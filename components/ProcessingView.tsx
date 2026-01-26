import React from 'react';

interface ProcessingViewProps {
  currentStep: number;
}

const ProcessingView: React.FC<ProcessingViewProps> = ({ currentStep }) => {
  
  const steps = [
    { label: "Preparing Files", detail: "Reading audio data and preparing for secure transmission" },
    { label: "Transcribing Audio", detail: "Phase 1: Converting audio segments to text with speaker identification" },
    { label: "Extracting Intelligence", detail: "Phase 2: Analyzing transcript for decisions, action items, and tech specs" },
    { label: "Finalizing Report", detail: "Formatting structure and validating JSON output" }
  ];

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
        
        <h3 className="text-xl font-semibold text-slate-800 animate-pulse">
            Processing Meeting Intelligence
        </h3>

        <div className="w-full space-y-4 text-left mt-4">
            {steps.map((s, idx) => (
                <div key={idx} className={`flex items-start transition-opacity duration-500 ${idx > currentStep ? 'opacity-30' : 'opacity-100'}`}>
                    <div className="flex-shrink-0 h-6 w-6 flex items-center justify-center">
                        {idx < currentStep ? (
                             <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                             </svg>
                        ) : idx === currentStep ? (
                            <div className="w-2.5 h-2.5 bg-brand-600 rounded-full animate-bounce"></div>
                        ) : (
                            <div className="w-2.5 h-2.5 bg-slate-300 rounded-full"></div>
                        )}
                    </div>
                    <div className="ml-3">
                        <p className={`text-sm font-medium ${idx === currentStep ? 'text-brand-600' : 'text-slate-700'}`}>{s.label}</p>
                        <p className="text-xs text-slate-500">{s.detail}</p>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default ProcessingView;