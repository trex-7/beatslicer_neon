import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import Auth from './Auth';

interface ProMenuBarProps {
    projectName: string;
    setProjectName: (name: string) => void;
    onOpenLibrary: () => void;
    onImportPreset: () => void;
    onSavePreset: (name: string) => Promise<string>;
    onSaveToCloud: () => void;
    getAudioWav: () => Promise<Blob | null>;
    onExportWav: () => void;
    onRandomize: () => void;
    onClearPattern: () => void;
    onAutoSlice: () => void;
    onGenerateBeat: (style: 'house' | 'break' | 'chaos') => void;
    onToggleMode: () => void;
    onShowMonitor: () => void;
    user: any;
    sampleName: string;
    onReportIssue: () => void;
    onOpenVideo: () => void;
    onOpenContact: () => void;
}

const MenuDropdown = ({ label, children }: { label: string, children?: React.ReactNode }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative z-50" ref={ref}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`px-3 py-1 text-xs font-medium rounded hover:bg-white/10 transition-colors ${isOpen ? 'bg-white/10 text-white' : 'text-star-dust'}`}
            >
                {label}
            </button>
            {isOpen && (
                <div className="absolute left-0 top-full mt-1 w-48 bg-[#1a1f2b] border border-white/10 rounded-lg shadow-xl py-1 flex flex-col min-w-[160px]">
                    {React.Children.map(children, (child) => {
                        if (React.isValidElement(child)) {
                            const element = child as React.ReactElement<any>;
                            // Only attach click handler to close menu if it's not a direct link
                            // or pass the close handler down
                            return React.cloneElement(element, { 
                                onClick: (e: React.MouseEvent) => {
                                    element.props.onClick?.(e);
                                    setIsOpen(false);
                                }
                            });
                        }
                        return child;
                    })}
                </div>
            )}
        </div>
    );
};

const MenuItem = ({ label, onClick, href, shortcut, disabled, danger }: { label: string, onClick?: () => void, href?: string, shortcut?: string, disabled?: boolean, danger?: boolean }) => {
    const className = `text-left px-4 py-2 text-xs hover:bg-hyper-cyan/10 hover:text-hyper-cyan transition-colors flex justify-between items-center group w-full ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${danger ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10' : 'text-star-dust'}`;

    if (href && !disabled) {
        return (
            <a 
                href={href} 
                className={className}
                onClick={onClick} // Pass onClick to allow menu closing via parent cloneElement
            >
                <span>{label}</span>
                {shortcut && <span className="text-[10px] opacity-30 font-mono group-hover:opacity-100">{shortcut}</span>}
            </a>
        )
    }

    return (
        <button 
            onClick={onClick}
            disabled={disabled}
            className={className}
        >
            <span>{label}</span>
            {shortcut && <span className="text-[10px] opacity-30 font-mono group-hover:opacity-100">{shortcut}</span>}
        </button>
    );
};

const MenuDivider = () => <div className="h-px bg-white/5 my-1 mx-2"></div>;

const ProMenuBar: React.FC<ProMenuBarProps> = ({
    projectName,
    setProjectName,
    onOpenLibrary,
    onImportPreset,
    onSavePreset,
    onSaveToCloud,
    getAudioWav,
    onExportWav,
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
    onOpenContact
}) => {
    
    const handleDownloadWav = async () => {
        const blob = await getAudioWav();
        if (!blob) return alert("No audio loaded");
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectName.replace(/\s+/g, '_')}_Master.wav`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportZip = async () => {
        const blob = await getAudioWav();
        if (!blob) return alert("No audio loaded");
        
        try {
            const zip = new JSZip();
            const safeName = projectName.replace(/[^a-z0-9]/gi, '_');
            const root = zip.folder(safeName);
            if (!root) return;

            // Add Audio
            root.file(`${safeName}.wav`, blob);

            // Add JSON
            const jsonString = await onSavePreset(projectName);
            root.file(`${safeName}.json`, jsonString);

            // Generate
            const content = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${safeName}_Project.zip`;
            a.click();
            URL.revokeObjectURL(url);
        } catch(e) {
            console.error(e);
            alert("Export failed");
        }
    };

    return (
        <div className="fixed top-0 left-0 w-full h-10 bg-[#0f1319] border-b border-white/10 z-50 flex items-center justify-between px-3 select-none backdrop-blur-md">
            
            <div className="flex items-center gap-1">
                {/* Logo Area */}
                <div className="mr-3 flex items-center gap-2 pr-3 border-r border-white/5">
                    <div className="w-5 h-5 bg-gradient-to-br from-hyper-cyan to-blue-600 rounded flex items-center justify-center text-[10px] font-black text-deep-space">
                        BS
                    </div>
                    <div className="flex flex-col leading-none">
                        <span className="text-xs font-bold text-white tracking-wide">BEAT SLICER</span>
                        <span className="text-[7px] text-white/30 font-mono tracking-tighter">v0.9.0-beta</span>
                    </div>
                </div>

                {/* File Menu */}
                <MenuDropdown label="FILE">
                    <MenuItem label="New Project" onClick={() => { if(confirm('Clear all settings?')) window.location.reload(); }} />
                    <MenuDivider />
                    <MenuItem label="Browse Database" onClick={onOpenLibrary} shortcut="Cmd+O" />
                    <MenuItem label="Save to Database..." onClick={onSaveToCloud} disabled={!user} shortcut="Cmd+S" />
                    <MenuDivider />
                    <MenuItem label="Export WAV" onClick={handleDownloadWav} />
                    <MenuItem label="Export Project ZIP" onClick={handleExportZip} />
                </MenuDropdown>

                {/* Edit Menu */}
                <MenuDropdown label="EDIT">
                    <MenuItem label="Randomize Pattern" onClick={onRandomize} />
                    <MenuItem label="Clear Pattern" onClick={onClearPattern} />
                    <MenuDivider />
                    <MenuItem label="Auto-Slice Buffer" onClick={onAutoSlice} />
                </MenuDropdown>

                {/* Generate Menu */}
                <MenuDropdown label="GENERATE">
                    <MenuItem label="House Beat" onClick={() => onGenerateBeat('house')} />
                    <MenuItem label="Breakbeat" onClick={() => onGenerateBeat('break')} />
                    <MenuItem label="Glitch Chaos" onClick={() => onGenerateBeat('chaos')} />
                </MenuDropdown>

                {/* View Menu */}
                <MenuDropdown label="VIEW">
                    <MenuItem label="System Monitor" onClick={onShowMonitor} />
                    <MenuItem label="Switch to Simple Mode" onClick={onToggleMode} />
                </MenuDropdown>

                {/* Help Menu */}
                <MenuDropdown label="HELP">
                    <MenuItem label="Quickstart Video" onClick={onOpenVideo} />
                    <MenuItem label="Credits" onClick={onOpenContact} />
                    <MenuItem 
                        label="Report Issue / Feedback" 
                        onClick={onReportIssue}
                    />
                </MenuDropdown>
            </div>

            {/* Project Name */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <input 
                    type="text" 
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="bg-transparent text-center text-xs font-bold text-white/50 focus:text-white focus:bg-white/5 rounded px-2 py-1 outline-none w-48 hover:text-white/80 transition-colors"
                />
            </div>

            {/* Right Side: Auth / Info */}
            <div className="flex items-center gap-3">
                 <div className="text-xs text-white/70 font-mono text-right mr-2 leading-tight border-r border-white/5 pr-3">
                     <span className="font-bold text-white/80">Dev: Sandro Mancino</span><br/>
                     <button onClick={() => { console.log('Pro contact button clicked'); onOpenContact(); }} className="text-hyper-cyan hover:underline cursor-pointer bg-transparent border-none p-0">sandromancino.sm@gmail.com</button>
                 </div>
                 <div className="hidden sm:flex items-center gap-2 text-[10px] text-star-dust/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    <span className="max-w-[100px] truncate">{sampleName}</span>
                 </div>
                 <div className="h-4 w-px bg-white/5 mx-1"></div>
                 <Auth user={user} />
            </div>
        </div>
    );
};

export default ProMenuBar;