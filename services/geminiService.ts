import { MeetingAnalysis, TranscriptSegment } from "../types";
import { splitAudioFile, needsChunking, AudioChunk } from "../utils/audioUtils";

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Constants for chunking
const MAX_CHUNK_DURATION = 600; // 10 minutes in seconds

// Helper to convert File to Base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

// Helper to read Text File
const readTextFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
};

const FREE_TRANSCRIBE_URL = 'https://gladly-mint-dragon.ngrok-free.app';

async function freeTranscribe(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const uploadRes = await fetch(`${FREE_TRANSCRIBE_URL}/transcribe`, {
    method: 'POST',
    body: formData,
  });
  if (!uploadRes.ok) throw new Error(`Free transcription upload failed (${uploadRes.status})`);
  const { task_id } = await uploadRes.json() as { task_id: string };

  // Poll for result
  while (true) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch(`${FREE_TRANSCRIBE_URL}/status/${task_id}`);
    const data = await statusRes.json() as { status: string; result: string | null };
    if (data.status === 'completed') return data.result || '';
    if (data.status === 'failed') throw new Error(data.result || 'Free transcription failed');
    // pending / processing — continue polling
  }
}

export const analyzeMeeting = async (
  files: File[], 
  language: string = "English", 
  projectContext?: string, 
  teamContext?: string, 
  feedback?: string, 
  onProgress?: (percent: number, message: string) => void,
  useFreeTranscription?: boolean
): Promise<MeetingAnalysis> => {
  try {
    // Separate audio and text files
    const audioFiles: File[] = [];
    const textFiles: File[] = [];
    
    for (const file of files) {
      const isAudio = file.type.startsWith('audio') || file.type.startsWith('video');
      if (isAudio) {
        audioFiles.push(file);
      } else {
        textFiles.push(file);
      }
    }

    // Calculate total steps: each audio file = 1 transcribe request (or N chunks), 
    // each text file = 1 read step, +1 for final analysis
    // Start with a minimum estimate; update total dynamically as we learn actual chunk counts
    let totalSteps = audioFiles.length + textFiles.length + 1;
    let completedSteps = 0;

    const reportProgress = (message: string) => {
      if (onProgress) {
        const percent = Math.min(100, Math.round((completedSteps / totalSteps) * 100));
        onProgress(percent, message);
      }
    };

    reportProgress("Preparing files...");

    // Process audio files with chunking if needed
    const allTranscriptSegments: TranscriptSegment[] = [];
    let rawTextParts: string[] = [];
    
    for (let fileIndex = 0; fileIndex < audioFiles.length; fileIndex++) {
      const audioFile = audioFiles[fileIndex];

      if (useFreeTranscription) {
        // Free transcription service — no chunking needed, service handles long audio
        reportProgress(`Transcribing (free) ${fileIndex + 1}/${audioFiles.length}...`);
        const transcriptText = await freeTranscribe(audioFile);
        const segments = parseTranscriptText(transcriptText);
        if (segments.length > 0 && segments.some(s => s.timestamp !== '00:00' || s.speaker !== 'Speaker')) {
          allTranscriptSegments.push(...segments);
        } else {
          rawTextParts.push(`--- ${audioFile.name} ---\n${transcriptText}`);
        }
        completedSteps++;
        reportProgress(`Transcribed (free) ${fileIndex + 1}/${audioFiles.length}`);
      } else if (needsChunking(audioFile, MAX_CHUNK_DURATION)) {
        // Split into chunks
        reportProgress(`Splitting audio ${fileIndex + 1}/${audioFiles.length}...`);
        const chunks = await splitAudioFile(audioFile);
        
        // Update total: replace 1 estimated step with actual chunk count
        totalSteps += (chunks.length - 1);

        // Transcribe each chunk
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          const chunk = chunks[chunkIndex];
          reportProgress(`Transcribing file ${fileIndex + 1}/${audioFiles.length}, chunk ${chunkIndex + 1}/${chunks.length}...`);
          
          const chunkSegments = await transcribeAudioChunk(chunk, language);
          completedSteps++;
          reportProgress(`Transcribed file ${fileIndex + 1}/${audioFiles.length}, chunk ${chunkIndex + 1}/${chunks.length}`);
          
          // Adjust timestamps for this chunk
          const adjustedSegments = chunkSegments.map(seg => ({
            ...seg,
            timestamp: formatTimestamp(parseTimestamp(seg.timestamp) + chunk.startTime)
          }));
          
          allTranscriptSegments.push(...adjustedSegments);
        }
      } else {
        // Process whole file
        reportProgress(`Transcribing file ${fileIndex + 1}/${audioFiles.length}...`);
        const base64Data = await fileToBase64(audioFile);
        const segments = await transcribeAudioChunk({
          blob: new Blob([base64Data], { type: audioFile.type }),
          index: 0,
          duration: 0,
          startTime: 0
        }, language, base64Data);
        completedSteps++;
        reportProgress(`Transcribed file ${fileIndex + 1}/${audioFiles.length}`);
        allTranscriptSegments.push(...segments);
      }
    }

    // Process text files — pass raw text, let the AI parse it
    for (const textFile of textFiles) {
      reportProgress(`Reading ${textFile.name}...`);
      const textContent = await readTextFile(textFile);
      // Try structured parsing first; if it yields segments, use them
      const segments = parseTranscriptText(textContent);
      if (segments.length > 0 && segments.some(s => s.timestamp !== '00:00' || s.speaker !== 'Speaker')) {
        // Looks like a real transcript with timestamps/speakers
        allTranscriptSegments.push(...segments);
      } else {
        // Plain text (md, notes, etc.) — pass raw to AI
        rawTextParts.push(`--- ${textFile.name} ---\n${textContent}`);
      }
      completedSteps++;
      reportProgress(`Read ${textFile.name}`);
    }

    reportProgress("Analyzing transcript...");

    // Send transcript for analysis
    const response = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transcript: allTranscriptSegments,
        rawText: rawTextParts.length > 0 ? rawTextParts.join('\n\n') : undefined,
        language,
        projectContext,
        teamContext,
        feedback,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Analysis failed');
    }

    completedSteps++;
    reportProgress("Finalizing report...");

    const result = await response.json();
    
    // Add transcript to result
    result.transcript = allTranscriptSegments;

    return result as MeetingAnalysis;
  } catch (error) {
    console.error("Analysis failed:", error);
    throw error;
  }
};

// Helper to transcribe a single audio chunk
async function transcribeAudioChunk(
  chunk: AudioChunk | { blob: Blob; index: number; duration: number; startTime: number },
  language: string,
  precomputedBase64?: string
): Promise<TranscriptSegment[]> {
  const base64Data = precomputedBase64 || await blobToBase64(chunk.blob);
  
  const response = await fetch(`${API_BASE}/api/transcribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio: base64Data,
      type: chunk.blob.type,
      language,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Transcription failed');
  }

  const result = await response.json();
  return result.transcript as TranscriptSegment[];
}

// Helper to convert blob to base64
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
  });
}

// Helper to parse transcript text into segments
function parseTranscriptText(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = text.split('\n');
  const regex = /^\[(\d{2}:\d{2}(?::\d{2})?)\]\s+([^:]+):\s+(.+)$/;
  // Also match lines like "Speaker: text" without timestamp
  const speakerLineRegex = /^([^:\[\]]+):\s+(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(regex);
    if (match) {
      segments.push({
        timestamp: match[1],
        speaker: match[2].trim(),
        text: match[3].trim()
      });
    } else {
      // Try speaker-only format (no timestamp)
      const speakerMatch = trimmed.match(speakerLineRegex);
      if (speakerMatch && speakerMatch[1].length < 30) {
        segments.push({
          timestamp: '00:00',
          speaker: speakerMatch[1].trim(),
          text: speakerMatch[2].trim()
        });
      } else {
        // Plain text line — assign to last speaker or "Speaker"
        const lastSpeaker = segments.length > 0 ? segments[segments.length - 1].speaker : 'Speaker';
        if (segments.length > 0 && segments[segments.length - 1].speaker === lastSpeaker) {
          segments[segments.length - 1].text += '\n' + trimmed;
        } else {
          segments.push({
            timestamp: segments.length > 0 ? segments[segments.length - 1].timestamp : '00:00',
            speaker: lastSpeaker,
            text: trimmed
          });
        }
      }
    }
  }

  // If nothing parsed at all, treat entire content as one segment
  if (segments.length === 0 && text.trim()) {
    segments.push({
      timestamp: '00:00',
      speaker: 'Speaker',
      text: text.trim()
    });
  }

  return segments;
}

// Helper to parse timestamp string to seconds
function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

// Helper to format seconds to timestamp string
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export interface KBGenerationResult {
  title: string;
  systems: string[];
  topics: string[];
  content: string;
}

export const generateKBDocument = async (
  analysis: MeetingAnalysis,
  projectName: string,
  projectContext: string,
  teamContext: string,
  meetingTimestamp?: number,
): Promise<KBGenerationResult> => {
  const participants = Array.from(
    new Set(analysis.transcript.map(s => s.speaker).filter(Boolean))
  ).join(', ') || 'Unknown';

  const meetingDate = meetingTimestamp
    ? new Date(meetingTimestamp).toLocaleDateString('ru-RU')
    : new Date().toLocaleDateString('ru-RU');

  const transcriptText = analysis.transcript.length > 0
    ? analysis.transcript.map(s => `[${s.timestamp}] ${s.speaker}: ${s.text}`).join('\n')
    : `Summary: ${analysis.summary}\n\nTopics: ${analysis.topics.join(', ')}\n\nDecisions:\n${analysis.decisions.map(d => `- ${d.decision}: ${d.context}`).join('\n')}\n\nAction Items:\n${analysis.actionItems.map(a => `- ${a.what} (${a.who})`).join('\n')}\n\nBlockers:\n${analysis.blockers.join('\n')}`;

  const systemPrompt = `Ты — старший технический аналитик и куратор корпоративной Базы Знаний (Knowledge Base). 
Твоя задача — проанализировать сырой транскрипт рабочей встречи и сформировать из него структурированный, точный и лаконичный документ. 

В твоем распоряжении есть контекст проекта (словарь терминов, роли участников, архитектура). Ты ДОЛЖЕН использовать этот контекст для правильной интерпретации имен, должностей и технических аббревиатур, упомянутых во встрече.

ДАННЫЕ ВСТРЕЧИ:
- Проект: ${projectName}
- Дата: ${meetingDate}
- Участники: ${participants}

КОНТЕКСТ ПРОЕКТА (Глоссарий и Роли):
"""
${projectContext || 'Не указан'}
"""

КОМАНДА:
"""
${teamContext || 'Не указана'}
"""

ТРАНСКРИПТ ВСТРЕЧИ:
"""
${transcriptText}
"""

ИНСТРУКЦИИ ПО ФОРМАТИРОВАНИЮ ОТВЕТА:
Твой ответ должен быть строго в формате JSON, без дополнительных оберток или текста до/после него.

Структура JSON:
{
  "title": "Краткое и емкое название для документа (не более 6-8 слов)",
  "systems": ["Массив строк: только названия информационных систем, сервисов или продуктов, затронутых на встрече"],
  "topics": ["Массив строк: ключевые обсуждаемые темы, проблемы или бизнес-процессы"],
  "content": "Строка: готовый документ в формате Markdown с экранированными переносами строк"
}

ПРАВИЛА ДЛЯ ПОЛЯ content (Markdown):
1. Документ должен быть написан в деловом, профессиональном стиле.
2. Используй следующую структуру заголовков:
   - # [Название встречи]
   - **Метаданные:** Дата, Проект, Участники (списком).
   - ## 📝 Executive Summary (2-4 предложения — самая короткая выжимка).
   - ## 📋 Meeting Recap (Подробный пересказ хода встречи: что обсуждалось, в каком порядке, какие вопросы поднимались, как развивался разговор. Объём — от 200 до 500 слов. Пиши связным текстом по абзацам, не списком. Используй имена участников из контекста проекта).
   - ## 🎯 Decisions Log (принятые решения с контекстом курсивом).
   - ## ✅ Action Items (чекбоксы [ ] с исполнителем).
   - ## 🛠 Tech Stack & Details (технические детали, ошибки, конфигурации).
   - ## ⚠️ Blockers & Risks (только если есть в транскрипте).
3. Опирайся ТОЛЬКО на факты из транскрипта. Не придумывай задачи или решения.`;

  const response = await fetch(`${API_BASE}/api/question`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [],
      question: systemPrompt,
      projectContext: '',
      teamContext: '',
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'KB generation failed');
  }

  const data = await response.json();
  const raw: string = data.answer || '';

  // Strip markdown code fences if present
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    const parsed = JSON.parse(jsonStr) as KBGenerationResult;
    // Fix literal \n sequences (two chars: backslash + n) left by model
    if (typeof parsed.content === 'string') {
      parsed.content = parsed.content.replace(/\\n/g, '\n');
    }
    return parsed;
  } catch {
    throw new Error('Model returned invalid JSON. Raw: ' + raw.slice(0, 300));
  }
};

export const askMeetingQuestion = async (files: File[], question: string, projectContext?: string, teamContext?: string): Promise<string> => {
  try {
    // Convert files to format expected by API
    const filesData = await Promise.all(files.map(async (file) => {
      const isAudio = file.type.startsWith('audio') || file.type.startsWith('video');
      
      if (isAudio) {
        const base64Data = await fileToBase64(file);
        return {
          type: file.type,
          data: base64Data,
        };
      } else {
        const textContent = await readTextFile(file);
        return {
          type: file.type,
          content: textContent,
        };
      }
    }));

    const response = await fetch(`${API_BASE}/api/question`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: filesData,
        question,
        projectContext,
        teamContext,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Q&A failed');
    }

    const result = await response.json();
    return result.answer || "I could not generate an answer.";
  } catch (error) {
    console.error("Q&A failed:", error);
    throw error;
  }
};

export const generateMarkdownReport = async (analysis: MeetingAnalysis, language: string = "English"): Promise<string> => {
  try {
    const response = await fetch(`${API_BASE}/api/markdown`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        analysis,
        language,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Markdown generation failed');
    }

    const result = await response.json();
    return result.markdown || "# Error generating report";
  } catch (error) {
    console.error("Markdown generation failed:", error);
    throw error;
  }
};
