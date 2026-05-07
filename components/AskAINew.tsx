import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Project } from '../types';
import {
  ChatThread, UserSettings, KBDocument,
  getUserSettings, getChatThreads, deleteChatThread,
} from '../services/meetingService';
import { useAssistantChatNew } from '../hooks/useAssistantChatNew';
import ChatMessageNew from './ChatMessageNew';
import { CitationAnnotation, AnnotationsMapNew } from '../utils/formatCitationsNew';

// ── Props ───────────────────────────────────────────────────────────
interface AskAINewProps {
  userId: string;
  projects: Project[];
}

// ── ChatWindowNew ────────────────────────────────────────────────────
interface ChatWindowNewProps {
  userId: string;
  project: Project;
  thread: ChatThread | null;
  settings: UserSettings | null;
  onThreadCreated: (thread: ChatThread) => void;
}

const CHAT_MODELS = [
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { id: 'gpt-5', label: 'GPT-5' },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini' },
] as const;

const ChatWindowNew: React.FC<ChatWindowNewProps> = ({ userId, project, thread, settings, onThreadCreated }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [selectedKbDoc, setSelectedKbDoc] = useState<KBDocument | null>(null);
  const [citationNotFound, setCitationNotFound] = useState<string | null>(null);
  const [chatModel, setChatModel] = useState<string>(CHAT_MODELS[1].id);
  const [currentAnnotations, setCurrentAnnotations] = useState<CitationAnnotation[]>([]);

  const { messages, annotationsMap, input, setInput, isLoading, error, sendMessage } = useAssistantChatNew({
    userId,
    project,
    thread,
    settings,
    onThreadCreated,
    model: chatModel,
  });

  // Collect annotations from the map for the current message rendering
  useEffect(() => {
    const all: CitationAnnotation[] = [];
    for (const [fileId, entries] of Object.entries(annotationsMap)) {
      for (const entry of entries) {
        all.push({ type: 'file_citation', index: entry.index, file_id: fileId, filename: entry.filename });
      }
    }
    setCurrentAnnotations(all);
  }, [annotationsMap]);

  const handleCitationClick = useCallback(async (fileId: string) => {
    try {
      // Match by openai_file_id in knowledge_base
      const q = query(collection(db, 'knowledge_base'), where('userId', '==', userId), where('openai_file_id', '==', fileId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setSelectedKbDoc(snap.docs[0].data() as KBDocument);
        return;
      }

      // Fallback: try to find by filename from annotationsMap
      const entries = annotationsMap[fileId];
      if (entries?.length) {
        const filename = entries[0].filename;
        // Try matching by title containing the filename
        const q2 = query(collection(db, 'knowledge_base'), where('userId', '==', userId));
        const snap2 = await getDocs(q2);
        const match = snap2.docs.find(d => {
          const data = d.data() as KBDocument;
          return filename.includes(data.title) || data.title.includes(filename.replace(/\.\w+$/, ''));
        });
        if (match) {
          setSelectedKbDoc(match.data() as KBDocument);
          return;
        }
      }
    } catch (err) {
      console.error('[Citation New] lookup failed:', err);
    }

    setCitationNotFound(fileId);
    setTimeout(() => setCitationNotFound(null), 3000);
  }, [annotationsMap, userId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-16">
            <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <p className="text-sm">
              Ask anything about{' '}
              <span className="font-semibold text-slate-600">{project.name}</span>
            </p>
            {project.openai_vector_store_id && (
              <p className="text-xs mt-1 text-emerald-600">
                ✓ Knowledge Base connected
              </p>
            )}
            <p className="text-xs mt-2 text-slate-300">
              Responses API · {chatModel}
            </p>
          </div>
        )}

        {messages.map(msg => (
          <ChatMessageNew
            key={msg.id}
            message={msg}
            annotations={currentAnnotations}
            annotationsMap={annotationsMap}
            onCitationClick={handleCitationClick}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Citation not found toast */}
      {citationNotFound && (
        <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-t border-amber-100 flex-shrink-0">
          Source document not found in Knowledge Base for file: <code className="font-mono">{citationNotFound}</code>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100 flex-shrink-0">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-slate-200 bg-white px-4 py-3 flex gap-2 items-end flex-shrink-0">
        <select
          value={chatModel}
          onChange={e => setChatModel(e.target.value)}
          disabled={isLoading}
          className="flex-shrink-0 px-2 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-600 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-50 cursor-pointer"
          title="Chat model"
        >
          {CHAT_MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={1}
          placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
          className="flex-1 resize-none px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-50 disabled:cursor-not-allowed overflow-y-auto"
          style={{ minHeight: '40px', maxHeight: '128px' }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || isLoading}
          className="flex-shrink-0 p-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>
      {/* KB Source Drawer */}
      {selectedKbDoc && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedKbDoc(null)}>
          <div
            className="relative w-full max-w-lg h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">Knowledge Base Source</p>
                <h3 className="font-semibold text-slate-800 text-base leading-snug">{selectedKbDoc.title}</h3>
              </div>
              <button
                onClick={() => setSelectedKbDoc(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="prose prose-sm prose-slate max-w-none">
                <ReactMarkdown>{selectedKbDoc.content}</ReactMarkdown>
              </div>
            </div>
            {(selectedKbDoc.systems?.length > 0 || selectedKbDoc.topics?.length > 0) && (
              <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap gap-1.5 flex-shrink-0">
                {selectedKbDoc.systems?.map(s => (
                  <span key={s} className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700 border border-blue-100">{s}</span>
                ))}
                {selectedKbDoc.topics?.map(t => (
                  <span key={t} className="px-2 py-0.5 text-xs rounded-full bg-purple-50 text-purple-700 border border-purple-100">{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── AskAINew (page) ─────────────────────────────────────────────────
const AskAINew: React.FC<AskAINewProps> = ({ userId, projects }) => {
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const activeProject = projects.find(p => p.id === activeProjectId) ?? null;

  // Load user settings once
  useEffect(() => {
    getUserSettings(userId).then(s => setSettings(s));
  }, [userId]);

  // Default to first project
  useEffect(() => {
    if (projects.length > 0 && !activeProjectId) {
      setActiveProjectId(projects[0].id);
    }
  }, [projects, activeProjectId]);

  // Load threads when project tab changes — only new API threads
  useEffect(() => {
    if (!activeProjectId) return;
    setLoadingThreads(true);
    setActiveThread(null);
    getChatThreads(userId, activeProjectId).then(data => {
      // Filter to only show Responses API threads
      setThreads(data.filter(t => t.api_version === 'responses_v1'));
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
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Ask AI <span className="text-xs font-normal text-brand-500 align-top">[new]</span></h2>
        <p className="text-slate-500 max-w-md">
          Create a project first, then configure an OpenAI API key in Settings to start chatting.
        </p>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col"
      style={{ height: 'calc(100vh - 12rem)' }}
    >
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
            {p.openai_vector_store_id && (
              <span className="ml-1.5 text-[10px] text-emerald-500">●</span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Thread sidebar */}
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
          <div className="flex-1 overflow-y-auto">
            {loadingThreads && (
              <div className="p-3 text-xs text-slate-400">Loading…</div>
            )}
            {!loadingThreads && threads.length === 0 && (
              <div className="p-3 text-xs text-slate-400">No threads yet. Start a new chat!</div>
            )}
            {threads.map(t => (
              <div
                key={t.id}
                onClick={() => setActiveThread(t)}
                className={`group flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors border-b border-slate-100 ${
                  activeThread?.id === t.id
                    ? 'bg-brand-50 text-brand-800 font-medium'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <span className="truncate flex-1 text-xs leading-snug">{t.title || 'Untitled'}</span>
                <button
                  onClick={e => handleDeleteThread(e, t.id)}
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

        {/* Chat */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeProject ? (
            <ChatWindowNew
              key={activeProject.id}
              userId={userId}
              project={activeProject}
              thread={activeThread}
              settings={settings}
              onThreadCreated={handleThreadCreated}
            />
          ) : (
            <div className="flex items-center justify-center flex-1 text-slate-400 text-sm">
              Select a project to start
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AskAINew;
