import { GoogleGenAI, Type, Schema } from "@google/genai";

// Intelligence Schema
const intelligenceSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    meetingTitle: { type: Type.STRING, description: "Short concise meeting title (5-7 words max)." },
    meetingType: { type: Type.STRING, description: "Meeting category." },
    summary: { type: Type.STRING, description: "3-5 sentence summary." },
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
  },
  required: ["meetingTitle", "meetingType", "summary", "topics", "decisions", "actionItems", "techDetails", "projects", "blockers", "transcript"],
};

// Helper function to parse transcript
function parseTranscript(text: string): Array<{ speaker: string; timestamp: string; text: string }> {
  const lines = text.split('\n');
  const segments: Array<{ speaker: string; timestamp: string; text: string }> = [];
  const strictRegex = /^\[(\d{2}:\d{2})\]\s+([A-Za-z0-9\s]+):\s+(.+)$/;

  // Try strict format first
  let hasStrictFormat = lines.some(line => strictRegex.test(line.trim()));

  if (hasStrictFormat) {
    let currentSegment: { speaker: string; timestamp: string; text: string } | null = null;
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
        if (currentSegment) currentSegment.text += " " + cleanLine;
      }
    }
    if (currentSegment) segments.push(currentSegment);
  } else {
    let timeOffset = 0;
    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;

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

// Analyze endpoint
async function analyze(request: Request, env: any) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  try {
    const body = await request.json();
    const { transcript, files, language, projectContext, teamContext, feedback } = body;

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const ai = new GoogleGenAI({ apiKey });
    const MODEL_ANALYSIS = "gemini-3.1-flash-lite-preview";

    let fullTranscript: Array<{ speaker: string; timestamp: string; text: string }> = [];

    // If transcript is provided from client (new chunked approach), use it
    if (transcript && Array.isArray(transcript)) {
      fullTranscript = transcript;
    } 
    // Otherwise fallback to old files processing (for backwards compatibility)
    else if (files && Array.isArray(files)) {
      const MODEL_TRANSCRIPT = "gemini-3.1-flash-lite-preview";
      
      for (const file of files) {
        const isAudio = file.type.startsWith('audio') || file.type.startsWith('video');

        if (isAudio) {
          // Get transcription with retry for timeout
          let transcriptText = "";
          let retries = 2;
          while (retries > 0) {
            try {
              const transcriptResponse = await ai.models.generateContent({
                model: MODEL_TRANSCRIPT,
                contents: { parts: [{ inlineData: { mimeType: file.type, data: file.data } }] },
                config: {
                  systemInstruction: "You are a helpful assistant that transcribes audio. Return the transcript in the format [MM:SS] Speaker: text. If no speaker is detected, use 'Speaker 1', 'Speaker 2', etc.",
                  temperature: 0.2,
                  maxOutputTokens: 8192
                }
              });
              transcriptText = transcriptResponse.text || "";
              break;
            } catch (e: any) {
              if (e.message?.includes('524') || e.message?.includes('timeout')) {
                retries--;
                if (retries === 0) throw new Error("Transcription timeout - audio file too long. Try splitting into smaller files (< 10 minutes).");
                await new Promise(r => setTimeout(r, 1000));
              } else {
                throw e;
              }
            }
          }

          if (!transcriptText) throw new Error("No transcript generated from model.");

          const segments = parseTranscript(transcriptText);
          fullTranscript.push(...segments);
        } else {
          const textContent = file.content;
          const segments = parseTranscript(textContent);
          fullTranscript.push(...segments);
        }
      }
    } else {
      return new Response(JSON.stringify({ error: "Either 'transcript' array or 'files' array is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    // Build content parts for analysis
    const contentParts: any[] = [];
    
    let systemPrompt = `You are a helpful assistant specialized in analyzing meeting recordings. IMPORTANT: Write in ${language || "English"}. Extract and return only valid JSON matching the provided schema. Do not include any conversational text outside the JSON.

For meetingTitle: generate a short, specific title (5-7 words max) that describes the meeting topic, e.g. "Backend API Deployment Planning" or "Sprint 12 Retrospective Review". Do NOT use generic titles like "Meeting" or "Team Sync".`;

    if (projectContext) systemPrompt += `\n\nPROJECT CONTEXT:\n${projectContext}`;
    if (teamContext) systemPrompt += `\n\nTEAM MEMBERS:\n${teamContext}`;
    if (feedback) systemPrompt += `\n\nFEEDBACK FROM PREVIOUS ANALYSIS:\n${feedback}`;

    contentParts.push({ text: systemPrompt });
    contentParts.push({ text: `Analyze the following meeting transcript and extract key information:` });

    fullTranscript.forEach(segment => {
      contentParts.push({ text: `[${segment.timestamp}] ${segment.speaker}: ${segment.text}` });
    });

    const response = await ai.models.generateContent({
      model: MODEL_ANALYSIS,
      contents: { parts: contentParts },
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2,
        responseSchema: intelligenceSchema,
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response generated from model.");

    const analysisResult = JSON.parse(text);

    return new Response(JSON.stringify({
      ...analysisResult,
      transcript: fullTranscript
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Analysis failed:", error);
    return new Response(JSON.stringify({ error: error.message || "Analysis failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// Question endpoint
async function question(request: Request, env: any) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  try {
    const body = await request.json();
    const { files, question, projectContext, teamContext } = body;

    if (!question) {
      return new Response(JSON.stringify({ error: "Question is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    if (!files || !Array.isArray(files)) {
      return new Response(JSON.stringify({ error: "Files array is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const ai = new GoogleGenAI({ apiKey });
    const MODEL_REPORT = "gemini-3.1-flash-lite-preview";

    const contentParts: any[] = [];

    for (const file of files) {
      const isAudio = file.type.startsWith('audio') || file.type.startsWith('video');

      if (isAudio) {
        contentParts.push({ inlineData: { mimeType: file.type, data: file.data } });
      } else {
        contentParts.push({ text: `Transcript Context: ${file.content}` });
      }
    }

    let systemPrompt = `You are a helpful assistant specialized in analyzing meeting recordings. Answer the user's question based strictly on the provided content.`;
    if (projectContext) systemPrompt += `\n\nPROJECT CONTEXT:\n${projectContext}`;
    if (teamContext) systemPrompt += `\n\nTEAM MEMBERS:\n${teamContext}`;

    contentParts.push({ text: `Question: ${question}` });

    const response = await ai.models.generateContent({
      model: MODEL_REPORT,
      contents: { parts: contentParts },
      config: { systemInstruction: systemPrompt, temperature: 0.2 }
    });

    return new Response(JSON.stringify({ answer: response.text || "I could not generate an answer." }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Q&A failed:", error);
    return new Response(JSON.stringify({ error: error.message || "Q&A failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// Markdown endpoint
async function markdown(request: Request, env: any) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  try {
    const body = await request.json();
    const { analysis, language } = body;

    if (!analysis) {
      return new Response(JSON.stringify({ error: "Analysis data is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const ai = new GoogleGenAI({ apiKey });
    const MODEL_REPORT = "gemini-3.1-flash-lite-preview";

    const prompt = `You are a professional technical writer. Task: Convert the JSON meeting data into a formatted Markdown document. IMPORTANT: Write in ${language || "English"}. Structure: # Meeting Intelligence Report: ${analysis.meetingType} ## Executive Summary ## Action Items (Checkbox list) ## Key Decisions ## Technical Details ## Blockers ## Discussed Topics ## Appendix: Full Transcript Formatting Rules: - Tables MUST be compact. NO empty lines between rows. - STRICTLY DO NOT add blank lines between table rows. - Tables must be continuous blocks of text. - Use standard markdown lists for Action Items. Data: ${JSON.stringify(analysis, null, 2)}`;

    const response = await ai.models.generateContent({
      model: MODEL_REPORT,
      contents: { text: prompt },
      config: { temperature: 0.2 }
    });

    return new Response(JSON.stringify({ markdown: response.text || "# Error generating report" }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Markdown generation failed:", error);
    return new Response(JSON.stringify({ error: error.message || "Markdown generation failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// Transcribe single audio chunk
async function transcribe(request: Request, env: any): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  try {
    const body = await request.json();
    const { audio, type, language } = body;

    if (!audio || !type) {
      return new Response(JSON.stringify({ error: "Audio data and type are required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const ai = new GoogleGenAI({ apiKey });
    const MODEL_TRANSCRIBE = "gemini-3.1-flash-lite-preview";

    const response = await ai.models.generateContent({
      model: MODEL_TRANSCRIBE,
      contents: { 
        parts: [
          { inlineData: { mimeType: type, data: audio } }
        ] 
      },
      config: {
        systemInstruction: `You are a helpful assistant that transcribes audio. 
Return the transcript in the strict format:
[MM:SS] Speaker Name: The spoken text.

If no speaker is detected, use 'Speaker 1', 'Speaker 2', etc.
IMPORTANT: The transcript MUST be written in ${language || "English"}.
If the audio is in a different language, translate it to ${language || "English"}.

Output ONLY the transcript lines. No JSON, no markdown, no explanations.`,
        temperature: 0.2,
        maxOutputTokens: 8192
      }
    });

    const transcriptText = response.text || "";
    
    // Parse transcript into segments
    const segments = parseTranscript(transcriptText);

    return new Response(JSON.stringify({ 
      transcript: segments,
      raw: transcriptText 
    }), { 
      status: 200, 
      headers: { "Content-Type": "application/json" } 
    });

  } catch (error: any) {
    console.error("Transcription failed:", error);
    return new Response(JSON.stringify({ error: error.message || "Transcription failed" }), { 
      status: 500, 
      headers: { "Content-Type": "application/json" } 
    });
  }
}

// Main worker with routing
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function withCors(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Routing
    if (path === "/api/analyze") {
      return withCors(await analyze(request, env));
    } else if (path === "/api/transcribe") {
      return withCors(await transcribe(request, env));
    } else if (path === "/api/question") {
      return withCors(await question(request, env));
    } else if (path === "/api/markdown") {
      return withCors(await markdown(request, env));
    } else {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }
  },
};
