import { GoogleGenAI } from "@google/genai";

export async function onRequestPost(context: any) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { files, question, projectContext, teamContext } = body;

    if (!question) {
      return new Response(JSON.stringify({ error: "Question is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!files || !Array.isArray(files)) {
      return new Response(JSON.stringify({ error: "Files array is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const MODEL_REPORT = "gemini-3-flash-preview";

    const contentParts: any[] = [];
    
    for (const file of files) {
       const isAudio = file.type.startsWith('audio') || file.type.startsWith('video');
       
       if (isAudio) {
          contentParts.push({
            inlineData: {
              mimeType: file.type,
              data: file.data,
            }
          });
       } else {
          contentParts.push({ text: `Transcript Context: ${file.content}` });
       }
    }

    let systemPrompt = `You are a helpful assistant specialized in analyzing meeting recordings. 
    Answer the user's question based strictly on the provided content.`;
    
    if (projectContext) systemPrompt += `\n\nPROJECT CONTEXT:\n${projectContext}`;
    if (teamContext) systemPrompt += `\n\nTEAM MEMBERS:\n${teamContext}`;

    contentParts.push({ text: `Question: ${question}` });

    const response = await ai.models.generateContent({
      model: MODEL_REPORT,
      contents: { parts: contentParts },
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2, 
      }
    });

    return new Response(JSON.stringify({ answer: response.text || "I could not generate an answer." }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Q&A failed:", error);
    return new Response(JSON.stringify({ error: error.message || "Q&A failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
