import os
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

# --- Хотфикс для PyTorch 2.6.0+ ---
# Разрешаем загрузку старых форматов весов Pyannote
try:
    torch.serialization.add_safe_globals([
        omegaconf.listconfig.ListConfig,
        omegaconf.dictconfig.DictConfig,
        set # иногда pyannote требует и базовые типы
    ])
except AttributeError:
    pass # Если PyTorch версии ниже 2.6, игнорируем
# -----------------------------------
# --- ГЛОБАЛЬНЫЙ ХОТФИКС ДЛЯ PYTORCH 2.6+ ---
# Возвращаем старое поведение загрузки весов (как было до версии 2.6)
_original_load = torch.load

def legacy_load(*args, **kwargs):
    # Принудительно отключаем параноидальную проверку, если она не задана жестко
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return _original_load(*args, **kwargs)

torch.load = legacy_load

import whisperx

import pyannote.audio.core.inference

# --- ХОТФИКС №3: Учим старый Pyannote понимать новые команды от WhisperX ---
_orig_pipeline_from_pretrained = pyannote.audio.Pipeline.from_pretrained
def from_pretrained(cls, *args, **kwargs):
    if 'token' in kwargs:
        kwargs['use_auth_token'] = kwargs.pop('token')
    return _orig_pipeline_from_pretrained(cls, *args, **kwargs)
pyannote.audio.Pipeline.from_pretrained = from_pretrained

# --- ХОТФИКС ДЛЯ НЕСОВМЕСТИМОСТИ WHISPERX И PYANNOTE ---
# Перехватываем функцию инициализации и удаляем аргумент 'token', из-за которого всё падает
_original_inference_init = pyannote.audio.core.inference.Inference.__init__

def _patched_inference_init(self, *args, **kwargs):
    kwargs.pop("token", None)  # Удаляем проблемный аргумент
    _original_inference_init(self, *args, **kwargs)

pyannote.audio.core.inference.Inference.__init__ = _patched_inference_init
# -------------------------------------------------------

# --- Конфигурация ---
NGROK_TOKEN = os.environ.get("NGROK_TOKEN", "xxxx")
NGROK_DOMAIN = os.environ.get("NGROK_DOMAIN", "xxx.ngrok-free.app")
HF_TOKEN = os.environ.get("HF_TOKEN", "xxx") # Обязательно для диаризации!
PORT = 8000
UPLOAD_DIR = "temp_audio"

os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- Глобальные переменные состояния ---
tasks_db = {}
task_queue = asyncio.Queue()

# Переменные для моделей
device = "cuda" if torch.cuda.is_available() else "cpu"
compute_type = "float16" if device == "cuda" else "int8"
whisper_model = None
align_model = None
align_metadata = None
diarize_model = None

# Словарь терминов, чтобы не было "параметелоса" и "шветишек"
IT_PROMPT = "ПСИ, стенд, IFT, DEV, DPM, Prometheus, JWT, Кубер, Дженкинс, пром, неймспейс."

# --- Функция расшифровки с WhisperX ---
def process_audio(file_path: str, task_id: str) -> str:
    print(f"[{task_id[:8]}] 🎙️  Начинаю транскрипцию: {os.path.basename(file_path)}")
    start_time = time.time()
    
    # Загружаем аудио в память (WhisperX делает это через ffmpeg)
    audio = whisperx.load_audio(file_path)
    duration = len(audio) / 16000 # sample_rate = 16000
    
    # 1. ТРАНСКРИПЦИЯ (Whisper + VAD)
    print(f"[{task_id[:8]}] 1/3 📝  Транскрипция текста (Batch size: 16)...")
    whisper_model.model.hotwords = [w.strip() for w in IT_PROMPT.split(",")]

    # A4000 легко тянет batch_size=16, что делает процесс очень быстрым
    result = whisper_model.transcribe(
        audio, 
        batch_size=16, 
        language="ru"
    )

    
    # 2. ВЫРАВНИВАНИЕ (Точные таймкоды для каждого слова)
    print(f"[{task_id[:8]}] 2/3 ⏱️  Синхронизация таймкодов (Alignment)...")
    result = whisperx.align(
        result["segments"], 
        align_model, 
        align_metadata, 
        audio, 
        device, 
        return_char_alignments=False
    )
    
    # 3. ДИАРИЗАЦИЯ (Определение спикеров)
    print(f"[{task_id[:8]}] 3/3 🗣️  Распознавание спикеров (Pyannote)...")
    diarize_segments = diarize_model(audio)
    
    # Объединяем текст и спикеров
    result = whisperx.assign_word_speakers(diarize_segments, result)
    
    print(f"[{task_id[:8]}] 🛠️  Форматирование результата...")
    collected = []
    
    for segment in tqdm(result["segments"]):
        # Если модель не смогла определить спикера, ставим UNKNOWN
        speaker = segment.get("speaker", "SPEAKER_UNKNOWN")
        # Форматируем секунды в MM:SS
        start_td = datetime.timedelta(seconds=int(segment["start"]))
        time_str = str(start_td)[2:] # Убираем часы, оставляем mm:ss
        
        text = segment["text"].strip()
        
        # Сохраняем в формате "00:00 Speaker 1: Текст"
        collected.append(f"{time_str} {speaker}: {text}")
    
    elapsed = time.time() - start_time
    rtf = duration / elapsed
    print(f"[{task_id[:8]}] ✅  Готово! Время: {elapsed:.1f}s, Скорость: {rtf:.1f}x realtime")
    
    return "\n".join(collected)


# --- Фоновый воркер ---
async def gpu_worker():
    while True:
        task_id, file_path = await task_queue.get()
        tasks_db[task_id]["status"] = "processing"

        try:
            # Запускаем тяжелую синхронную функцию в отдельном потоке
            result = await asyncio.to_thread(process_audio, file_path, task_id)
            tasks_db[task_id]["status"] = "completed"
            tasks_db[task_id]["result"] = result
        except Exception as e:
            tasks_db[task_id]["status"] = "failed"
            tasks_db[task_id]["result"] = str(e)
            print(f"[{task_id[:8]}] ❌  Ошибка: {e}\n")
            traceback.print_exc()
        finally:
            if os.path.exists(file_path):
                os.remove(file_path)
            task_queue.task_done()
            


# --- Жизненный цикл приложения ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    global whisper_model, align_model, align_metadata, diarize_model
    
    print("🚀 Загрузка моделей в VRAM (A4000)...")
    
    # 1. Базовая модель Whisper (Large-v3 отлично влезает в 16GB)
    whisper_model = whisperx.load_model(
        "large-v3", 
        device, 
        compute_type=compute_type
    )
    print("✅ Whisper Large-V3 загружен")

    # 2. Модель выравнивания (для русского языка)
    align_model, align_metadata = whisperx.load_align_model(
        language_code="ru", 
        device=device
    )
    print("✅ Wav2Vec2 (RU) загружен")

    # 3. Модель диаризации (Pyannote)
    from whisperx.diarize import DiarizationPipeline
    
    print("Загружаю Pyannote Diarization...")
    # Для новых версий whisperx (используют token)
    diarize_model = DiarizationPipeline(
        model_name="pyannote/speaker-diarization-3.1",
        device=device
    )
    print("✅ Pyannote Diarization загружена")

    # Ngrok туннель
    conf.get_default().auth_token = NGROK_TOKEN
    tunnel = ngrok.connect(PORT, domain=NGROK_DOMAIN)
    print(f"✅ Сервер доступен: {tunnel.public_url}")

    worker_task = asyncio.create_task(gpu_worker())

    yield

    worker_task.cancel()
    ngrok.disconnect(tunnel.public_url)
    
    # Очистка памяти
    import gc
    del whisper_model, align_model, diarize_model
    gc.collect()
    torch.cuda.empty_cache()

# --- Инициализация FastAPI ---
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
    task_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{task_id}_{file.filename}")

    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())

    tasks_db[task_id] = {"status": "pending", "result": None}
    await task_queue.put((task_id, file_path))

    return {"task_id": task_id, "status": "pending"}

@app.get("/status/{task_id}")
async def get_task_status(task_id: str):
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks_db[task_id]

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)