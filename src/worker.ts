import { GoogleGenAI, Type, Schema } from "@google/genai";

// Intelligence Schema
const intelligenceSchema: Schema = {
  type: Type.OBJECT,
  properties: {
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
  },
  required: ["meetingType", "summary", "topics", "decisions", "actionItems", "techDetails", "projects", "blockers"],
};

// Helper to parse Transcript
function parseFlexibleTranscript(text: string) {
  const segments = [];
  const lines = text.split('\n');
  let currentSegment = null;
  
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
          if (currentSegment) currentSegment.text += " " + cleanLine;
        }
      }
      if (currentSegment) segments.push(currentSegment);
  } else {
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
    const { files, language, projectContext, teamContext, feedback } = body;

    if (!files || !Array.isArray(files)) {
      return new Response(JSON.stringify({ error: "Files array is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const ai = new GoogleGenAI({ apiKey });
    const MODEL_TRANSCRIPTION = "gemini-3-flash-preview";
    const MODEL_ANALYSIS = "gemini-3-pro-preview";

    // Phase 1: Transcription
    const transcriptSegmentsNested = await Promise.all(files.map(async (file: any) => {
       const isAudio = file.type.startsWith('audio') || file.type.startsWith('video');
       
       if (isAudio) {
           const prompt = `Transcribe this audio segment. IMPORTANT: The transcript MUST be written in ${language || "English"}. If the audio is in a different language, translate it to ${language || "English"}. Format output strictly as lines: [MM:SS] Speaker Name: The spoken text. Do NOT use JSON. Do NOT use Markdown.`;
           
           const resp = await ai.models.generateContent({
             model: MODEL_TRANSCRIPTION,
             contents: {
                parts: [
                    { inlineData: { mimeType: file.type, data: file.data } },
                    { text: prompt }
                ]
             },
             config: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
           });

           return parseFlexibleTranscript(resp.text || "");
       } else {
           return parseFlexibleTranscript(file.content);
       }
    }));

    const fullTranscript = transcriptSegmentsNested.flat();
    const transcriptText = fullTranscript.map((t: any) => `[${t.timestamp}] ${t.speaker}: ${t.text}`).join('\n');

    // Phase 2: Analysis
    let systemPrompt = `You are a Systems Analyst. Analyze the following transcript. 1. Meeting Type: Classify. 2. Action Items: Extract tasks (Who, What). 3. Decisions: Agreed points. 4. Tech Details: Database, APIs, etc. 5. Blockers: Risks. IMPORTANT: Output in ${language || "English"}.`;

    if (projectContext) systemPrompt += `\n\nPROJECT CONTEXT:\n${projectContext}\n`;
    if (teamContext) systemPrompt += `\n\nTEAM MEMBERS:\n${teamContext}\n`;

    let userPrompt = `Analyze this transcript:\n\n${transcriptText}`;
    if (feedback) userPrompt += `\n\nIMPORTANT CORRECTION REQUEST: \n"${feedback}"\nFix errors based on this feedback.`;

    const response = await ai.models.generateContent({
      model: MODEL_ANALYSIS,
      contents: { parts: [{ text: userPrompt }] },
      config: {
        systemInstruction: systemPrompt,
        temperature: 0, 
        responseMimeType: "application/json",
        responseSchema: intelligenceSchema,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response generated from model.");

    const analysisResult = JSON.parse(text);

    return new Response(JSON.stringify({ ...analysisResult, transcript: fullTranscript }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Analysis failed:", error);
    return new Response(JSON.stringify({ error: error.message || "Analysis failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
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
    const MODEL_REPORT = "gemini-3-flash-preview";

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
    const MODEL_REPORT = "gemini-3-flash-preview";

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

// Main worker with routing
export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Routing
    if (path === "/api/analyze") {
      return analyze(request, env);
    } else if (path === "/api/question") {
      return question(request, env);
    } else if (path === "/api/markdown") {
      return markdown(request, env);
    } else {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  },
};
