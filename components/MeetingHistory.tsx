import React, { useState, useEffect } from 'react';
import { Meeting, MeetingVersion, getMeetings, getMeetingVersions, deleteMeeting } from '../services/meetingService';
import { MeetingAnalysis } from '../types';

interface MeetingHistoryProps {
  userId: string;
  onOpenReport: (analysis: MeetingAnalysis, meetingId: string) => void;
}

const MeetingHistory: React.FC<MeetingHistoryProps> = ({ userId, onOpenReport }) => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [versions, setVersions] = useState<MeetingVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    loadMeetings();
  }, [userId]);

  const loadMeetings = async () => {
    setLoading(true);
    const data = await getMeetings(userId);
    setMeetings(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    setLoading(false);
  };

  const handleSelectMeeting = async (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setLoadingVersions(true);
    const data = await getMeetingVersions(meeting.id);
    setVersions(data);
    setLoadingVersions(false);
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
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row h-[600px]">
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
                <div className="flex justify-between items-start">
                  <h3 className="font-medium text-slate-900 truncate pr-2">{meeting.title}</h3>
                  <button onClick={(e) => handleDelete(e, meeting.id)} className="text-slate-400 hover:text-red-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {new Date(meeting.createdAt).toLocaleDateString()}
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
            <h2 className="text-xl font-bold text-slate-900 mb-2">{selectedMeeting.title}</h2>
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
                        onClick={() => onOpenReport(analysis, selectedMeeting.id)}
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
