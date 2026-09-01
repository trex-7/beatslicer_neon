import React, { useState, useRef, useEffect } from 'react';
import { 
    Folder, 
    Save, 
    Download, 
    Upload, 
    Sparkles, 
    Activity, 
    Sliders, 
    Scissors, 
    HelpCircle, 
    RotateCcw, 
    FileAudio, 
    Share2, 
    MessageSquare, 
    Mail, 
    Video, 
    User as UserIcon,
    ChevronDown
} from 'lucide-react';

interface ProMenuBarProps {
    projectName: string;
    setProjectName: (name: string) => void;
    onOpenLibrary: () => void;
    onImportPreset: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSavePreset: () => void;
    onSaveToCloud: () => void;
    getAudioWav: () => Promise<Blob | null>;
    onExportWav?: () => void;
    onRandomize: () => void;
    onClearPattern: () => void;
    onAutoSlice: () => void;
    onGenerateBeat: (style: 'house' | 'break' | 'chaos') => void;
    onToggleMode: () => void;
    onShowMonitor: () => void;
    user?: any;
    sampleName?: string;
    onReportIssue?: () => void;
    onOpenVideo?: () => void;
    onOpenContact?: () => void;
}

export const ProMenuBar: React.FC<ProMenuBarProps> = ({
    projectName,
    setProjectName,
    onOpenLibrary,
    onImportPreset,
    onSavePreset,
    onSaveToCloud,
    getAudioWav,
    onRandomize,
    onClearPattern,
    onAutoSlice,
    onGenerateBeat,
    onToggleMode,
    onShowMonitor,
    user,
    sampleName,
    onReportIssue,
    onOpenVideo,
    onOpenContact,
}) => {
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest('.pro-menu-container')) {
                setActiveMenu(null);
            }
        };
        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleExportAudio = async () => {
        setIsExporting(true);
        try {
            const wavBlob = await getAudioWav();
            if (wavBlob) {
                const url = URL.createObjectURL(wavBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${projectName.replace(/\s+/g, '_')}_master.wav`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error('Failed to export audio WAV:', err);
        } finally {
            setIsExporting(false);
            setActiveMenu(null);
        }
    };

    return (
        <header className="fixed top-0 left-0 right-0 h-10 bg-neutral-950/95 border-b border-neutral-800/80 backdrop-blur-md z-40 flex items-center justify-between px-4 text-xs select-none pro-menu-container">
            {/* Hidden file input for import */}
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={onImportPreset} 
                accept=".json" 
                className="hidden" 
            />

            {/* Left Menus */}
            <div className="flex items-center gap-1">
                <div className="flex items-center gap-2 mr-3 font-black text-sm tracking-wider text-cyan-400">
                    <span className="text-base">🎛️</span>
                    <span>BEAT SLICER</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60">PRO</span>
                </div>

                {/* File Menu */}
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setActiveMenu(activeMenu === 'file' ? null : 'file')}
                        className={`px-2.5 py-1 rounded font-medium transition-colors ${activeMenu === 'file' ? 'bg-neutral-800 text-white' : 'text-neutral-300 hover:bg-neutral-800/60'}`}
                    >
                        File
                    </button>
                    {activeMenu === 'file' && (
                        <div className="absolute top-full left-0 mt-1 w-52 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                            <button
                                type="button"
                                onClick={() => { onOpenLibrary(); setActiveMenu(null); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-800 text-left text-neutral-200"
                            >
                                <Folder className="w-4 h-4 text-cyan-400" />
                                <span>Open Cloud Library</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { onSaveToCloud(); setActiveMenu(null); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-800 text-left text-neutral-200"
                            >
                                <Save className="w-4 h-4 text-emerald-400" />
                                <span>Save to Cloud</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { onSavePreset(); setActiveMenu(null); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-800 text-left text-neutral-200"
                            >
                                <Download className="w-4 h-4 text-blue-400" />
                                <span>Export Preset JSON</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { fileInputRef.current?.click(); setActiveMenu(null); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-800 text-left text-neutral-200"
                            >
                                <Upload className="w-4 h-4 text-purple-400" />
                                <span>Import Preset JSON</span>
                            </button>
                            <div className="border-t border-neutral-800 my-1" />
                            <button
                                type="button"
                                onClick={handleExportAudio}
                                disabled={isExporting}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-800 text-left text-neutral-200"
                            >
                                <FileAudio className="w-4 h-4 text-amber-400" />
                                <span>{isExporting ? 'Rendering WAV...' : 'Export Audio (WAV)'}</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Edit & Generator Menu */}
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setActiveMenu(activeMenu === 'edit' ? null : 'edit')}
                        className={`px-2.5 py-1 rounded font-medium transition-colors ${activeMenu === 'edit' ? 'bg-neutral-800 text-white' : 'text-neutral-300 hover:bg-neutral-800/60'}`}
                    >
                        Edit
                    </button>
                    {activeMenu === 'edit' && (
                        <div className="absolute top-full left-0 mt-1 w-52 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                            <button
                                type="button"
                                onClick={() => { onAutoSlice(); setActiveMenu(null); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-800 text-left text-neutral-200"
                            >
                                <Scissors className="w-4 h-4 text-cyan-400" />
                                <span>Auto-Slice Transients</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { onRandomize(); setActiveMenu(null); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-800 text-left text-neutral-200"
                            >
                                <Sparkles className="w-4 h-4 text-amber-400" />
                                <span>Randomize Pattern</span>
                            </button>
                            <div className="border-t border-neutral-800 my-1" />
                            <button
                                type="button"
                                onClick={() => { onGenerateBeat('house'); setActiveMenu(null); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-800 text-left text-neutral-200"
                            >
                                <Sparkles className="w-4 h-4 text-emerald-400" />
                                <span>Generate House Beat</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { onGenerateBeat('break'); setActiveMenu(null); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-800 text-left text-neutral-200"
                            >
                                <Sparkles className="w-4 h-4 text-purple-400" />
                                <span>Generate Breakbeat</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { onGenerateBeat('chaos'); setActiveMenu(null); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-800 text-left text-neutral-200"
                            >
                                <Sparkles className="w-4 h-4 text-rose-400" />
                                <span>Generate Chaos Pattern</span>
                            </button>
                            <div className="border-t border-neutral-800 my-1" />
                            <button
                                type="button"
                                onClick={() => { onClearPattern(); setActiveMenu(null); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-800 text-left text-rose-400"
                            >
                                <RotateCcw className="w-4 h-4" />
                                <span>Clear Sequencer Steps</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* View Menu */}
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setActiveMenu(activeMenu === 'view' ? null : 'view')}
                        className={`px-2.5 py-1 rounded font-medium transition-colors ${activeMenu === 'view' ? 'bg-neutral-800 text-white' : 'text-neutral-300 hover:bg-neutral-800/60'}`}
                    >
                        View
                    </button>
                    {activeMenu === 'view' && (
                        <div className="absolute top-full left-0 mt-1 w-48 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                            <button
                                type="button"
                                onClick={() => { onToggleMode(); setActiveMenu(null); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-800 text-left text-neutral-200"
                            >
                                <Sliders className="w-4 h-4 text-cyan-400" />
                                <span>Switch to Simple Mode</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { onShowMonitor(); setActiveMenu(null); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-800 text-left text-neutral-200"
                            >
                                <Activity className="w-4 h-4 text-emerald-400" />
                                <span>System Monitor</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Help Menu */}
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setActiveMenu(activeMenu === 'help' ? null : 'help')}
                        className={`px-2.5 py-1 rounded font-medium transition-colors ${activeMenu === 'help' ? 'bg-neutral-800 text-white' : 'text-neutral-300 hover:bg-neutral-800/60'}`}
                    >
                        Help
                    </button>
                    {activeMenu === 'help' && (
                        <div className="absolute top-full left-0 mt-1 w-52 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                            {onOpenVideo && (
                                <button
                                    type="button"
                                    onClick={() => { onOpenVideo(); setActiveMenu(null); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-800 text-left text-neutral-200"
                                >
                                    <Video className="w-4 h-4 text-cyan-400" />
                                    <span>Video Tutorial</span>
                                </button>
                            )}
                            {onReportIssue && (
                                <button
                                    type="button"
                                    onClick={() => { onReportIssue(); setActiveMenu(null); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-800 text-left text-neutral-200"
                                >
                                    <MessageSquare className="w-4 h-4 text-amber-400" />
                                    <span>Send Feedback</span>
                                </button>
                            )}
                            {onOpenContact && (
                                <button
                                    type="button"
                                    onClick={() => { onOpenContact(); setActiveMenu(null); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-800 text-left text-neutral-200"
                                >
                                    <Mail className="w-4 h-4 text-purple-400" />
                                    <span>Contact & Support</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Center Project Name */}
            <div className="flex items-center gap-2">
                <input 
                    type="text" 
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="bg-neutral-900 border border-neutral-800 rounded-md px-2 py-0.5 text-center text-xs font-semibold text-neutral-200 focus:outline-none focus:border-cyan-500 hover:border-neutral-700 transition-colors w-40 max-w-xs"
                    placeholder="Project Name"
                />
                {sampleName && (
                    <span className="text-[11px] text-neutral-500 font-mono hidden md:inline">
                        ({sampleName})
                    </span>
                )}
            </div>

            {/* Right Status Actions */}
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={onOpenLibrary}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-800/60 rounded-md font-semibold transition-all shadow-sm"
                >
                    <Folder className="w-3.5 h-3.5" />
                    <span>Cloud Library</span>
                </button>
                <button
                    type="button"
                    onClick={onShowMonitor}
                    className="flex items-center gap-1.5 px-2 py-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 rounded-md transition-colors"
                >
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="hidden sm:inline">Monitor</span>
                </button>
                <button
                    type="button"
                    onClick={onToggleMode}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-850 hover:bg-neutral-800 text-neutral-300 rounded-md border border-neutral-750 transition-colors"
                >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Simple Mode</span>
                </button>
            </div>
        </header>
    );
};

export default ProMenuBar;
