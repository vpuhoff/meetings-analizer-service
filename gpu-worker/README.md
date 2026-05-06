# GPU Worker — WhisperX Transcription Service

Standalone GPU-сервис для расшифровки аудио с диаризацией спикеров.
Работает на **WhisperX** (Whisper Large-v3 + Pyannote диаризация) через **FastAPI**.

## Требования

- GPU с CUDA (тестировалось на NVIDIA A4000 16GB)
- Python 3.10+
- FFmpeg
- HuggingFace токен (для модели диаризации Pyannote)
- Ngrok токен (для публичного URL)

## Установка

```bash
bash install.sh
```

Скрипт установит:
1. FFmpeg (системный)
2. PyTorch 2.5.1 + CUDA 11.8
3. WhisperX из GitHub
4. FastAPI + uvicorn + pyngrok
5. Зафиксирует совместимые версии numpy, pyannote.audio, transformers
6. Наложит патч совместимости (`patch.sh`)

## Запуск

```bash
export HF_TOKEN="hf_ваш_токен"
export NGROK_TOKEN="ваш_ngrok_токен"
export NGROK_DOMAIN="ваш_домен.ngrok-free.app"
python worker.py
```

Или через `start.sh` (задать токены перед запуском).

При старте сервер:
1. Загружает модели в VRAM (~10GB)
2. Открывает ngrok-туннель
3. Готов к приёму запросов

## API

### POST /transcribe

Загрузить аудиофайл для расшифровки.

```bash
curl -X POST https://your-domain.ngrok-free.app/transcribe \
  -F "file=@audio.mp3"
```

Ответ:
```json
{ "task_id": "uuid", "status": "pending" }
```

### GET /status/{task_id}

Опросить статус задачи. Polling каждые 2-3 секунды.

```bash
curl https://your-domain.ngrok-free.app/status/uuid
```

Возможные ответы:
```json
{ "status": "pending",    "result": null }
{ "status": "processing", "result": null }
{ "status": "completed",  "result": "00:05 SPEAKER_00: Привет\n00:08 SPEAKER_01: Здравствуйте" }
{ "status": "failed",     "result": "ошибка" }
```

## Формат результата

Каждая строка: `MM:SS SPEAKER_XX: текст`

Пример:
```
00:05 SPEAKER_00: Добрый день, начнём стендап
00:12 SPEAKER_01: У меня обновление по ПСИ стенду
01:30 SPEAKER_00: Спасибо, переходим к следующему
```

Этот формат автоматически парсится на фронтенде приложения.

## Поддерживаемые аудиоформаты

mp3, mp4, ogg, wav, flac, m4a, webm — всё, что умеет FFmpeg.

## Скорость

| Длина аудио | Время расшифровки |
|---|---|
| 1 мин | ~8 сек |
| 10 мин | ~80 сек |
| 1 час | ~8 мин |

## Архитектура

```
Запрос → FastAPI → Очередь (asyncio.Queue) → GPU Worker (отдельный поток)
                ↓                                      ↓
           task_id + pending                    WhisperX pipeline:
                                                 1. Transcribe (large-v3)
                                                 2. Align (Wav2Vec2 RU)
                                                 3. Diarize (Pyannote 3.1)
```

Очередь гарантирует, что одновременно обрабатывается только один файл (одна GPU).

## Переменные окружения

| Переменная | Описание | По умолчанию |
|---|---|---|
| `HF_TOKEN` | Токен HuggingFace (для Pyannote) | — |
| `NGROK_TOKEN` | Токен Ngrok | — |
| `NGROK_DOMAIN` | Домен Ngrok | `xxx.ngrok-free.app` |
| `PORT` | Порт сервера | `8000` |
