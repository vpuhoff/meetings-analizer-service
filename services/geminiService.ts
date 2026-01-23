import { GoogleGenAI, Type, Schema } from "@google/genai";
import { MeetingAnalysis } from "../types";

// Initialize Gemini client
// Note: In a real backend (FastAPI as per TZ), this would happen server-side.
// Here we simulate the "Microservice" logic in the browser.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// The Schema matching the TZ requirements
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
          speaker: { type: Type.STRING, description: "Name of the speaker (e.g. 'Speaker 1', 'Alice')." },
          timestamp: { type: Type.STRING, description: "Time offset (e.g. '04:20')." },
          text: { type: Type.STRING, description: "The spoken content." },
        },
        required: ["speaker", "timestamp", "text"],
      },
      description: "Verbatim transcript with speaker identification and timestamps.",
    },
    summary: {
      type: Type.STRING,
      description: "A brief summary of the meeting (3-5 sentences).",
    },
    topics: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of discussed topics.",
    },
    decisions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          decision: { type: Type.STRING },
          context: { type: Type.STRING, description: "Context or reasoning behind the decision." },
        },
        required: ["decision", "context"],
      },
      description: "Decisions made during the meeting.",
    },
    actionItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          who: { type: Type.STRING, description: "Person responsible (or 'Unknown')." },
          what: { type: Type.STRING, description: "The task description." },
        },
        required: ["who", "what"],
      },
      description: "Action items extracted from the conversation.",
    },
    techDetails: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Technical stack details, API names, architectural decisions, configs.",
    },
    projects: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Mentioned codebases, internal services, or project names.",
    },
    blockers: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Problems, risks, and obstacles mentioned.",
    },
  },
  required: ["meetingType", "transcript", "summary", "topics", "decisions", "actionItems", "techDetails", "projects", "blockers"],
};

// Helper to convert File to Base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data url prefix (e.g. "data:audio/mp3;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const analyzeMeeting = async (file: File, language: string = "English", projectContext?: string, teamContext?: string, feedback?: string): Promise<MeetingAnalysis> => {
  try {
    const base64Data = await fileToBase64(file);
    const mimeType = file.type;

    // We use gemini-flash-latest (mapping to gemini-2.5-flash-latest per instructions)
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
      systemPrompt += `\n\nPROJECT CONTEXT & TERMINOLOGY:\nThe user has provided specific context for this project. Use these definitions to better understand acronyms, project names, and technical specifics:\n"""\n${projectContext}\n"""\n`;
    }

    if (teamContext) {
      systemPrompt += `\n\nTEAM MEMBERS & ROLES:\nThe user has provided a list of team members and potentially their roles. Use this to identify speakers in the transcript and correctly assign Action Items:\n"""\n${teamContext}\n"""\n`;
    }

    let userPrompt = `Analyze this meeting audio and output the results in ${language}.`;

    if (feedback) {
      userPrompt += `\n\nIMPORTANT CORRECTION REQUEST: The user has identified errors in a previous analysis of this file. 
      Please re-analyze the audio with the following corrections in mind: 
      "${feedback}"
      
      Fix any misunderstood terms, entities, or contexts based on this feedback and regenerate the full report.`;
    }

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
        temperature: 0, // As per TZ: minimize hallucinations
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response generated from model.");
    }

    return JSON.parse(text) as MeetingAnalysis;

  } catch (error) {
    console.error("Analysis failed:", error);
    throw error;
  }
};

export const askMeetingQuestion = async (file: File, question: string, projectContext?: string, teamContext?: string): Promise<string> => {
  try {
    const base64Data = await fileToBase64(file);
    const mimeType = file.type;
    const model = "gemini-flash-latest";

    let systemPrompt = `You are a helpful assistant specialized in analyzing meeting recordings. 
    Answer the user's question based strictly on the provided audio content. 
    If the answer is not in the audio, state that clearly.
    Provide concise and accurate answers.`;
    
    if (projectContext) {
      systemPrompt += `\n\nPROJECT CONTEXT:\n${projectContext}`;
    }
    
    if (teamContext) {
      systemPrompt += `\n\nTEAM MEMBERS:\n${teamContext}`;
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Data } },
          { text: `Question: ${question}` }
        ]
      },
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
    You are a professional technical writer and secretary. 
    
    Task: Convert the following JSON meeting analysis data into a comprehensive, beautifully formatted Markdown document (Meeting Minutes).

    IMPORTANT: The entire document (titles, descriptions, content) MUST be written in ${language}.

    Structure the document as follows:
    # Meeting Intelligence Report: ${analysis.meetingType}
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
      contents: { text: prompt },
      config: {
        temperature: 0.2,
      }
    });

    return response.text || "# Error generating report";
  } catch (error) {
    console.error("Markdown generation failed", error);
    throw error;
  }
};