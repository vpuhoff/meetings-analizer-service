import React, { useEffect, useState } from 'react';

const ProcessingView: React.FC = () => {
  const [step, setStep] = useState(0);
  
  // Simulate the stages mentioned in the TZ: Diarization -> Transcription -> Entity Extraction
  useEffect(() => {
    const intervals = [
        setTimeout(() => setStep(1), 2000), // Diarization
        setTimeout(() => setStep(2), 6000), // Transcription
        setTimeout(() => setStep(3), 10000), // Entity Extraction
    ];
    return () => intervals.forEach(clearTimeout);
  }, []);

  const steps = [
    { label: "Initializing...", detail: "Preparing secure upload" },
    { label: "Diarization & Transcription", detail: "Identifying speakers and converting audio to text (Whisper/Gemini)" },
    { label: "Entity Extraction", detail: "Running LLM analysis for Tech Details & Action Items" },
    { label: "Formatting Results", detail: "Generating JSON output" }
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
                <div key={idx} className={`flex items-start transition-opacity duration-500 ${idx > step ? 'opacity-30' : 'opacity-100'}`}>
                    <div className="flex-shrink-0 h-6 w-6 flex items-center justify-center">
                        {idx < step ? (
                             <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                             </svg>
                        ) : idx === step ? (
                            <div className="w-2.5 h-2.5 bg-brand-600 rounded-full animate-bounce"></div>
                        ) : (
                            <div className="w-2.5 h-2.5 bg-slate-300 rounded-full"></div>
                        )}
                    </div>
                    <div className="ml-3">
                        <p className={`text-sm font-medium ${idx === step ? 'text-brand-600' : 'text-slate-700'}`}>{s.label}</p>
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
