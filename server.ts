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

app.use(cors() as unknown as express.RequestHandler);
app.use(express.json({ limit: '50mb' }) as unknown as express.RequestHandler); // Increased limit for large transcript payloads

// --- Schemas ---

// 1. Schema for Transcription only
const transcriptSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      speaker: { type: Type.STRING },
      timestamp: { type: Type.STRING },
      text: { type: Type.STRING },
    },
    required: ["speaker", "timestamp", "text"],
  },
};

// 2. Schema for Intelligence only (No transcript)
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

app.post('/v1/process-meeting', upload.array('files') as unknown as express.RequestHandler, async (req: any, res: any) => {
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

    const model = "gemini-flash-latest";
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
    - Do not add extra blank lines between rows in tables.
    - Ensure tables are compact.
    - Use clear headers and lists.

    Data:
    ${JSON.stringify(analysis, null, 2)}
    `;

    const response = await ai.models.generateContent({
      model: model,
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

// --- Background Logic ---

async function processMeetingInBackground(
  taskId: string, 
  files: { mimetype: string; buffer: Buffer }[], 
  language: string,
  projectContext?: string,
  teamContext?: string
) {
  try {
    const model = "gemini-flash-latest";

    // PHASE 1: Transcribe each file individually (Parallel)
    // This avoids output token limits for massive transcripts
    console.log(`[Task ${taskId}] Starting transcription phase...`);
    
    const transcriptionPromises = files.map(async (file, index) => {
      const base64Data = file.buffer.toString('base64');
      
      const prompt = `
      Transcribe this audio segment.
      - Identify speakers (Speaker A, B, etc.).
      - Provide timestamps.
      - Output strictly as a JSON array of objects: [{ "speaker": "...", "timestamp": "...", "text": "..." }]
      `;

      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            { inlineData: { mimeType: file.mimetype, data: base64Data } },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: transcriptSchema,
          temperature: 0,
        }
      });
      
      const text = response.text;
      if (!text) return [];
      try {
        return JSON.parse(text);
      } catch (e) {
        console.warn(`Failed to parse transcript for file ${index}`, e);
        return [];
      }
    });

    const transcriptsParts = await Promise.all(transcriptionPromises);
    // Flatten the array of arrays
    const fullTranscript = transcriptsParts.flat();

    console.log(`[Task ${taskId}] Transcription complete. ${fullTranscript.length} segments. Starting analysis...`);

    // PHASE 2: Analyze the full transcript
    // Convert transcript object to a string format to save tokens and provide context
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
      model: model,
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