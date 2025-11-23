import React, { useRef } from 'react';
import Tooltip from './Tooltip';

interface FileLoaderProps {
    onFileLoad: (file: File) => void;
    onDefaultLoad: () => void;
    isLoading: boolean;
    onPreviewToggle: () => void;
    isPreviewing: boolean;
}

const FileLoader: React.FC<FileLoaderProps> = ({ onFileLoad, onDefaultLoad, isLoading, onPreviewToggle, isPreviewing }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onFileLoad(file);
        }
    };

    return (
        <div className="flex items-center gap-3 bg-deep-space/40 p-1.5 rounded-lg border border-white/10 w-full h-full">
            <div className="text-[10px] font-bold text-star-dust/50 uppercase tracking-wider hidden sm:flex items-center px-2 border-r border-white/10 h-full">
                Source
            </div>
            <div className="flex gap-2 flex-1">
                <Tooltip text="Upload audio file (.mp3, .wav)">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading}
                        className="flex-1 bg-nebula-blue hover:bg-nebula-blue/80 text-star-dust text-xs font-semibold py-1.5 px-3 rounded transition duration-200 disabled:opacity-50 whitespace-nowrap border border-white/5"
                    >
                        {isLoading ? '...' : 'Upload'}
                    </button>
                </Tooltip>
                <input
                    type="file"
                    accept="audio/*"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                />
                <Tooltip text="Load Default Sample">
                    <button
                        onClick={onDefaultLoad}
                        disabled={isLoading}
                        className="flex-1 bg-transparent border border-hyper-cyan/30 hover:bg-hyper-cyan/10 text-hyper-cyan text-xs font-semibold py-1.5 px-3 rounded transition duration-200 disabled:opacity-50 whitespace-nowrap"
                    >
                        Default
                    </button>
                </Tooltip>
                
                <Tooltip text="Preview Loop (Raw Audio)">
                    <button
                        onClick={onPreviewToggle}
                        disabled={isLoading}
                        className={`flex items-center justify-center w-10 bg-transparent border rounded transition duration-200 disabled:opacity-50 ${isPreviewing ? 'border-plasma-pink text-plasma-pink animate-pulse' : 'border-white/20 text-star-dust hover:bg-white/10'}`}
                    >
                        {isPreviewing ? (
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                                <rect x="6" y="6" width="12" height="12" />
                             </svg>
                        ) : (
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                 <path d="M8 5v14l11-7z" />
                             </svg>
                        )}
                    </button>
                </Tooltip>
            </div>
        </div>
    );
};

export default FileLoader;