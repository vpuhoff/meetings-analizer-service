import React, { useState, useEffect } from 'react';
import { MeetingAnalysis } from '../types';
import { generateMarkdownReport } from '../services/geminiService';

interface DashboardProps {
  data: MeetingAnalysis;
  language: string;
  onReset: () => void;
  onReanalyze: (feedback: string) => void;
  onAskQuestion: (question: string) => Promise<string>;
  onSaveToKB?: () => Promise<void>;
  kbDocExists?: boolean;
  onViewKBDoc?: () => void;
  resultVersion?: number;
  meetingDate?: number;
  onDateChange?: (newDate: number) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ data, language, onReset, onReanalyze, onAskQuestion, onSaveToKB, kbDocExists, onViewKBDoc, resultVersion, meetingDate, onDateChange }) => {
  const [feedback, setFeedback] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSavingToKB, setIsSavingToKB] = useState(false);
  const [kbSaved, setKbSaved] = useState(false);
  const [kbError, setKbError] = useState<string | null>(null);

  // Format timestamp to YYYY-MM-DD for <input type="date">
  const dateValue = meetingDate
    ? new Date(meetingDate).toISOString().slice(0, 10)
    : '';

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value || !onDateChange) return;
    onDateChange(new Date(e.target.value).getTime());
  };

  useEffect(() => {
    setKbSaved(false);
    setKbError(null);
  }, [resultVersion]);
  
  // Q&A State
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  const handleSaveToKB = async () => {
    if (!onSaveToKB) return;
    setIsSavingToKB(true);
    setKbError(null);
    try {
      await onSaveToKB();
      setKbSaved(true);
    } catch (err: any) {
      setKbError(err?.message || 'Failed to save to Knowledge Base');
    } finally {
      setIsSavingToKB(false);
    }
  };

  const handleReanalyzeClick = () => {
    if (feedback.trim()) {
      onReanalyze(feedback);
    }
  };

  const handleAskClick = async () => {
    if (!question.trim()) return;
    setIsAsking(true);
    setAnswer(null);
    try {
      const result = await onAskQuestion(question);
      setAnswer(result);
    } catch (e) {
      setAnswer("Sorry, I encountered an error while processing your question.");
    } finally {
      setIsAsking(false);
    }
  };

  const handleExportMarkdown = async () => {
    setIsExporting(true);
    try {
      const markdown = await generateMarkdownReport(data, language);
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `meeting-report-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert("Failed to generate markdown report.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-start mb-6 gap-4">
        {/* Left: title + type badge + date */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-800">Meeting Intelligence Report</h2>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-brand-100 text-brand-700 uppercase tracking-wide">
              {data.meetingType || 'Meeting'}
            </span>
          </div>
          {/* Date picker */}
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <input
              type="date"
              value={dateValue}
              onChange={handleDateChange}
              disabled={!onDateChange}
              className="text-sm text-slate-600 border border-slate-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-400 focus:border-brand-400 disabled:opacity-50 disabled:cursor-default bg-white"
            />
          </div>
        </div>

        {/* Right: action buttons — ordered by importance */}
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {/* KB: save or view */}
          {onSaveToKB && !kbDocExists && (
            <button
              onClick={handleSaveToKB}
              disabled={isSavingToKB || kbSaved}
              className="flex items-center px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {isSavingToKB ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </>
              ) : kbSaved ? (
                <>
                  <svg className="w-4 h-4 mr-2 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Saved to KB
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                  Save to KB
                </>
              )}
            </button>
          )}
          {kbDocExists && (
            <button
              onClick={onViewKBDoc}
              className="flex items-center px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
              In KB ↗
            </button>
          )}

          {/* Divider */}
          <div className="hidden sm:block w-px h-7 bg-slate-200" />

          {/* Export */}
          <button
            onClick={handleExportMarkdown}
            disabled={isExporting}
            className="flex items-center px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {isExporting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Exporting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export MD
              </>
            )}
          </button>

          {/* Upload new — secondary action, less prominent */}
          <button
            onClick={onReset}
            className="flex items-center px-4 py-2 text-sm font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
            </svg>
            New Upload
          </button>
        </div>
      </div>
      {kbError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{kbError}</div>
      )}

      {/* Summary Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center">
           <svg className="w-5 h-5 mr-2 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
           </svg>
           Executive Summary
        </h3>
        <p className="text-slate-600 leading-relaxed">
          {data.summary}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Action Items */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Action Items
            </h3>
            {data.actionItems.length === 0 ? (
                 <p className="text-slate-400 italic">No explicit action items detected.</p>
            ) : (
                <ul className="space-y-3 flex-1 overflow-y-auto max-h-80 custom-scrollbar pr-2">
                    {data.actionItems.map((item, idx) => (
                        <li key={idx} className="flex items-start bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <input type="checkbox" className="mt-1 h-4 w-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500" disabled />
                            <div className="ml-3">
                                <p className="text-sm font-medium text-slate-900">{item.what}</p>
                                <p className="text-xs text-slate-500 mt-0.5">Assigned to: <span className="font-semibold text-brand-600">{item.who}</span></p>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>

        {/* Tech Details */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
             <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                Tech Stack & Details
            </h3>
            <div className="flex flex-wrap gap-2">
                {data.techDetails.length > 0 ? data.techDetails.map((tech, idx) => (
                    <span key={idx} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {tech}
                    </span>
                )) : <p className="text-slate-400 italic text-sm">No technical details mentioned.</p>}
            </div>

            <h4 className="text-sm font-semibold text-slate-700 mt-6 mb-3">Projects & Systems</h4>
            <div className="flex flex-wrap gap-2">
                {data.projects.length > 0 ? data.projects.map((proj, idx) => (
                    <span key={idx} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        {proj}
                    </span>
                )) : <p className="text-slate-400 italic text-sm">No specific projects mentioned.</p>}
            </div>
        </div>

        {/* Decisions */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Decisions Log
            </h3>
             <ul className="space-y-4">
                {data.decisions.length > 0 ? data.decisions.map((dec, idx) => (
                    <li key={idx} className="pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                        <p className="text-sm font-semibold text-slate-900">{dec.decision}</p>
                        <p className="text-xs text-slate-500 mt-1 italic">"{dec.context}"</p>
                    </li>
                )) : <p className="text-slate-400 italic">No formal decisions recorded.</p>}
            </ul>
        </div>

        {/* Blockers & Topics */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
            <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Blockers & Risks
                </h3>
                <ul className="space-y-2 mb-6">
                     {data.blockers.length > 0 ? data.blockers.map((blocker, idx) => (
                        <li key={idx} className="flex items-start text-sm text-red-700 bg-red-50 p-2 rounded">
                           <span className="mr-2">•</span> {blocker}
                        </li>
                    )) : <p className="text-slate-400 italic text-sm">No blockers identified.</p>}
                </ul>
            </div>
            
            <div className="pt-6 border-t border-slate-100">
                <h3 className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wider">Discussed Topics</h3>
                <div className="flex flex-wrap gap-2">
                     {data.topics.length > 0 ? data.topics.map((topic, idx) => (
                        <span key={idx} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">
                            #{topic}
                        </span>
                    )) : null}
                </div>
            </div>
        </div>
      </div>

      {/* Transcript Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <button 
            onClick={() => setShowTranscript(!showTranscript)}
            className="flex items-center justify-between w-full text-left focus:outline-none"
        >
            <h3 className="text-lg font-semibold text-slate-800 flex items-center">
                <svg className="w-5 h-5 mr-2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                Meeting Transcript
            </h3>
            <div className="flex items-center text-sm text-brand-600 font-medium hover:text-brand-700">
                {showTranscript ? "Hide Transcript" : "Show Transcript"}
                <svg className={`ml-2 w-5 h-5 text-slate-400 transform transition-transform duration-200 ${showTranscript ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        </button>
        {showTranscript && (
            <div className="mt-4 p-5 bg-slate-50 rounded-lg border border-slate-200 max-h-96 overflow-y-auto custom-scrollbar">
                {data.transcript && data.transcript.length > 0 ? (
                    <div className="space-y-4">
                        {data.transcript.map((seg, idx) => (
                            <div key={idx} className="flex gap-4">
                                <div className="flex-shrink-0 w-12 text-xs font-mono text-slate-400 pt-1 text-right">
                                    {seg.timestamp}
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-slate-700 mb-0.5">{seg.speaker}</div>
                                    <div className="text-sm text-slate-600 leading-relaxed">{seg.text}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-slate-400 italic">No transcript available.</p>
                )}
            </div>
        )}
      </div>

       {/* Q&A Section */}
       <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-6">
        <h3 className="text-lg font-semibold text-indigo-900 mb-2 flex items-center">
             <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
             </svg>
             Ask about this meeting
         </h3>
         <p className="text-sm text-indigo-700 mb-4">
             Have a specific question or need clarification on something said? Ask the AI directly.
         </p>
         
         <div className="flex gap-3 mb-4">
            <input 
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What did Alex say about the budget timeline?"
                className="flex-1 p-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-slate-800 bg-white placeholder-slate-400"
                onKeyDown={(e) => e.key === 'Enter' && handleAskClick()}
            />
            <button 
                onClick={handleAskClick}
                disabled={!question.trim() || isAsking}
                className="px-6 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm whitespace-nowrap"
            >
                {isAsking ? 'Asking...' : 'Ask AI'}
            </button>
         </div>

         {answer && (
             <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-sm animate-fade-in">
                 <p className="text-sm font-semibold text-slate-700 mb-1">Answer:</p>
                 <p className="text-slate-700 text-sm leading-relaxed">{answer}</p>
             </div>
         )}
      </div>

      {/* Correction / Feedback Loop */}
      <div className="bg-brand-50 rounded-xl border border-brand-200 p-6 mt-2">
         <h3 className="text-lg font-semibold text-brand-900 mb-2 flex items-center">
             <svg className="w-5 h-5 mr-2 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
             </svg>
             Spot an error?
         </h3>
         <p className="text-sm text-brand-700 mb-4">
             If the AI misunderstood a technical term or missed an item, describe the error below. We will re-analyze the audio with your corrections.
         </p>
         <div className="flex flex-col sm:flex-row gap-4">
            <textarea 
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Example: The database mentioned is 'PostgreSQL', not 'Post-it'. Also, add 'Update API docs' to action items."
                className="flex-1 p-3 border border-brand-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm text-slate-800 bg-white placeholder-slate-400"
                rows={2}
            />
            <button 
                onClick={handleReanalyzeClick}
                disabled={!feedback.trim()}
                className="self-end sm:self-center px-6 py-3 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
                Re-analyze
            </button>
         </div>
      </div>
    </div>
  );
};

export default Dashboard;