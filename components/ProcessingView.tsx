import React from 'react';

interface ProcessingViewProps {
  percent: number;
  message: string;
  filePercent?: number;
  fileStage?: string;
}

const ProcessingView: React.FC<ProcessingViewProps> = ({ percent, message, filePercent, fileStage }) => {
  return (
    <div className="max-w-xl mx-auto py-12 px-6 bg-white rounded-2xl shadow-lg border border-slate-100">
      <div className="flex flex-col items-center text-center space-y-6">
        <div className="relative">
             {/* Spinner */}
            <div className="w-16 h-16 border-4 border-brand-100 border-t-brand-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
                 <svg className="w-6 h-6 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                 </svg>
            </div>
        </div>
        
        <h3 className="text-xl font-semibold text-slate-800">
            Processing Meeting Intelligence
        </h3>

        {/* Overall Progress Bar */}
        <div className="w-full space-y-3 mt-4">
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
            <div 
              className="bg-brand-600 h-3 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex justify-between items-center">
            <p className="text-sm text-brand-600 font-medium animate-pulse">
              {message || 'Preparing...'}
            </p>
            <span className="text-sm font-bold text-slate-700">
              {percent}%
            </span>
          </div>
        </div>

        {/* File-level Progress Bar */}
        {filePercent != null && filePercent > 0 && (
          <div className="w-full space-y-2 mt-2">
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-emerald-500 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${filePercent}%` }}
              />
            </div>
            <div className="flex justify-between items-center">
              <p className="text-xs text-emerald-600 font-medium">
                {fileStage || 'Processing file...'}
              </p>
              <span className="text-xs font-bold text-slate-500">
                {Math.round(filePercent)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProcessingView;