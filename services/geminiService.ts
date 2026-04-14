import { GoogleGenAI, Type, Schema } from "@google/genai";
import { MeetingAnalysis, TranscriptSegment } from "../types";

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Models Configuration
const MODEL_TRANSCRIPTION = "gemini-3-flash-preview"; // Supports thinking config
const MODEL_ANALYSIS = "gemini-3-pro-preview";
const MODEL_REPORT = "gemini-3-flash-preview";

// Intelligence Schema (No transcript)
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

// Helper to read Text File
const readTextFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
};

// Helper: Parse Transcript (Flexible)
// Tries to match strict "[MM:SS] Speaker: Text" format.
// If that fails, treats lines as free text segments.
function parseFlexibleTranscript(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = text.split('\n');
  let currentSegment: TranscriptSegment | null = null;
  
  // Strict Regex: [MM:SS] Speaker: Text
  const strictRegex = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+):\s*(.+)$/;

  // First pass: Check if it looks like a structured transcript
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
          // Continuation of previous line
          if (currentSegment) currentSegment.text += " " + cleanLine;
        }
      }
      if (currentSegment) segments.push(currentSegment);
  } else {
      // Fallback: Treat as free text
      // We will chunk it by paragraph to keep UI clean
      let timeOffset = 0;
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

    // --- PHASE 1: PREPARATION & TRANSCRIPTION ---
    
    if (onProgress) onProgress(1); // Transcribing Audio (or reading text)

    const transcriptSegmentsNested = await Promise.all(files.map(async (file) => {
       const isAudio = file.type.startsWith('audio') || file.type.startsWith('video');
       
       if (isAudio) {
           // Audio File: Transcribe via Gemini
           const base64Data = await fileToBase64(file);
           const prompt = `
           Transcribe this audio segment.
           
           IMPORTANT: The transcript MUST be written in ${language}.
           If the audio is in a different language, translate it to ${language}.

           Format output strictly as lines: 
           [MM:SS] Speaker Name: The spoken text.
           
           Do NOT use JSON. Do NOT use Markdown.
           `;
           
           const resp = await ai.models.generateContent({
             model: MODEL_TRANSCRIPTION,
             contents: {
                parts: [
                    { inlineData: { mimeType: file.type, data: base64Data } },
                    { text: prompt }
                ]
             },
             config: { 
                 temperature: 0,
                 thinkingConfig: { thinkingBudget: 0 } // Minimal thinking (disabled)
             }
           });

           return parseFlexibleTranscript(resp.text || "");

       } else {
           // Text File: Read directly
           const textContent = await readTextFile(file);
           return parseFlexibleTranscript(textContent);
       }
    }));

    const fullTranscript = transcriptSegmentsNested.flat();

    // --- PHASE 2: ANALYSIS ---
    
    if (onProgress) onProgress(2); // Extracting Intelligence

    // Combine segments into one text block for the prompt
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
      model: MODEL_ANALYSIS,
      contents: { parts: [{ text: userPrompt }] },
      config: {
        systemInstruction: systemPrompt,
        temperature: 0, 
        responseMimeType: "application/json",
        responseSchema: intelligenceSchema,
      },
    });

    if (onProgress) onProgress(3); // Finalizing

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
    const contentParts: any[] = [];
    
    for (const file of files) {
       const isAudio = file.type.startsWith('audio') || file.type.startsWith('video');
       
       if (isAudio) {
          const base64Data = await fileToBase64(file);
          contentParts.push({
            inlineData: {
              mimeType: file.type,
              data: base64Data,
            }
          });
       } else {
          // For text files, we add the content directly to context
          const text = await readTextFile(file);
          contentParts.push({ text: `Transcript Context: ${text}` });
       }
    }

    let systemPrompt = `You are a helpful assistant specialized in analyzing meeting recordings. 
    Answer the user's question based strictly on the provided content.`;
    
    if (projectContext) systemPrompt += `\n\nPROJECT CONTEXT:\n${projectContext}`;
    if (teamContext) systemPrompt += `\n\nTEAM MEMBERS:\n${teamContext}`;

    contentParts.push({ text: `Question: ${question}` });

    const response = await ai.models.generateContent({
      model: MODEL_REPORT, // Use the faster flash model for chat interaction
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
    - Tables MUST be compact. NO empty lines between rows.
    - STRICTLY DO NOT add blank lines between table rows.
    - Tables must be continuous blocks of text.
    - Use standard markdown lists for Action Items.

    Data:
    ${JSON.stringify(analysis, null, 2)}
    `;

    const response = await ai.models.generateContent({
      model: MODEL_REPORT, // Use Flash for text generation tasks
      contents: { text: prompt },
      config: { temperature: 0.2 }
    });

    return response.text || "# Error generating report";
  } catch (error) {
    console.error("Markdown generation failed", error);
    throw error;
  }
};