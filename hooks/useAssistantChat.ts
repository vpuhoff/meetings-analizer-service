import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChatThread, UserSettings, saveChatThread } from '../services/meetingService';
import { Project } from '../types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface UseAssistantChatOptions {
  userId: string;
  project: Project;
  thread: ChatThread | null;
  settings: UserSettings | null;
  onThreadCreated: (thread: ChatThread) => void;
}

interface UseAssistantChatReturn {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  isLoading: boolean;
  error: string | null;
  sendMessage: () => Promise<void>;
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? '';

export function useAssistantChat({
  userId,
  project,
  thread,
  settings,
  onThreadCreated,
}: UseAssistantChatOptions): UseAssistantChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the active OpenAI thread ID across the lifetime of this hook instance
  const activeThreadIdRef = useRef<string | null>(thread?.openai_thread_id ?? null);

  // When the user picks a DIFFERENT existing thread from the sidebar, reset the chat.
  // We must NOT reset when a new thread is created and propagated back as a prop —
  // that case is detected by checking whether the new thread id matches what we
  // already set in activeThreadIdRef during sendMessage.
  useEffect(() => {
    const incomingOaiId = thread?.openai_thread_id ?? null;
    if (incomingOaiId !== null && incomingOaiId === activeThreadIdRef.current) {
      // This is the thread we just created — don't reset messages
      return;
    }
    // Genuinely different thread selected from sidebar (or cleared to null)
    activeThreadIdRef.current = incomingOaiId;
    setMessages([]);
    setError(null);
  }, [thread?.id]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    if (!settings?.openaiApiKey) {
      setError('OpenAI API key not configured. Add it in Settings.');
      return;
    }
    if (!settings?.openaiAssistantId) {
      setError('OpenAI Assistant ID not configured. Add it in Settings.');
      return;
    }

    setInput('');
    setIsLoading(true);
    setError(null);

    // Optimistically add user message
    const userMsgId = uuidv4();
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: text }]);

    // Placeholder for streaming assistant reply
    const assistantMsgId = uuidv4();
    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }]);

    try {
      const res = await fetch(`${API_BASE}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          threadId: activeThreadIdRef.current ?? null,
          assistant_id: settings.openaiAssistantId,
          openai_api_key: settings.openaiApiKey,
          vectorStoreId: project.openai_vector_store_id ?? null,
        }),
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      // Save new thread to Firestore if this is the first message
      const returnedThreadId = res.headers.get('x-thread-id');
      if (returnedThreadId && !activeThreadIdRef.current) {
        activeThreadIdRef.current = returnedThreadId;
        const newThread: ChatThread = {
          id: uuidv4(),
          userId,
          project_id: project.id,
          openai_thread_id: returnedThreadId,
          title: text.slice(0, 60),
          created_at: Date.now(),
          updated_at: Date.now(),
        };
        saveChatThread(newThread).then(() => onThreadCreated(newThread));
      }

      // Read SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          // SSE format: "event: <name>" followed by "data: <json>"
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;

          try {
            const evt = JSON.parse(raw);
            // OpenAI v2 SSE: object === 'thread.message.delta'
            if (evt.object === 'thread.message.delta') {
              const delta: string = evt.delta?.content?.[0]?.text?.value ?? '';
              if (delta) {
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + delta }
                    : m
                ));
              }
            }
          } catch {
            // non-JSON line — skip
          }
        }
      }

    } catch (err: any) {
      setError(err.message);
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: `*Error: ${err.message}*` }
          : m
      ));
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, settings, project, userId, onThreadCreated]);

  return { messages, input, setInput, isLoading, error, sendMessage };
}
