
import React, { useRef } from 'react';
import Tooltip from './Tooltip';
import { DEMO_LOOPS, DEMO_KITS } from '../utils/demoLoops';
import type { KitSample } from '../types';

interface FileLoaderProps {
    onFileLoad: (file: File) => void;
    onKitLoad: (files: File[] | KitSample[], name: string) => void;
    onDemoLoad: (url: string, name: string) => void;
    isLoading: boolean;
    onPreviewToggle: () => void;
    isPreviewing: boolean;
}

const FileLoader: React.FC<FileLoaderProps> = ({ onFileLoad, onKitLoad, onDemoLoad, isLoading, onPreviewToggle, isPreviewing }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            if (files.length > 1) {
                // Construction Kit Mode
                onKitLoad(Array.from(files), "User Kit");
            } else if (files.length === 1) {
                // Single Loop Mode
                onFileLoad(files[0]);
            }
        }
    };

    const handleDemoSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const url = e.target.value;
        if (!url) return;
        
        const loop = DEMO_LOOPS.find(l => l.url === url);
        if (loop) {
            onDemoLoad(loop.url, loop.name);
        }
        // Reset select to default
        e.target.value = "";
    };

    const handleKitSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const name = e.target.value;
        if (!name) return;
        
        const kit = DEMO_KITS.find(k => k.name === name);
        if (kit) {
            onKitLoad(kit.samples, kit.name);
        }
        // Reset select
        e.target.value = "";
    };

    return (
        <div className="flex items-center gap-3 bg-deep-space/40 p-1.5 rounded-lg border border-white/10 w-full h-full">
            <div className="text-[10px] font-bold text-star-dust/50 uppercase tracking-wider hidden sm:flex items-center px-2 border-r border-white/10 h-full">
                Source
            </div>
            <div className="flex gap-2 flex-1 w-full">
                <Tooltip text="Upload audio file (Loop) or multiple files (Kit)">
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
                    multiple // Allow multiple file selection for kits
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                />
                
                <div className="relative flex-[1.5]">
                    <select
                        onChange={handleDemoSelect}
                        disabled={isLoading}
                        className="w-full bg-transparent border border-hyper-cyan/30 hover:bg-hyper-cyan/10 text-hyper-cyan text-xs font-semibold py-1.5 px-3 rounded transition duration-200 disabled:opacity-50 outline-none appearance-none cursor-pointer"
                        defaultValue=""
                    >
                        <option value="" disabled>Load Loop...</option>
                        {DEMO_LOOPS.map((loop, i) => (
                            <option key={i} value={loop.url} className="bg-deep-space text-white">
                                {loop.name}
                            </option>
                        ))}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-hyper-cyan text-[10px]">▼</div>
                </div>

                <div className="relative flex-[1.5]">
                    <select
                        onChange={handleKitSelect}
                        disabled={isLoading}
                        className="w-full bg-transparent border border-plasma-pink/30 hover:bg-plasma-pink/10 text-plasma-pink text-xs font-semibold py-1.5 px-3 rounded transition duration-200 disabled:opacity-50 outline-none appearance-none cursor-pointer"
                        defaultValue=""
                    >
                        <option value="" disabled>Load Kit...</option>
                        {DEMO_KITS.map((kit, i) => (
                            <option key={i} value={kit.name} className="bg-deep-space text-white">
                                {kit.name}
                            </option>
                        ))}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-plasma-pink text-[10px]">▼</div>
                </div>
                
                <Tooltip text="Preview Source (Raw Audio)">
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
