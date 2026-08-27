
import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';

interface VideoTutorialDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

<<<<<<< HEAD
const STORAGE_KEY = 'beat_slicer_quickstart_seen_v2';
=======
const STORAGE_KEY = 'beat_slicer_quickstart_seen_v3';
>>>>>>> old-slicer/ai-beat-patterns

const VideoTutorialDialog: React.FC<VideoTutorialDialogProps> = ({ isOpen, onClose }) => {
    const [dontShowAgain, setDontShowAgain] = useState(false);
    const [hasError, setHasError] = useState(false);

    // Sync state when opening
    useEffect(() => {
        if (isOpen) {
            setDontShowAgain(localStorage.getItem(STORAGE_KEY) === 'true');
            setHasError(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleClose = () => {
        if (dontShowAgain) {
            localStorage.setItem(STORAGE_KEY, 'true');
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
        onClose();
    };

    const videoFilename = "Slicer Demo vid 1-Desktop.m4v";
    const videoSrcEncoded = encodeURIComponent(videoFilename);
    const videoSrcRaw = videoFilename;
    
    // Construct Cloud URL if Supabase is configured
    let cloudUrl = null;
    if (supabase) {
        const { data } = supabase.storage.from('videos').getPublicUrl(videoSrcRaw);
        // Ensure spaces are encoded to %20 to match the known working URL format
        if (data && data.publicUrl) {
            cloudUrl = data.publicUrl.replace(/ /g, '%20');
        }
    }

    return (
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={handleClose}></div>
            
            <div className="relative bg-[#12161d] border border-white/10 rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] ring-1 ring-white/5 animate-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#1a1f2b]">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="text-hyper-cyan">🎥</span> Quickstart Guide
                    </h2>
                    <button 
                        onClick={handleClose} 
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                </div>
                <div className="bg-black flex-1 flex items-center justify-center relative w-full h-full min-h-[300px]">
                    {!hasError ? (
<<<<<<< HEAD
                        <video 
                            controls 
                            playsInline
                            className="max-h-full max-w-full w-full h-auto object-contain"
                            onError={() => {
                                console.error("Video load error: Source unavailable");
                                setHasError(true);
                            }}
                        >
                            {/* Strategy 0: Cloud Storage (Supabase) */}
                            {cloudUrl && <source src={cloudUrl} type="video/mp4" />}
                            
                            {/* Strategy 1: URL Encoded Local */}
                            <source src={videoSrcEncoded} type="video/mp4" />
                            
                            {/* Strategy 2: Raw Filename Local */}
                            <source src={videoSrcRaw} type="video/mp4" />
                            
                            {/* Strategy 3: Explicit Relative Dot Slash */}
                            <source src={`./${videoSrcEncoded}`} type="video/mp4" />
                            
                            Your browser does not support the video tag.
                        </video>
=======
                        <iframe
                            width="100%"
                            height="100%"
                            src="https://www.youtube.com/embed/OccOu9i76L0"
                            title="Beat Slicer Quickstart Guide"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            className="w-full h-full min-h-[300px]"
                            onError={() => {
                                console.error("YouTube embed load error");
                                setHasError(true);
                            }}
                        ></iframe>
>>>>>>> old-slicer/ai-beat-patterns
                    ) : (
                        <div className="text-center p-8">
                            <div className="text-4xl mb-4">⚠️</div>
                            <h3 className="text-xl font-bold text-white mb-2">Video Unavailable</h3>
                            <p className="text-star-dust mb-4 text-sm max-w-md">
<<<<<<< HEAD
                                The tutorial video could not be loaded. This might be due to a file path issue or browser restriction.
                            </p>
                            <a 
                                href={cloudUrl || videoSrcEncoded} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded font-bold text-xs transition-colors border border-white/5"
                            >
                                Try Direct Link
=======
                                The tutorial video could not be loaded. This might be due to a network issue or browser restriction.
                            </p>
                            <a
                                href="https://youtu.be/OccOu9i76L0?si=GWDO4oITSO6tq9ac"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded font-bold text-xs transition-colors border border-white/5"
                            >
                                Open on YouTube
>>>>>>> old-slicer/ai-beat-patterns
                            </a>
                        </div>
                    )}
                </div>
                <div className="p-4 bg-[#1a1f2b] border-t border-white/10 flex justify-end">
                    <label className="flex items-center gap-2 cursor-pointer group">
                        <input 
                            type="checkbox" 
                            checked={dontShowAgain}
                            onChange={(e) => setDontShowAgain(e.target.checked)}
                            className="w-4 h-4 rounded border-white/20 bg-black/40 checked:bg-hyper-cyan focus:ring-0 focus:ring-offset-0"
                        />
                        <span className="text-xs text-star-dust group-hover:text-white transition-colors select-none">
                            Don't show this again
                        </span>
                    </label>
                </div>
            </div>
        </div>
    );
};

export default VideoTutorialDialog;
