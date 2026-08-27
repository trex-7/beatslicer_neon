
import React, { useRef, useEffect, useState } from 'react';
import Tooltip from './Tooltip';
import { DEMO_LOOPS, DEMO_KITS, fetchAudioLibrary, type DemoLoop } from '../utils/demoLoops';
import type { KitSample, DemoKit } from '../types';

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
    const [libraryLoops, setLibraryLoops] = useState<DemoLoop[]>([]);
    const [libraryKits, setLibraryKits] = useState<DemoKit[]>([]);
    const [libraryLoaded, setLibraryLoaded] = useState(false);

    // Fetch library.json on mount
    useEffect(() => {
        const loadLib = async () => {
            const library = await fetchAudioLibrary();
            if (library) {
                setLibraryLoops(library.loops || []);
                setLibraryKits(library.kits || []);
                setLibraryLoaded(true);
            }
        };
        loadLib();
    }, []);

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
        
        // Check library first
        let loop = libraryLoops.find(l => l.url === url);
        if (!loop) {
             loop = DEMO_LOOPS.find(l => l.url === url);
        }
        
        if (loop) {
            onDemoLoad(loop.url, loop.name);
        }
        // Reset select to default
        e.target.value = "";
    };

    const handleKitSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const name = e.target.value;
        if (!name) return;
        
        let kit = libraryKits.find(k => k.name === name);
        if (!kit) {
            kit = DEMO_KITS.find(k => k.name === name);
        }
        
        if (kit) {
            onKitLoad(kit.samples, kit.name);
        }
        // Reset select
        e.target.value = "";
    };

    return (
        <div className="flex items-center gap-3 bg-deep-space/40 p-1.5 rounded-lg border border-white/10 w-full h-full">
            <div className="text-[10px] font-bold text-star-dust/50 uppercase tracking-wider hidden sm:flex items-center px-2 border-r border-white/10 h-full">
                Source {libraryLoaded && <span className="ml-1 text-hyper-cyan">•</span>}
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
                        {libraryLoops.length > 0 && (
                            <optgroup label="Local Library">
                                {libraryLoops.map((loop, i) => (
                                    <option key={`lib-loop-${i}`} value={loop.url} className="bg-deep-space text-white">
                                        {loop.name}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                        <optgroup label="Online Demos">
                            {DEMO_LOOPS.map((loop, i) => (
                                <option key={`loop-${i}`} value={loop.url} className="bg-deep-space text-white">
                                    {loop.name}
                                </option>
                            ))}
                        </optgroup>
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
                         {libraryKits.length > 0 && (
                            <optgroup label="Local Library">
                                {libraryKits.map((kit, i) => (
                                    <option key={`lib-kit-${i}`} value={kit.name} className="bg-deep-space text-white">
                                        {kit.name}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                        <optgroup label="Online Demos">
                            {DEMO_KITS.map((kit, i) => (
                                <option key={`kit-${i}`} value={kit.name} className="bg-deep-space text-white">
                                    {kit.name}
                                </option>
                            ))}
                        </optgroup>
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
