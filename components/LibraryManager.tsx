
import React, { useRef, useEffect, useState } from 'react';
import Tooltip from './Tooltip';
import { DEMO_LOOPS, DEMO_KITS } from '../utils/demoLoops';
import { FACTORY_PRESETS } from '../utils/factoryPresets';
import { supabase } from '../utils/supabaseClient';
import { 
    fetchLibrary, 
    saveCloudPreset, 
    uploadSampleToCloud, 
    deleteCloudPreset, 
    deleteCloudSample, 
    deleteBulkPresets, 
    deleteBulkSamples, 
    type CloudItem 
} from '../utils/db';
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

const ADMIN_EMAILS = ['sandromancino.sm@gmail.com'];

type TabView = 'dashboard' | 'my_presets' | 'my_samples' | 'factory' | 'community';

const LibraryManager: React.FC<LibraryManagerProps> = ({ 
    onFileLoad, onKitLoad, onDemoLoad, onExport, onImport, onLoadPreset, getAudioWav, isLoading, onPreviewToggle, isPreviewing, sampleName
}) => {
    // Hidden Input Refs
    const audioInputRef = useRef<HTMLInputElement>(null);
    const kitInputRef = useRef<HTMLInputElement>(null);
    const kitFolderInputRef = useRef<HTMLInputElement>(null);
    const presetInputRef = useRef<HTMLInputElement>(null);
    const bulkUploadRef = useRef<HTMLInputElement>(null);

    // Data State
    const [publicPresets, setPublicPresets] = useState<CloudItem[]>([]);
    const [publicSamples, setPublicSamples] = useState<CloudItem[]>([]);
    const [factoryPresets, setFactoryPresets] = useState<CloudItem[]>([]);
    const [factorySamples, setFactorySamples] = useState<CloudItem[]>([]);
    const [userPresets, setUserPresets] = useState<CloudItem[]>([]);
    const [userSamples, setUserSamples] = useState<CloudItem[]>([]);
    
    // UI State
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<TabView>('dashboard');
    const [projectName, setProjectName] = useState("My Groove");
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    
    // Upload Progress State
    const [uploadProgress, setUploadProgress] = useState<{
        active: boolean;
        current: number;
        total: number;
        currentFile: string;
        success: number;
        failed: number;
        complete: boolean;
    }>({ active: false, current: 0, total: 0, currentFile: '', success: 0, failed: 0, complete: false });

    // Auth State
    const [user, setUser] = useState<any>(null);

    // --- INITIALIZATION ---

    useEffect(() => {
        if (supabase) {
            supabase.auth.getSession().then(({ data: { session } }) => {
                setUser(session?.user ?? null);
            });
            const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
                setUser(session?.user ?? null);
            });
            return () => subscription.unsubscribe();
        }
    }, []);

    const loadLibraryData = async () => {
        if (!supabase) return;
        const data = await fetchLibrary(user?.id);
        setPublicPresets(data.publicPresets);
        setPublicSamples(data.publicSamples);
        setFactoryPresets(data.factoryPresets);
        setFactorySamples(data.factorySamples);
        setUserPresets(data.userPresets);
        setUserSamples(data.userSamples);
    };

    useEffect(() => {
        loadLibraryData();
    }, [user, isOpen]);


    // --- ACTION HANDLERS (Files) ---

    const handleAudioFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) onFileLoad(files[0]);
        setIsOpen(false);
        event.target.value = ""; 
    };

    const handleKitFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = Array.from(event.target.files || []);
        if (files.length > 0) {
            const audioFiles = files.filter(f => f.type.startsWith('audio/') || f.name.match(/\.(wav|mp3|ogg|m4a|aif|aiff|flac)$/i));
            if (audioFiles.length === 0) {
                alert("No valid audio files found.");
                return;
            }
            audioFiles.sort((a, b) => a.name.localeCompare(b.name));
            let kitName = "User Kit";
            if (audioFiles[0].webkitRelativePath) {
                const parts = audioFiles[0].webkitRelativePath.split('/');
                if (parts.length > 1) kitName = parts[0];
            }
            onKitLoad(audioFiles, kitName);
        }
        setIsOpen(false);
        event.target.value = ""; 
    };

    const handlePresetImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsProcessing(true);
        try {
            const text = await file.text();
            await onImport(text);
            setIsOpen(false);
        } catch (e) {
            console.error(e);
            alert("Failed to load preset");
        } finally {
            setIsProcessing(false);
            if (presetInputRef.current) presetInputRef.current.value = '';
        }
    };

    // --- SAVING ---

    const handleProjectDownload = async () => {
        if (!projectName) return;
        setIsProcessing(true);
        try {
            const zip = new JSZip();
            const safeName = projectName.replace(/[^a-z0-9]/gi, '_');
            const rootFolder = zip.folder(safeName);
            if (!rootFolder) throw new Error("Zip Error");

            const audioBlob = await getAudioWav();
            const audioFileName = `${sampleName.replace(/[^a-z0-9]/gi, '_')}.wav`;
            if (audioBlob) rootFolder.folder("Audio")?.file(audioFileName, audioBlob);

            const jsonString = await onExport(projectName);
            const presetObj = JSON.parse(jsonString);
            presetObj.localAudioPath = `Audio/${audioFileName}`;
            
            rootFolder.file(`${safeName}.json`, JSON.stringify(presetObj, null, 2));

            const content = await zip.generateAsync({ type: "blob" });
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

    const handleCloudSave = async (isFactory: boolean = false) => {
        if (!user || !projectName) return;
        setIsProcessing(true);
        try {
            const audioBlob = await getAudioWav();
            let sampleId: string | undefined;

            if (audioBlob) {
                const uploadResult = await uploadSampleToCloud(audioBlob, sampleName + ".wav", user.id, isFactory);
                if (uploadResult) sampleId = uploadResult.id;
            }

            const json = await onExport(projectName);
            const presetObj = JSON.parse(json);
            
            const success = await saveCloudPreset(
                projectName,
                presetObj.params,
                presetObj.sequencer,
                presetObj.slices,
                user.id,
                sampleId,
                isFactory
            );

            if (success) {
                await loadLibraryData();
                alert(`Saved "${projectName}" to ${isFactory ? 'Factory' : 'Cloud'}!`);
            } else {
                alert("Save failed.");
            }
        } catch (e) {
            console.error(e);
            alert("Error saving to cloud");
        } finally {
            setIsProcessing(false);
        }
    };

    // --- LOADING ITEMS ---

    const loadCloudItem = (item: CloudItem) => {
        if (item.type === 'preset' && item.data) {
             const fullPreset: Preset = {
                 id: item.id,
                 name: item.label,
                 date: Date.now(),
                 params: item.data.params,
                 sequencer: item.data.sequencer,
                 slices: item.data.slices || [],
                 sampleName: item.data.sampleName || 'Cloud Preset',
                 sampleUrl: item.data.sampleUrl
             };
             onLoadPreset(fullPreset);
             setProjectName(item.label);
        } else if (item.type === 'sample' && item.url) {
             onDemoLoad(item.url, item.label);
        }
        setIsOpen(false);
    };

    const loadLegacy = (type: 'loop'|'kit', item: any) => {
        if (type === 'loop') onDemoLoad(item.url, item.name);
        else onKitLoad(item.samples, item.name);
        setIsOpen(false);
    }

    // --- DELETION ---

    const handleDelete = async (item: CloudItem) => {
        if (!window.confirm(`Permanently delete "${item.label}"?`)) return;
        
        // Optimistic UI Update: Remove immediately from list
        if (item.type === 'preset') {
            setUserPresets(prev => prev.filter(p => p.id !== item.id));
        } else {
            setUserSamples(prev => prev.filter(s => s.id !== item.id));
        }

        setIsProcessing(true);
        let success = false;
        if (item.type === 'preset') success = await deleteCloudPreset(item.id);
        else success = await deleteCloudSample(item.id);

        if (!success) {
            alert("Delete failed on server. Item will be restored.");
            // Revert state by reloading from server
            await loadLibraryData();
        } else {
            // Success: We can optionally reload silently to ensure sync, 
            // but for UX speed we trust the optimistic update.
            // setTimeout(() => loadLibraryData(), 2000); 
        }
        setIsProcessing(false);
    };

    // --- ADMIN BULK UPLOAD ---
    const handleBulkUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        e.target.value = "";
        if (files.length === 0 || !user) return;

        setUploadProgress({ active: true, total: files.length, current: 0, currentFile: 'Init...', success: 0, failed: 0, complete: false });
        setIsProcessing(true);

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setUploadProgress(prev => ({ ...prev, current: i + 1, currentFile: file.name }));
            try {
                const res = await uploadSampleToCloud(file, file.name, user.id, true);
                if (res) successCount++; else failCount++;
            } catch { failCount++; }
            setUploadProgress(prev => ({ ...prev, success: successCount, failed: failCount }));
        }

        setUploadProgress(prev => ({ ...prev, currentFile: 'Done', complete: true }));
        setIsProcessing(false);
        await loadLibraryData();
    };

    const isAdmin = user && ADMIN_EMAILS.includes(user.email?.toLowerCase());

    // --- RENDER HELPERS ---

    const renderList = (items: CloudItem[], canDelete: boolean = false) => {
        const filtered = items.filter(i => i.label.toLowerCase().includes(searchTerm.toLowerCase()));
        
        if (filtered.length === 0) return <div className="text-white/30 italic text-sm p-4">No items found.</div>;

        return (
            <div className="grid grid-cols-1 gap-2">
                {filtered.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-deep-space/40 border border-white/5 hover:bg-white/5 transition-colors group">
                        <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => loadCloudItem(item)}>
                            <div className={`w-8 h-8 rounded flex items-center justify-center text-lg ${item.type === 'preset' ? 'bg-hyper-cyan/10 text-hyper-cyan' : 'bg-plasma-pink/10 text-plasma-pink'}`}>
                                {item.type === 'preset' ? '🎛️' : '💿'}
                            </div>
                            <div>
                                <div className="text-sm font-bold text-white group-hover:text-hyper-cyan transition-colors">{item.label}</div>
                                <div className="text-[10px] text-star-dust/60">
                                    {item.type === 'preset' ? 'Patch' : 'Sample'} • by {item.author || 'Anon'}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => loadCloudItem(item)}
                                className="px-3 py-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
                            >
                                LOAD
                            </button>
                            {canDelete && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                                    className="p-1.5 text-star-dust hover:text-red-500 transition-colors"
                                    title="Delete"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <>
            {/* HIDDEN INPUTS */}
            <input type="file" accept="audio/*" ref={audioInputRef} onChange={handleAudioFileChange} className="hidden" />
            <input type="file" accept="audio/*" multiple ref={kitInputRef} onChange={handleKitFileChange} className="hidden" />
            <input type="file" accept="audio/*" {...({ webkitdirectory: "", directory: "" } as any)} ref={kitFolderInputRef} onChange={handleKitFileChange} className="hidden" />
            <input type="file" accept=".json" ref={presetInputRef} onChange={handlePresetImport} className="hidden" />
            <input type="file" accept="audio/*" multiple ref={bulkUploadRef} onChange={handleBulkUploadChange} className="hidden" />

            {/* --- TOP BAR (Always Visible) --- */}
            <div className="w-full bg-deep-space/80 backdrop-blur-md border-b border-white/10 p-2 sm:px-4 flex items-center justify-between sticky top-0 z-40 rounded-xl mb-4 shadow-lg">
                
                {/* Left: Project Info */}
                <div className="flex items-center gap-3 flex-1 overflow-hidden">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-hyper-cyan to-blue-600 flex items-center justify-center text-deep-space font-bold shadow-[0_0_10px_rgba(0,246,255,0.3)]">
                        FX
                    </div>
                    <div className="flex flex-col min-w-0">
                        <input 
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            className="bg-transparent text-white font-bold text-sm sm:text-base outline-none placeholder-white/20 truncate"
                            placeholder="Untitled Project"
                        />
                        <div className="text-[10px] text-star-dust truncate">
                             Active Sample: <span className="text-hyper-cyan">{sampleName}</span>
                        </div>
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 sm:gap-4">
                    <Tooltip text="Preview Raw Audio">
                        <button 
                            onClick={onPreviewToggle}
                            className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all ${isPreviewing ? 'border-plasma-pink text-plasma-pink animate-pulse' : 'border-white/10 text-white/50 hover:bg-white/10'}`}
                        >
                            ▶
                        </button>
                    </Tooltip>

                    <Auth user={user} />

                    <button 
                        onClick={() => setIsOpen(true)}
                        className="bg-white/10 hover:bg-white/20 text-white border border-white/10 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold tracking-wide transition-all shadow-lg hover:shadow-hyper-cyan/20 hover:border-hyper-cyan/30 flex items-center gap-2"
                    >
                        <span className="text-lg">📚</span>
                        <span className="hidden sm:inline">LIBRARY</span>
                    </button>
                </div>
            </div>

            {/* --- MODAL WINDOW --- */}
            {isOpen && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-5xl h-[85vh] bg-[#0f1319] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/5">
                        
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#151a23]">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="text-hyper-cyan">📚</span> Library Manager
                            </h2>
                            <button onClick={() => setIsOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">✕</button>
                        </div>

                        <div className="flex flex-1 overflow-hidden">
                            {/* SIDEBAR */}
                            <div className="w-16 sm:w-64 bg-[#12161d] border-r border-white/5 flex flex-col">
                                <nav className="flex-1 p-2 space-y-1">
                                    <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest px-3 py-2 hidden sm:block">Project</div>
                                    <button 
                                        onClick={() => setActiveTab('dashboard')}
                                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-hyper-cyan/10 text-hyper-cyan border border-hyper-cyan/20' : 'text-star-dust hover:bg-white/5 hover:text-white'}`}
                                    >
                                        <span className="text-lg">🏠</span> <span className="hidden sm:inline">Dashboard</span>
                                    </button>

                                    <div className="h-px bg-white/5 my-2 mx-2"></div>
                                    
                                    <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest px-3 py-2 hidden sm:block">My Library</div>
                                    <button 
                                        onClick={() => setActiveTab('my_presets')}
                                        disabled={!user}
                                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'my_presets' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'text-star-dust hover:bg-white/5 hover:text-white disabled:opacity-30'}`}
                                    >
                                        <span className="text-lg">🎛️</span> <span className="hidden sm:inline">My Presets</span>
                                    </button>
                                    <button 
                                        onClick={() => setActiveTab('my_samples')}
                                        disabled={!user}
                                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'my_samples' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'text-star-dust hover:bg-white/5 hover:text-white disabled:opacity-30'}`}
                                    >
                                        <span className="text-lg">💿</span> <span className="hidden sm:inline">My Samples</span>
                                    </button>

                                    <div className="h-px bg-white/5 my-2 mx-2"></div>

                                    <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest px-3 py-2 hidden sm:block">Explore</div>
                                    <button 
                                        onClick={() => setActiveTab('factory')}
                                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'factory' ? 'bg-plasma-pink/10 text-plasma-pink border border-plasma-pink/20' : 'text-star-dust hover:bg-white/5 hover:text-white'}`}
                                    >
                                        <span className="text-lg">🏭</span> <span className="hidden sm:inline">Factory</span>
                                    </button>
                                    <button 
                                        onClick={() => setActiveTab('community')}
                                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'community' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-star-dust hover:bg-white/5 hover:text-white'}`}
                                    >
                                        <span className="text-lg">🌐</span> <span className="hidden sm:inline">Community</span>
                                    </button>
                                </nav>
                                
                                {isAdmin && (
                                    <div className="p-2 border-t border-white/5">
                                        <button 
                                            onClick={() => bulkUploadRef.current?.click()}
                                            className="w-full flex items-center justify-center gap-2 p-2 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-xs text-white/50 hover:text-white"
                                            title="Admin Bulk Upload"
                                        >
                                            <span>⚡</span> <span className="hidden sm:inline">Admin Upload</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* MAIN CONTENT AREA */}
                            <div className="flex-1 flex flex-col bg-[#0a0d14] relative">
                                
                                {/* DASHBOARD VIEW */}
                                {activeTab === 'dashboard' && (
                                    <div className="p-8 overflow-y-auto">
                                        <h1 className="text-3xl font-bold text-white mb-2">Welcome{user ? `, ${user.email?.split('@')[0]}` : ''}</h1>
                                        <p className="text-star-dust mb-8">Manage your project, load audio, or export your work.</p>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {/* Local Actions */}
                                            <div className="space-y-4">
                                                <h3 className="text-xs font-bold text-hyper-cyan uppercase tracking-widest border-b border-white/10 pb-2">Local Actions</h3>
                                                <button onClick={() => { onLoadPreset(FACTORY_PRESETS[0]); setProjectName("Init Project"); setIsOpen(false); }} className="w-full p-4 bg-deep-space/60 border border-white/10 hover:border-hyper-cyan/50 rounded-xl text-left flex items-center gap-4 transition-all group">
                                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-xl group-hover:bg-hyper-cyan group-hover:text-black transition-colors">✨</div>
                                                    <div>
                                                        <div className="font-bold text-white">New Project</div>
                                                        <div className="text-xs text-star-dust">Initialize a blank state</div>
                                                    </div>
                                                </button>
                                                <button onClick={() => audioInputRef.current?.click()} className="w-full p-4 bg-deep-space/60 border border-white/10 hover:border-hyper-cyan/50 rounded-xl text-left flex items-center gap-4 transition-all group">
                                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-xl group-hover:bg-hyper-cyan group-hover:text-black transition-colors">📂</div>
                                                    <div>
                                                        <div className="font-bold text-white">Load Audio File</div>
                                                        <div className="text-xs text-star-dust">Import WAV, MP3, AIFF loop</div>
                                                    </div>
                                                </button>
                                                 <button onClick={() => kitFolderInputRef.current?.click()} className="w-full p-4 bg-deep-space/60 border border-white/10 hover:border-hyper-cyan/50 rounded-xl text-left flex items-center gap-4 transition-all group">
                                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-xl group-hover:bg-hyper-cyan group-hover:text-black transition-colors">🥁</div>
                                                    <div>
                                                        <div className="font-bold text-white">Import Kit Folder</div>
                                                        <div className="text-xs text-star-dust">Select a folder of drum samples</div>
                                                    </div>
                                                </button>
                                            </div>

                                            {/* Save Actions */}
                                            <div className="space-y-4">
                                                <h3 className="text-xs font-bold text-plasma-pink uppercase tracking-widest border-b border-white/10 pb-2">Save & Export</h3>
                                                <button onClick={handleProjectDownload} className="w-full p-4 bg-deep-space/60 border border-white/10 hover:border-plasma-pink/50 rounded-xl text-left flex items-center gap-4 transition-all group">
                                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-xl group-hover:bg-plasma-pink group-hover:text-white transition-colors">📦</div>
                                                    <div>
                                                        <div className="font-bold text-white">Download Project ZIP</div>
                                                        <div className="text-xs text-star-dust">Includes JSON preset + Audio</div>
                                                    </div>
                                                </button>
                                                
                                                {user ? (
                                                    <button onClick={() => handleCloudSave(false)} className="w-full p-4 bg-deep-space/60 border border-white/10 hover:border-plasma-pink/50 rounded-xl text-left flex items-center gap-4 transition-all group">
                                                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-xl group-hover:bg-plasma-pink group-hover:text-white transition-colors">☁️</div>
                                                        <div>
                                                            <div className="font-bold text-white">Save to Cloud</div>
                                                            <div className="text-xs text-star-dust">Store permanently in your library</div>
                                                        </div>
                                                    </button>
                                                ) : (
                                                    <div className="w-full p-4 bg-deep-space/30 border border-white/5 rounded-xl text-center flex flex-col items-center justify-center gap-2 opacity-50">
                                                        <div className="font-bold text-white">Login to use Cloud Save</div>
                                                        <div className="text-xs text-star-dust">Access your presets anywhere</div>
                                                    </div>
                                                )}

                                                <button onClick={() => presetInputRef.current?.click()} className="w-full p-3 text-xs text-star-dust hover:text-white border border-dashed border-white/10 rounded-lg hover:bg-white/5 transition-colors">
                                                    Import JSON Preset File...
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* LIST VIEWS */}
                                {activeTab !== 'dashboard' && (
                                    <div className="flex flex-col h-full">
                                        {/* List Toolbar */}
                                        <div className="p-4 border-b border-white/5 flex gap-4">
                                            <input 
                                                type="text" 
                                                placeholder="Search..." 
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:border-hyper-cyan outline-none"
                                            />
                                        </div>

                                        <div className="flex-1 overflow-y-auto p-4">
                                            {activeTab === 'my_presets' && renderList(userPresets, true)}
                                            {activeTab === 'my_samples' && renderList(userSamples, true)}
                                            {activeTab === 'factory' && (
                                                <div className="space-y-6">
                                                    <div>
                                                        <h3 className="text-xs font-bold text-white/50 mb-3 uppercase">Presets</h3>
                                                        <div className="grid grid-cols-1 gap-2">
                                                            {FACTORY_PRESETS.map(p => (
                                                                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-deep-space/40 border border-white/5 hover:bg-white/5 transition-colors cursor-pointer group" onClick={() => { onLoadPreset(p); setIsOpen(false); }}>
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="text-lg">⭐</span>
                                                                        <div className="font-bold text-white group-hover:text-plasma-pink transition-colors">{p.name}</div>
                                                                    </div>
                                                                    <button className="px-3 py-1 text-xs bg-white/10 rounded text-white">LOAD</button>
                                                                </div>
                                                            ))}
                                                            {renderList(factoryPresets)}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <h3 className="text-xs font-bold text-white/50 mb-3 uppercase">Samples</h3>
                                                        {renderList(factorySamples)}
                                                    </div>
                                                    <div>
                                                        <h3 className="text-xs font-bold text-white/50 mb-3 uppercase">Legacy Demos</h3>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                            {DEMO_LOOPS.map((l,i) => (
                                                                <button key={i} onClick={() => loadLegacy('loop', l)} className="p-2 text-left bg-white/5 hover:bg-white/10 rounded text-xs text-star-dust hover:text-white">🎵 {l.name}</button>
                                                            ))}
                                                            {DEMO_KITS.map((k,i) => (
                                                                <button key={i} onClick={() => loadLegacy('kit', k)} className="p-2 text-left bg-white/5 hover:bg-white/10 rounded text-xs text-star-dust hover:text-white">🥁 {k.name}</button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {activeTab === 'community' && (
                                                <div className="space-y-6">
                                                    <div>
                                                        <h3 className="text-xs font-bold text-white/50 mb-3 uppercase">Community Presets</h3>
                                                        {renderList(publicPresets)}
                                                    </div>
                                                    <div>
                                                        <h3 className="text-xs font-bold text-white/50 mb-3 uppercase">Community Samples</h3>
                                                        {renderList(publicSamples)}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* UPLOAD PROGRESS OVERLAY */}
            {uploadProgress.active && (
                <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black/90 backdrop-blur-md">
                    <div className="w-full max-w-md p-6 bg-deep-space border border-hyper-cyan rounded-xl shadow-2xl text-center">
                        <h3 className="text-xl font-bold text-white mb-4">
                            {uploadProgress.complete ? '✅ Upload Complete' : '⏳ Uploading...'}
                        </h3>
                        {!uploadProgress.complete && (
                            <>
                                <div className="w-full bg-white/10 rounded-full h-2 mb-4 overflow-hidden">
                                    <div className="bg-hyper-cyan h-full transition-all duration-300" style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}></div>
                                </div>
                                <p className="text-xs text-star-dust mb-4 font-mono">{uploadProgress.currentFile}</p>
                            </>
                        )}
                        <div className="flex justify-center gap-8 mb-6">
                            <div className="text-center"><div className="text-2xl font-bold text-green-400">{uploadProgress.success}</div><div className="text-[10px] uppercase text-white/50">Success</div></div>
                            <div className="text-center"><div className="text-2xl font-bold text-red-400">{uploadProgress.failed}</div><div className="text-[10px] uppercase text-white/50">Failed</div></div>
                        </div>
                        {uploadProgress.complete && (
                            <button onClick={() => setUploadProgress(p => ({ ...p, active: false }))} className="w-full py-2 bg-hyper-cyan text-black font-bold rounded hover:bg-white transition-colors">CLOSE</button>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default LibraryManager;
