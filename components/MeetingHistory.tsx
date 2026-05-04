import React, { useState, useEffect } from 'react';
import { Meeting, MeetingVersion, getMeetings, getMeetingVersions, deleteMeeting, saveMeeting, subscribeKBDocuments } from '../services/meetingService';
import { MeetingAnalysis } from '../types';

interface MeetingHistoryProps {
  userId: string;
  onOpenReport: (analysis: MeetingAnalysis, meetingId: string, meetingDate?: string) => void;
}

const MeetingHistory: React.FC<MeetingHistoryProps> = ({ userId, onOpenReport }) => {
  const [kbMeetingIds, setKbMeetingIds] = useState<Set<string>>(new Set());
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [versions, setVersions] = useState<MeetingVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState('');
  const [savingDate, setSavingDate] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  useEffect(() => {
    loadMeetings();
  }, [userId]);

  useEffect(() => {
    const unsub = subscribeKBDocuments(userId, (docs) => {
      setKbMeetingIds(new Set(docs.map(d => d.meeting_id).filter(Boolean)));
    });
    return unsub;
  }, [userId]);

  const loadMeetings = async () => {
    setLoading(true);
    const data = await getMeetings(userId);
    setMeetings(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    setLoading(false);
  };

  const handleSelectMeeting = async (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setEditingDate(false);
    setLoadingVersions(true);
    const data = await getMeetingVersions(meeting.id);
    setVersions(data);
    setLoadingVersions(false);
  };

  const handleStartEditDate = () => {
    if (!selectedMeeting) return;
    // datetime-local input expects 'YYYY-MM-DDTHH:mm'
    const d = new Date(selectedMeeting.createdAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setDateInput(local);
    setEditingDate(true);
  };

  const handleSaveDate = async () => {
    if (!selectedMeeting || !dateInput) return;
    setSavingDate(true);
    setDateError(null);
    try {
      const newDate = new Date(dateInput).toISOString();
      await saveMeeting({ id: selectedMeeting.id, createdAt: newDate, updatedAt: new Date().toISOString() });
      const updated = { ...selectedMeeting, createdAt: newDate };
      setSelectedMeeting(updated);
      setMeetings(prev => prev.map(m => m.id === updated.id ? updated : m).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setEditingDate(false);
    } catch (err: any) {
      console.error('Failed to save date:', err);
      setDateError(err?.message || 'Failed to save date');
    } finally {
      setSavingDate(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteMeeting(id);
    if (selectedMeeting?.id === id) {
      setSelectedMeeting(null);
      setVersions([]);
    }
    loadMeetings();
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading history...</div>;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row h-[calc(100vh-12rem)]">
      {/* Meetings List */}
      <div className="w-full md:w-1/3 border-r border-slate-200 overflow-y-auto custom-scrollbar bg-slate-50">
        <div className="p-4 border-b border-slate-200 bg-white sticky top-0 z-10">
          <h2 className="font-bold text-slate-800">Meeting History</h2>
        </div>
        {meetings.length === 0 ? (
          <div className="p-4 text-sm text-slate-500 text-center">No meetings saved yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {meetings.map(meeting => (
              <li 
                key={meeting.id} 
                className={`p-4 cursor-pointer hover:bg-brand-50 transition-colors ${selectedMeeting?.id === meeting.id ? 'bg-brand-50 border-l-4 border-brand-500' : 'border-l-4 border-transparent'}`}
                onClick={() => handleSelectMeeting(meeting)}
              >
                <div className="flex justify-between items-start gap-1">
                  <h3 className="font-medium text-slate-900 truncate">{meeting.title}</h3>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {kbMeetingIds.has(meeting.id) && (
                      <span title="Saved to Knowledge Base" className="flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded-full">
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                        </svg>
                        KB
                      </span>
                    )}
                    <button onClick={(e) => handleDelete(e, meeting.id)} className="text-slate-400 hover:text-red-500">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {new Date(meeting.createdAt).toLocaleString()}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(meeting.projectTags || []).slice(0, 3).map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded">{tag}</span>
                  ))}
                  {(meeting.projectTags || []).length > 3 && <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded">+{(meeting.projectTags || []).length - 3}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Versions List */}
      <div className="w-full md:w-2/3 overflow-y-auto custom-scrollbar bg-white">
        {selectedMeeting ? (
          <div className="p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-1">{selectedMeeting.title}</h2>
            <div className="flex items-center gap-2 mb-4">
              {editingDate ? (
                <>
                  <input
                    type="datetime-local"
                    value={dateInput}
                    onChange={e => setDateInput(e.target.value)}
                    className="text-xs border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                  <button
                    onClick={handleSaveDate}
                    disabled={savingDate}
                    className="text-xs px-2 py-1 bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-50 transition-colors"
                  >
                    {savingDate ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setEditingDate(false); setDateError(null); }}
                    className="text-xs px-2 py-1 text-slate-600 bg-slate-100 rounded hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  {dateError && (
                    <span className="text-xs text-red-500">{dateError}</span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-sm text-slate-500">
                    {new Date(selectedMeeting.createdAt).toLocaleString()}
                  </span>
                  <button
                    onClick={handleStartEditDate}
                    className="text-slate-400 hover:text-brand-600 transition-colors"
                    title="Edit date"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mb-6">
              {(selectedMeeting.techStackTags || []).map(tag => (
                <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">{tag}</span>
              ))}
            </div>
            
            <h3 className="font-semibold text-slate-800 mb-4">Report Versions</h3>
            {loadingVersions ? (
              <div className="text-sm text-slate-500">Loading versions...</div>
            ) : (
              <div className="space-y-4">
                {versions.map((version, index) => {
                  const analysis: MeetingAnalysis = JSON.parse(version.analysis);
                  return (
                    <div key={version.id} className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-center mb-2">
                        <div className="font-medium text-slate-900">
                          Version {versions.length - index}
                          {index === 0 && <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Latest</span>}
                        </div>
                        <div className="text-xs text-slate-500">{new Date(version.createdAt).toLocaleString()}</div>
                      </div>
                      {version.feedback && (
                        <div className="text-sm text-slate-600 bg-slate-50 p-2 rounded mb-3 border border-slate-100">
                          <span className="font-medium">Feedback:</span> {version.feedback}
                        </div>
                      )}
                      <div className="text-sm text-slate-700 line-clamp-5 mb-3">
                        {analysis.summary}
                      </div>
                      <button 
                        onClick={() => onOpenReport(analysis, selectedMeeting.id, selectedMeeting.createdAt)}
                        className="text-sm text-brand-600 font-medium hover:text-brand-700 flex items-center"
                      >
                        Open Report
                        <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 p-8 text-center">
            Select a meeting from the list to view its history and versions.
          </div>
        )}
      </div>
    </div>
  );
};

export default MeetingHistory;
