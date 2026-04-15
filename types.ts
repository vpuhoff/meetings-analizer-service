export interface ActionItem {
  who: string;
  what: string;
  dueDate?: string;
}

export interface Decision {
  decision: string;
  context: string;
}

export interface TranscriptSegment {
  speaker: string;
  timestamp: string;
  text: string;
}

export interface MeetingAnalysis {
  meetingTitle: string;
  meetingType: string;
  summary: string;
  transcript: TranscriptSegment[];
  topics: string[];
  decisions: Decision[];
  actionItems: ActionItem[];
  techDetails: string[];
  projects: string[];
  blockers: string[];
}

export type ProcessingStatus = 'idle' | 'uploading' | 'processing' | 'completed' | 'error';

export interface ProcessingError {
  message: string;
  code?: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;
  context: string;
  team?: string;
  createdAt: string;
  updatedAt: string;
}