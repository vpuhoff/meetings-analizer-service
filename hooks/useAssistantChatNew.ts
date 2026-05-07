import React, { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChatThread, UserSettings, saveChatThread } from '../services/meetingService';
import { Project } from '../types';
import { CitationAnnotation, buildAnnotationsMap, AnnotationsMapNew } from '../utils/formatCitationsNew';

export interface ChatMessageNew {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface UseAssistantChatNewOptions {
  userId: string;
  project: Project;
  thread: ChatThread | null;
  settings: UserSettings | null;
  onThreadCreated: (thread: ChatThread) => void;
  model?: string;
}

interface UseAssistantChatNewReturn {
  messages: ChatMessageNew[];
  annotationsMap: AnnotationsMapNew;
  input: string;
  setInput: (v: string) => void;
  isLoading: boolean;
  error: string | null;
  sendMessage: () => Promise<void>;
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? '';

export function useAssistantChatNew({
  userId,
  project,
  thread,
  settings,
  onThreadCreated,
  model,
}: UseAssistantChatNewOptions): UseAssistantChatNewReturn {
  const [messages, setMessages] = useState<ChatMessageNew[]>([]);
  const [annotationsMap, setAnnotationsMap] = useState<AnnotationsMapNew>({});
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the active OpenAI conversation ID
  const activeConvIdRef = useRef<string | null>(thread?.openai_conversation_id ?? null);

  // When the user picks a DIFFERENT existing thread from the sidebar, reset
  useEffect(() => {
    const incomingConvId = thread?.openai_conversation_id ?? null;
    if (incomingConvId !== null && incomingConvId === activeConvIdRef.current) {
      return; // same thread — don't reset
    }
    activeConvIdRef.current = incomingConvId;
    setMessages([]);
    setAnnotationsMap({});
    setError(null);

    if (!incomingConvId || !settings?.openaiApiKey) return;

    // Load existing messages from Conversations API
    fetch(`${API_BASE}/api/assistant-new/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: incomingConvId, openai_api_key: settings.openaiApiKey }),
    })
      .then(r => r.json())
      .then((data: { messages?: Array<{ id: string; role: 'user' | 'assistant'; content: string; annotations: CitationAnnotation[] }> }) => {
        if (!data.messages) return;
        setMessages(data.messages.map(m => ({ id: m.id, role: m.role, content: m.content })));
        // Restore annotationsMap from historical annotations
        const allAnnotations: CitationAnnotation[] = [];
        for (const m of data.messages) {
          if (m.annotations?.length) allAnnotations.push(...m.annotations);
        }
        if (allAnnotations.length > 0) setAnnotationsMap(buildAnnotationsMap(allAnnotations));
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
      const res = await fetch(`${API_BASE}/api/assistant-new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId: activeConvIdRef.current ?? null,
          model: model || 'gpt-4.1-mini',
          openai_api_key: settings.openaiApiKey,
          vectorStoreId: project.openai_vector_store_id ?? null,
          instructions: [project.context ? `PROJECT CONTEXT:\n${project.context}` : '', project.team ? `TEAM MEMBERS:\n${project.team}` : ''].filter(Boolean).join('\n\n') || undefined,
        }),
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      // Save new thread to Firestore if this is the first message
      const returnedConvId = res.headers.get('x-conversation-id');
      if (returnedConvId && !activeConvIdRef.current) {
        activeConvIdRef.current = returnedConvId;
        const newThread: ChatThread = {
          id: uuidv4(),
          userId,
          project_id: project.id,
          openai_thread_id: '', // not used in new API
          openai_conversation_id: returnedConvId,
          api_version: 'responses_v1',
          title: text.slice(0, 60),
          created_at: Date.now(),
          updated_at: Date.now(),
        };
        saveChatThread(newThread).then(() => onThreadCreated(newThread));
      }

      // Read SSE stream — Responses API uses event: + data: lines
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEventType = '';

        for (const line of lines) {
          // SSE format: "event: <type>" then "data: <json>"
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim();
            continue;
          }
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;

          try {
            const evt = JSON.parse(raw);

            // Text delta — append to assistant message
            if (currentEventType === 'response.output_text.delta') {
              const delta: string = evt.delta ?? '';
              if (delta) {
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + delta }
                    : m
                ));
              }
            }

            // Text done — carries final annotations
            if (currentEventType === 'response.output_text.done') {
              const annotations: CitationAnnotation[] = evt.annotations ?? [];
              if (annotations.length > 0) {
                setAnnotationsMap(prev => {
                  const newMap = buildAnnotationsMap(annotations);
                  return { ...prev, ...newMap };
                });
              }
            }

            // Response completed — may carry final annotations in output
            if (currentEventType === 'response.completed') {
              const output = evt.response?.output ?? [];
              for (const item of output) {
                if (item.type === 'message' && item.content) {
                  for (const part of item.content) {
                    if (part.annotations?.length) {
                      setAnnotationsMap(prev => {
                        const newMap = buildAnnotationsMap(part.annotations);
                        return { ...prev, ...newMap };
                      });
                    }
                  }
                }
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
  }, [input, isLoading, settings, project, userId, onThreadCreated, model]);

  return { messages, annotationsMap, input, setInput, isLoading, error, sendMessage };
}
