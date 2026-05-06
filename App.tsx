import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import Hero from './components/Hero';
import Dropzone from './components/Dropzone';
import ProcessingView from './components/ProcessingView';
import Dashboard from './components/Dashboard';
import Projects from './components/Projects';
import MeetingHistory from './components/MeetingHistory';
import ProfileModal from './components/ProfileModal';
import AskAI from './components/AskAI';
import KnowledgeBase from './components/KnowledgeBase';
import KBViewModal from './components/KBViewModal';
import KBEditorModal from './components/KBEditorModal';
import { analyzeMeeting, askMeetingQuestion, generateKBDocument } from './services/geminiService';
import { saveMeeting, saveMeetingVersion, Meeting, MeetingVersion, getProjects, Project, KBDocument, saveKBDocument, subscribeKBDocuments, getMeeting, getUserSettings, getProject } from './services/meetingService';
import { MeetingAnalysis, ProcessingStatus } from './types';
import { auth } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { v4 as uuidv4 } from 'uuid';

const App: React.FC = () => {
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [result, setResult] = useState<MeetingAnalysis | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [fileProgressPercent, setFileProgressPercent] = useState<number>(0);
  const [fileProgressStage, setFileProgressStage] = useState<string>('');
  
  // Settings
  const [language, setLanguage] = useState<string>(() => {
    return localStorage.getItem('meeting-language') || 'English';
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    return localStorage.getItem('selected-project-id') || '';
  });

  const [currentFiles, setCurrentFiles] = useState<File[]>([]);
  const [kbDocForMeeting, setKbDocForMeeting] = useState<KBDocument | null>(null);
  const [viewingKBDoc, setViewingKBDoc] = useState<KBDocument | null>(null);
  const [editingKBDoc, setEditingKBDoc] = useState<KBDocument | null>(null);
  const [resultVersion, setResultVersion] = useState(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [useFreeTranscription, setUseFreeTranscription] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Auth & Navigation State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<'extract' | 'history' | 'projects' | 'ask-ai' | 'knowledge'>('extract');
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);
  const [currentMeetingDate, setCurrentMeetingDate] = useState<number>(Date.now());

  // Close user menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Check if KB doc already exists for current meeting
  useEffect(() => {
    if (!currentMeetingId || !user) { setKbDocForMeeting(null); return; }
    const unsub = subscribeKBDocuments(user.uid, (docs) => {
      setKbDocForMeeting(docs.find(d => d.meeting_id === currentMeetingId) ?? null);
    });
    return unsub;
  }, [currentMeetingId, user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Load projects when user is logged in
  useEffect(() => {
    if (user) {
      loadProjects();
    }
  }, [user]);

  const loadProjects = async () => {
    if (!user) return;
    try {
      const loadedProjects = await getProjects(user.uid);
      setProjects(loadedProjects);
      // Update selected project if still exists
      if (selectedProjectId) {
        const stillExists = loadedProjects.find(p => p.id === selectedProjectId);
        if (!stillExists) {
          setSelectedProjectId('');
        }
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const handleSelectProject = (project: Project | null) => {
    setSelectedProjectId(project ? project.id : '');
  };

  // Save language preference to localStorage
  useEffect(() => {
    localStorage.setItem('meeting-language', language);
  }, [language]);

  // Save selected project to localStorage
  useEffect(() => {
    localStorage.setItem('selected-project-id', selectedProjectId);
  }, [selectedProjectId]);

  const handleFilesSelect = async (files: File[]) => {
    setStatus('processing');
    setProgressPercent(0);
    setProgressMessage('');
    setFileProgressPercent(0);
    setFileProgressStage('');
    setErrorMsg(null);
    setCurrentFiles(files);
    
    try {
      // Find selected project context
      const project = projects.find(p => p.id === selectedProjectId);
      const context = project ? project.context : undefined;
      const team = project ? project.team : undefined;

      const data = await analyzeMeeting(
        files, 
        language, 
        context, 
        team, 
        undefined, 
        (percent, message) => {
          setProgressPercent(percent);
          setProgressMessage(message);
        },
        useFreeTranscription,
        (pct, stage) => {
          setFileProgressPercent(pct);
          setFileProgressStage(stage);
        }
      );
      
      setResult(data);
      setStatus('completed');
      setResultVersion(v => v + 1);

      // Save to Firebase if logged in
      if (user) {
        const meetingId = uuidv4();
        setCurrentMeetingId(meetingId);
        const meetingCreatedAt = new Date().toISOString();
        setCurrentMeetingDate(new Date(meetingCreatedAt).getTime());
        
        const techStackTags = data.techDetails || [];
        const projectTags = data.projects || [];
        
        const newMeeting: Meeting = {
          id: meetingId,
          userId: user.uid,
          title: data.meetingTitle || files.map(f => f.name).join(', ') || 'Untitled Meeting',
          createdAt: meetingCreatedAt,
          updatedAt: new Date().toISOString(),
          techStackTags,
          projectTags
        };

        // Only add projectId if it has a value
        if (selectedProjectId) {
          (newMeeting as any).projectId = selectedProjectId;
        }
        
        const newVersion: MeetingVersion = {
          id: uuidv4(),
          userId: user.uid,
          meetingId: meetingId,
          createdAt: new Date().toISOString(),
          analysis: JSON.stringify(data)
        };

        await saveMeeting(newMeeting);
        await saveMeetingVersion(newVersion);
      }

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred during processing.");
      setStatus('error');
    }
  };

  const handleReanalyze = async (feedback: string) => {
    let filesToAnalyze = currentFiles;
    
    // If we don't have the original files (e.g., opened from history), 
    // we can reconstruct a text file from the transcript.
    if (filesToAnalyze.length === 0 && result && result.transcript) {
        const transcriptText = result.transcript.map(t => `[${t.timestamp}] ${t.speaker}: ${t.text}`).join('\n');
        const file = new File([transcriptText], "transcript.txt", { type: "text/plain" });
        filesToAnalyze = [file];
    }

    if (filesToAnalyze.length === 0) return;

    setStatus('processing');
    setProgressPercent(0);
    setProgressMessage('');
    setFileProgressPercent(0);
    setFileProgressStage('');
    setErrorMsg(null);

    try {
        const project = projects.find(p => p.id === selectedProjectId);
        const context = project ? project.context : undefined;
        const team = project ? project.team : undefined;

        const data = await analyzeMeeting(
            filesToAnalyze, 
            language, 
            context, 
            team, 
            feedback,
            (percent, message) => {
              setProgressPercent(percent);
              setProgressMessage(message);
            },
            useFreeTranscription,
            (pct, stage) => {
              setFileProgressPercent(pct);
              setFileProgressStage(stage);
            }
        );
        setResult(data);
        setStatus('completed');
        setResultVersion(v => v + 1);

        // Save new version to Firebase if logged in
        if (user && currentMeetingId) {
            const newVersion: MeetingVersion = {
                id: uuidv4(),
                userId: user.uid,
                meetingId: currentMeetingId,
                createdAt: new Date().toISOString(),
                feedback: feedback,
                analysis: JSON.stringify(data)
            };
            await saveMeetingVersion(newVersion);
            
            // Update meeting's updatedAt and tags
            const techStackTags = data.techDetails || [];
            const projectTags = data.projects || [];
            
            const updatedMeeting: Partial<Meeting> & { id: string } = {
                id: currentMeetingId,
                updatedAt: new Date().toISOString(),
                techStackTags,
                projectTags
            };
            await saveMeeting(updatedMeeting);
        }

    } catch (err: any) {
        console.error(err);
        setErrorMsg(err.message || "An error occurred during re-analysis.");
        setStatus('error');
    }
  };

  const handleAskQuestion = async (question: string): Promise<string> => {
      let filesToAnalyze = currentFiles;
      if (filesToAnalyze.length === 0 && result && result.transcript) {
          const transcriptText = result.transcript.map(t => `[${t.timestamp}] ${t.speaker}: ${t.text}`).join('\n');
          const file = new File([transcriptText], "transcript.txt", { type: "text/plain" });
          filesToAnalyze = [file];
      }
      if (filesToAnalyze.length === 0) return "No files or transcript loaded.";
      
      const project = projects.find(p => p.id === selectedProjectId);
      const context = project ? project.context : undefined;
      const team = project ? project.team : undefined;
      return await askMeetingQuestion(filesToAnalyze, question, context, team);
  };

  const handleReset = () => {
    setStatus('idle');
    setResult(null);
    setErrorMsg(null);
    setCurrentFiles([]);
    setProgressPercent(0);
    setProgressMessage('');
    setFileProgressPercent(0);
    setFileProgressStage('');
    setCurrentMeetingId(null);
  };

  const handleSyncKBDoc = async (kbDoc: KBDocument) => {
    await saveKBDocument({ ...kbDoc, sync_status: 'pending', updated_at: Date.now() });
    try {
      const settings = user ? await getUserSettings(user.uid) : null;
      if (!settings?.openaiApiKey) throw new Error('OpenAI API key not configured. Add it in Settings.');
      const project = kbDoc.project_id ? await getProject(kbDoc.project_id) : null;
      if (!project?.openai_vector_store_id) throw new Error('No Vector Store ID set for this project.');
      const apiBase = (import.meta as any).env?.VITE_API_BASE_URL ?? '';
      const res = await fetch(`${apiBase}/api/kb/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_id: kbDoc.id,
          content: kbDoc.content,
          title: kbDoc.title,
          topics: kbDoc.topics,
          systems: kbDoc.systems,
          old_file_id: kbDoc.openai_file_id,
          vector_store_id: project.openai_vector_store_id,
          openai_api_key: settings.openaiApiKey,
        }),
      });
      const data = await res.json() as { success?: boolean; new_file_id?: string; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || 'Sync failed');
      await saveKBDocument({ ...kbDoc, sync_status: 'synced', openai_file_id: data.new_file_id ?? kbDoc.openai_file_id, last_synced_at: Date.now(), updated_at: Date.now() });
    } catch (err: any) {
      await saveKBDocument({ ...kbDoc, sync_status: 'failed', updated_at: Date.now() });
      throw err;
    }
  };

  const handleDateChange = async (newDate: number) => {
    setCurrentMeetingDate(newDate);
    if (!currentMeetingId) return;
    const iso = new Date(newDate).toISOString();
    await saveMeeting({ id: currentMeetingId, createdAt: iso, updatedAt: new Date().toISOString() });
  };

  const handleSaveToKB = async () => {
    if (!result || !user) throw new Error('No meeting data');
    const project = projects.find(p => p.id === selectedProjectId);
    // Always fetch the latest createdAt from Firestore so date edits in History are reflected
    let meetingDate = currentMeetingDate;
    if (currentMeetingId) {
      const freshMeeting = await getMeeting(currentMeetingId);
      if (freshMeeting?.createdAt) {
        meetingDate = new Date(freshMeeting.createdAt).getTime();
      }
    }
    const kbResult = await generateKBDocument(
      result,
      project?.name || '',
      project?.context || '',
      project?.team || '',
      meetingDate,
    );
    const doc: KBDocument = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      userId: user.uid,
      meeting_id: currentMeetingId || '',
      project_id: selectedProjectId || '',
      project_name: project?.name || '',
      title: kbResult.title,
      content: kbResult.content,
      systems: kbResult.systems,
      topics: kbResult.topics,
      sync_status: 'out_of_sync',
      openai_file_id: null,
      created_at: meetingDate,
      updated_at: Date.now(),
    };
    await saveKBDocument(doc);
  };

  const handleOpenHistoryReport = (analysis: MeetingAnalysis, meetingId: string, meetingDate?: string) => {
    setResult(analysis);
    setCurrentMeetingId(meetingId);
    setCurrentMeetingDate(meetingDate ? new Date(meetingDate).getTime() : Date.now());
    setStatus('completed');
    setActiveTab('extract');
  };

  if (!isAuthReady) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-brand-600 p-2 bg-brand-50 rounded-lg mr-3">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                 </svg>
              </span>
              <span className="font-bold text-xl tracking-tight text-slate-800">MeetingIntel</span>
            </div>
            <div className="flex items-center space-x-4">
                <div className="hidden md:flex text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                    Powered by Gemini 2.5
                </div>
                {user ? (
                  <div className="flex items-center space-x-3">
                    <div className="relative" ref={userMenuRef}>
                      <button
                        onClick={() => setShowUserMenu(v => !v)}
                        className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                      >
                        {user.photoURL ? (
                          <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
                            {user.email?.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {showUserMenu && (
                        <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50">
                          <div className="px-4 py-2 border-b border-slate-100">
                            <p className="text-xs font-semibold text-slate-700 truncate">{user.displayName || user.email}</p>
                          </div>
                          <button
                            onClick={() => { setShowUserMenu(false); setActiveTab('history'); }}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            History
                          </button>
                          <button
                            onClick={() => { setShowUserMenu(false); setShowProfileModal(true); }}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            Profile
                          </button>
                          <div className="border-t border-slate-100 mt-1" />
                          <button
                            onClick={() => { setShowUserMenu(false); handleLogout(); }}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            Logout
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={handleLogin}
                    className="text-sm font-medium px-4 py-1.5 bg-brand-600 text-white rounded-md hover:bg-brand-700 transition-colors"
                  >
                    Sign In
                  </button>
                )}
            </div>
          </div>
        </div>
      </nav>

      {/* Tab Navigation */}
      {user && (
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-1" aria-label="Tabs">
              {([
                { id: 'extract', label: 'New Extract', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
                { id: 'history', label: 'Meeting History', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
                { id: 'projects', label: 'Projects', icon: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z' },
                { id: 'ask-ai', label: 'Ask AI', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
                { id: 'knowledge', label: 'Knowledge Base', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
              ] as { id: 'extract' | 'history' | 'projects' | 'ask-ai' | 'knowledge'; label: string; icon: string }[]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                  </svg>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'history' && user ? (
        <div className="px-4 sm:px-6 lg:px-8 pt-8 animate-fade-in-up">
          <MeetingHistory userId={user.uid} onOpenReport={handleOpenHistoryReport} />
        </div>
      ) : activeTab === 'ask-ai' && user ? (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 animate-fade-in-up">
          <AskAI userId={user.uid} projects={projects} />
        </div>
      ) : activeTab === 'projects' && user ? (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 animate-fade-in-up">
          <Projects
            userId={user.uid}
            onSelectProject={(project) => {
              handleSelectProject(project);
              if (project) setActiveTab('extract');
            }}
            selectedProjectId={selectedProjectId}
          />
        </div>
      ) : activeTab === 'knowledge' && user ? (
        <div className="px-4 sm:px-6 lg:px-8 pt-8 animate-fade-in-up">
          <KnowledgeBase userId={user.uid} />
        </div>
      ) : (
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        <>
            {status === 'idle' && (
          <div className="animate-fade-in-up">
            <Hero />
            
            <div className="mt-8 max-w-2xl mx-auto">
              {/* Controls Bar */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 space-y-4 md:space-y-0 md:flex md:items-center md:justify-between gap-4">
                
                {/* Language Selector */}
                <div className="flex items-center">
                    <label htmlFor="language-select" className="mr-2 text-slate-600 font-medium text-sm whitespace-nowrap">
                    Output:
                    </label>
                    <select
                        id="language-select"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="appearance-none pl-3 pr-8 py-1.5 border border-slate-300 rounded-md text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white w-full md:w-auto"
                    >
                        <option value="English">English</option>
                        <option value="Russian">Russian</option>
                        <option value="Spanish">Spanish</option>
                        <option value="French">French</option>
                        <option value="German">German</option>
                        <option value="Chinese">Chinese</option>
                        <option value="Japanese">Japanese</option>
                    </select>
                </div>

                {/* Project Selector */}
                <div className="flex items-center flex-1">
                    <label htmlFor="project-select" className="mr-2 text-slate-600 font-medium text-sm whitespace-nowrap">
                    Project:
                    </label>
                    <div className="relative flex-1">
                        <select
                            id="project-select"
                            value={selectedProjectId}
                            onChange={(e) => setSelectedProjectId(e.target.value)}
                            className="w-full appearance-none pl-3 pr-8 py-1.5 border border-slate-300 rounded-md text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                        >
                            <option value="">No Project Context</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                         <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Manage Projects link */}
                <button
                    onClick={() => setActiveTab('projects')}
                    className="text-sm font-medium px-4 py-1.5 rounded-md transition-colors text-slate-500 hover:text-brand-600 hover:bg-slate-50"
                >
                    Manage Projects
                </button>
              </div>

              <Dropzone onFilesSelect={handleFilesSelect} />

              <label className="mt-3 flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useFreeTranscription}
                  onChange={e => setUseFreeTranscription(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-600">
                  Free transcription <span className="text-xs text-slate-400">(external service, no Gemini credits for audio)</span>
                </span>
              </label>
              
              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                 <div className="p-4 bg-white rounded-lg shadow-sm border border-slate-100">
                    <div className="text-brand-600 font-bold text-lg mb-1">Upload</div>
                    <p className="text-sm text-slate-500">Multiple audio files supported</p>
                 </div>
                 <div className="p-4 bg-white rounded-lg shadow-sm border border-slate-100">
                    <div className="text-brand-600 font-bold text-lg mb-1">Extract</div>
                    <p className="text-sm text-slate-500">AI extracts decisions & tech specs</p>
                 </div>
                 <div className="p-4 bg-white rounded-lg shadow-sm border border-slate-100">
                    <div className="text-brand-600 font-bold text-lg mb-1">Action</div>
                    <p className="text-sm text-slate-500">Get a structured JSON report</p>
                 </div>
              </div>
            </div>
          </div>
        )}

        {status === 'processing' && (
          <div className="mt-10">
            <ProcessingView percent={progressPercent} message={progressMessage} filePercent={fileProgressPercent} fileStage={fileProgressStage} />
          </div>
        )}

        {status === 'completed' && result && (
          <div className="mt-6">
            <Dashboard 
              data={result} 
              language={language}
              onReset={handleReset} 
              onReanalyze={handleReanalyze}
              onAskQuestion={handleAskQuestion}
              onSaveToKB={user ? handleSaveToKB : undefined}
              kbDocExists={!!kbDocForMeeting}
              kbDoc={kbDocForMeeting ?? undefined}
              onViewKBDoc={kbDocForMeeting ? () => setViewingKBDoc(kbDocForMeeting) : undefined}
              onSyncKBDoc={user && kbDocForMeeting ? handleSyncKBDoc : undefined}
              resultVersion={resultVersion}
              meetingDate={currentMeetingDate}
              onDateChange={user && currentMeetingId ? handleDateChange : undefined}
            />
          </div>
        )}

        {status === 'error' && (
          <div className="mt-10 max-w-lg mx-auto text-center bg-white p-8 rounded-xl shadow-lg border border-red-100">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg leading-6 font-medium text-slate-900">Processing Failed</h3>
            <p className="mt-2 text-sm text-slate-500">
              {errorMsg || "We couldn't process these files. Please check your API key or file format."}
            </p>
            <div className="mt-6">
              <button
                onClick={handleReset}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-brand-600 text-base font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 sm:text-sm"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
        </>
      </main>
      )}
      {showProfileModal && user && (
        <ProfileModal user={user} onClose={() => setShowProfileModal(false)} />
      )}

      {viewingKBDoc && !editingKBDoc && (
        <KBViewModal
          doc={viewingKBDoc}
          onClose={() => setViewingKBDoc(null)}
          onEdit={() => { setEditingKBDoc(viewingKBDoc); setViewingKBDoc(null); }}
        />
      )}
      {editingKBDoc && (
        <KBEditorModal
          doc={editingKBDoc}
          onClose={() => setEditingKBDoc(null)}
          onSave={async (updated) => { await saveKBDocument(updated); setEditingKBDoc(null); }}
        />
      )}
    </div>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);