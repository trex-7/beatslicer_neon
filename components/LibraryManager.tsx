
import React, { useRef, useEffect, useState, memo, useMemo } from 'react';
import Tooltip from './Tooltip';
import InfoIcon from './InfoIcon';
import { FACTORY_PRESETS } from '../utils/factoryPresets';
import { supabase } from '../utils/supabaseClient';
import { 
    fetchLibrary, 
    saveCloudPreset, 
    uploadSampleToCloud, 
    deleteCloudPreset, 
    deleteCloudSample, 
    updateSampleTitle,
    type CloudItem,
    type DeleteResult
} from '../utils/db';
import type { KitSample, Preset } from '../types';
import JSZip from 'jszip';

interface LibraryManagerProps {
    onFileLoad: (file: File) => void;
    onKitLoad: (files: File[] | KitSample[], name: string) => void;
    onDemoLoad: (url: string, name: string) => void;
    onExport: (name: string) => Promise<string>;
    onImport: (json: string) => Promise<void>;
    onLoadPreset: (preset: Preset) => void;
    getAudioWav: () => Promise<Blob | null>;
    isLoading: boolean;
    sampleName: string;
    className?: string;
    variant?: 'default' | 'centered' | 'visual-browser' | 'transport' | 'sidebar' | 'hidden';
    user: any;
    // New props for external control
    externalIsOpen?: boolean;
    onExternalClose?: () => void;
}

const ADMIN_EMAILS = ['sandromancino.sm@gmail.com'];

type TabView = 'dashboard' | 'my_presets' | 'my_samples' | 'factory' | 'community' | 'admin';

interface DetectedKit {
    name: string;
    author: string;
    items: CloudItem[];
}

const LibraryManager: React.FC<LibraryManagerProps> = memo(({ 
    onFileLoad, onKitLoad, onDemoLoad, onExport, onImport, onLoadPreset, getAudioWav, isLoading, sampleName, className, variant = 'default', user, externalIsOpen, onExternalClose
}) => {
    // Hidden Input Refs
    const audioInputRef = useRef<HTMLInputElement>(null);
    const kitInputRef = useRef<HTMLInputElement>(null);
    const kitFolderInputRef = useRef<HTMLInputElement>(null);
    const presetInputRef = useRef<HTMLInputElement>(null);
    const bulkUploadRef = useRef<HTMLInputElement>(null);
    const adminPresetRef = useRef<HTMLInputElement>(null);

    // Admin Upload State
    const adminUploadType = useRef<'sample' | 'kit' | null>(null);
    const adminKitName = useRef<string>("");
    const [adminKitNameInput, setAdminKitNameInput] = useState("");

    // Data State
    const [publicPresets, setPublicPresets] = useState<CloudItem[]>([]);
    const [publicSamples, setPublicSamples] = useState<CloudItem[]>([]);
    const [factoryPresets, setFactoryPresets] = useState<CloudItem[]>([]);
    const [factorySamples, setFactorySamples] = useState<CloudItem[]>([]);
    const [userPresets, setUserPresets] = useState<CloudItem[]>([]);
    const [userSamples, setUserSamples] = useState<CloudItem[]>([]);
    
    // Preview State
    const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
    const [previewingId, setPreviewingId] = useState<string | null>(null);
    
    // Deletion State
    const [kitToDelete, setKitToDelete] = useState<DetectedKit | null>(null);
    
    // UI State
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    
    // Derived Open State
    const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
    const handleClose = () => {
        if (onExternalClose) onExternalClose();
        else setInternalIsOpen(false);
        setActiveTab('dashboard'); // Reset tab on close
        setSearchTerm("");
        stopPreview();
    };
    const handleOpen = () => {
        setInternalIsOpen(true);
    };

    const [activeTab, setActiveTab] = useState<TabView>('dashboard');
    const [searchTerm, setSearchTerm] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);
    
    // --- INITIALIZATION ---

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
        if (isOpen) loadLibraryData();
    }, [user, isOpen]);

    // Cleanup audio on unmount
    useEffect(() => {
        return () => stopPreview();
    }, []);

    // --- HELPER: GUESS TYPE ---
    const getSampleTypeInfo = (name: string) => {
        const lower = name.toLowerCase();
        if (lower.includes('loop') || lower.includes('bpm')) return { icon: '🔄', label: 'Loop' }; 
        if (lower.match(/(kick|snare|hat|perc|clap|cymbal|tom|hit|shot|fx|bass|lead|synth|stab)/)) return { icon: '⚡', label: 'One-Shot' }; 
        return { icon: '🎵', label: 'Sample' }; 
    };

    // --- DERIVED KITS ---
    const extractKits = (items: CloudItem[]): DetectedKit[] => {
        const kits: Record<string, DetectedKit> = {};
        items.forEach(item => {
            if (item.type !== 'sample') return;
            // Expect "KitName - Filename" pattern
            const parts = item.label.split(' - ');
            if (parts.length >= 2) {
                const kitName = parts[0];
                if (!kits[kitName]) {
                    kits[kitName] = { 
                        name: kitName, 
                        author: item.author || 'Anon', 
                        items: [] 
                    };
                }
                kits[kitName].items.push(item);
            }
        });
        return Object.values(kits).sort((a,b) => a.name.localeCompare(b.name));
    };

    const factoryKits = useMemo(() => extractKits(factorySamples), [factorySamples]);
    const publicKits = useMemo(() => extractKits(publicSamples), [publicSamples]);

    const stopPreview = () => {
        if (audioPreviewRef.current) {
            audioPreviewRef.current.pause();
            audioPreviewRef.current = null;
        }
        setPreviewingId(null);
    };

    const togglePreview = (item: CloudItem) => {
        if (item.type !== 'sample' || !item.url) return;

        if (previewingId === item.id) {
            stopPreview();
        } else {
            if (audioPreviewRef.current) {
                audioPreviewRef.current.pause();
            }
            const audio = new Audio(item.url);
            audioPreviewRef.current = audio;
            audio.volume = 0.5;
            audio.onended = () => setPreviewingId(null);
            audio.onerror = () => {
                console.error("Preview failed");
                setPreviewingId(null);
            };
            audio.play().catch(e => console.error("Play failed", e));
            setPreviewingId(item.id);
        }
    };

    // Admin Check
    const isAdmin = user && user.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

    // --- ACTION HANDLERS ---
    const handleAudioFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) onFileLoad(files[0]);
        handleClose();
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
        handleClose();
        event.target.value = ""; 
    };

    const handlePresetImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            await onImport(text);
            handleClose();
        } catch (e) {
            console.error(e);
            alert("Failed to load preset");
        } finally {
            if (presetInputRef.current) presetInputRef.current.value = '';
        }
    };

    // Admin Preset Upload Handler
    const handleAdminPresetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;
        
        try {
            const text = await file.text();
            const preset = JSON.parse(text);
            
            // Basic validation
            if (!preset.params || !preset.sequencer) throw new Error("Invalid preset format");

            const success = await saveCloudPreset(
                preset.name || file.name.replace('.json', ''),
                preset.params,
                preset.sequencer,
                preset.slices || [],
                user.id,
                undefined, // sampleId - we don't resolve this for now
                true // isFactory
            );
            
            if (success) {
                alert("Factory Preset Uploaded Successfully");
                await loadLibraryData();
            } else {
                throw new Error("Database save failed");
            }
        } catch (err: any) {
            console.error(err);
            alert(`Error uploading preset: ${err.message}`);
        } finally {
            e.target.value = "";
        }
    };

    const handleBulkUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = Array.from(e.target.files || []);
        e.target.value = "";
        if (files.length === 0 || !user) return;

        let kitName: string | undefined = undefined;
        
        // Use pre-determined type if set via Admin menu
        if (adminUploadType.current === 'kit') {
            kitName = adminKitName.current;
        } else if (adminUploadType.current === 'sample') {
            kitName = undefined;
        } else {
            // Fallback for non-admin usage or if triggered directly
            if (files.length > 1) {
                if (window.confirm(`You selected ${files.length} files. Upload these as a Construction Kit?`)) {
                    const inputName = window.prompt("Enter Kit Name (e.g. '909 Drums'):");
                    if (!inputName) return; 
                    kitName = inputName;
                }
            }
        }

        // Reset Admin Refs
        adminUploadType.current = null;
        adminKitName.current = "";

        let successCount = 0;
        for (let i = 0; i < files.length; i++) {
            const result = await uploadSampleToCloud(files[i], files[i].name, user.id, true, kitName);
            if (result) successCount++;
        }
        
        await loadLibraryData();
        alert(`Upload complete. ${successCount}/${files.length} files uploaded.`);
    };

    const loadCloudItem = (item: CloudItem) => {
        stopPreview();
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
        } else if (item.type === 'sample' && item.url) {
             onDemoLoad(item.url, item.label);
        }
        handleClose();
    };

    const loadCloudKit = (kit: DetectedKit) => {
        if (!kit.items.length) return;
        
        const kitSamples: KitSample[] = kit.items.map((item): KitSample | null => {
            // Ensure URL is present
            if (!item.url) return null;
            
            // Try to infer type from label (e.g. "MyKit - Kick" -> "kick")
            let type: any = undefined;
            const lowerLabel = item.label.toLowerCase();
            if (lowerLabel.includes('kick') || lowerLabel.includes('bd')) type = 'kick';
            else if (lowerLabel.includes('snare') || lowerLabel.includes('sd')) type = 'snare';
            else if (lowerLabel.includes('hat') || lowerLabel.includes('hh')) type = 'hihat';
            else if (lowerLabel.includes('perc')) type = 'perc';

            return {
                name: item.label,
                url: item.url,
                type: type
            };
        }).filter((s): s is KitSample => s !== null);

        onKitLoad(kitSamples, kit.name);
        handleClose();
    };

    const handleDelete = async (item: CloudItem) => {
        if (deletingId) return; 
        setDeletingId(item.id);

        const revertState = { userPresets, publicPresets, factoryPresets, userSamples, publicSamples, factorySamples };

        if (item.type === 'preset') {
            setUserPresets(prev => prev.filter(p => p.id !== item.id));
            setPublicPresets(prev => prev.filter(p => p.id !== item.id));
            setFactoryPresets(prev => prev.filter(p => p.id !== item.id));
        } else {
            setUserSamples(prev => prev.filter(s => s.id !== item.id));
            setPublicSamples(prev => prev.filter(s => s.id !== item.id));
            setFactorySamples(prev => prev.filter(s => s.id !== item.id));
        }

        let result: DeleteResult = { success: false };
        if (item.type === 'preset') result = await deleteCloudPreset(item.id);
        else result = await deleteCloudSample(item.id, item.url);

        if (!result.success) {
            const msg = result.error || "Unknown Error";
            alert(`Delete failed: ${msg}`);
            // Revert on error
            setUserPresets(revertState.userPresets);
            setPublicPresets(revertState.publicPresets);
            // ... (full revert logic)
        }
        setDeletingId(null);
    };

    // --- KIT DELETION LOGIC ---

    const handleDeleteKitFull = async () => {
        if (!kitToDelete) return;
        const kit = kitToDelete;
        setKitToDelete(null);

        // Delete ALL samples
        const results = await Promise.all(kit.items.map(item => deleteCloudSample(item.id, item.url)));
        const failed = results.filter(r => !r.success);
        
        if (failed.length > 0) {
            alert(`Failed to delete ${failed.length} samples.`);
        }
        await loadLibraryData();
    };

    const handleUngroupKit = async () => {
        if (!kitToDelete) return;
        const kit = kitToDelete;
        setKitToDelete(null);

        // Rename samples to remove prefix "KitName - "
        // Replace " - " with " " to break the parser but keep the words
        const results = await Promise.all(kit.items.map(item => {
            const newTitle = item.label.replace(' - ', ' '); 
            return updateSampleTitle(item.id, newTitle);
        }));

        const failed = results.filter(success => !success);
        if (failed.length > 0) {
            alert(`Failed to ungroup ${failed.length} samples.`);
        } else {
            alert(`Kit "${kit.name}" ungrouped! Samples are now loose.`);
        }
        await loadLibraryData();
    };

    const renderKits = (kits: DetectedKit[]) => {
        const filtered = kits.filter(k => k.name.toLowerCase().includes(searchTerm.toLowerCase()));
        if (filtered.length === 0) return null;

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                {filtered.map(kit => (
                    <div key={kit.name} className="flex flex-col bg-white/5 border border-white/5 hover:border-yellow-500/30 rounded-xl overflow-hidden transition-all group">
                        <div className="p-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded bg-yellow-500/20 text-yellow-500 flex items-center justify-center text-xl">
                                    📦
                                </div>
                                <div>
                                    <h4 className="font-bold text-white text-sm group-hover:text-yellow-500 transition-colors">{kit.name}</h4>
                                    <div className="text-[10px] text-star-dust/60">{kit.items.length} samples • by {kit.author}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => loadCloudKit(kit)}
                                    className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-deep-space font-bold text-xs rounded transition-colors shadow-lg shadow-yellow-500/20"
                                >
                                    LOAD KIT
                                </button>
                                {isAdmin && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setKitToDelete(kit); }}
                                        className="p-1.5 text-white/30 hover:text-red-500 hover:bg-white/5 rounded-full transition-colors"
                                        title="Delete / Ungroup Kit"
                                    >
                                        🗑
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderList = (items: CloudItem[]) => {
        const filtered = items.filter(i => i.label.toLowerCase().includes(searchTerm.toLowerCase()));
        if (filtered.length === 0) return <div className="text-white/30 italic text-sm p-4">No items found.</div>;
        return (
            <div className="grid grid-cols-1 gap-2">
                {filtered.map(item => {
                    // Type Info
                    let typeInfo = { icon: '💿', label: 'Sample' };
                    if (item.type === 'preset') typeInfo = { icon: '🎛️', label: 'Patch' };
                    else typeInfo = getSampleTypeInfo(item.label);

                    return (
                        <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg bg-deep-space/40 border border-white/5 hover:bg-white/5 transition-colors group ${deletingId === item.id ? 'opacity-50 pointer-events-none bg-red-900/10' : ''}`}>
                            <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => loadCloudItem(item)}>
                                <div className={`w-8 h-8 rounded flex items-center justify-center text-lg ${item.type === 'preset' ? 'bg-hyper-cyan/10 text-hyper-cyan' : 'bg-plasma-pink/10 text-plasma-pink'}`} title={typeInfo.label}>
                                    {typeInfo.icon}
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-white group-hover:text-hyper-cyan transition-colors">{item.label}</div>
                                    <div className="text-[10px] text-star-dust/60">{typeInfo.label} • by {item.author || 'Anon'}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* PREVIEW BUTTON */}
                                {item.type === 'sample' && item.url && (
                                    <button 
                                        type="button" 
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePreview(item); }} 
                                        className={`w-8 h-8 flex items-center justify-center rounded-full transition-all border border-white/10 ${previewingId === item.id ? 'bg-hyper-cyan text-deep-space animate-pulse' : 'bg-white/5 text-white hover:bg-white/20'}`}
                                        title={previewingId === item.id ? "Stop Preview" : "Preview Audio"}
                                    >
                                        {previewingId === item.id ? '⏹' : '▶'}
                                    </button>
                                )}
                                <button type="button" onClick={() => loadCloudItem(item)} className="px-3 py-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 text-white rounded transition-colors">LOAD</button>
                                {isAdmin && (
                                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(item); }} disabled={deletingId === item.id} className="p-2 text-white/50 hover:text-red-500 hover:bg-white/5 rounded-full transition-colors z-10" title="Delete">
                                        {deletingId === item.id ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderModal = () => (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            {/* --- KIT DELETION MODAL --- */}
            {kitToDelete && (
                <div className="absolute inset-0 z-[210] bg-black/60 flex items-center justify-center p-4">
                    <div className="bg-[#1a1f2b] border border-red-500/30 rounded-xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 animate-in zoom-in-95">
                        <div className="flex items-center gap-3 text-red-400">
                            <span className="text-2xl">⚠️</span>
                            <h3 className="text-lg font-bold">Delete Kit?</h3>
                        </div>
                        <p className="text-sm text-white/80">
                            You are about to delete the kit <strong>{kitToDelete.name}</strong> ({kitToDelete.items.length} samples).
                        </p>
                        <p className="text-xs text-white/50">
                            How do you want to handle the associated audio samples?
                        </p>
                        
                        <div className="flex flex-col gap-3 mt-2">
                            <button 
                                onClick={handleDeleteKitFull}
                                className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded flex items-center justify-center gap-2"
                            >
                                <span>🗑</span> Delete Everything (Kit + Samples)
                            </button>
                            <button 
                                onClick={handleUngroupKit}
                                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded flex items-center justify-center gap-2 border border-white/10"
                            >
                                <span>🔓</span> Ungroup (Keep Samples as Loose)
                            </button>
                            <button 
                                onClick={() => setKitToDelete(null)}
                                className="w-full py-2 text-star-dust hover:text-white text-xs font-bold uppercase tracking-widest mt-2"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="w-full max-w-5xl h-[85vh] bg-[#0f1319] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/5">
                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#151a23]">
                    <div className="flex items-center gap-4">
                        {activeTab !== 'dashboard' && (
                            <button onClick={() => { setActiveTab('dashboard'); setSearchTerm(""); }} className="flex items-center gap-1 text-xs font-bold text-hyper-cyan hover:text-white transition-colors">
                                <span>←</span> BACK
                            </button>
                        )}
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="text-hyper-cyan">📚</span> Library Manager
                            <InfoIcon text="Browse local factory presets or community shared patches." className="ml-1" />
                        </h2>
                    </div>
                    <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">✕</button>
                </div>
                
                <div className="flex-1 bg-[#0a0d14] relative p-4 overflow-y-auto">
                    {activeTab === 'dashboard' && (
                        <div className="text-center p-8">
                            <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-2">Project Dashboard <InfoIcon text="Quick access to file loading" /></h1>
                            <p className="text-star-dust/50 mb-8 text-sm">Manage your current session or load new sounds.</p>
                            
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
                                <button onClick={() => audioInputRef.current?.click()} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-hyper-cyan transition-all flex flex-col items-center gap-3 group h-32 justify-center">
                                    <span className="text-2xl group-hover:scale-110 transition-transform">🎵</span>
                                    <div>
                                        <span className="block text-sm font-bold text-white">Load Loop</span>
                                        <span className="block text-[10px] text-white/50">Single File</span>
                                    </div>
                                </button>
                                <button onClick={() => kitInputRef.current?.click()} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-hyper-cyan transition-all flex flex-col items-center gap-3 group h-32 justify-center">
                                    <span className="text-2xl group-hover:scale-110 transition-transform">🎹</span>
                                    <div>
                                        <span className="block text-sm font-bold text-white">Load Kit</span>
                                        <span className="block text-[10px] text-white/50">Select Files</span>
                                    </div>
                                </button>
                                <button onClick={() => kitFolderInputRef.current?.click()} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-hyper-cyan transition-all flex flex-col items-center gap-3 group h-32 justify-center">
                                    <span className="text-2xl group-hover:scale-110 transition-transform">📂</span>
                                    <div>
                                        <span className="block text-sm font-bold text-white">Load Kit</span>
                                        <span className="block text-[10px] text-white/50">Select Folder</span>
                                    </div>
                                </button>
                                <button onClick={() => { setActiveTab('factory'); setSearchTerm(""); }} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-plasma-pink/10 hover:border-plasma-pink transition-all flex flex-col items-center gap-3 group h-32 justify-center">
                                    <span className="text-2xl group-hover:scale-110 transition-transform">🏭</span>
                                    <div>
                                        <span className="block text-sm font-bold text-white">Factory</span>
                                        <span className="block text-[10px] text-white/50">Built-in Presets</span>
                                    </div>
                                </button>
                                <button onClick={() => { setActiveTab('community'); setSearchTerm(""); }} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-blue-500/10 hover:border-blue-500 transition-all flex flex-col items-center gap-3 group h-32 justify-center">
                                    <span className="text-2xl group-hover:scale-110 transition-transform">🌐</span>
                                    <div>
                                        <span className="block text-sm font-bold text-white">Community</span>
                                        <span className="block text-[10px] text-white/50">Online Library</span>
                                    </div>
                                </button>
                                {isAdmin && (
                                    <button onClick={() => setActiveTab('admin')} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-yellow-500/10 hover:border-yellow-500 transition-all flex flex-col items-center gap-3 group h-32 justify-center">
                                        <span className="text-2xl group-hover:scale-110 transition-transform">⚡</span>
                                        <div>
                                            <span className="block text-sm font-bold text-white">Admin Upload</span>
                                            <span className="block text-[10px] text-white/50">Bulk Import</span>
                                        </div>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    {activeTab === 'admin' && (
                        <div className="max-w-4xl mx-auto space-y-8 p-4">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <span className="text-yellow-500">⚡</span> Admin Upload Tools
                            </h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Option 1: Preset */}
                                <div className="bg-white/5 p-6 rounded-xl border border-white/10 flex flex-col items-center gap-4 text-center">
                                    <div className="w-12 h-12 bg-hyper-cyan/20 text-hyper-cyan rounded-full flex items-center justify-center text-2xl">🎛️</div>
                                    <div>
                                        <h4 className="text-sm font-bold text-white">Factory Preset</h4>
                                        <p className="text-xs text-white/50 mt-1">Upload a .json preset file as a Factory Preset.</p>
                                    </div>
                                    <button 
                                        onClick={() => adminPresetRef.current?.click()}
                                        className="mt-2 w-full py-2 bg-hyper-cyan text-deep-space font-bold text-xs rounded hover:bg-white transition-colors"
                                    >
                                        SELECT JSON
                                    </button>
                                </div>

                                {/* Option 2: Loose Samples */}
                                <div className="bg-white/5 p-6 rounded-xl border border-white/10 flex flex-col items-center gap-4 text-center">
                                    <div className="w-12 h-12 bg-plasma-pink/20 text-plasma-pink rounded-full flex items-center justify-center text-2xl">💿</div>
                                    <div>
                                        <h4 className="text-sm font-bold text-white">Factory Samples</h4>
                                        <p className="text-xs text-white/50 mt-1">Upload loose audio files (loops/one-shots) to the Factory Library.</p>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            adminUploadType.current = 'sample';
                                            bulkUploadRef.current?.click();
                                        }}
                                        className="mt-2 w-full py-2 bg-plasma-pink text-white font-bold text-xs rounded hover:bg-white hover:text-deep-space transition-colors"
                                    >
                                        SELECT FILES
                                    </button>
                                </div>

                                {/* Option 3: Construction Kit */}
                                <div className="bg-white/5 p-6 rounded-xl border border-white/10 flex flex-col items-center gap-4 text-center">
                                    <div className="w-12 h-12 bg-yellow-500/20 text-yellow-500 rounded-full flex items-center justify-center text-2xl">📦</div>
                                    <div>
                                        <h4 className="text-sm font-bold text-white">Construction Kit</h4>
                                        <p className="text-xs text-white/50 mt-1">Upload multiple files into a named Kit folder.</p>
                                    </div>
                                    <input 
                                        type="text" 
                                        placeholder="Enter Kit Name..." 
                                        value={adminKitNameInput}
                                        onChange={(e) => setAdminKitNameInput(e.target.value)}
                                        className="w-full bg-black/40 border border-white/20 rounded px-2 py-1.5 text-xs text-white focus:border-yellow-500 outline-none"
                                    />
                                    <button 
                                        onClick={() => {
                                            if (!adminKitNameInput.trim()) return alert("Please enter a kit name.");
                                            adminUploadType.current = 'kit';
                                            adminKitName.current = adminKitNameInput;
                                            bulkUploadRef.current?.click();
                                        }}
                                        disabled={!adminKitNameInput.trim()}
                                        className="mt-2 w-full py-2 bg-yellow-500 text-deep-space font-bold text-xs rounded hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        SELECT FILES
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'factory' && (
                        <div className="space-y-8 max-w-4xl mx-auto">
                            {/* Built-in Presets */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        Factory Presets
                                        <span className="text-xs font-normal text-white/30 bg-white/10 px-2 py-0.5 rounded-full">{FACTORY_PRESETS.length}</span>
                                    </h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {FACTORY_PRESETS.map(p => (
                                        <button key={p.id} onClick={() => { onLoadPreset(p); handleClose(); }} className="w-full text-left p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 text-white flex justify-between items-center group transition-all hover:border-plasma-pink/30">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl bg-plasma-pink/20 w-10 h-10 flex items-center justify-center rounded-full text-plasma-pink">🎛️</span>
                                                <div>
                                                    <span className="font-bold block group-hover:text-plasma-pink transition-colors">{p.name}</span>
                                                    <span className="text-xs text-white/50">Factory Preset</span>
                                                </div>
                                            </div>
                                            <span className="text-xs font-bold bg-white/10 px-2 py-1 rounded text-white/70">LOAD</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Cloud Factory Content */}
                            {(factorySamples.length > 0) && (
                                <div className="border-t border-white/10 pt-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                            Factory Library
                                            <span className="text-xs font-normal text-white/30 bg-white/10 px-2 py-0.5 rounded-full">{factorySamples.length}</span>
                                        </h3>
                                        <input 
                                            type="text" 
                                            placeholder="Search Library..." 
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:border-hyper-cyan outline-none w-48"
                                        />
                                    </div>
                                    
                                    <div className="max-h-[500px] overflow-y-auto pr-1 custom-scrollbar space-y-6">
                                        {/* Kits Section */}
                                        {factoryKits.length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-bold text-star-dust uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Kits</h4>
                                                {renderKits(factoryKits)}
                                            </div>
                                        )}

                                        {/* Samples Section */}
                                        <div>
                                            <h4 className="text-xs font-bold text-star-dust uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Samples</h4>
                                            {renderList(factorySamples)}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {activeTab === 'community' && (
                        <div className="max-w-4xl mx-auto space-y-8">
                             <div>
                                <div className="flex items-center justify-between mb-4 gap-4">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        Community Library
                                        <InfoIcon text="Presets and Samples shared by users." className="ml-1" />
                                    </h3>
                                    <input 
                                        type="text" 
                                        placeholder="Search..." 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-hyper-cyan outline-none w-64"
                                    />
                                </div>
                                
                                {publicKits.length > 0 && (
                                    <div className="mb-6">
                                        <h4 className="text-xs font-bold text-star-dust uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Kits</h4>
                                        {renderKits(publicKits)}
                                    </div>
                                )}

                                <h4 className="text-xs font-bold text-star-dust uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Presets</h4>
                                {renderList(publicPresets)}
                             </div>
                             
                             {publicSamples.length > 0 && (
                                 <div>
                                    <h4 className="text-xs font-bold text-star-dust uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Samples</h4>
                                    {renderList(publicSamples)}
                                 </div>
                             )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    // Render hidden inputs always
    const inputs = (
        <>
            <input type="file" accept="audio/*" ref={audioInputRef} onChange={handleAudioFileChange} className="hidden" />
            <input type="file" accept="audio/*" multiple ref={kitInputRef} onChange={handleKitFileChange} className="hidden" />
            <input type="file" accept="audio/*" {...({ webkitdirectory: "", directory: "" } as any)} ref={kitFolderInputRef} onChange={handleKitFileChange} className="hidden" />
            <input type="file" accept=".json" ref={presetInputRef} onChange={handlePresetImport} className="hidden" />
            <input type="file" accept="audio/*" multiple ref={bulkUploadRef} onChange={handleBulkUploadChange} className="hidden" />
            <input type="file" accept=".json" ref={adminPresetRef} onChange={handleAdminPresetUpload} className="hidden" />
        </>
    );

    // Controlled / Hidden variant
    if (variant === 'hidden') {
        return (
            <>
                {inputs}
                {isOpen && renderModal()}
            </>
        );
    }

    // Default Visual Browser (Simple Mode)
    if (variant === 'visual-browser' || variant === 'default' || variant === 'centered') {
         const isCentered = variant === 'centered';
         return (
            <>
                {inputs}
                <div className={`w-full bg-deep-space/80 backdrop-blur-md border-b border-white/10 p-2 sm:px-4 flex items-center sticky top-0 z-40 rounded-xl mb-4 shadow-lg ${isCentered ? 'justify-center relative' : 'justify-between'} ${className || ''}`}>
                    <div className={`flex items-center gap-3 flex-1 overflow-hidden ${isCentered ? 'absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 max-w-[140px] md:max-w-[240px] hidden md:flex' : ''}`}>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-hyper-cyan to-blue-600 flex items-center justify-center text-deep-space font-bold shadow-[0_0_10px_rgba(0,246,255,0.3)] shrink-0">FX</div>
                        <div className="flex flex-col min-w-0">
                            <div className="text-white font-bold text-sm sm:text-base truncate">My Groove</div>
                            <div className="text-[10px] text-star-dust truncate">Active Sample: <span className="text-hyper-cyan">{sampleName}</span></div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4 z-10">
                        <button type="button" onClick={handleOpen} className="bg-white/10 hover:bg-white/20 text-white border border-white/10 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold tracking-wide transition-all shadow-lg hover:shadow-hyper-cyan/20 hover:border-hyper-cyan/30 flex items-center gap-2">
                            <span className="text-lg">📚</span><span className="hidden sm:inline">LIBRARY</span>
                        </button>
                    </div>
                </div>
                {isOpen && renderModal()}
            </>
        )
    }

    // Transport Variant
    if (variant === 'transport') {
        return (
            <>
                {inputs}
                <div className={`flex items-center gap-3 h-full ${className}`}>
                     <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-hyper-cyan to-blue-600 flex items-center justify-center text-deep-space font-bold shadow-[0_0_10px_rgba(0,246,255,0.3)] shrink-0">FX</div>
                        <div className="flex flex-col min-w-0 justify-center">
                            <div className="text-white font-bold text-lg outline-none placeholder-white/20 w-32 md:w-48 truncate">My Groove</div>
                            <div className="text-[10px] text-star-dust truncate flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span><span className="opacity-70">Active:</span><span className="text-hyper-cyan truncate max-w-[100px]">{sampleName}</span></div>
                        </div>
                     </div>
                     <div className="h-8 w-px bg-white/10 mx-1 hidden sm:block"></div>
                     <Tooltip text="Open Library">
                         <button onClick={handleOpen} className="flex items-center gap-2 px-3 h-10 bg-white/5 hover:bg-white/10 rounded-lg text-white border border-white/5 transition-colors group shrink-0">
                            <span className="group-hover:scale-110 block transition-transform text-lg">📚</span>
                            <span className="text-xs font-bold tracking-wide text-star-dust group-hover:text-white hidden lg:inline">LIBRARY</span>
                         </button>
                     </Tooltip>
                </div>
                {isOpen && renderModal()}
            </>
        )
    }

    return null; 
});

export default LibraryManager;
