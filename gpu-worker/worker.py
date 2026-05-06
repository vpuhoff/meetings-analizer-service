import os
import gc
import uuid
import asyncio
import torch
import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from pyngrok import ngrok, conf
import time
import datetime
import omegaconf
from tqdm import tqdm
import traceback
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.asyncio import AsyncioIntegration

# --- Sentry ---
sentry_sdk.init(
    dsn="xxxxx",
    integrations=[],
    traces_sample_rate=0.0,
)

# --- Хотфикс для PyTorch 2.6.0+ ---
try:
    torch.serialization.add_safe_globals([
        omegaconf.listconfig.ListConfig,
        omegaconf.dictconfig.DictConfig,
        set
    ])
except AttributeError:
    pass

# --- Глобальный хотфикс для PyTorch 2.6+ ---
_original_load = torch.load

def legacy_load(*args, **kwargs):
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return _original_load(*args, **kwargs)

torch.load = legacy_load

import whisperx
import pyannote.audio.core.inference

# --- Хотфикс №3: Pyannote + WhisperX token → use_auth_token ---
_orig_pipeline_from_pretrained = pyannote.audio.Pipeline.from_pretrained
def from_pretrained(cls, *args, **kwargs):
    if 'token' in kwargs:
        kwargs['use_auth_token'] = kwargs.pop('token')
    return _orig_pipeline_from_pretrained(cls, *args, **kwargs)
pyannote.audio.Pipeline.from_pretrained = from_pretrained

# --- Хотфикс для Inference.__init__ ---
_original_inference_init = pyannote.audio.core.inference.Inference.__init__

def _patched_inference_init(self, *args, **kwargs):
    kwargs.pop("token", None)
    _original_inference_init(self, *args, **kwargs)

pyannote.audio.core.inference.Inference.__init__ = _patched_inference_init

# --- Конфигурация ---
NGROK_TOKEN = "xxxx"
NGROK_DOMAIN = "gladly-mint-dragon.ngrok-free.app"
HF_TOKEN = "xxx"
PORT = 8000
UPLOAD_DIR = "temp_audio"
MAX_QUEUE_SIZE = 20

os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- Глобальные переменные ---
tasks_db = {}
task_queue = asyncio.Queue(maxsize=MAX_QUEUE_SIZE)

device = "cuda" if torch.cuda.is_available() else "cpu"
compute_type = "float16" if device == "cuda" else "int8"
whisper_model = None
align_model = None
align_metadata = None
diarize_model = None

IT_PROMPT = "ПСИ, стенд, IFT, DEV, Prometheus, JWT, Кубер, Дженкинс, пром, неймспейс."


def log_vram(tag: str, task_id: str):
    if device == "cuda":
        allocated = torch.cuda.memory_allocated() / 1024**3
        reserved  = torch.cuda.memory_reserved()  / 1024**3
        print(f"[{task_id[:8]}] 🖥️  VRAM {tag}: {allocated:.2f}GB allocated / {reserved:.2f}GB reserved")


def process_audio(file_path: str, task_id: str) -> str:
    def set_progress(stage: str, pct: float):
        tasks_db[task_id]["stage"] = stage
        tasks_db[task_id]["progress"] = round(pct, 1)

    print(f"[{task_id[:8]}] 🎙️  Начинаю транскрипцию: {os.path.basename(file_path)}")
    start_time = time.time()
    log_vram("before", task_id)

    audio = whisperx.load_audio(file_path)
    duration = len(audio) / 16000

    # 1. ТРАНСКРИПЦИЯ (0–50%)
    set_progress("transcription", 0)
    print(f"[{task_id[:8]}] 1/3 📝  Транскрипция текста...")
    whisper_model.model.hotwords = [w.strip() for w in IT_PROMPT.split(",")]
    result = whisper_model.transcribe(
        audio,
        batch_size=32,
        language="ru",
    )
    set_progress("transcription", 50)
    log_vram("after transcribe", task_id)

    # 2. ВЫРАВНИВАНИЕ (50–70%)
    set_progress("alignment", 50)
    print(f"[{task_id[:8]}] 2/3 ⏱️  Синхронизация таймкодов...")
    result = whisperx.align(
        result["segments"], align_model, align_metadata,
        audio, device, return_char_alignments=False
    )
    set_progress("alignment", 70)
    log_vram("after align", task_id)

    # 3. ДИАРИЗАЦИЯ (70–100%) — тут есть реальный колбэк!
    set_progress("diarization", 70)
    print(f"[{task_id[:8]}] 3/3 🗣️  Распознавание спикеров...")

    def diarization_progress(pct: float):
        # pct приходит 0–100 от pyannote, маппим в 70–100
        mapped = 70 + (pct / 100) * 30
        set_progress("diarization", mapped)

    diarize_segments = diarize_model(
        audio,
        min_speakers=2,
        max_speakers=6,  # сколько реально бывает на созвоне
        progress_callback=diarization_progress
    )
    result = whisperx.assign_word_speakers(diarize_segments, result)
    set_progress("diarization", 100)
    log_vram("after diarize", task_id)

    # Форматирование
    set_progress("formatting", 100)
    collected = []
    for segment in result["segments"]:
        speaker  = segment.get("speaker", "SPEAKER_UNKNOWN")
        start_td = datetime.timedelta(seconds=int(segment["start"]))
        time_str = str(start_td)[2:]
        text     = segment["text"].strip()
        collected.append(f"{time_str} {speaker}: {text}")

    output = "\n".join(collected)

    del audio, result, diarize_segments
    gc.collect()
    torch.cuda.empty_cache()
    log_vram("after cleanup", task_id)

    elapsed = time.time() - start_time
    rtf = duration / elapsed
    print(f"[{task_id[:8]}] ✅  Готово! Время: {elapsed:.1f}s, Скорость: {rtf:.1f}x realtime")

    return output


async def cleanup_task(task_id: str, delay: int):
    """Удаляем результат из памяти через delay секунд."""
    await asyncio.sleep(delay)
    tasks_db.pop(task_id, None)
    print(f"[{task_id[:8]}] 🗑️  Удалён из tasks_db")


async def gpu_worker():
    while True:
        task_id, file_path = await task_queue.get()
        tasks_db[task_id]["status"] = "processing"

        try:
            result = await asyncio.to_thread(process_audio, file_path, task_id)
            tasks_db[task_id]["status"] = "completed"
            tasks_db[task_id]["result"] = result
            # Чистим результат из RAM через 1 час
            asyncio.create_task(cleanup_task(task_id, delay=3600))
        except Exception as e:
            tasks_db[task_id]["status"] = "failed"
            tasks_db[task_id]["result"] = str(e)
            print(f"[{task_id[:8]}] ❌  Ошибка: {e}\n")
            traceback.print_exc()
            sentry_sdk.capture_exception(e)
            # Чистим failed через 5 минут
            asyncio.create_task(cleanup_task(task_id, delay=300))
            # При OOM — принудительная чистка
            gc.collect()
            torch.cuda.empty_cache()
        finally:
            if os.path.exists(file_path):
                os.remove(file_path)
            task_queue.task_done()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global whisper_model, align_model, align_metadata, diarize_model

    print("🚀 Загрузка моделей в VRAM (A4000)...")

    whisper_model = whisperx.load_model(
        "large-v3", device,
        compute_type=compute_type,
        asr_options={
            "beam_size": 5,
            "temperatures": [0, 0.2, 0.4], 
            "condition_on_previous_text": True,
            "repetition_penalty": 1.2,
            "no_speech_threshold": 0.6,
            "compression_ratio_threshold": 2.4,
        },
        vad_options={
            "vad_onset": 0.450,
            "vad_offset": 0.363,
        }
    )
    print("✅ Whisper Large-V3 загружен")

    align_model, align_metadata = whisperx.load_align_model(language_code="ru", device=device)
    print("✅ Wav2Vec2 (RU) загружен")

    from whisperx.diarize import DiarizationPipeline
    print("Загружаю Pyannote Diarization...")
    diarize_model = DiarizationPipeline(
        model_name="pyannote/speaker-diarization-3.1",
        device=device
    )
    print("✅ Pyannote Diarization загружена")

    conf.get_default().auth_token = NGROK_TOKEN
    tunnel = ngrok.connect(PORT, domain=NGROK_DOMAIN)
    print(f"✅ Сервер доступен: {tunnel.public_url}")

    worker_task = asyncio.create_task(gpu_worker())

    yield

    worker_task.cancel()
    ngrok.disconnect(tunnel.public_url)

    del whisper_model, align_model, diarize_model
    gc.collect()
    torch.cuda.empty_cache()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/transcribe")
async def create_transcription_task(file: UploadFile = File(...)):
    if task_queue.full():
        raise HTTPException(
            status_code=429,
            detail=f"Queue is full ({MAX_QUEUE_SIZE} tasks). Try later."
        )

    task_id   = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{task_id}_{file.filename}")

    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())

    tasks_db[task_id] = {
        "status": "pending",
        "result": None,
        "progress": 0,
        "stage": None,
        "queue_position": task_queue.qsize() + 1,
    }

    await task_queue.put((task_id, file_path))

    return {
        "task_id": task_id,
        "status": "pending",
        "queue_position": tasks_db[task_id]["queue_position"],
    }


@app.get("/status/{task_id}")
async def get_task_status(task_id: str):
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks_db[task_id]


@app.get("/queue")
async def get_queue_status():
    return {
        "queue_size":  task_queue.qsize(),
        "max_size":    MAX_QUEUE_SIZE,
        "tasks": {
            tid: info["status"]
            for tid, info in tasks_db.items()
        },
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)