import { MeetingAnalysis, TranscriptSegment } from "../types";

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

    // Convert files to format expected by API
    const filesData = await Promise.all(files.map(async (file) => {
      const isAudio = file.type.startsWith('audio') || file.type.startsWith('video');
      
      if (isAudio) {
        const base64Data = await fileToBase64(file);
        return {
          type: file.type,
          data: base64Data,
        };
      } else {
        const textContent = await readTextFile(file);
        return {
          type: file.type,
          content: textContent,
        };
      }
    }));

    if (onProgress) onProgress(1); // Calling API

    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: filesData,
        language,
        projectContext,
        teamContext,
        feedback,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Analysis failed');
    }

    if (onProgress) onProgress(2); // Processing response

    const result = await response.json();

    if (onProgress) onProgress(3); // Finalizing

    return result as MeetingAnalysis;
  } catch (error) {
    console.error("Analysis failed:", error);
    throw error;
  }
};

export const askMeetingQuestion = async (files: File[], question: string, projectContext?: string, teamContext?: string): Promise<string> => {
  try {
    // Convert files to format expected by API
    const filesData = await Promise.all(files.map(async (file) => {
      const isAudio = file.type.startsWith('audio') || file.type.startsWith('video');
      
      if (isAudio) {
        const base64Data = await fileToBase64(file);
        return {
          type: file.type,
          data: base64Data,
        };
      } else {
        const textContent = await readTextFile(file);
        return {
          type: file.type,
          content: textContent,
        };
      }
    }));

    const response = await fetch('/api/question', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: filesData,
        question,
        projectContext,
        teamContext,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Q&A failed');
    }

    const result = await response.json();
    return result.answer || "I could not generate an answer.";
  } catch (error) {
    console.error("Q&A failed:", error);
    throw error;
  }
};

export const generateMarkdownReport = async (analysis: MeetingAnalysis, language: string = "English"): Promise<string> => {
  try {
    const response = await fetch('/api/markdown', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        analysis,
        language,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Markdown generation failed');
    }

    const result = await response.json();
    return result.markdown || "# Error generating report";
  } catch (error) {
    console.error("Markdown generation failed:", error);
    throw error;
  }
};
