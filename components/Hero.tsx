import React from 'react';

const Hero: React.FC = () => {
  return (
    <div className="text-center py-10 px-4">
      <div className="inline-flex items-center justify-center p-3 bg-brand-50 rounded-full mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </div>
      <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl mb-4">
        Meeting Intelligence Extractor
      </h1>
      <p className="max-w-2xl mx-auto text-lg text-slate-600">
        Upload your meeting audio (MP3, WAV) to automatically extract <span className="font-semibold text-brand-600">decisions</span>, <span className="font-semibold text-brand-600">action items</span>, and <span className="font-semibold text-brand-600">technical specs</span> using Gemini 2.5 Flash.
      </p>
    </div>
  );
};

export default Hero;
