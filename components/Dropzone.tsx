import React, { useRef, useState, useEffect, useCallback } from 'react';

interface DropzoneProps {
  onFilesSelect: (files: File[]) => void;
  disabled?: boolean;
}

const Dropzone: React.FC<DropzoneProps> = ({ onFilesSelect, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileCount, setFileCount] = useState(0);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  // Handle Ctrl+V paste — read clipboard text and process as .txt file
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    if (disabled) return;
    // Only handle text from clipboard (skip if files are pasted — those go through drop)
    const text = e.clipboardData?.getData('text/plain');
    if (!text || !text.trim()) return;
    e.preventDefault();
    const file = new File([text], 'pasted-transcript.txt', { type: 'text/plain' });
    setFileCount(1);
    onFilesSelect([file]);
  }, [disabled, onFilesSelect]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const processFiles = (fileList: FileList) => {
     const files = Array.from(fileList);
     
     // Allowed types: Audio + Text formats
     const audioTypes = ['audio/', 'video/']; // Allowing video mime prefix as some containers are audio-only
     const textTypes = ['text/', 'application/json', 'application/x-subrip']; // txt, md, json, srt
     const textExtensions = ['.txt', '.md', '.json', '.srt', '.vtt', '.csv'];

     const validFiles = files.filter(file => {
        const isAudio = audioTypes.some(type => file.type.includes(type));
        const isTextType = textTypes.some(type => file.type.includes(type));
        const hasTextExt = textExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
        
        return isAudio || isTextType || hasTextExt;
     });

     if (validFiles.length !== files.length) {
         alert(`Some files were skipped. Supported formats: Audio (MP3, WAV, etc.) or Text (TXT, MD, SRT, JSON).`);
     }

     if (validFiles.length > 0) {
         setFileCount(validFiles.length);
         onFilesSelect(validFiles);
     }
  };

  return (
    <div 
      className={`
        relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer
        ${isDragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input 
        type="file" 
        ref={inputRef} 
        onChange={handleChange} 
        accept="audio/*, .txt, .md, .json, .srt, .vtt" 
        className="hidden" 
        multiple
        disabled={disabled}
      />
      
      <div className="space-y-4">
        <div className="flex justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-12 w-12 ${isDragOver ? 'text-brand-600' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
        </div>
        <div>
          <p className="text-lg font-medium text-slate-700">
            {isDragOver ? "Drop files here" : (fileCount > 0 ? `${fileCount} file(s) selected` : "Upload Audio or Text Transcript")}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Audio (MP3, WAV) or Text (TXT, MD, SRT) · <span className="text-brand-500">Ctrl+V</span> to paste transcript
          </p>
        </div>
      </div>
    </div>
  );
};

export default Dropzone;