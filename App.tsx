import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import Hero from './components/Hero';
import Dropzone from './components/Dropzone';
import ProcessingView from './components/ProcessingView';
import Dashboard from './components/Dashboard';
import ProjectManager from './components/ProjectManager';
import MeetingHistory from './components/MeetingHistory';
import { analyzeMeeting, askMeetingQuestion } from './services/geminiService';
import { getProjects, saveProjects, exportProjectsToFile } from './services/projectService';
import { saveMeeting, saveMeetingVersion, Meeting, MeetingVersion } from './services/meetingService';
import { MeetingAnalysis, ProcessingStatus, Project } from './types';
import { auth } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { v4 as uuidv4 } from 'uuid';

const App: React.FC = () => {
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [result, setResult] = useState<MeetingAnalysis | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [processingStep, setProcessingStep] = useState<number>(0);
  
  // Settings
  const [language, setLanguage] = useState<string>('English');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [showProjectManager, setShowProjectManager] = useState(false);
  
  const [currentFiles, setCurrentFiles] = useState<File[]>([]);
  
  // Auth & History State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setShowHistory(false);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  // Load projects on mount
  useEffect(() => {
    const loaded = getProjects();
    setProjects(loaded);
  }, []);

  // Save projects whenever they change
  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  // Project CRUD
  const handleAddProject = (project: Project) => {
    setProjects(prev => [...prev, project]);
    if (!selectedProjectId) setSelectedProjectId(project.id);
  };

  const handleUpdateProject = (project: Project) => {
    setProjects(prev => prev.map(p => p.id === project.id ? project : p));
  };

  const handleDeleteProject = (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    if (selectedProjectId === id) setSelectedProjectId('');
  };

  const handleImportProjects = (newProjects: Project[]) => {
    // Merge strategies could vary, for now we just append unique IDs or replace.
    // Let's replace duplicates by ID, append new ones.
    setProjects(prev => {
        const map = new Map(prev.map(p => [p.id, p]));
        newProjects.forEach(p => map.set(p.id, p));
        return Array.from(map.values());
    });
  };

  const handleFilesSelect = async (files: File[]) => {
    setStatus('processing');
    setProcessingStep(0);
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
        (step) => setProcessingStep(step)
      );
      
      setResult(data);
      setStatus('completed');

      // Save to Firebase if logged in
      if (user) {
        const meetingId = uuidv4();
        setCurrentMeetingId(meetingId);
        
        const techStackTags = data.techDetails || [];
        const projectTags = data.projects || [];
        
        const newMeeting: Meeting = {
          id: meetingId,
          userId: user.uid,
          projectId: selectedProjectId || undefined,
          title: files.map(f => f.name).join(', ') || 'Untitled Meeting',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          techStackTags,
          projectTags
        };
        
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
    setProcessingStep(0);
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
            (step) => setProcessingStep(step)
        );
        setResult(data);
        setStatus('completed');

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
    setProcessingStep(0);
    setCurrentMeetingId(null);
  };

  const handleOpenHistoryReport = (analysis: MeetingAnalysis, meetingId: string) => {
    setResult(analysis);
    setCurrentMeetingId(meetingId);
    setStatus('completed');
    setShowHistory(false);
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
                    <button 
                      onClick={() => {
                        setShowHistory(!showHistory);
                        if (!showHistory) handleReset();
                      }}
                      className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${showHistory ? 'bg-brand-100 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      History
                    </button>
                    <div className="flex items-center space-x-2">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
                          {user.email?.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <button onClick={handleLogout} className="text-xs text-slate-500 hover:text-slate-700">Logout</button>
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

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        
        {showHistory && user ? (
          <div className="animate-fade-in-up">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-900">Your Meetings</h1>
              <button 
                onClick={() => setShowHistory(false)}
                className="text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                &larr; Back to Extractor
              </button>
            </div>
            <MeetingHistory userId={user.uid} onOpenReport={handleOpenHistoryReport} />
          </div>
        ) : (
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

                {/* Manage Projects Toggle */}
                <button 
                    onClick={() => setShowProjectManager(!showProjectManager)}
                    className={`text-sm font-medium px-4 py-1.5 rounded-md transition-colors ${showProjectManager ? 'bg-brand-100 text-brand-700' : 'text-slate-500 hover:text-brand-600 hover:bg-slate-50'}`}
                >
                    {showProjectManager ? 'Close Manager' : 'Manage Projects'}
                </button>
              </div>

              {/* Project Manager Component */}
              <ProjectManager 
                  isOpen={showProjectManager}
                  projects={projects}
                  onAdd={handleAddProject}
                  onUpdate={handleUpdateProject}
                  onDelete={handleDeleteProject}
                  onImport={handleImportProjects}
                  onExport={() => exportProjectsToFile(projects)}
                  onClose={() => setShowProjectManager(false)}
              />

              <Dropzone onFilesSelect={handleFilesSelect} />
              
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
            <ProcessingView currentStep={processingStep} />
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
        )}

      </main>
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