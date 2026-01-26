import React, { useRef, useState } from 'react';

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

  const processFiles = (fileList: FileList) => {
     const files = Array.from(fileList);
     const validTypes = ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/mp4', 'audio/webm'];
     const maxSize = 20 * 1024 * 1024; // 20MB limit for demo stability per file

     const validFiles = files.filter(file => {
        const isValidType = validTypes.some(type => file.type.includes(type) || file.type.includes('audio')) || file.type.startsWith('audio/');
        const isValidSize = file.size <= maxSize;
        return isValidType && isValidSize;
     });

     if (validFiles.length !== files.length) {
         alert(`Some files were skipped. Ensure they are valid audio files under 20MB.`);
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
        accept="audio/*" 
        className="hidden" 
        multiple
        disabled={disabled}
      />
      
      <div className="space-y-4">
        <div className="flex justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-12 w-12 ${isDragOver ? 'text-brand-600' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
        </div>
        <div>
          <p className="text-lg font-medium text-slate-700">
            {isDragOver ? "Drop audio files here" : (fileCount > 0 ? `${fileCount} file(s) selected` : "Click to upload multiple audio files")}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            MP3, WAV, M4A (Max 20MB per file)
          </p>
        </div>
      </div>
    </div>
  );
};

export default Dropzone;