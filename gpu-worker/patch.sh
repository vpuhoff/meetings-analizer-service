DIARIZE_PATH=$(find / -name "diarize.py" -path "*/whisperx/*" 2>/dev/null | head -1)
sed -i 's/diarization = output\.speaker_diarization/diarization = output.speaker_diarization if hasattr(output, "speaker_diarization") else output/' "$DIARIZE_PATH"
sed -n '165,170p' "$DIARIZE_PATH"
