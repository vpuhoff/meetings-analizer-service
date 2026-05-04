import React from 'react';

const KnowledgeBase: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-5">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Knowledge Base</h2>
      <p className="text-slate-500 max-w-md">
        Your meetings are indexed here for semantic search. Enable "Auto-save to search index" in Profile settings to populate the knowledge base automatically.
      </p>
      <span className="mt-6 px-4 py-1.5 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-full">Coming soon</span>
    </div>
  );
};

export default KnowledgeBase;
