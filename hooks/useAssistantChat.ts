import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  annotationsMap: Record<string, string>;
  input: string;
  setInput: (v: string) => void;
  isLoading: boolean;
  error: string | null;
  sendMessage: () => Promise<void>;
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? '';

function extractAnnotations(
  annotations: any[] | undefined,
  setter: React.Dispatch<React.SetStateAction<Record<string, string>>>,
) {
  if (!annotations?.length) return;
  const entries: Record<string, string> = {};
  for (const ann of annotations) {
    if (ann.type === 'file_citation' && ann.text && ann.file_citation?.file_id) {
      entries[ann.text] = ann.file_citation.file_id;
    }
  }
  if (Object.keys(entries).length > 0) {
    setter(prev => ({ ...prev, ...entries }));
  }
}

export function useAssistantChat({
  userId,
  project,
  thread,
  settings,
  onThreadCreated,
}: UseAssistantChatOptions): UseAssistantChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [annotationsMap, setAnnotationsMap] = useState<Record<string, string>>({});
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the active OpenAI thread ID across the lifetime of this hook instance
  const activeThreadIdRef = useRef<string | null>(thread?.openai_thread_id ?? null);

  // When the user picks a DIFFERENT existing thread from the sidebar, reset the chat
  // and load history from OpenAI. Skip when a new thread is created and propagated
  // back as a prop (detected by matching activeThreadIdRef).
  useEffect(() => {
    const incomingOaiId = thread?.openai_thread_id ?? null;
    if (incomingOaiId !== null && incomingOaiId === activeThreadIdRef.current) {
      // This is the thread we just created — don't reset messages
      return;
    }
    // Genuinely different thread selected from sidebar (or cleared to null)
    activeThreadIdRef.current = incomingOaiId;
    setMessages([]);
    setAnnotationsMap({});
    setError(null);

    if (!incomingOaiId || !settings?.openaiApiKey) return;

    // Load existing messages from OpenAI
    fetch(`${API_BASE}/api/assistant/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: incomingOaiId, openai_api_key: settings.openaiApiKey }),
    })
      .then(r => r.json())
      .then((data: { messages?: Array<{ id: string; role: 'user' | 'assistant'; content: string; annotations: any[] }> }) => {
        if (!data.messages) return;
        setMessages(data.messages.map(m => ({ id: m.id, role: m.role, content: m.content })));
        // Restore annotationsMap from historical annotations
        const restored: Record<string, string> = {};
        for (const m of data.messages) {
          for (const ann of (m.annotations ?? [])) {
            if (ann.type === 'file_citation' && ann.text && ann.file_citation?.file_id) {
              restored[ann.text] = ann.file_citation.file_id;
            }
          }
        }
        if (Object.keys(restored).length > 0) setAnnotationsMap(restored);
      })
      .catch(() => { /* silently ignore history load errors */ });
  }, [thread?.id, settings?.openaiApiKey]);

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
          projectContext: project.context ?? null,
          teamContext: project.team ?? null,
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

            if (evt.object === 'thread.message.delta') {
              const textContent = evt.delta?.content?.[0]?.text;
              const delta: string = textContent?.value ?? '';
              if (delta) {
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + delta }
                    : m
                ));
              }
              if (textContent?.annotations?.length) {
                console.log('[SSE delta annotations]', textContent.annotations);
              }
              extractAnnotations(textContent?.annotations, setAnnotationsMap);
            }

            // thread.message.completed carries the final, authoritative annotations
            if (evt.object === 'thread.message') {
              console.log('[SSE thread.message]', evt.status, evt.content);
              const textContent = evt.content?.find((c: any) => c.type === 'text')?.text;
              if (textContent?.annotations?.length) {
                console.log('[SSE completed annotations]', textContent.annotations);
              }
              extractAnnotations(textContent?.annotations, setAnnotationsMap);
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

  return { messages, annotationsMap, input, setInput, isLoading, error, sendMessage };
}
