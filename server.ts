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
// In a real production app, use Redis or a Database
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
app.use(express.json({ limit: '10mb' }) as unknown as express.RequestHandler); // Increase limit for large analysis JSON

// Schema definition (Matching the frontend types)
const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    meetingType: {
      type: Type.STRING,
      description: "The general type or category of the meeting (e.g., 'Daily Standup', 'Incident Post-mortem', 'Project Planning', 'Casual Sync')."
    },
    transcript: {
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
  required: ["meetingType", "transcript", "summary", "topics", "decisions", "actionItems", "techDetails", "projects", "blockers"],
};

// --- Endpoints ---

/**
 * POST /v1/process-meeting
 * Accepts multipart/form-data with 'file' field.
 * Optional body fields: 'context' (project context), 'team' (team members).
 */
app.post('/v1/process-meeting', upload.single('file') as unknown as express.RequestHandler, async (req: any, res: any) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file provided." });
      return;
    }

    const taskId = uuidv4();
    const fileBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;
    
    // Optional context from body
    const projectContext = req.body.context;
    const teamContext = req.body.team;
    const language = req.body.language || "English";

    // Create task
    tasks.set(taskId, {
      id: taskId,
      status: 'processing',
      createdAt: Date.now()
    });

    // Respond immediately (202 Accepted)
    res.status(202).json({ 
      task_id: taskId, 
      status: "accepted",
      message: "File uploaded and processing started." 
    });

    // Start Background Processing
    processMeetingInBackground(taskId, fileBuffer, mimeType, language, projectContext, teamContext);

  } catch (error: any) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v1/results/:taskId
 * Returns the status and result of the analysis.
 */
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

/**
 * POST /v1/generate-report
 * Accepts JSON body with 'analysis' object and optional 'language'.
 * Returns markdown string.
 */
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
  buffer: Buffer, 
  mimeType: string, 
  language: string,
  projectContext?: string,
  teamContext?: string
) {
  try {
    const base64Data = buffer.toString('base64');
    const model = "gemini-flash-latest";

    let systemPrompt = `
    You are a Systems Analyst. Your task is to process the meeting audio and extract structured intelligence.
    
    1. **Meeting Type**: Classify the general category of the meeting (e.g., Daily Standup, Incident Review, Client Sync, Planning).
    2. **Transcript**: Generate a detailed transcript. 
       - **Diarization**: Identify speakers (e.g., 'Speaker A', 'Speaker B', or real names if introduced). 
       - **Timestamps**: Provide an estimated timestamp (MM:SS) for the start of each segment.
    3. **Tech Details**: If a database, API method, library, or specific architecture is mentioned, extract it here.
    4. **Action Items**: Extract all tasks, assignments, and **implicit requests**.
       - Capture direct commitments ("I will do...").
       - Capture polite requests or soft instructions (e.g., "Please recall...", "We need to gather...", "Make sure to...").
       - Capture future planning tasks ("Let's assemble the next release...").
       - If a specific person is not named, assign it to 'Team' or 'Unknown'.
    5. **Decisions**: Explicitly agreed upon points.
    6. **Blockers**: Any raised concerns, risks, or impediments.
    
    IMPORTANT: All text content in the JSON response (summary, transcript text, topics, decisions, etc.) MUST be written in ${language}.
    
    Ensure the output is strictly valid JSON matching the schema.
    `;

    if (projectContext) {
      systemPrompt += `\n\nPROJECT CONTEXT & TERMINOLOGY:\n${projectContext}\n`;
    }

    if (teamContext) {
      systemPrompt += `\n\nTEAM MEMBERS & ROLES:\n${teamContext}\n`;
    }

    const userPrompt = `Analyze this meeting audio and output the results in ${language}.`;

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
          {
            text: userPrompt,
          },
        ],
      },
      config: {
        systemInstruction: systemPrompt,
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI model");

    const result = JSON.parse(text);

    // Update task status
    const task = tasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.result = result;
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