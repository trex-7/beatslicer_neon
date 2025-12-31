
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
    renameCloudItem,
    type CloudItem,
    type DeleteResult
} from '../utils/db';
import type { KitSample, Preset } from '../types';

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
    externalIsOpen?: boolean;
    onExternalClose?: () => void;
}

const ADMIN_EMAILS = ['sandromancino.sm@gmail.com'];

type TabView = 'dashboard' | 'presets' | 'samples' | 'admin';

const LibraryManager: React.FC<LibraryManagerProps> = memo(({ 
    onFileLoad, onKitLoad, onDemoLoad, onExport, onImport, onLoadPreset, getAudioWav, isLoading, sampleName, className, variant = 'default', user, externalIsOpen, onExternalClose
}) => {
    const audioInputRef = useRef<HTMLInputElement>(null);
    const kitInputRef = useRef<HTMLInputElement>(null);
    const presetInputRef = useRef<HTMLInputElement>(null);
    const bulkUploadRef = useRef<HTMLInputElement>(null);
    const adminPresetRef = useRef<HTMLInputElement>(null);

    const [publicPresets, setPublicPresets] = useState<CloudItem[]>([]);
    const [publicSamples, setPublicSamples] = useState<CloudItem[]>([]);
    const [factoryPresets, setFactoryPresets] = useState<CloudItem[]>([]);
    const [factorySamples, setFactorySamples] = useState<CloudItem[]>([]);
    const [userPresets, setUserPresets] = useState<CloudItem[]>([]);
    const [userSamples, setUserSamples] = useState<CloudItem[]>([]);
    
    const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
    const [previewingId, setPreviewingId] = useState<string | null>(null);
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    
    const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
    
    const handleClose = () => {
        if (onExternalClose) onExternalClose();
        else setInternalIsOpen(false);
        setActiveTab('dashboard'); 
        setSearchTerm("");
        stopPreview();
    };
    const handleOpen = () => {
        setInternalIsOpen(true);
    };

    const [activeTab, setActiveTab] = useState<TabView>('dashboard');
    const [searchTerm, setSearchTerm] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);
    
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

    useEffect(() => {
        return () => stopPreview();
    }, []);

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

    const isAdmin = user && user.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

    const handleAudioFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            if (files.length > 1) {
                // Treated as a Kit if multiple files selected via "Local File"
                onKitLoad(Array.from(files), "Local Selection");
            } else {
                // Treated as a single Loop
                onFileLoad(files[0]);
            }
        }
        handleClose();
        event.target.value = ""; 
    };

    const handleKitFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = Array.from(event.target.files || []);
        if (files.length > 0) {
            onKitLoad(files, "Imported Kit");
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

    const handleAdminPresetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;
        
        try {
            const text = await file.text();
            const preset = JSON.parse(text);
            
            if (!preset.params || !preset.sequencer) throw new Error("Invalid format");

            const success = await saveCloudPreset(
                preset.name || file.name.replace('.json', ''),
                preset.params,
                preset.sequencer,
                preset.slices || [],
                user.id,
                undefined,
                true // Is Factory
            );
            
            if (success) {
                alert("Factory Preset Uploaded");
                await loadLibraryData();
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            e.target.value = "";
        }
    };

    const handleBulkUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = Array.from(e.target.files || []);
        e.target.value = "";
        if (files.length === 0 || !user) return;

        let successCount = 0;
        for (let i = 0; i < files.length; i++) {
            const result = await uploadSampleToCloud(files[i], files[i].name, user.id, true);
            if (result) successCount++;
        }
        
        await loadLibraryData();
        alert(`Uploaded ${successCount}/${files.length} samples to Factory.`);
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

    const handleDelete = async (item: CloudItem) => {
        if (deletingId) return; 

        // KIT WARNING: If the URL suggests it's part of a kit (contains /kits/), warn the user.
        if (item.type === 'sample' && item.url && item.url.includes('/kits/')) {
            const confirmed = window.confirm(`⚠️ Warning: "${item.label}" appears to be part of a Kit. Deleting it might break the kit's integrity. Are you sure you want to delete it?`);
            if (!confirmed) return;
        }

        setDeletingId(item.id);

        let result: DeleteResult = { success: false };
        if (item.type === 'preset') result = await deleteCloudPreset(item.id);
        else result = await deleteCloudSample(item.id, item.url);

        if (!result.success) {
            alert(`Delete failed: ${result.error}`);
        } else {
            // Optimistic update logic omitted for brevity, reloading instead
            await loadLibraryData();
        }
        setDeletingId(null);
    };

    const handleRename = async (item: CloudItem) => {
        const newName = window.prompt("Enter new name:", item.label);
        if (!newName || newName.trim() === item.label) return;
        
        const success = await renameCloudItem(item.type, item.id, newName.trim());
        if (success) {
            await loadLibraryData();
        } else {
            alert("Failed to rename item.");
        }
    };

    const renderList = (items: CloudItem[]) => {
        const filtered = items.filter(i => i.label.toLowerCase().includes(searchTerm.toLowerCase()));
        if (filtered.length === 0) return <div className="text-white/30 italic text-sm p-4">No items found.</div>;
        return (
            <div className="grid grid-cols-1 gap-2">
                {filtered.map(item => {
                    let typeIcon = item.type === 'preset' ? '🎛️' : '💿';
                    let typeLabel = item.type === 'preset' ? 'Preset' : 'Sample';
                    
                    const isMine = user && item._userId === user.id;
                    const isPublic = item.isPublic;

                    return (
                        <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg bg-deep-space/40 border border-white/5 hover:bg-white/5 transition-colors group ${deletingId === item.id ? 'opacity-50 pointer-events-none bg-red-900/10' : ''}`}>
                            <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => loadCloudItem(item)}>
                                <div className={`w-8 h-8 rounded flex items-center justify-center text-lg ${item.type === 'preset' ? 'bg-hyper-cyan/10 text-hyper-cyan' : 'bg-plasma-pink/10 text-plasma-pink'}`}>
                                    {typeIcon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <div className="text-sm font-bold text-white group-hover:text-hyper-cyan transition-colors truncate">{item.label}</div>
                                        {isMine && !item.isFactory && (
                                            <span className={`text-[9px] px-1.5 rounded font-bold uppercase ${isPublic ? 'bg-blue-500/20 text-blue-300' : 'bg-white/10 text-star-dust'}`}>
                                                {isPublic ? 'Public' : 'Private'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[10px] text-star-dust/60 truncate flex items-center gap-1">
                                        <span>{typeLabel}</span>
                                        <span className="opacity-50">•</span>
                                        <span className={isMine ? 'text-hyper-cyan font-bold' : ''}>by {item.author || 'Anon'}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {item.type === 'sample' && item.url && (
                                    <button 
                                        type="button" 
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePreview(item); }} 
                                        className={`w-8 h-8 flex items-center justify-center rounded-full transition-all border border-white/10 ${previewingId === item.id ? 'bg-hyper-cyan text-deep-space animate-pulse' : 'bg-white/5 text-white hover:bg-white/20'}`}
                                    >
                                        {previewingId === item.id ? '⏹' : '▶'}
                                    </button>
                                )}
                                <button type="button" onClick={() => loadCloudItem(item)} className="px-3 py-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 text-white rounded transition-colors">LOAD</button>
                                {(isAdmin || isMine) && (
                                    <>
                                        <Tooltip text="Rename">
                                            <button 
                                                type="button" 
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRename(item); }} 
                                                className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-full transition-colors z-10"
                                            >
                                                ✏️
                                            </button>
                                        </Tooltip>
                                        <Tooltip text="Delete">
                                            <button 
                                                type="button" 
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(item); }} 
                                                disabled={deletingId === item.id} 
                                                className="p-2 text-white/50 hover:text-red-500 hover:bg-white/5 rounded-full transition-colors z-10"
                                            >
                                                {deletingId === item.id ? '...' : '🗑'}
                                            </button>
                                        </Tooltip>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const inputs = (
        <>
            {/* Added 'multiple' to support kit loading from a single selection dialog */}
            <input type="file" accept="audio/*" multiple ref={audioInputRef} onChange={handleAudioFileChange} className="hidden" />
            <input type="file" accept="audio/*" multiple ref={kitInputRef} onChange={handleKitFileChange} className="hidden" />
            <input type="file" accept=".json" ref={presetInputRef} onChange={handlePresetImport} className="hidden" />
            <input type="file" accept="audio/*" multiple ref={bulkUploadRef} onChange={handleBulkUploadChange} className="hidden" />
            <input type="file" accept=".json" ref={adminPresetRef} onChange={handleAdminPresetUpload} className="hidden" />
        </>
    );

    const renderContent = () => (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-5xl h-[85vh] bg-[#0f1319] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/5">
                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#151a23]">
                    <div className="flex items-center gap-4">
                        {activeTab !== 'dashboard' && (
                            <button onClick={() => { setActiveTab('dashboard'); setSearchTerm(""); }} className="flex items-center gap-1 text-xs font-bold text-hyper-cyan hover:text-white transition-colors"><span>←</span> BACK</button>
                        )}
                        <h2 className="text-lg font-bold text-white flex items-center gap-2"><span className="text-hyper-cyan">📚</span> Database Manager</h2>
                    </div>
                    <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">✕</button>
                </div>
                
                <div className="flex-1 bg-[#0a0d14] relative p-4 overflow-y-auto">
                    {activeTab === 'dashboard' && (
                        <div className="text-center p-8">
                            <h1 className="text-2xl font-bold text-white mb-2">Load From...</h1>
                            <p className="text-star-dust/50 mb-8 text-sm">Select a category or upload locally.</p>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
                                <button onClick={() => audioInputRef.current?.click()} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-hyper-cyan transition-all flex flex-col items-center gap-3 group h-32 justify-center">
                                    <span className="text-2xl group-hover:scale-110 transition-transform">📂</span>
                                    <div><span className="block text-sm font-bold text-white">Local File</span><span className="block text-[10px] text-white/50">Upload Audio / Kit</span></div>
                                </button>
                                <button onClick={() => { setActiveTab('presets'); setSearchTerm(""); }} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-hyper-cyan/10 hover:border-hyper-cyan transition-all flex flex-col items-center gap-3 group h-32 justify-center">
                                    <span className="text-2xl group-hover:scale-110 transition-transform">🎛️</span>
                                    <div><span className="block text-sm font-bold text-white">Presets</span><span className="block text-[10px] text-white/50">Database Table</span></div>
                                </button>
                                <button onClick={() => { setActiveTab('samples'); setSearchTerm(""); }} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-plasma-pink/10 hover:border-plasma-pink transition-all flex flex-col items-center gap-3 group h-32 justify-center">
                                    <span className="text-2xl group-hover:scale-110 transition-transform">💿</span>
                                    <div><span className="block text-sm font-bold text-white">Samples</span><span className="block text-[10px] text-white/50">Database Table</span></div>
                                </button>
                                {isAdmin && (
                                    <button onClick={() => setActiveTab('admin')} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-yellow-500/10 hover:border-yellow-500 transition-all flex flex-col items-center gap-3 group h-32 justify-center">
                                        <span className="text-2xl group-hover:scale-110 transition-transform">⚡</span>
                                        <div><span className="block text-sm font-bold text-white">Admin</span><span className="block text-[10px] text-white/50">Factory Upload</span></div>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'presets' && (
                        <div className="max-w-4xl mx-auto space-y-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-bold text-white">Presets Table</h3>
                                <input type="text" placeholder="Search Presets..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:border-hyper-cyan outline-none w-48" />
                            </div>
                            
                            {user && (
                                <div>
                                    <h4 className="text-xs font-bold text-hyper-cyan uppercase tracking-widest mb-2 border-b border-white/5 pb-1">My Presets</h4>
                                    {renderList(userPresets)}
                                </div>
                            )}

                            <div className={user ? "mt-6" : ""}>
                                <h4 className="text-xs font-bold text-star-dust uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Community Library</h4>
                                {renderList(publicPresets)}
                            </div>

                            <div className="mt-6">
                                <h4 className="text-xs font-bold text-yellow-500/70 uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Factory</h4>
                                {renderList(factoryPresets)}
                            </div>
                        </div>
                    )}

                    {activeTab === 'samples' && (
                        <div className="max-w-4xl mx-auto space-y-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-bold text-white">Samples Table</h3>
                                <input type="text" placeholder="Search Samples..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:border-hyper-cyan outline-none w-48" />
                            </div>

                            {user && (
                                <div>
                                    <h4 className="text-xs font-bold text-hyper-cyan uppercase tracking-widest mb-2 border-b border-white/5 pb-1">My Samples</h4>
                                    {renderList(userSamples)}
                                </div>
                            )}

                            <div className={user ? "mt-6" : ""}>
                                <h4 className="text-xs font-bold text-star-dust uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Community Library</h4>
                                {renderList(publicSamples)}
                            </div>

                            <div className="mt-6">
                                <h4 className="text-xs font-bold text-yellow-500/70 uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Factory</h4>
                                {renderList(factorySamples)}
                            </div>
                        </div>
                    )}

                    {activeTab === 'admin' && (
                        <div className="max-w-4xl mx-auto space-y-8 p-4">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2"><span className="text-yellow-500">⚡</span> Admin Tools</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white/5 p-6 rounded-xl border border-white/10 flex flex-col items-center gap-4 text-center">
                                    <div className="w-12 h-12 bg-hyper-cyan/20 text-hyper-cyan rounded-full flex items-center justify-center text-2xl">🎛️</div>
                                    <div><h4 className="text-sm font-bold text-white">Upload Factory Preset</h4><p className="text-xs text-white/50 mt-1">Select JSON file</p></div>
                                    <button onClick={() => adminPresetRef.current?.click()} className="mt-2 w-full py-2 bg-hyper-cyan text-deep-space font-bold text-xs rounded hover:bg-white transition-colors">SELECT JSON</button>
                                </div>
                                <div className="bg-white/5 p-6 rounded-xl border border-white/10 flex flex-col items-center gap-4 text-center">
                                    <div className="w-12 h-12 bg-plasma-pink/20 text-plasma-pink rounded-full flex items-center justify-center text-2xl">💿</div>
                                    <div><h4 className="text-sm font-bold text-white">Upload Factory Samples</h4><p className="text-xs text-white/50 mt-1">Select Audio files</p></div>
                                    <button onClick={() => bulkUploadRef.current?.click()} className="mt-2 w-full py-2 bg-plasma-pink text-white font-bold text-xs rounded hover:bg-white hover:text-deep-space transition-colors">SELECT FILES</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    if (variant === 'hidden') return <>{inputs}{isOpen && renderContent()}</>;

    // Simplified Transport Button
    if (variant === 'transport') {
        return (
            <>
                {inputs}
                <div className={`flex items-center gap-3 h-full ${className}`}>
                     <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-hyper-cyan to-blue-600 flex items-center justify-center text-deep-space font-bold shadow-[0_0_10px_rgba(0,246,255,0.3)] shrink-0">DB</div>
                        <div className="flex flex-col min-w-0 justify-center">
                            <div className="text-white font-bold text-lg outline-none placeholder-white/20 w-32 md:w-48 truncate">My Groove</div>
                            <div className="text-[10px] text-star-dust truncate flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span><span className="opacity-70">Active Sample:</span><span className="text-hyper-cyan truncate max-w-[100px]">{sampleName}</span></div>
                        </div>
                     </div>
                     <div className="h-8 w-px bg-white/10 mx-1 hidden sm:block"></div>
                     <Tooltip text="Open Database Manager">
                         <button onClick={handleOpen} className="flex items-center gap-2 px-3 h-10 bg-white/5 hover:bg-white/10 rounded-lg text-white border border-white/5 transition-colors group shrink-0">
                            <span className="group-hover:scale-110 block transition-transform text-lg">📚</span>
                            <span className="text-xs font-bold tracking-wide text-star-dust group-hover:text-white hidden lg:inline">BROWSE DB</span>
                         </button>
                     </Tooltip>
                </div>
                {isOpen && renderContent()}
            </>
        )
    }

    return null; 
});

export default LibraryManager;
