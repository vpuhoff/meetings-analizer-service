import React from 'react';

const AskAI: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mb-5">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Ask AI</h2>
      <p className="text-slate-500 max-w-md">
        Ask questions across all your meetings using OpenAI Assistants. Connect your OpenAI API key in Profile settings to get started.
      </p>
      <span className="mt-6 px-4 py-1.5 bg-purple-100 text-purple-700 text-sm font-medium rounded-full">Coming soon</span>
    </div>
  );
};

export default AskAI;
