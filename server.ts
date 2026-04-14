import express, { Request, Response } from 'express';
import multer from 'multer';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Buffer } from 'buffer';

// Configuration
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("Error: API_KEY environment variable is missing.");
  throw new Error("API_KEY environment variable is missing.");
}

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Models Configuration
const MODEL_TRANSCRIPTION = "gemini-3-flash-preview"; // Supports thinking config
const MODEL_ANALYSIS = "gemini-3-pro-preview"; // Advanced reasoning
const MODEL_REPORT = "gemini-3-flash-preview"; // Fast text generation

// In-memory storage for tasks
interface Task {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: number;
}

const tasks = new Map<string, Task>();

// Setup Express
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors() as any);
app.use(express.json({ limit: '50mb' }) as any); // Increased limit for large transcript payloads

// --- Schemas ---

// 1. Intelligence Schema (No transcript)
const intelligenceSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    meetingType: {
      type: Type.STRING,
      description: "The general type or category of the meeting."
    },
    summary: { type: Type.STRING },
    topics: { type: Type.ARRAY, items: { type: Type.STRING } },
    decisions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          decision: { type: Type.STRING },
          context: { type: Type.STRING },
        },
        required: ["decision", "context"],
      },
    },
    actionItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          who: { type: Type.STRING },
          what: { type: Type.STRING },
        },
        required: ["who", "what"],
      },
    },
    techDetails: { type: Type.ARRAY, items: { type: Type.STRING } },
    projects: { type: Type.ARRAY, items: { type: Type.STRING } },
    blockers: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["meetingType", "summary", "topics", "decisions", "actionItems", "techDetails", "projects", "blockers"],
};

// --- Endpoints ---

app.post('/v1/process-meeting', upload.array('files') as any, async (req: any, res: any) => {
  try {
    if (!req.files || req.files.length === 0) {
      res.status(400).json({ error: "No files provided." });
      return;
    }

    const taskId = uuidv4();
    
    const projectContext = req.body.context;
    const teamContext = req.body.team;
    const language = req.body.language || "English";

    tasks.set(taskId, {
      id: taskId,
      status: 'processing',
      createdAt: Date.now()
    });

    res.status(202).json({ 
      task_id: taskId, 
      status: "accepted",
      message: `${req.files.length} file(s) uploaded and processing started.` 
    });

    // Start Background Processing
    processMeetingInBackground(taskId, req.files, language, projectContext, teamContext);

  } catch (error: any) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/v1/results/:taskId', (req: any, res: any) => {
  const taskId = req.params.taskId;
  const task = tasks.get(taskId);

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  if (task.status === 'processing') {
    res.json({ status: 'processing' });
  } else if (task.status === 'failed') {
    res.json({ status: 'failed', error: task.error });
  } else {
    res.json({ status: 'completed', result: task.result });
  }
});

app.post('/v1/generate-report', async (req: any, res: any) => {
  try {
    const { analysis, language = "English" } = req.body;
    
    if (!analysis) {
      res.status(400).json({ error: "Analysis data is required." });
      return;
    }

    const prompt = `
    You are a professional technical writer and secretary. 
    
    Task: Convert the following JSON meeting analysis data into a comprehensive, beautifully formatted Markdown document (Meeting Minutes).

    IMPORTANT: The entire document (titles, descriptions, content) MUST be written in ${language}.

    Structure the document as follows:
    # Meeting Intelligence Report: ${analysis.meetingType || 'Meeting'}
    ## Executive Summary
    ## Action Items (Use checkboxes [ ] and bold the assignee)
    ## Key Decisions (Include context)
    ## Technical Details & Stack
    ## Blockers & Risks
    ## Discussed Topics
    ## Appendix: Full Transcript (Format nicely with timestamps and speaker names)

    Formatting Rules:
    - Tables MUST be compact. NO empty lines between rows.
    - STRICTLY DO NOT add blank lines between table rows.
    - Tables must be continuous blocks of text.
    - Use clear headers and lists.

    Data:
    ${JSON.stringify(analysis, null, 2)}
    `;

    const response = await ai.models.generateContent({
      model: MODEL_REPORT,
      contents: { parts: [{ text: prompt }] },
      config: {
        temperature: 0.2,
      }
    });

    const report = response.text;
    res.json({ report });

  } catch (error: any) {
    console.error("Report generation failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- Helper Parser ---
// Converts "[00:00] Speaker: Text" format into TranscriptSegment[]
// supports free text fallback
function parseFlexibleTranscript(text: string) {
  const segments: { speaker: string; timestamp: string; text: string }[] = [];
  const lines = text.split('\n');
  let currentSegment: { speaker: string; timestamp: string; text: string } | null = null;

  // Regex to match strictly formatted lines: [00:00] Speaker: Text
  const strictRegex = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+):\s*(.+)$/;

  const hasStrictStructure = lines.some(l => strictRegex.test(l.trim()));

  if (hasStrictStructure) {
      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;

        const match = cleanLine.match(strictRegex);
        if (match) {
          if (currentSegment) segments.push(currentSegment);
          currentSegment = {
            timestamp: match[1],
            speaker: match[2].trim(),
            text: match[3].trim()
          };
        } else {
          // It's a continuation of the previous line
          if (currentSegment) currentSegment.text += " " + cleanLine;
        }
      }
      if (currentSegment) segments.push(currentSegment);
  } else {
      // Fallback: Treat as free text
      for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine) continue;
          
           // Try to detect speaker at start of line "Name: Text" even without timestamp
           const looseSpeakerMatch = /^([A-Za-z0-9 ]+):\s+(.+)/.exec(cleanLine);
          
           if (looseSpeakerMatch) {
             segments.push({
                 timestamp: "00:00",
                 speaker: looseSpeakerMatch[1],
                 text: looseSpeakerMatch[2]
             });
           } else {
             segments.push({
                timestamp: "00:00", 
                speaker: "Document",
                text: cleanLine
             });
           }
      }
  }

  return segments;
}

// --- Background Logic ---

async function processMeetingInBackground(
  taskId: string, 
  files: { mimetype: string; buffer: Buffer, originalname: string }[], 
  language: string,
  projectContext?: string,
  teamContext?: string
) {
  try {
    console.log(`[Task ${taskId}] Processing files...`);
    
    const transcriptionPromises = files.map(async (file, index) => {
      const isAudio = file.mimetype.startsWith('audio') || file.mimetype.startsWith('video');
      // Simple extension check for text files in case mimetype is octet-stream
      const isText = file.mimetype.startsWith('text') || file.originalname.match(/\.(txt|md|srt|vtt|json)$/i);

      if (isAudio) {
          const base64Data = file.buffer.toString('base64');
          
          const prompt = `
          Transcribe this audio segment.
          
          IMPORTANT: The transcript MUST be written in ${language}.
          If the audio is in a different language, translate it to ${language}.

          Strict Output Format per line:
          [MM:SS] Speaker Name: The spoken text.

          Rules:
          - Do NOT use JSON.
          - Do NOT use Markdown formatting (bold, italics, etc).
          - Identify speakers as Speaker 1, Speaker 2, or names if available.
          - Start every new speech segment with the timestamp in brackets.
          `;

          const response = await ai.models.generateContent({
            model: MODEL_TRANSCRIPTION,
            contents: {
              parts: [
                { inlineData: { mimeType: file.mimetype, data: base64Data } },
                { text: prompt }
              ]
            },
            config: {
              temperature: 0,
              thinkingConfig: { thinkingBudget: 0 } // Minimal thinking (disabled)
            }
          });
          
          const text = response.text || "";
          return parseFlexibleTranscript(text);
      } else {
          // Handle Text File
          console.log(`[Task ${taskId}] Reading text file: ${file.originalname}`);
          const textContent = file.buffer.toString('utf-8');
          return parseFlexibleTranscript(textContent);
      }
    });

    const transcriptsParts = await Promise.all(transcriptionPromises);
    // Flatten the array of arrays
    const fullTranscript = transcriptsParts.flat();

    console.log(`[Task ${taskId}] Input processing complete. ${fullTranscript.length} segments. Starting analysis...`);

    // PHASE 2: Analyze the full transcript
    // Use the advanced model for reasoning.
    const transcriptText = fullTranscript.map((t: any) => `[${t.timestamp}] ${t.speaker}: ${t.text}`).join('\n');

    let systemPrompt = `
    You are a Systems Analyst. Your task is to analyze the following meeting transcript and extract structured intelligence.
    
    1. **Meeting Type**: Classify the general category.
    2. **Tech Details**: Extract databases, APIs, libraries, architectures.
    3. **Action Items**: Extract tasks, assignments, and implicit requests. Assign to 'Unknown' if not specified.
    4. **Decisions**: Explicitly agreed upon points.
    5. **Blockers**: Concerns, risks, impediments.
    
    IMPORTANT: All text content in the JSON response MUST be written in ${language}.
    `;

    if (projectContext) {
      systemPrompt += `\n\nPROJECT CONTEXT:\n${projectContext}\n`;
    }

    if (teamContext) {
      systemPrompt += `\n\nTEAM MEMBERS:\n${teamContext}\n`;
    }

    const userPrompt = `Analyze this transcript:\n\n${transcriptText}`;

    const analysisResponse = await ai.models.generateContent({
      model: MODEL_ANALYSIS,
      contents: {
        parts: [{ text: userPrompt }]
      },
      config: {
        systemInstruction: systemPrompt,
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: intelligenceSchema, // Using schema WITHOUT transcript
      },
    });

    const analysisText = analysisResponse.text;
    if (!analysisText) throw new Error("No response from AI model during analysis");

    const analysisResult = JSON.parse(analysisText);

    // MERGE: Combine Intelligence + Full Transcript
    const finalResult = {
      ...analysisResult,
      transcript: fullTranscript
    };

    console.log(`[Task ${taskId}] Analysis complete.`);

    const task = tasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.result = finalResult;
      tasks.set(taskId, task);
    }

  } catch (error: any) {
    console.error(`Task ${taskId} failed:`, error);
    const task = tasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.error = error.message;
      tasks.set(taskId, task);
    }
  }
}

// Start Server
app.listen(PORT, () => {
  console.log(`Meeting Intelligence API running on port ${PORT}`);
});