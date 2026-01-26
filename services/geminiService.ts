import { GoogleGenAI, Type, Schema } from "@google/genai";
import { MeetingAnalysis } from "../types";

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// 1. Transcription Schema
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

// 2. Intelligence Schema (No transcript)
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

export const analyzeMeeting = async (
  files: File[], 
  language: string = "English", 
  projectContext?: string, 
  teamContext?: string, 
  feedback?: string,
  onProgress?: (step: number) => void
): Promise<MeetingAnalysis> => {
  try {
    if (onProgress) onProgress(0); // Preparing Files

    const model = "gemini-flash-latest"; 

    // --- PHASE 1: TRANSCRIPTION ---
    // Transcribe each file individually to avoid output token limits.
    
    if (onProgress) onProgress(1); // Transcribing Audio

    const transcriptPromises = files.map(async (file) => {
       const base64Data = await fileToBase64(file);
       
       const prompt = `Transcribe this audio segment. Identify speakers and provide timestamps. Return JSON array.`;
       
       const resp = await ai.models.generateContent({
         model: model,
         contents: {
            parts: [
                { inlineData: { mimeType: file.type, data: base64Data } },
                { text: prompt }
            ]
         },
         config: {
            responseMimeType: "application/json",
            responseSchema: transcriptSchema,
            temperature: 0,
         }
       });

       return resp.text ? JSON.parse(resp.text) : [];
    });

    const transcriptSegments = await Promise.all(transcriptPromises);
    const fullTranscript = transcriptSegments.flat();

    // --- PHASE 2: ANALYSIS ---
    // Use the transcript string for analysis.
    
    if (onProgress) onProgress(2); // Extracting Intelligence

    const transcriptText = fullTranscript.map((t: any) => `[${t.timestamp}] ${t.speaker}: ${t.text}`).join('\n');

    let systemPrompt = `
    You are a Systems Analyst. Analyze the following transcript.
    
    1. **Meeting Type**: Classify.
    2. **Action Items**: Extract tasks (Who, What).
    3. **Decisions**: Agreed points.
    4. **Tech Details**: Database, APIs, etc.
    5. **Blockers**: Risks.
    
    IMPORTANT: Output in ${language}.
    `;

    if (projectContext) systemPrompt += `\n\nPROJECT CONTEXT:\n${projectContext}\n`;
    if (teamContext) systemPrompt += `\n\nTEAM MEMBERS:\n${teamContext}\n`;

    let userPrompt = `Analyze this transcript:\n\n${transcriptText}`;

    if (feedback) {
       userPrompt += `\n\nIMPORTANT CORRECTION REQUEST: \n"${feedback}"\nFix errors based on this feedback.`;
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [{ text: userPrompt }] },
      config: {
        systemInstruction: systemPrompt,
        temperature: 0, 
        responseMimeType: "application/json",
        responseSchema: intelligenceSchema,
      },
    });

    if (onProgress) onProgress(3); // Finalizing (Just before parse/return)

    const text = response.text;
    if (!text) throw new Error("No response generated from model.");

    const analysisResult = JSON.parse(text);

    return {
        ...analysisResult,
        transcript: fullTranscript
    } as MeetingAnalysis;

  } catch (error) {
    console.error("Analysis failed:", error);
    throw error;
  }
};

export const askMeetingQuestion = async (files: File[], question: string, projectContext?: string, teamContext?: string): Promise<string> => {
  try {
    const model = "gemini-flash-latest";

    const contentParts: any[] = [];
    for (const file of files) {
      const base64Data = await fileToBase64(file);
      contentParts.push({
        inlineData: {
          mimeType: file.type,
          data: base64Data,
        }
      });
    }

    let systemPrompt = `You are a helpful assistant specialized in analyzing meeting recordings. 
    Answer the user's question based strictly on the provided audio content.`;
    
    if (projectContext) systemPrompt += `\n\nPROJECT CONTEXT:\n${projectContext}`;
    if (teamContext) systemPrompt += `\n\nTEAM MEMBERS:\n${teamContext}`;

    contentParts.push({ text: `Question: ${question}` });

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: contentParts },
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2, 
      }
    });

    return response.text || "I could not generate an answer.";
  } catch (error) {
    console.error("Q&A failed:", error);
    throw error;
  }
};

export const generateMarkdownReport = async (analysis: MeetingAnalysis, language: string = "English"): Promise<string> => {
  try {
    const model = "gemini-flash-latest";
    
    const prompt = `
    You are a professional technical writer. 
    Task: Convert the JSON meeting data into a formatted Markdown document.

    IMPORTANT: Write in ${language}.

    Structure:
    # Meeting Intelligence Report: ${analysis.meetingType}
    ## Executive Summary
    ## Action Items (Checkbox list)
    ## Key Decisions
    ## Technical Details
    ## Blockers
    ## Discussed Topics
    ## Appendix: Full Transcript

    Formatting Rules:
    - Do not add extra blank lines between rows in tables.
    - Ensure tables are compact.

    Data:
    ${JSON.stringify(analysis, null, 2)}
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: { text: prompt },
      config: { temperature: 0.2 }
    });

    return response.text || "# Error generating report";
  } catch (error) {
    console.error("Markdown generation failed", error);
    throw error;
  }
};