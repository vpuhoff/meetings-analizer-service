import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Project } from '../types';
import {
  ChatThread, getUserSettings, saveChatThread, getChatThreads, deleteChatThread,
} from '../services/meetingService';
import { v4 as uuidv4 } from 'uuid';

// ── Types ──────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AskAIProps {
  userId: string;
  projects: Project[];
}

// ── ChatWindow ─────────────────────────────────────────────────────
interface ChatWindowProps {
  userId: string;
  project: Project;
  thread: ChatThread | null;
  onThreadCreated: (thread: ChatThread) => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ userId, project, thread, onThreadCreated }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'in_progress' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentThreadIdRef = useRef<string | null>(thread?.openai_thread_id ?? null);

  useEffect(() => {
    currentThreadIdRef.current = thread?.openai_thread_id ?? null;
    setMessages([]);
    setError(null);
    setStatus('idle');
  }, [thread?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || status === 'in_progress') return;

    const settings = await getUserSettings(userId);
    if (!settings?.openaiApiKey) {
      setError('OpenAI API key not configured. Add it in Settings.');
      return;
    }

    const assistantId = project.openai_vector_store_id
      ? (settings as any).openaiAssistantId ?? ''
      : (settings as any).openaiAssistantId ?? '';

    if (!(settings as any).openaiAssistantId) {
      setError('OpenAI Assistant ID not configured. Add it in Settings.');
      return;
    }

    setInput('');
    setStatus('in_progress');
    setError(null);

    const userMsg: ChatMessage = { id: uuidv4(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);

    const assistantMsgId = uuidv4();
    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }]);

    try {
      const apiBase = (import.meta as any).env?.VITE_API_BASE_URL ?? '';
      const res = await fetch(`${apiBase}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          openai_thread_id: currentThreadIdRef.current,
          assistant_id: (settings as any).openaiAssistantId,
          openai_api_key: settings.openaiApiKey,
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || 'Request failed');
      }

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
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const evt = JSON.parse(raw) as { type: string; thread_id?: string; text?: string; status?: string };
            if (evt.type === 'thread_id' && evt.thread_id && !currentThreadIdRef.current) {
              currentThreadIdRef.current = evt.thread_id;
              // Save new thread to Firestore
              const newThread: ChatThread = {
                id: uuidv4(),
                userId,
                project_id: project.id,
                openai_thread_id: evt.thread_id,
                title: text.slice(0, 60),
                created_at: Date.now(),
                updated_at: Date.now(),
              };
              await saveChatThread(newThread);
              onThreadCreated(newThread);
            } else if (evt.type === 'delta' && evt.text) {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, content: m.content + evt.text! } : m
              ));
            }
          } catch {
            // skip
          }
        }
      }
      setStatus('idle');
    } catch (err: any) {
      setError(err.message);
      setStatus('error');
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, content: '_Error: ' + err.message + '_' } : m
      ));
    }
  }, [input, status, userId, project, onThreadCreated]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-16">
            <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <p className="text-sm">Ask anything about <span className="font-semibold text-slate-600">{project.name}</span></p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
              msg.role === 'user'
                ? 'bg-brand-600 text-white rounded-br-sm'
                : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm prose-slate max-w-none">
                  {msg.content ? (
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  ) : (
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100">{error}</div>
      )}

      {/* Input */}
      <div className="border-t border-slate-200 bg-white px-4 py-3 flex gap-2 items-end">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={status === 'in_progress'}
          rows={1}
          placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
          className="flex-1 resize-none px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-50 disabled:cursor-not-allowed max-h-32 overflow-y-auto"
          style={{ minHeight: '40px' }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || status === 'in_progress'}
          className="flex-shrink-0 p-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {status === 'in_progress' ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

// ── AskAI (main page) ──────────────────────────────────────────────
const AskAI: React.FC<AskAIProps> = ({ userId, projects }) => {
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);

  const activeProject = projects.find(p => p.id === activeProjectId) ?? null;

  // Init first project
  useEffect(() => {
    if (projects.length > 0 && !activeProjectId) {
      setActiveProjectId(projects[0].id);
    }
  }, [projects]);

  // Load threads when project changes
  useEffect(() => {
    if (!activeProjectId) return;
    setLoadingThreads(true);
    setActiveThread(null);
    getChatThreads(userId, activeProjectId).then(data => {
      setThreads(data);
      setLoadingThreads(false);
    });
  }, [activeProjectId, userId]);

  const handleThreadCreated = useCallback((thread: ChatThread) => {
    setThreads(prev => [thread, ...prev]);
    setActiveThread(thread);
  }, []);

  const handleDeleteThread = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteChatThread(id);
    setThreads(prev => prev.filter(t => t.id !== id));
    if (activeThread?.id === id) setActiveThread(null);
  };

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mb-5">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Ask AI</h2>
        <p className="text-slate-500 max-w-md">Create a project first, then configure an OpenAI Assistant ID in Settings to start chatting.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 12rem)' }}>

      {/* Project Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto flex-shrink-0">
        {projects.map(p => (
          <button
            key={p.id}
            onClick={() => setActiveProjectId(p.id)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
              activeProjectId === p.id
                ? 'border-brand-600 text-brand-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/60'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Body: sidebar + chat */}
      <div className="flex flex-1 overflow-hidden">

        {/* Thread Sidebar */}
        <div className="w-56 flex-shrink-0 border-r border-slate-200 flex flex-col bg-slate-50">
          <div className="p-3 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Threads</span>
            <button
              onClick={() => setActiveThread(null)}
              title="New chat"
              className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-brand-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loadingThreads && <div className="p-3 text-xs text-slate-400">Loading…</div>}
            {!loadingThreads && threads.length === 0 && (
              <div className="p-3 text-xs text-slate-400">No threads yet. Start a new chat!</div>
            )}
            {threads.map(t => (
              <div
                key={t.id}
                onClick={() => setActiveThread(t)}
                className={`group flex items-center justify-between px-3 py-2.5 cursor-pointer text-sm transition-colors border-b border-slate-100 ${
                  activeThread?.id === t.id
                    ? 'bg-brand-50 text-brand-800 font-medium'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <span className="truncate flex-1 text-xs leading-tight">{t.title || 'Untitled'}</span>
                <button
                  onClick={(e) => handleDeleteThread(e, t.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-red-500 transition-all flex-shrink-0 ml-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeProject ? (
            <ChatWindow
              key={`${activeProject.id}-${activeThread?.id ?? 'new'}`}
              userId={userId}
              project={activeProject}
              thread={activeThread}
              onThreadCreated={handleThreadCreated}
            />
          ) : (
            <div className="flex items-center justify-center flex-1 text-slate-400 text-sm">Select a project to start</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AskAI;
