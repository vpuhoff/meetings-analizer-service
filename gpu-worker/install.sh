#!/bin/bash
set -e

echo "=== 1. Устанавливаем системные зависимости (FFmpeg) ==="
# Закомментируйте строку ниже, если у вас Windows или ffmpeg уже установлен
sudo apt-get update && sudo apt-get install -y ffmpeg

echo "=== 2. Устанавливаем PyTorch с поддержкой CUDA 11.8 ==="
# Устанавливаем сразу нужную версию, чтобы не было двойной работы
python -m pip install torch==2.5.1 torchaudio==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu118

echo "=== 3. Устанавливаем WhisperX напрямую из GitHub ==="
# Версия на GitHub содержит важные фиксы для работы с новыми версиями faster-whisper
python -m pip install git+https://github.com/m-bain/whisperx.git

echo "=== 4. Устанавливаем зависимости для веб-сервера ==="
python -m pip install fastapi uvicorn python-multipart pyngrok

echo "=== 5. Фиксируем версии проблемных библиотек ==="
# Numpy 2.0+ ломает многие аудио-библиотеки (в т.ч. pyannote и librosa)
# Обновляем pyannote.audio для корректной диаризации
python -m pip install "numpy<2.0.0" "huggingface_hub>=0.22.0" "pyannote.audio==3.1.1"
python -m pip install torch==2.5.1 torchaudio==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu118
python -m pip install --upgrade transformers accelerate sentencepiece protobuf
python -m pip install "transformers==4.47.0" tqdm
sh patch.sh # Патч для совместимости
echo "=== ✅ Готово! Среда для WhisperX успешно настроена ==="