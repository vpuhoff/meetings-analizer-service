// Audio chunking utilities for splitting long audio files
// Uses Web Audio API + lamejs for MP3 encoding

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
    
    // Convert to MP3 blob
    const blob = await encodeToMp3(chunkBuffer);
    
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
 * Encode AudioBuffer to MP3 Blob using lamejs
 */
async function encodeToMp3(audioBuffer: AudioBuffer): Promise<Blob> {
  // Dynamic import lamejs to avoid SSR issues
  const lamejsModule = await import('lamejs');
  const Mp3Encoder = (lamejsModule as any).Mp3Encoder || (lamejsModule as any).default?.Mp3Encoder;
  
  if (!Mp3Encoder) {
    throw new Error('lamejs Mp3Encoder not available');
  }
  
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const mp3encoder = new Mp3Encoder(channels, sampleRate, 128);
  
  const mp3Data: Uint8Array[] = [];
  const sampleBlockSize = 1152;
  
  // Process audio data in blocks
  for (let i = 0; i < audioBuffer.length; i += sampleBlockSize) {
    const leftChannel = audioBuffer.getChannelData(0);
    const rightChannel = channels > 1 ? audioBuffer.getChannelData(1) : leftChannel;
    
    // Convert Float32 to Int16
    const leftChunk = float32ToInt16(leftChannel.subarray(i, i + sampleBlockSize));
    const rightChunk = channels > 1 
      ? float32ToInt16(rightChannel.subarray(i, i + sampleBlockSize))
      : leftChunk;
    
    // Encode based on channels
    let mp3buf: Uint8Array;
    if (channels > 1) {
      mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
    } else {
      mp3buf = mp3encoder.encodeBuffer(leftChunk);
    }
    
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }
  
  // Flush encoder
  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }
  
  // Combine all chunks
  const totalLength = mp3Data.reduce((acc, buf) => acc + buf.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const buf of mp3Data) {
    combined.set(buf, offset);
    offset += buf.length;
  }
  
  return new Blob([combined], { type: 'audio/mp3' });
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
  // Estimate duration from file size (rough approximation for MP3)
  // MP3 at 128kbps = ~1MB per minute
  const estimatedDuration = file.size / (1024 * 1024) * 60;
  return estimatedDuration > maxDurationSeconds;
}
