
import React, { useRef, useEffect, useState, memo } from 'react';
import Tooltip from './Tooltip';
import { 
    fetchLibrary, 
    saveCloudPreset, 
    uploadSampleToCloud, 
    deleteCloudPreset, 
    deleteCloudSample, 
    deleteCloudKit,
    listStorageObjects,
    deleteStorageObject,
    renameCloudItem,
    fetchAllFeedback,
    createKit,
    linkSamplesToKit,
    type CloudItem,
    type DeleteResult,
    type FeedbackItem,
    type StorageObjectItem,
} from '../utils/db';
import type { KitSample, Preset } from '../types';
import { stitchAudioFiles, validateFile, MAX_KIT_FILES, MAX_KIT_TOTAL_MB } from '../utils/audioHelpers';

interface LibraryManagerProps {
    isOpen: boolean;
    onClose: () => void;
    onFileLoad: (file: File) => void;
    onKitLoad: (files: File[] | KitSample[], name: string) => void;
    onDemoLoad: (url: string, name: string) => void;
    onExport: (name: string) => Promise<string>;
    onImport: (json: string) => Promise<void>;
    onLoadPreset: (preset: Preset) => void;
    getAudioWav: () => Promise<Blob | null>;
    isLoading: boolean;
    sampleName: string;
    user: any;
}

const ADMIN_EMAILS = [
    'sandromancino.sm@gmail.com',
    'sandromancino.SM@gmail.com',
];

type TabView = 'dashboard' | 'presets' | 'samples' | 'kits' | 'admin';

const LibraryManager: React.FC<LibraryManagerProps> = memo(({ 
    isOpen, onClose, onFileLoad, onKitLoad, onDemoLoad, onImport, onLoadPreset, user
}) => {
    const audioInputRef = useRef<HTMLInputElement>(null);
    const kitInputRef = useRef<HTMLInputElement>(null);
    const presetInputRef = useRef<HTMLInputElement>(null);
    const adminPresetRef = useRef<HTMLInputElement>(null);
    const userUploadRef = useRef<HTMLInputElement>(null); 
    
    // Split Admin Upload Refs
    const adminSampleUploadRef = useRef<HTMLInputElement>(null);
    const adminKitUploadRef = useRef<HTMLInputElement>(null);

    const [publicPresets, setPublicPresets] = useState<CloudItem[]>([]);
    const [publicSamples, setPublicSamples] = useState<CloudItem[]>([]);
    const [factoryPresets, setFactoryPresets] = useState<CloudItem[]>([]);
    const [factorySamples, setFactorySamples] = useState<CloudItem[]>([]);
    const [userPresets, setUserPresets] = useState<CloudItem[]>([]);
    const [userSamples, setUserSamples] = useState<CloudItem[]>([]);
    const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
    
    // UI State for Folders
    const [expandedKits, setExpandedKits] = useState<Set<string>>(new Set());
    const [adminKitName, setAdminKitName] = useState(""); // State for Admin Kit Name

    const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
    const audioUrlRef = useRef<string | null>(null);
    const [previewingId, setPreviewingId] = useState<string | null>(null);
    const [errorId, setErrorId] = useState<string | null>(null);
    
    // Upload State
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState("");

    // Storage Admin & Purge State
    const [storageObjects, setStorageObjects] = useState<StorageObjectItem[]>([]);
    const [isLoadingStorage, setIsLoadingStorage] = useState(false);
    const [storageSearch, setStorageSearch] = useState("");
    const [storageStatus, setStorageStatus] = useState<any>(null);
    const [manualDeleteTarget, setManualDeleteTarget] = useState("");
    const [isDeletingStorage, setIsDeletingStorage] = useState(false);
    const [storageActionMsg, setStorageActionMsg] = useState<{ text: string; success: boolean } | null>(null);

    // Supabase to Neon Migration State
    const [supabaseUrlInput, setSupabaseUrlInput] = useState("");
    const [supabaseKeyInput, setSupabaseKeyInput] = useState("");
    const [supabaseBucketInput, setSupabaseBucketInput] = useState("samples");
    const [isMigrating, setIsMigrating] = useState(false);
    const [migrationResult, setMigrationResult] = useState<any>(null);

    const [activeTab, setActiveTab] = useState<TabView>('dashboard');
    const [searchTerm, setSearchTerm] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);
    
    const isAdmin = Boolean(
        user &&
        user.email &&
        ADMIN_EMAILS.some((a) => a.toLowerCase().trim() === String(user.email).toLowerCase().trim())
    );

    const loadStorageInfo = async () => {
        setIsLoadingStorage(true);
        try {
            const statusRes = await fetch('/api/storage/status');
            const statusData = await statusRes.json();
            setStorageStatus(statusData);

            const objectsRes = await listStorageObjects();
            if (objectsRes.success) {
                setStorageObjects(objectsRes.objects);
            }
        } catch (e) {
            console.error('Error loading storage info:', e);
        } finally {
            setIsLoadingStorage(false);
        }
    };

    const handleDeleteStorageObject = async (keyOrUrl: string) => {
        if (!window.confirm(`⚠️ Permanently delete "${keyOrUrl}" from S3 Object Storage?`)) {
            return;
        }
        setIsDeletingStorage(true);
        setStorageActionMsg(null);
        try {
            const res = await deleteStorageObject(keyOrUrl);
            if (res.success) {
                setStorageActionMsg({ text: `Successfully deleted: ${keyOrUrl}`, success: true });
                await loadStorageInfo();
                await loadLibraryData();
            } else {
                setStorageActionMsg({ text: `Failed to delete: ${res.error || 'Unknown error'}`, success: false });
            }
        } catch (err: any) {
            setStorageActionMsg({ text: `Error: ${err.message || 'Delete failed'}`, success: false });
        } finally {
            setIsDeletingStorage(false);
        }
    };

    const loadLibraryData = async () => {
        const data = await fetchLibrary(user?.id);
        setPublicPresets(data.publicPresets);
        setPublicSamples(data.publicSamples);
        setFactoryPresets(data.factoryPresets);
        setFactorySamples(data.factorySamples);
        setUserPresets(data.userPresets);
        setUserSamples(data.userSamples);
    };

    const loadFeedback = async () => {
        if (isAdmin) {
            const data = await fetchAllFeedback();
            setFeedbackItems(data);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadLibraryData();
            setActiveTab('dashboard');
            setSearchTerm("");
        } else {
            stopPreview();
        }
    }, [user, isOpen]);

    useEffect(() => {
        if (isOpen && activeTab === 'admin' && isAdmin) {
            loadFeedback();
            loadStorageInfo();
        }
    }, [isOpen, activeTab, isAdmin]);

    useEffect(() => {
        return () => stopPreview();
    }, []);

    const stopPreview = () => {
        if (audioPreviewRef.current) {
            audioPreviewRef.current.pause();
            audioPreviewRef.current = null;
        }
        if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
            audioUrlRef.current = null;
        }
        setPreviewingId(null);
    };

    const togglePreview = async (item: CloudItem) => {
        if (item.type !== 'sample' || !item.url) return;

        if (previewingId === item.id) {
            stopPreview();
        } else {
            stopPreview(); 
            if (errorId === item.id) setErrorId(null);
            setPreviewingId(item.id); 

            try {
                const response = await fetch(item.url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const blob = await response.blob();
                const wavBlob = new Blob([blob], { type: 'audio/wav' });
                const blobUrl = URL.createObjectURL(wavBlob);
                audioUrlRef.current = blobUrl;

                const audio = new Audio(blobUrl);
                audioPreviewRef.current = audio;
                audio.volume = 0.5;
                audio.onended = () => {
                    setPreviewingId(null);
                };
                audio.onerror = (e) => {
                    console.error("Preview failed for", item.url, e);
                    setPreviewingId(null);
                    setErrorId(item.id);
                };
                
                await audio.play();
            } catch (e) {
                console.error("Preview playback failed:", e);
                setPreviewingId(null);
                setErrorId(item.id);
            }
        }
    };

    const toggleKitExpansion = (kitName: string) => {
        setExpandedKits(prev => {
            const next = new Set(prev);
            if (next.has(kitName)) next.delete(kitName);
            else next.add(kitName);
            return next;
        });
    };

    const handleAudioFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            if (files.length > 1) {
                onKitLoad(Array.from(files), "Local Selection");
            } else {
                onFileLoad(files[0]);
            }
        }
        onClose();
        event.target.value = ""; 
    };

    const handleKitFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = Array.from(event.target.files || []);
        if (files.length > 0) {
            onKitLoad(files, "Imported Kit");
        }
        onClose();
        event.target.value = ""; 
    };

    const handleUserUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = Array.from(e.target.files || []);
        e.target.value = "";
        
        if (files.length === 0 || !user) return;

        for (const file of files) {
            const err = validateFile(file);
            if (err) {
                alert(err);
                return;
            }
        }

        if (files.length > MAX_KIT_FILES) {
            alert(`Too many files. Max kit size is ${MAX_KIT_FILES} samples.`);
            return;
        }

        const totalSize = files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024);
        if (totalSize > MAX_KIT_TOTAL_MB) {
            alert(`Total upload size exceeds ${MAX_KIT_TOTAL_MB}MB.`);
            return;
        }

        setIsUploading(true);
        setUploadStatus("Starting upload...");

        try {
            if (files.length > 1) {
                if (window.confirm(`You selected ${files.length} files. Do you want to group them as a Kit?\n\n(This creates a Playable Preset automatically)`)) {
                    const kitName = window.prompt("Enter a Name for this Kit:", "My New Kit");
                    if (!kitName) {
                        setIsUploading(false);
                        return;
                    }
                    
                    const kitDesc = window.prompt("Enter a short description (optional):", "");

                    setUploadStatus("Creating Kit Database Entry...");
                    const kitId = await createKit(user.id, kitName, false, false, kitDesc || "");
                    if (!kitId) throw new Error("Failed to create kit.");

                    setUploadStatus("Processing audio & stitching...");
                    const sampleIds: string[] = [];
                    
                    for (let i = 0; i < files.length; i++) {
                        setUploadStatus(`Uploading file ${i+1}/${files.length}...`);
                        const upload = await uploadSampleToCloud(files[i], files[i].name, user.id, false, kitName, false, true);
                        if (upload) sampleIds.push(upload.id);
                    }

                    setUploadStatus("Linking samples...");
                    await linkSamplesToKit(kitId, sampleIds);

                    setUploadStatus("Stitching Kit Master...");
                    const { blob: masterBlob, slices } = await stitchAudioFiles(files);
                    
                    setUploadStatus("Uploading Kit Master...");
                    const masterUpload = await uploadSampleToCloud(masterBlob, `${kitName} (Master).wav`, user.id, false, kitName, false, true);

                    if (masterUpload) {
                        setUploadStatus("Saving Preset...");
                        
                        const params = {
                            grainSize: 0.09, overlap: 0.03, detune: 0, playbackRate: 1, bpm: 120,
                            attack: 0.001, release: 0.01, sustain: 0.5,
                            reverb: { isActive: false, decay: 1.5, wet: 0, isSynced: false, syncValue: '2n', lowCut: 20, highCut: 20000 },
                            delay: { isActive: false, delayTime: 0.375, feedback: 0.2, wet: 0, isSynced: true, syncValue: '8n', lowCut: 20, highCut: 20000 },
                            filter: { isActive: false, frequency: 20000, q: 1, type: 'lowpass', envDepth: 0, lfoDepth: 0, lfoRate: 1, isSynced: true, syncValue: '4n' },
                            distortion: { isActive: false, amount: 1.0, wet: 0.04 },
                            compressor: { isActive: true, threshold: -24, ratio: 4, attack: 0.01, release: 0.1 },
                            bitCrusher: { isActive: false, bits: 8, wet: 0 },
                            glitch: { chaos: 0, allowReverse: false, allowOctaveJump: true, allowRatchet: true, pitchShift: true, allowFormant: true },
                            order: ['compressor', 'distortion', 'bitCrusher', 'filter', 'delay', 'reverb']
                        };

                        const sequencer = {
                            steps: Array(32).fill(0).map((_, i) => ({ active: i%2===0, sliceIndex: i % slices.length, ratchet: 1 })),
                            stepCount: 32, mode: 'forward', currentStep: -1, isPlaying: false, isLooping: true, editMode: 'trigger', playbackBehavior: 'reset'
                        };

                        await saveCloudPreset(kitName, params as any, sequencer, slices, user.id, masterUpload.id, false, false);
                    }
                    alert("Kit Uploaded Successfully!");
                } else {
                    for (let i = 0; i < files.length; i++) {
                        setUploadStatus(`Uploading ${i+1}/${files.length}...`);
                        await uploadSampleToCloud(files[i], files[i].name, user.id, false, undefined, true);
                    }
                    alert("Files Uploaded.");
                }
            } else {
                setUploadStatus("Uploading...");
                await uploadSampleToCloud(files[0], files[0].name, user.id, false, undefined, true);
                alert("File Uploaded.");
            }
            
            await loadLibraryData();

        } catch (e: any) {
            console.error(e);
            alert(`Upload failed: ${e.message}`);
        } finally {
            setIsUploading(false);
            setUploadStatus("");
        }
    };

    const handlePresetImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            await onImport(text);
            onClose();
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

    const handleAdminSampleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = Array.from(e.target.files || []);
        e.target.value = "";
        if (files.length === 0 || !user) return;

        setIsUploading(true);
        setUploadStatus("Uploading Factory Samples...");

        try {
            let successCount = 0;
            for (let i = 0; i < files.length; i++) {
                setUploadStatus(`Uploading ${i + 1}/${files.length}: ${files[i].name}`);
                const result = await uploadSampleToCloud(files[i], files[i].name, user.id, true);
                if (result) successCount++;
            }
            await loadLibraryData();
            alert(`Uploaded ${successCount}/${files.length} Factory Samples.`);
        } catch (e: any) {
            console.error(e);
            alert("Upload failed: " + e.message);
        } finally {
            setIsUploading(false);
            setUploadStatus("");
        }
    };

    const handleTriggerKitUpload = () => {
        if (!adminKitName.trim()) {
            alert("Please enter a Kit Name first.");
            return;
        }
        adminKitUploadRef.current?.click();
    };

    const handleAdminKitUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = Array.from(e.target.files || []);
        e.target.value = "";
        
        if (files.length === 0 || !user) return;
        if (!adminKitName.trim()) {
            alert("Kit Name missing.");
            return;
        }

        setIsUploading(true);
        const kitName = adminKitName.trim();
        
        try {
            setUploadStatus(`Creating Kit Entry "${kitName}"...`);
            
            const kitId = await createKit(user.id, kitName, true, true);
            if (!kitId) throw new Error("Failed to create kit entry.");

            const sampleIds: string[] = [];

            for (let i = 0; i < files.length; i++) {
                setUploadStatus(`Uploading part ${i + 1}/${files.length}: ${files[i].name}`);
                const res = await uploadSampleToCloud(files[i], files[i].name, user.id, true, kitName, true, true);
                if (res) sampleIds.push(res.id);
            }

            setUploadStatus("Linking samples to kit...");
            await linkSamplesToKit(kitId, sampleIds);

            if (files.length > 0) {
                setUploadStatus("Stitching Kit Master...");
                const { blob: masterBlob, slices } = await stitchAudioFiles(files);

                setUploadStatus("Uploading Kit Master...");
                const masterUpload = await uploadSampleToCloud(
                    masterBlob, 
                    `${kitName} (Master).wav`, 
                    user.id, 
                    true, 
                    kitName, 
                    true,
                    true 
                );

                if (masterUpload) {
                    setUploadStatus("Creating Factory Preset...");
                    
                    const params = {
                        grainSize: 0.09, overlap: 0.03, detune: 0, playbackRate: 1, bpm: 120,
                        attack: 0.001, release: 0.01, sustain: 0.5,
                        reverb: { isActive: false, decay: 1.5, wet: 0, isSynced: false, syncValue: '2n', lowCut: 20, highCut: 20000 },
                        delay: { isActive: false, delayTime: 0.375, feedback: 0.2, wet: 0, isSynced: true, syncValue: '8n', lowCut: 20, highCut: 20000 },
                        filter: { isActive: false, frequency: 20000, q: 1, type: 'lowpass', envDepth: 0, lfoDepth: 0, lfoRate: 1, isSynced: true, syncValue: '4n' },
                        distortion: { isActive: false, amount: 1.0, wet: 0.04 },
                        compressor: { isActive: true, threshold: -24, ratio: 4, attack: 0.01, release: 0.1 },
                        bitCrusher: { isActive: false, bits: 8, wet: 0 },
                        glitch: { chaos: 0, allowReverse: false, allowOctaveJump: true, allowRatchet: true, pitchShift: true, allowFormant: true },
                        order: ['compressor', 'distortion', 'bitCrusher', 'filter', 'delay', 'reverb']
                    };

                    const sequencer = {
                        steps: Array(32).fill(0).map((_, i) => ({ active: i%2===0, sliceIndex: i % slices.length, ratchet: 1 })),
                        stepCount: 32, mode: 'forward', currentStep: -1, isPlaying: false, isLooping: true, editMode: 'trigger', playbackBehavior: 'reset'
                    };

                    await saveCloudPreset(
                        kitName, 
                        params as any, 
                        sequencer, 
                        slices, 
                        user.id, 
                        masterUpload.id, 
                        true, 
                        true  
                    );
                }
            }

            await loadLibraryData();
            setAdminKitName(""); 
            alert(`Factory Kit "${kitName}" Created!`);

        } catch (e: any) {
            console.error(e);
            alert("Kit Creation Failed: " + e.message);
        } finally {
            setIsUploading(false);
            setUploadStatus("");
        }
    };

    const handleRunSupabaseMigration = async () => {
        setIsMigrating(true);
        setMigrationResult(null);
        try {
            const res = await fetch('/api/storage/migrate-from-supabase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supabaseUrl: supabaseUrlInput.trim() || undefined,
                    supabaseServiceKey: supabaseKeyInput.trim() || undefined,
                    sourceBucket: supabaseBucketInput.trim() || undefined,
                    destinationPrefix: 'samples/',
                    updateDatabaseUrls: true,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Migration request failed');
            }

            setMigrationResult(data);
            await loadLibraryData();
            alert(data.message || 'Migration completed successfully!');
        } catch (err: any) {
            console.error('Supabase Migration failed:', err);
            setMigrationResult({ success: false, error: err.message });
            alert('Migration failed: ' + err.message);
        } finally {
            setIsMigrating(false);
        }
    };

    const loadCloudItem = (item: CloudItem) => {
        stopPreview();
        
        if (item.type === 'kit' && item.data && item.data.items) {
            const children = item.data.items as CloudItem[];
            const kitSamples: KitSample[] = children.map(c => ({
                name: c.label,
                url: c.url || ''
            })).filter(c => c.url);
            
            if (kitSamples.length > 0) {
                onKitLoad(kitSamples, item.label);
                onClose();
            }
            return;
        }

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
        onClose();
    };

    const handleDelete = async (item: CloudItem) => {
        if (deletingId) return; 

        // Detect if the item is a Kit (either type === 'kit' or labeled with legacy '[Kit: ...]')
        const isKitItem = item.type === 'kit' || Boolean(item.data?.items) || (item.type !== 'preset' && item.label && item.label.startsWith('[Kit:'));

        if (item.type === 'kit' || (isKitItem && item.type !== 'preset' && item.type !== 'sample')) {
            const confirmed = window.confirm(`⚠️ Are you sure you want to delete kit "${item.label}"? This will permanently delete the kit and all its associated audio samples and files.`);
            if (!confirmed) return;

            setDeletingId(item.id);
            const result = await deleteCloudKit(item.id, true);
            if (!result.success) {
                alert(`Delete kit failed: ${result.error}`);
            } else {
                await loadLibraryData();
            }
            setDeletingId(null);
            return;
        }

        if (item.type === 'preset') {
            const confirmed = window.confirm(`⚠️ Are you sure you want to delete preset "${item.label}"? This will permanently delete the preset and all associated audio files.`);
            if (!confirmed) return;
        } else if (item.type === 'sample' && item.url && item.url.includes('/kits/')) {
            const confirmed = window.confirm(`⚠️ Warning: "${item.label}" appears to be part of a Kit. Deleting it might break the kit's integrity. Are you sure you want to delete it?`);
            if (!confirmed) return;
        }

        setDeletingId(item.id);

        let result: DeleteResult = { success: false };
        if (item.type === 'preset') {
            result = await deleteCloudPreset(item.id, item.url, true);
        } else if ((item.type as string) === 'kit') {
            result = await deleteCloudKit(item.id, true);
        } else {
            result = await deleteCloudSample(item.id, item.url);
        }

        if (!result.success) {
            alert(`Delete failed: ${result.error}`);
        } else {
            await loadLibraryData();
        }
        setDeletingId(null);
    };

    const renderItemRow = (item: CloudItem, isKitMember: boolean = false) => {
        const isBroken = errorId === item.id;
        const isMine = user && item._userId === user.id;
        const isPublic = item.isPublic;
        
        const isMaster = item.label.includes('(Master)');
        const label = item.label.replace(/^\[Kit: .*?\]\s*/, '');

        let typeIcon = item.type === 'preset' ? '🎛️' : '💿';
        let typeLabel = item.type === 'preset' ? 'Preset' : 'Sample';

        return (
            <div key={item.id} className={`flex items-center justify-between p-2 rounded-lg border transition-colors group ${deletingId === item.id ? 'opacity-50 pointer-events-none bg-red-900/10' : ''} ${isBroken ? 'bg-red-900/20 border-red-500/30' : (isKitMember ? 'bg-black/20 border-white/5 hover:bg-white/5' : 'bg-white/5 border-white/5 hover:bg-white/10')} ${isMaster ? 'border-l-4 border-l-hyper-cyan' : ''}`}>
                <div className="flex items-center gap-3 cursor-pointer flex-1 min-w-0" onClick={() => loadCloudItem(item)}>
                    <div className={`w-8 h-8 rounded flex items-center justify-center text-lg shrink-0 ${item.type === 'preset' ? 'bg-hyper-cyan/10 text-hyper-cyan' : 'bg-plasma-pink/10 text-plasma-pink'}`}>
                        {typeIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <div className={`text-sm font-bold transition-colors truncate ${isBroken ? 'text-red-400' : 'text-white group-hover:text-hyper-cyan'}`}>
                                {label}
                                {isBroken && <span className="ml-2 text-[10px] text-red-400 bg-red-900/40 px-1.5 rounded uppercase">Error</span>}
                                {isMaster && <span className="ml-2 text-[8px] bg-hyper-cyan/20 text-hyper-cyan px-1 rounded uppercase">Master</span>}
                            </div>
                            {isMine && !item.isFactory && !isKitMember && (
                                <span className={`text-[10px] px-1.5 rounded font-bold uppercase shrink-0 ${isPublic ? 'bg-blue-500/20 text-blue-300' : 'bg-white/10 text-star-dust'}`}>
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
                <div className="flex items-center gap-2 shrink-0">
                    {item.type === 'sample' && item.url && (
                        <button 
                            type="button" 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePreview(item); }} 
                            className={`w-8 h-8 flex items-center justify-center rounded-full transition-all border border-white/10 ${previewingId === item.id ? 'bg-hyper-cyan text-deep-space animate-pulse' : (isBroken ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-white/5 text-white hover:bg-white/20')}`}
                        >
                            {previewingId === item.id ? '⏹' : (isBroken ? '!' : '▶')}
                        </button>
                    )}
                    <button type="button" onClick={() => loadCloudItem(item)} className="px-3 py-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 text-white rounded transition-colors">LOAD</button>
                    {(isAdmin || (isMine && !isKitMember)) && (
                        <Tooltip text="Delete">
                            <button 
                                type="button" 
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(item); }} 
                                disabled={deletingId === item.id} 
                                className="p-2 text-white/50 hover:text-red-500 hover:bg-white/5 rounded-full transition-colors"
                            >
                                {deletingId === item.id ? '...' : '🗑'}
                            </button>
                        </Tooltip>
                    )}
                </div>
            </div>
        );
    }

    const renderGroupedList = (items: CloudItem[]) => {
        const filtered = items.filter(i => i.label.toLowerCase().includes(searchTerm.toLowerCase()));
        if (filtered.length === 0) return <div className="text-white/30 italic text-sm p-4">No items found.</div>;

        const explicitKits = filtered.filter(i => i.type === 'kit');
        
        const legacyKitGroups: Record<string, CloudItem[]> = {};
        const looseItems: CloudItem[] = [];

        filtered.filter(i => i.type !== 'kit').forEach(item => {
            const match = item.label.match(/^\[Kit: (.*?)\]/);
            if (match) {
                const kitName = match[1];
                if (!legacyKitGroups[kitName]) legacyKitGroups[kitName] = [];
                legacyKitGroups[kitName].push(item);
            } else {
                looseItems.push(item);
            }
        });

        const sortedLegacyKits = Object.keys(legacyKitGroups).sort();

        return (
            <div className="space-y-3">
                {explicitKits.map(kit => {
                    const isExpanded = expandedKits.has(kit.id);
                    const children = (kit.data?.items || []) as CloudItem[];
                    const isMine = user && kit._userId === user.id;

                    return (
                        <div key={kit.id} className="border border-white/10 rounded-lg overflow-hidden bg-white/5">
                            <div 
                                className="flex flex-col p-3 cursor-pointer hover:bg-white/5 transition-colors select-none"
                                onClick={() => toggleKitExpansion(kit.id)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className={`text-xs transition-transform duration-200 ${isExpanded ? 'rotate-90' : 'text-white/30'}`}>▶</span>
                                        <div className="flex items-center gap-2">
                                            {kit.imageUrl ? (
                                                <img src={kit.imageUrl} className="w-8 h-8 rounded object-cover border border-white/10" alt="Kit" />
                                            ) : (
                                                <span className="text-xl">📦</span>
                                            )}
                                            <div>
                                                <span className="text-sm font-bold text-white uppercase tracking-wide block">{kit.label}</span>
                                                <span className="text-[10px] text-star-dust">{children.length} Files</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isMine && (
                                            <span className="text-[10px] text-hyper-cyan font-bold uppercase px-2">My Kit</span>
                                        )}
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); loadCloudItem(kit); }}
                                            className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold rounded"
                                        >
                                            LOAD KIT
                                        </button>
                                        {(isAdmin || isMine) && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleDelete(kit); }}
                                                disabled={deletingId === kit.id}
                                                className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-[10px] font-bold rounded transition-colors"
                                                title="Delete Kit"
                                            >
                                                {deletingId === kit.id ? '...' : '🗑 DELETE'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {isExpanded && kit.description && (
                                    <div className="mt-2 ml-7 text-xs text-star-dust/70 italic border-l-2 border-white/10 pl-2">
                                        {kit.description}
                                    </div>
                                )}
                            </div>
                            
                            {isExpanded && (
                                <div className="border-t border-white/5 p-2 space-y-1 bg-black/20">
                                    {children.length > 0 ? children.map(child => renderItemRow(child, true)) : <div className="text-[10px] text-white/30 italic p-2">Empty Kit</div>}
                                </div>
                            )}
                        </div>
                    );
                })}

                {sortedLegacyKits.map(kitName => {
                    const groupItems = legacyKitGroups[kitName];
                    const isExpanded = expandedKits.has(kitName);
                    const isMine = user && groupItems.length > 0 && groupItems[0]._userId === user.id;

                    return (
                        <div key={`kit-${kitName}`} className="border border-white/10 rounded-lg overflow-hidden bg-white/5">
                            <div 
                                className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 transition-colors select-none"
                                onClick={() => toggleKitExpansion(kitName)}
                            >
                                <div className="flex items-center gap-3">
                                    <span className={`text-xs transition-transform duration-200 ${isExpanded ? 'rotate-90' : 'text-white/30'}`}>▶</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl">📁</span>
                                        <span className="text-sm font-bold text-white uppercase tracking-wide">{kitName}</span>
                                        <span className="text-[10px] bg-white/10 px-1.5 rounded text-star-dust">{groupItems.length} Files</span>
                                    </div>
                                </div>
                                {isMine && (
                                    <span className="text-[10px] text-hyper-cyan font-bold uppercase px-2">My Kit (Legacy)</span>
                                )}
                            </div>
                            
                            {isExpanded && (
                                <div className="border-t border-white/5 p-2 space-y-1 bg-black/20">
                                    {groupItems.map(item => renderItemRow(item, true))}
                                </div>
                            )}
                        </div>
                    )
                })}

                <div className="space-y-2 mt-4">
                    {looseItems.map(item => renderItemRow(item, false))}
                </div>
            </div>
        );
    };

    const renderFlatList = (items: CloudItem[]) => {
        const filtered = items.filter(i => i.label.toLowerCase().includes(searchTerm.toLowerCase()));
        if (filtered.length === 0) return <div className="text-white/30 italic text-sm p-4">No items found.</div>;
        return (
            <div className="grid grid-cols-1 gap-2">
                {filtered.map(item => renderItemRow(item, false))}
            </div>
        )
    };

    const inputs = (
        <>
            <input type="file" accept="audio/*" multiple ref={audioInputRef} onChange={handleAudioFileChange} className="hidden" />
            <input type="file" accept="audio/*" multiple ref={kitInputRef} onChange={handleKitFileChange} className="hidden" />
            <input type="file" accept=".json" ref={presetInputRef} onChange={handlePresetImport} className="hidden" />
            <input type="file" accept="audio/*" multiple ref={adminSampleUploadRef} onChange={handleAdminSampleUpload} className="hidden" />
            <input type="file" accept="audio/*" multiple ref={adminKitUploadRef} onChange={handleAdminKitUpload} className="hidden" />
            <input type="file" accept=".json" ref={adminPresetRef} onChange={handleAdminPresetUpload} className="hidden" />
            <input type="file" accept="audio/*" multiple ref={userUploadRef} onChange={handleUserUpload} className="hidden" />
        </>
    );

    if (!isOpen) return <>{inputs}</>;

    return (
        <>
            {inputs}
            <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="w-full max-w-5xl h-[85vh] bg-[#0f1319] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/5">
                    <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#151a23]">
                        <div className="flex items-center gap-4">
                            {activeTab !== 'dashboard' && (
                                <button onClick={() => { setActiveTab('dashboard'); setSearchTerm(""); }} className="flex items-center gap-1 text-xs font-bold text-hyper-cyan hover:text-white transition-colors"><span>←</span> BACK</button>
                            )}
                            <h2 className="text-lg font-bold text-white flex items-center gap-2"><span className="text-hyper-cyan">📚</span> Database Manager</h2>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <button onClick={() => audioInputRef.current?.click()} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs font-bold text-white transition-colors flex items-center gap-2">
                                <span>📂</span> Upload Local
                            </button>
                            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">✕</button>
                        </div>
                    </div>
                    
                    <div className="flex-1 bg-[#0a0d14] relative p-4 overflow-y-auto custom-scrollbar">
                        {isUploading && (
                            <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center text-white">
                                <div className="w-10 h-10 border-4 border-hyper-cyan border-t-transparent rounded-full animate-spin mb-4"></div>
                                <p className="font-bold">{uploadStatus}</p>
                            </div>
                        )}

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
                                        <div><span className="block text-sm font-bold text-white">Factory Presets</span><span className="block text-[10px] text-white/50">Database Table</span></div>
                                    </button>
                                    <button onClick={() => { setActiveTab('samples'); setSearchTerm(""); }} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-plasma-pink/10 hover:border-plasma-pink transition-all flex flex-col items-center gap-3 group h-32 justify-center">
                                        <span className="text-2xl group-hover:scale-110 transition-transform">💿</span>
                                        <div><span className="block text-sm font-bold text-white">Samples</span><span className="block text-[10px] text-white/50">Loose Files</span></div>
                                    </button>
                                    <button onClick={() => { setActiveTab('kits'); setSearchTerm(""); }} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-purple-500/10 hover:border-purple-500 transition-all flex flex-col items-center gap-3 group h-32 justify-center">
                                        <span className="text-2xl group-hover:scale-110 transition-transform">📦</span>
                                        <div><span className="block text-sm font-bold text-white">Kits</span><span className="block text-[10px] text-white/50">Grouped Samples</span></div>
                                    </button>
                                    {isAdmin && (
                                        <button onClick={() => setActiveTab('admin')} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-yellow-500/10 hover:border-yellow-500 transition-all flex flex-col items-center gap-3 group h-32 justify-center">
                                            <span className="text-2xl group-hover:scale-110 transition-transform">⚡</span>
                                            <div><span className="block text-sm font-bold text-white">Admin</span><span className="block text-[10px] text-white/50">Tools & Feedback</span></div>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'presets' && (
                            <div className="max-w-4xl mx-auto space-y-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-bold text-white">Factory Presets Table</h3>
                                    <input type="text" placeholder="Search Presets..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:border-hyper-cyan outline-none w-48" />
                                </div>
                                
                                {user && (
                                    <div>
                                        <h4 className="text-xs font-bold text-hyper-cyan uppercase tracking-widest mb-2 border-b border-white/5 pb-1">My Presets</h4>
                                        {renderFlatList(userPresets)}
                                    </div>
                                )}

                                <div className={user ? "mt-6" : ""}>
                                    <h4 className="text-xs font-bold text-star-dust uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Community Library</h4>
                                    {renderFlatList(publicPresets)}
                                </div>

                                <div className="mt-6">
                                    <h4 className="text-xs font-bold text-yellow-500/70 uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Factory</h4>
                                    {renderFlatList(factoryPresets)}
                                </div>
                            </div>
                        )}

                        {activeTab === 'samples' && (
                            <div className="max-w-4xl mx-auto space-y-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-bold text-white">Samples Table</h3>
                                    <div className="flex items-center gap-2">
                                        {user && (
                                            <Tooltip text="Upload Sample to Cloud">
                                                <button
                                                    onClick={() => userUploadRef.current?.click()}
                                                    className="px-2 py-1 bg-hyper-cyan/10 text-hyper-cyan border border-hyper-cyan/50 hover:bg-hyper-cyan/20 rounded text-[10px] font-bold uppercase transition-colors"
                                                >
                                                    ⬆ Cloud Upload
                                                </button>
                                            </Tooltip>
                                        )}
                                        <input type="text" placeholder="Search Samples..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:border-hyper-cyan outline-none w-48" />
                                    </div>
                                </div>

                                {user && (
                                    <div>
                                        <h4 className="text-xs font-bold text-hyper-cyan uppercase tracking-widest mb-2 border-b border-white/5 pb-1">My Samples</h4>
                                        {renderFlatList(userSamples.filter(s => s.type === 'sample' && !s.label.match(/^\[Kit: .*?\]/) && !s.label.includes('(Master)')))}
                                    </div>
                                )}

                                <div className={user ? "mt-6" : ""}>
                                    <h4 className="text-xs font-bold text-star-dust uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Community Library</h4>
                                    {renderFlatList(publicSamples.filter(s => s.type === 'sample' && !s.label.match(/^\[Kit: .*?\]/) && !s.label.includes('(Master)')))}
                                </div>

                                <div className="mt-6">
                                    <h4 className="text-xs font-bold text-yellow-500/70 uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Factory</h4>
                                    {renderFlatList(factorySamples.filter(s => s.type === 'sample' && !s.label.match(/^\[Kit: .*?\]/) && !s.label.includes('(Master)')))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'kits' && (
                            <div className="max-w-4xl mx-auto space-y-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-bold text-white">Kits Table</h3>
                                    <div className="flex items-center gap-2">
                                        {user && (
                                            <Tooltip text="Upload Kit to Cloud">
                                                <button
                                                    onClick={() => userUploadRef.current?.click()}
                                                    className="px-2 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/50 hover:bg-purple-500/20 rounded text-[10px] font-bold uppercase transition-colors"
                                                >
                                                    ⬆ Cloud Upload
                                                </button>
                                            </Tooltip>
                                        )}
                                        <input type="text" placeholder="Search Kits..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:border-hyper-cyan outline-none w-48" />
                                    </div>
                                </div>

                                {user && (
                                    <div>
                                        <h4 className="text-xs font-bold text-hyper-cyan uppercase tracking-widest mb-2 border-b border-white/5 pb-1">My Kits</h4>
                                        {renderGroupedList(userSamples.filter(s => s.type === 'kit' || s.label.match(/^\[Kit: .*?\]/)))}
                                    </div>
                                )}

                                <div className={user ? "mt-6" : ""}>
                                    <h4 className="text-xs font-bold text-star-dust uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Community Library</h4>
                                    {renderGroupedList(publicSamples.filter(s => s.type === 'kit' || s.label.match(/^\[Kit: .*?\]/)))}
                                </div>

                                <div className="mt-6">
                                    <h4 className="text-xs font-bold text-yellow-500/70 uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Factory</h4>
                                    {renderGroupedList(factorySamples.filter(s => s.type === 'kit' || s.label.match(/^\[Kit: .*?\]/)))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'admin' && (
                            <div className="max-w-4xl mx-auto space-y-8 p-4">
                                <h3 className="text-xl font-bold text-white flex items-center gap-2"><span className="text-yellow-500">⚡</span> Admin Tools</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                    <div className="bg-white/5 p-6 rounded-xl border border-white/10 flex flex-col items-center gap-4 text-center">
                                        <div className="w-12 h-12 bg-hyper-cyan/20 text-hyper-cyan rounded-full flex items-center justify-center text-2xl">🎛️</div>
                                        <div><h4 className="text-sm font-bold text-white">Upload Factory Preset</h4><p className="text-xs text-white/50 mt-1">Select JSON file</p></div>
                                        <button onClick={() => adminPresetRef.current?.click()} className="mt-2 w-full py-2 bg-hyper-cyan text-deep-space font-bold text-xs rounded hover:bg-white transition-colors">SELECT JSON</button>
                                    </div>
                                    <div className="bg-white/5 p-6 rounded-xl border border-white/10 flex flex-col items-center gap-4 text-center">
                                        <div className="w-12 h-12 bg-plasma-pink/20 text-plasma-pink rounded-full flex items-center justify-center text-2xl">💿</div>
                                        <div><h4 className="text-sm font-bold text-white">Factory Audio Content</h4><p className="text-xs text-white/50 mt-1">WAV / MP3</p></div>
                                        
                                        <div className="w-full mt-2 space-y-2">
                                            <button 
                                                onClick={() => adminSampleUploadRef.current?.click()} 
                                                className="w-full py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded border border-white/5 transition-colors"
                                            >
                                                Upload Samples (Loose)
                                            </button>
                                            
                                            <div className="flex gap-2 pt-2 border-t border-white/5">
                                                <input 
                                                    type="text" 
                                                    placeholder="Kit Name..." 
                                                    value={adminKitName}
                                                    onChange={(e) => setAdminKitName(e.target.value)}
                                                    className="flex-1 bg-black/40 border border-white/10 rounded px-3 text-xs text-white focus:border-plasma-pink outline-none"
                                                />
                                                <button 
                                                    onClick={handleTriggerKitUpload} 
                                                    disabled={!adminKitName.trim()}
                                                    className="px-4 py-2 bg-plasma-pink text-white font-bold text-xs rounded hover:bg-white hover:text-deep-space transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Upload Kit
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Storage Admin & Object Purge Panel */}
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                            <span className="text-hyper-cyan">🗄️</span> S3 / Neon Object Storage Browser & Purge
                                        </h3>
                                        <button
                                            onClick={loadStorageInfo}
                                            disabled={isLoadingStorage}
                                            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                            <span>{isLoadingStorage ? '⏳' : '🔄'}</span>
                                            <span>Refresh Files</span>
                                        </button>
                                    </div>

                                    {storageActionMsg && (
                                        <div className={`mb-4 text-xs px-3 py-2 rounded-lg border ${storageActionMsg.success ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30'}`}>
                                            {storageActionMsg.text}
                                        </div>
                                    )}

                                    <div className="bg-white/5 p-5 rounded-xl border border-white/10 space-y-4">
                                        {/* Bucket Info */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-black/40 p-3 rounded-lg border border-white/5">
                                            <div>
                                                <div className="text-[10px] text-white/50 uppercase font-bold">Storage State</div>
                                                <div className={`font-mono font-bold ${storageStatus?.configured || storageStatus?.s3Enabled ? 'text-emerald-400' : 'text-yellow-400'}`}>
                                                    {storageStatus?.configured || storageStatus?.s3Enabled ? '● S3 Connected' : '○ Local Disk'}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-white/50 uppercase font-bold">Bucket Name</div>
                                                <div className="font-mono text-white truncate">{storageStatus?.bucket || 'Default / None'}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-white/50 uppercase font-bold">Region</div>
                                                <div className="font-mono text-white">{storageStatus?.region || 'auto / us-east-1'}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-white/50 uppercase font-bold">Total Stored Objects</div>
                                                <div className="font-mono text-hyper-cyan font-bold">{storageObjects.length} files</div>
                                            </div>
                                        </div>

                                        {/* Direct Key/URL Purge Tool */}
                                        <div className="bg-black/30 p-3 rounded-lg border border-red-500/20 space-y-2">
                                            <div className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                                                <span>🗑</span> Direct Storage Purge by Key / URL:
                                            </div>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="samples/123_kick.wav OR full URL..."
                                                    value={manualDeleteTarget}
                                                    onChange={(e) => setManualDeleteTarget(e.target.value)}
                                                    className="flex-1 bg-black/50 border border-white/10 rounded px-3 py-1.5 text-xs text-white focus:border-red-500 outline-none font-mono"
                                                />
                                                <button
                                                    onClick={() => {
                                                        if (manualDeleteTarget.trim()) {
                                                            handleDeleteStorageObject(manualDeleteTarget.trim());
                                                            setManualDeleteTarget("");
                                                        }
                                                    }}
                                                    disabled={!manualDeleteTarget.trim() || isDeletingStorage}
                                                    className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded transition-colors disabled:opacity-50"
                                                >
                                                    {isDeletingStorage ? 'Purging...' : 'Purge Object'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Filter & File List */}
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="text-xs font-bold text-star-dust uppercase tracking-wider">
                                                    Stored Bucket Files ({storageObjects.filter(o => o.key.toLowerCase().includes(storageSearch.toLowerCase())).length})
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="Filter storage files..."
                                                    value={storageSearch}
                                                    onChange={(e) => setStorageSearch(e.target.value)}
                                                    className="bg-black/40 border border-white/10 rounded px-2.5 py-1 text-xs text-white outline-none focus:border-hyper-cyan w-48"
                                                />
                                            </div>

                                            <div className="max-h-64 overflow-y-auto bg-black/40 rounded-lg border border-white/5 divide-y divide-white/5">
                                                {isLoadingStorage ? (
                                                    <div className="p-6 text-center text-white/50 text-xs italic">Loading storage objects...</div>
                                                ) : storageObjects.length === 0 ? (
                                                    <div className="p-6 text-center text-white/40 text-xs italic">
                                                        No storage files found or S3 bucket is empty.
                                                    </div>
                                                ) : (
                                                    storageObjects
                                                        .filter(o => o.key.toLowerCase().includes(storageSearch.toLowerCase()))
                                                        .map((obj) => {
                                                            const sizeKB = (obj.size / 1024).toFixed(1);
                                                            const filename = obj.key.split('/').pop() || obj.key;
                                                            return (
                                                                <div key={obj.key} className="p-2.5 flex items-center justify-between hover:bg-white/5 transition-colors text-xs gap-3">
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="font-mono text-white truncate flex items-center gap-2">
                                                                            <span className="text-plasma-pink">🔊</span>
                                                                            <span className="truncate">{filename}</span>
                                                                        </div>
                                                                        <div className="text-[10px] text-white/40 font-mono truncate">
                                                                            <span>{obj.key}</span> • <span>{sizeKB} KB</span> {obj.lastModified && `• ${new Date(obj.lastModified).toLocaleDateString()}`}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 shrink-0">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => togglePreview({ id: obj.key, label: filename, type: 'sample', url: obj.url, isPublic: true })}
                                                                            className={`w-7 h-7 flex items-center justify-center rounded-full border border-white/10 text-xs transition-colors ${previewingId === obj.key ? 'bg-hyper-cyan text-deep-space animate-pulse' : 'bg-white/10 text-white hover:bg-white/20'}`}
                                                                            title="Preview Audio"
                                                                        >
                                                                            {previewingId === obj.key ? '⏹' : '▶'}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteStorageObject(obj.key)}
                                                                            disabled={isDeletingStorage}
                                                                            className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded font-bold text-[11px] transition-colors"
                                                                            title="Permanently Delete File"
                                                                        >
                                                                            🗑 Delete
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                        <span>📦</span> Supabase Storage Migration to Neon Bucket
                                    </h3>
                                    <div className="bg-white/5 p-6 rounded-xl border border-white/10 space-y-4">
                                        <p className="text-xs text-white/70 leading-relaxed">
                                            Transfer all audio files and kits from your existing Supabase storage bucket into your connected Neon S3 Object Storage bucket.
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div>
                                                <label className="text-[10px] font-bold text-white/50 uppercase">Supabase URL (Optional if set in .env)</label>
                                                <input
                                                    type="text"
                                                    placeholder="https://xyz.supabase.co"
                                                    value={supabaseUrlInput}
                                                    onChange={(e) => setSupabaseUrlInput(e.target.value)}
                                                    className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2 text-xs text-white focus:border-hyper-cyan outline-none font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-white/50 uppercase">Service Role / Anon Key</label>
                                                <input
                                                    type="password"
                                                    placeholder="eyJhbGciOi..."
                                                    value={supabaseKeyInput}
                                                    onChange={(e) => setSupabaseKeyInput(e.target.value)}
                                                    className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2 text-xs text-white focus:border-hyper-cyan outline-none font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-white/50 uppercase">Supabase Source Bucket</label>
                                                <input
                                                    type="text"
                                                    placeholder="samples"
                                                    value={supabaseBucketInput}
                                                    onChange={(e) => setSupabaseBucketInput(e.target.value)}
                                                    className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2 text-xs text-white focus:border-hyper-cyan outline-none font-mono"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-2">
                                            <button
                                                onClick={handleRunSupabaseMigration}
                                                disabled={isMigrating}
                                                className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs rounded-lg transition-all shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isMigrating ? (
                                                    <>
                                                        <span className="animate-spin inline-block">⏳</span>
                                                        <span>Migrating Assets to Neon...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span>🚀</span>
                                                        <span>Start Migration to Neon Storage</span>
                                                    </>
                                                )}
                                            </button>

                                            {migrationResult && (
                                                <div className={`text-xs px-3 py-1.5 rounded ${migrationResult.success ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
                                                    {migrationResult.message || (migrationResult.success ? 'Migration Complete!' : migrationResult.error)}
                                                </div>
                                            )}
                                        </div>

                                        {migrationResult?.result?.results && (
                                            <div className="mt-3 max-h-40 overflow-y-auto bg-black/40 rounded p-3 text-[11px] font-mono space-y-1 text-white/70">
                                                {migrationResult.result.results.map((r: any, idx: number) => (
                                                    <div key={idx} className="flex justify-between items-center">
                                                        <span className="truncate max-w-xs">{r.name}</span>
                                                        <span className={r.status === 'migrated' ? 'text-emerald-400' : 'text-red-400'}>
                                                            {r.status === 'migrated' ? '✓ Uploaded to Neon' : `✗ ${r.error || 'Failed'}`}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-lg font-bold text-white mb-4">📢 User Feedback</h3>
                                    <div className="bg-black/30 rounded-xl border border-white/10 overflow-hidden">
                                        {feedbackItems.length === 0 ? (
                                            <div className="p-4 text-center text-white/30 text-sm italic">No feedback received yet.</div>
                                        ) : (
                                            <div className="divide-y divide-white/5">
                                                {feedbackItems.map(fb => (
                                                    <div key={fb.id} className="p-4 hover:bg-white/5 transition-colors">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${fb.category === 'bug' ? 'bg-red-500/20 text-red-300' : (fb.category === 'feature' ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/50')}`}>
                                                                    {fb.category}
                                                                </span>
                                                                <span className="text-xs font-bold text-hyper-cyan">
                                                                    {fb.profiles?.username || (fb.user_id ? fb.user_id.slice(0,6) : 'Anon')}
                                                                </span>
                                                            </div>
                                                            <span className="text-[10px] text-white/30">
                                                                {new Date(fb.created_at).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-star-dust whitespace-pre-wrap">{fb.message}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
});

export default LibraryManager;
