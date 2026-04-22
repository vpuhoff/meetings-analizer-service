// Audio chunking utilities for splitting long audio files
// Uses Web Audio API with native WAV encoding (no external dependencies)

export interface AudioChunk {
  blob: Blob;
  index: number;
  duration: number;
  startTime: number;
}

const CHUNK_DURATION_SECONDS = 600; // 10 minutes

/**
 * Split audio file into chunks of specified duration
 */
export async function splitAudioFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<AudioChunk[]> {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  // Decode audio file
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  
  const chunks: AudioChunk[] = [];
  const sampleRate = audioBuffer.sampleRate;
  const channels = audioBuffer.numberOfChannels;
  const totalDuration = audioBuffer.duration;
  const totalChunks = Math.ceil(totalDuration / CHUNK_DURATION_SECONDS);
  
  // Samples per chunk
  const samplesPerChunk = Math.ceil(sampleRate * CHUNK_DURATION_SECONDS);
  const totalSamples = audioBuffer.length;
  
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const startSample = chunkIndex * samplesPerChunk;
    const endSample = Math.min(startSample + samplesPerChunk, totalSamples);
    const chunkLength = endSample - startSample;
    
    // Create buffer for this chunk
    const chunkBuffer = audioCtx.createBuffer(channels, chunkLength, sampleRate);
    
    // Copy channel data
    for (let channel = 0; channel < channels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      const chunkData = chunkBuffer.getChannelData(channel);
      chunkData.set(channelData.subarray(startSample, endSample));
    }
    
    // Convert to WAV blob
    const blob = await encodeToWav(chunkBuffer);
    
    chunks.push({
      blob,
      index: chunkIndex,
      duration: chunkLength / sampleRate,
      startTime: startSample / sampleRate
    });
    
    if (onProgress) {
      onProgress(Math.round(((chunkIndex + 1) / totalChunks) * 100));
    }
  }
  
  return chunks;
}

/**
 * Encode AudioBuffer to WAV Blob (16kHz mono PCM)
 */
async function encodeToWav(audioBuffer: AudioBuffer): Promise<Blob> {
  // Downsample to 16kHz mono to keep file size manageable for API upload
  const TARGET_SAMPLE_RATE = 16000;
  const channels = 1; // mono
  const sampleRate = Math.min(audioBuffer.sampleRate, TARGET_SAMPLE_RATE);
  
  // Resample if needed
  let pcmData: Float32Array;
  if (audioBuffer.sampleRate !== sampleRate) {
    const ratio = audioBuffer.sampleRate / sampleRate;
    const newLength = Math.round(audioBuffer.length / ratio);
    pcmData = new Float32Array(newLength);
    // Mix to mono and resample
    for (let i = 0; i < newLength; i++) {
      const srcIdx = Math.round(i * ratio);
      let sample = 0;
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        sample += audioBuffer.getChannelData(ch)[srcIdx] || 0;
      }
      pcmData[i] = sample / audioBuffer.numberOfChannels;
    }
  } else {
    // Just mix to mono
    pcmData = new Float32Array(audioBuffer.length);
    for (let i = 0; i < audioBuffer.length; i++) {
      let sample = 0;
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        sample += audioBuffer.getChannelData(ch)[i];
      }
      pcmData[i] = sample / audioBuffer.numberOfChannels;
    }
  }
  
  const int16Data = float32ToInt16(pcmData);
  const dataSize = int16Data.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  
  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true); // byte rate
  view.setUint16(32, channels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  
  // Copy PCM data
  const pcmBytes = new Uint8Array(int16Data.buffer);
  const wavBytes = new Uint8Array(buffer);
  wavBytes.set(pcmBytes, 44);
  
  return new Blob([wavBytes], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Convert Float32 array to Int16 array
 */
function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array;
}

/**
 * Check if file needs chunking (longer than threshold)
 */
export function needsChunking(file: File, maxDurationSeconds: number = 600): boolean {
  // Estimate duration from file size
  // Use bitrate-based heuristics: MP3 ~128kbps, WAV ~256kbps mono 16kHz
  // Conservative: assume ~1MB per minute for compressed formats
  const estimatedDuration = file.size / (1024 * 1024) * 60;
  return estimatedDuration > maxDurationSeconds;
}
