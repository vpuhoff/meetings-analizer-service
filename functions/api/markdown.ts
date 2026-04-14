import { GoogleGenAI } from "@google/genai";

export async function onRequestPost(context: any) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { analysis, language } = body;

    if (!analysis) {
      return new Response(JSON.stringify({ error: "Analysis data is required" }), {
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

    const prompt = `
    You are a professional technical writer. 
    Task: Convert the JSON meeting data into a formatted Markdown document.

    IMPORTANT: Write in ${language || "English"}.

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
      model: MODEL_REPORT,
      contents: { text: prompt },
      config: { temperature: 0.2 }
    });

    return new Response(JSON.stringify({ markdown: response.text || "# Error generating report" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Markdown generation failed:", error);
    return new Response(JSON.stringify({ error: error.message || "Markdown generation failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
