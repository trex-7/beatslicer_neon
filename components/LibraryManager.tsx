import React, { useRef, useEffect, useState } from 'react';
import Tooltip from './Tooltip';
import { DEMO_LOOPS, DEMO_KITS } from '../utils/demoLoops';
import { FACTORY_PRESETS } from '../utils/factoryPresets';
import { supabase } from '../utils/supabaseClient';
import { fetchLibrary, saveCloudPreset, uploadSampleToCloud, type CloudItem } from '../utils/db';
import type { KitSample, Preset } from '../types';
import Auth from './Auth';
import JSZip from 'jszip';

interface LibraryManagerProps {
    onFileLoad: (file: File) => void;
    onKitLoad: (files: File[] | KitSample[], name: string) => void;
    onDemoLoad: (url: string, name: string) => void;
    onExport: (name: string) => Promise<string>; // Returns JSON string
    onImport: (json: string) => Promise<void>;
    onLoadPreset: (preset: Preset) => void;
    getAudioWav: () => Promise<Blob | null>;
    isLoading: boolean;
    onPreviewToggle: () => void;
    isPreviewing: boolean;
    sampleName: string;
}

const LibraryManager: React.FC<LibraryManagerProps> = ({ 
    onFileLoad, onKitLoad, onDemoLoad, onExport, onImport, onLoadPreset, getAudioWav, isLoading, onPreviewToggle, isPreviewing, sampleName
}) => {
    // Inputs Refs
    const audioInputRef = useRef<HTMLInputElement>(null);
    const kitInputRef = useRef<HTMLInputElement>(null);
    const kitFolderInputRef = useRef<HTMLInputElement>(null);
    const presetInputRef = useRef<HTMLInputElement>(null);

    // State
    const [publicPresets, setPublicPresets] = useState<CloudItem[]>([]);
    const [publicSamples, setPublicSamples] = useState<CloudItem[]>([]);
    const [userPresets, setUserPresets] = useState<CloudItem[]>([]);
    const [userSamples, setUserSamples] = useState<CloudItem[]>([]);
    
    const [presetName, setPresetName] = useState("My Groove");
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Auth State
    const [user, setUser] = useState<any>(null);
    const [showAuth, setShowAuth] = useState(false);

    // Initial Load & Auth Check
    useEffect(() => {
        if (supabase) {
            // Get initial session
            supabase.auth.getSession().then(({ data: { session } }) => {
                setUser(session?.user ?? null);
            });

            // Listen for changes
            const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
                setUser(session?.user ?? null);
            });

            return () => subscription.unsubscribe();
        }
    }, []);

    // Fetch Library when User changes (or on mount)
    useEffect(() => {
        if (!supabase) return;

        const loadLib = async () => {
             const data = await fetchLibrary(user?.id);
             setPublicPresets(data.publicPresets);
             setPublicSamples(data.publicSamples);
             setUserPresets(data.userPresets);
             setUserSamples(data.userSamples);
        };
        loadLib();
    }, [user]);

    // Handlers for File Inputs
    const handleAudioFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
             onFileLoad(files[0]);
        }
        event.target.value = ""; 
    };

    const handleKitFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        
        if (files.length > 0) {
            // Filter for valid audio files
            const audioFiles = files.filter(f => 
                f.type.startsWith('audio/') || 
                f.name.match(/\.(wav|mp3|ogg|m4a|aif|aiff|flac)$/i)
            );

            if (audioFiles.length === 0) {
                alert("No valid audio files found in selection.");
                event.target.value = "";
                return;
            }

            // Sort alphabetically to keep kicks/snares grouped if named consistently
            audioFiles.sort((a, b) => a.name.localeCompare(b.name));

            // Attempt to determine Kit Name from folder structure
            let kitName = "User Kit";
            if (audioFiles[0].webkitRelativePath) {
                const parts = audioFiles[0].webkitRelativePath.split('/');
                if (parts.length > 1) {
                    kitName = parts[0]; // Top level folder name
                }
            }

            onKitLoad(audioFiles, kitName);
        }
        event.target.value = ""; 
    };

    const handlePresetFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsProcessing(true);
        try {
            const text = await file.text();
            await onImport(text);
        } catch (e) {
            console.error(e);
            alert("Failed to load preset");
        } finally {
            setIsProcessing(false);
            if (presetInputRef.current) presetInputRef.current.value = '';
        }
    };

    // Main Dropdown Handler
    const handleMainDropdown = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        if (!value) return;

        const [type, ...rest] = value.split(':');
        const id = rest.join(':');

        if (type === 'action') {
            if (id === 'new_preset') {
                const initPreset = FACTORY_PRESETS[0]; // Default Clean
                if (initPreset) {
                    onLoadPreset({
                        ...initPreset,
                        id: crypto.randomUUID(),
                        name: "Init Preset",
                        sampleName: sampleName // Keep existing sample name
                    });
                    setPresetName("Init Preset");
                }
            }
            if (id === 'upload_file') audioInputRef.current?.click();
            if (id === 'upload_kit') kitInputRef.current?.click();
            if (id === 'upload_kit_folder') kitFolderInputRef.current?.click();
            if (id === 'load_json') presetInputRef.current?.click();
        } else if (type === 'preset') {
             const p = FACTORY_PRESETS.find(x => x.id === id);
             if (p) onLoadPreset(p);
        } else if (type === 'cloud_preset') {
             // Search in both user and public lists
             const p = [...userPresets, ...publicPresets].find(x => x.id === id);
             if (p && p.data) {
                 // Convert CloudItem data to Preset structure
                 const fullPreset: Preset = {
                     id: p.id,
                     name: p.label,
                     date: Date.now(),
                     params: p.data.params,
                     sequencer: p.data.sequencer,
                     slices: p.data.slices || [],
                     sampleName: p.data.sampleName || 'Cloud Preset',
                     sampleUrl: p.data.sampleUrl
                 };
                 onLoadPreset(fullPreset);
             }
        } else if (type === 'cloud_sample') {
             const s = [...userSamples, ...publicSamples].find(x => x.id === id);
             if (s && s.url) onDemoLoad(s.url, s.label);
        } else if (type === 'loop') {
             let l = DEMO_LOOPS.find(x => x.url === id);
             if (l) onDemoLoad(l.url, l.name);
        } else if (type === 'kit') {
             let k = DEMO_KITS.find(x => x.name === id);
             if (k) onKitLoad(k.samples, k.name);
        }

        e.target.value = "";
    };

    const handleProjectSave = async () => {
        if (!presetName) return;
        setIsProcessing(true);

        try {
            const zip = new JSZip();
            const safeName = presetName.replace(/[^a-z0-9]/gi, '_');
            
            // Create Root Folder
            const rootFolder = zip.folder(safeName);
            if (!rootFolder) throw new Error("Failed to create zip folder");

            // 1. Add Audio
            const audioBlob = await getAudioWav();
            const audioFileName = `${sampleName.replace(/[^a-z0-9]/gi, '_')}.wav`;
            
            if (audioBlob) {
                const audioFolder = rootFolder.folder("Audio");
                if (audioFolder) {
                    audioFolder.file(audioFileName, audioBlob);
                }
            }

            // 2. Add JSON
            const jsonString = await onExport(presetName);
            const presetObj = JSON.parse(jsonString);
            
            // Add metadata about local storage path for future desktop app use
            presetObj.localAudioPath = `Audio/${audioFileName}`;
            
            rootFolder.file(`${safeName}.json`, JSON.stringify(presetObj, null, 2));

            // 3. Generate Zip Blob
            const content = await zip.generateAsync({ type: "blob" });
            
            // 4. Download
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${safeName}.zip`;
            a.click();
            URL.revokeObjectURL(url);

        } catch (e) {
            console.error(e);
            alert("Failed to zip project");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCloudSave = async () => {
        if (!user || !presetName) return;
        setIsProcessing(true);
        try {
            // 1. Get Audio Data
            const audioBlob = await getAudioWav();
            let sampleId: string | undefined;

            if (audioBlob) {
                const uploadResult = await uploadSampleToCloud(audioBlob, sampleName + ".wav", user.id);
                if (uploadResult) {
                    sampleId = uploadResult.id;
                }
            }

            // 2. Save Preset Data
            const json = await onExport(presetName);
            const presetObj = JSON.parse(json);
            
            const success = await saveCloudPreset(
                presetName,
                presetObj.params,
                presetObj.sequencer,
                presetObj.slices,
                user.id,
                sampleId 
            );

            if (success) {
                alert("Saved to cloud successfully!");
                // Refresh Library
                const data = await fetchLibrary(user.id);
                setPublicPresets(data.publicPresets);
                setPublicSamples(data.publicSamples);
                setUserPresets(data.userPresets);
                setUserSamples(data.userSamples);
            } else {
                alert("Failed to save to cloud.");
            }
        } catch (e) {
            console.error(e);
            alert("Error saving to cloud");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveDropdown = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const action = e.target.value;
        if (!action) return;

        if (!presetName.trim()) {
            alert("Please enter a preset name first.");
            e.target.value = "";
            return;
        }

        if (action === 'save_project') {
            await handleProjectSave();
        } else if (action === 'save_cloud') {
            await handleCloudSave();
        }

        e.target.value = "";
    };

    return (
        <div className="flex flex-col lg:flex-row items-center justify-between bg-nebula-blue/20 p-2 sm:p-3 rounded-xl border border-white/10 gap-3 w-full shadow-lg relative min-h-[60px]">
            
            {/* Hidden Inputs */}
            <input type="file" accept="audio/*" ref={audioInputRef} onChange={handleAudioFileChange} className="hidden" />
            <input type="file" accept="audio/*" multiple ref={kitInputRef} onChange={handleKitFileChange} className="hidden" />
            {/* Folder Input - Note: webkitdirectory is non-standard but widely supported */}
            <input 
                type="file" 
                accept="audio/*" 
                {...({ webkitdirectory: "", directory: "" } as any)} 
                ref={kitFolderInputRef} 
                onChange={handleKitFileChange} 
                className="hidden" 
            />
            <input type="file" accept=".json" ref={presetInputRef} onChange={handlePresetFileChange} className="hidden" />

            {/* Auth Widget Overlay */}
            <div className="absolute top-[-10px] right-0 translate-y-[-100%] pb-2 flex justify-end w-full">
                <div className="relative">
                    {!user ? (
                         <button 
                            onClick={() => setShowAuth(!showAuth)}
                            className="text-[10px] font-bold text-hyper-cyan hover:text-white uppercase tracking-wider bg-deep-space/80 px-2 py-1 rounded border border-hyper-cyan/30"
                         >
                            Login / Cloud
                         </button>
                    ) : (
                        <Auth user={user} />
                    )}
                    {showAuth && !user && <Auth user={null} onClose={() => setShowAuth(false)} />}
                </div>
            </div>

            {/* SECTION 1: UNIFIED LOADER */}
            <div className="flex items-center gap-2 flex-1 w-full lg:w-auto">
                <div className="relative flex-1 w-full">
                     <select 
                        onChange={handleMainDropdown} 
                        disabled={isLoading || isProcessing} 
                        className="w-full bg-deep-space/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-hyper-cyan focus:ring-1 focus:ring-hyper-cyan outline-none appearance-none cursor-pointer hover:bg-deep-space/80 transition-colors shadow-inner"
                        defaultValue=""
                     >
                        <option value="" disabled>Load Source...</option>
                        
                        <optgroup label="Actions">
                            <option value="action:new_preset">✨ New / Init Preset</option>
                            <option value="action:upload_file">📂 Upload Audio File (Loop)...</option>
                            <option value="action:upload_kit">🥁 Upload Kit (Select Files)...</option>
                            <option value="action:upload_kit_folder">📂 Upload Kit (Select Folder)...</option>
                            <option value="action:load_json">💾 Load JSON File...</option>
                        </optgroup>

                        {/* User Cloud Content */}
                        {userPresets.length > 0 && (
                            <optgroup label="My Cloud Presets">
                                {userPresets.map(p => (
                                    <option key={p.id} value={`cloud_preset:${p.id}`}>👤 {p.label}</option>
                                ))}
                            </optgroup>
                        )}
                        {userSamples.length > 0 && (
                            <optgroup label="My Cloud Samples">
                                {userSamples.map(s => (
                                    <option key={s.id} value={`cloud_sample:${s.id}`}>👤 {s.label}</option>
                                ))}
                            </optgroup>
                        )}

                        <optgroup label="Factory Presets">
                             {FACTORY_PRESETS.map(p => (
                                 <option key={p.id} value={`preset:${p.id}`}>✨ {p.name}</option>
                             ))}
                        </optgroup>

                        {/* Public Cloud Content */}
                        {publicPresets.length > 0 && (
                            <optgroup label="Community Presets">
                                {publicPresets.map(p => (
                                    <option key={p.id} value={`cloud_preset:${p.id}`}>☁️ {p.label} (by {p.author})</option>
                                ))}
                            </optgroup>
                        )}
                        
                        {publicSamples.length > 0 && (
                             <optgroup label="Community Samples">
                                {publicSamples.map(s => (
                                    <option key={s.id} value={`cloud_sample:${s.id}`}>☁️ {s.label} (by {s.author})</option>
                                ))}
                            </optgroup>
                        )}
                        
                        {(DEMO_LOOPS.length > 0 || DEMO_KITS.length > 0) && (
                            <optgroup label="Legacy Demos">
                                {DEMO_LOOPS.map((l, i) => <option key={`demo-loop-${i}`} value={`loop:${l.url}`}>🎵 {l.name}</option>)}
                                {DEMO_KITS.map((k, i) => <option key={`demo-kit-${i}`} value={`kit:${k.name}`}>🎹 {k.name}</option>)}
                            </optgroup>
                        )}
                     </select>
                     <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/50 text-[10px]">▼</div>
                </div>

                <Tooltip text="Preview Source (Raw Audio)">
                    <button 
                        onClick={onPreviewToggle} 
                        disabled={isLoading} 
                        className={`flex items-center justify-center w-9 h-9 bg-deep-space/40 border rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 ${isPreviewing ? 'border-plasma-pink text-plasma-pink animate-pulse shadow-[0_0_10px_rgba(255,0,170,0.3)]' : 'border-white/10 text-star-dust hover:bg-white/10'}`}
                    >
                        {isPreviewing ? 
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" /></svg> : 
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        }
                    </button>
                </Tooltip>

                <div className="flex items-center px-2 text-xs text-star-dust/60 truncate max-w-[100px] sm:max-w-[200px] border-l border-white/5 ml-1 pl-3">
                    <span className="opacity-50 mr-1 hidden sm:inline">Active:</span>
                    <span className="text-white font-medium truncate" title={sampleName}>{sampleName}</span>
                </div>
            </div>

            {/* SECTION 2: UNIFIED SAVE */}
            <div className="flex items-center gap-2 w-full lg:w-auto pt-2 lg:pt-0 lg:border-l lg:border-white/5 lg:pl-3">
                <input 
                    type="text" 
                    value={presetName} 
                    onChange={(e) => setPresetName(e.target.value)} 
                    placeholder="Preset Name" 
                    disabled={isLoading} 
                    className="flex-1 lg:w-40 bg-deep-space/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-plasma-pink focus:ring-1 focus:ring-plasma-pink outline-none placeholder-white/20 transition-all shadow-inner" 
                />
                
                <div className="relative w-full lg:w-40">
                    <select 
                        onChange={handleSaveDropdown}
                        disabled={isLoading || isProcessing || !presetName}
                        className="w-full bg-deep-space/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-plasma-pink focus:ring-1 focus:ring-plasma-pink outline-none appearance-none cursor-pointer hover:bg-deep-space/80 transition-colors shadow-inner disabled:opacity-50"
                        defaultValue=""
                    >
                        <option value="" disabled>Save Action...</option>
                        <option value="save_project">📦 Save Project to Device (ZIP)</option>
                        {user ? (
                            <option value="save_cloud">☁️ Save to Cloud (Audio + Settings)</option>
                        ) : (
                            <option value="" disabled className="text-white/30">☁️ Login to Cloud Save</option>
                        )}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/50 text-[10px]">▼</div>
                </div>
            </div>
        </div>
    );
};

export default LibraryManager;