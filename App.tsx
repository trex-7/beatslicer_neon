
import React, { useState, useEffect, useRef } from 'react';
import { useAudioEngine } from './hooks/useAudioEngine';
import type { AllParams, EffectParams } from './types';
import Header from './components/Header';
import LibraryManager from './components/LibraryManager';
import WaveformDisplay from './components/WaveformDisplay';
import ControlPanel from './components/ControlPanel';
import Sequencer from './components/Sequencer';
import SystemMonitor from './components/SystemMonitor';
import CollapsibleSection from './components/CollapsibleSection';
import ProMenuBar from './components/ProMenuBar';
import SaveDialog from './components/SaveDialog';
import FeedbackDialog from './components/FeedbackDialog';
import ContactDialog from './components/ContactDialog';
import Transport from './components/Transport';
import Tooltip from './components/Tooltip';
import VideoTutorialDialog from './components/VideoTutorialDialog';
import DemoPromptDialog from './components/DemoPromptDialog';
import { supabase } from './utils/supabaseClient';

declare const Tone: any;

const App: React.FC = () => {
    const {
        isReady,
        isPlaying,
        isLoading,
        audioBuffer,
        params,
        sequencer,
        slices,
        selectedSliceIndex,
        sampleName,
        currentSampleId,
        currentPresetId,
        midiConfig,
        midiInputs,
        midiOutputs,
        midiDebug,
        loadAudioFile,
        loadConstructionKit,
        togglePlay,
        updateParams,
        scrub,
        updateSequencerStep,
        setSequencerMode,
        setSequencerStepCount,
        setSequencerEditMode,
        setSequencerPlaybackBehavior,
        randomizePattern,
        generateAiBeat,
        generateAiPattern,
        selectSlice,
        toggleSliceActive,
        updateSlice,
        sliceRegion,
        autoSlice,
        exportPreset,
        importPreset,
        loadPreset,
        getAudioWav,
        getSourceAudio,
        togglePreviewOriginal,
        isPreviewPlaying,
        playSliceRaw,
        toggleSliceLoop,
        sliceLoopState,
        setTransportBpm,
        toggleLoop,
        stepForward,
        stepBackward,
        updateMidiConfig,
        metronomeConfig,
        updateMetronomeConfig,
        loadImpulseResponse
    } = useAudioEngine();
    
    const [isProMode, setIsProMode] = useState(true);
    const [showMonitor, setShowMonitor] = useState(false);
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
    const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
    const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
    const [isVideoDialogOpen, setIsVideoDialogOpen] = useState(false);
    const [isPromptOpen, setIsPromptOpen] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [projectName, setProjectName] = useState("My Groove");

    // Hidden input for File Menu triggers
    const presetInputRef = useRef<HTMLInputElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);

    // Auth State Management
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

    // Startup: Check Quickstart Video Preference with Delay
    useEffect(() => {
        const timer = setTimeout(() => {
            const hasSeen = localStorage.getItem('beat_slicer_quickstart_seen_v3');
            console.log('Checking demo prompt, hasSeen:', hasSeen);
            if (hasSeen !== 'true') {
                console.log('Opening prompt');
                setIsPromptOpen(true);
            } else {
                console.log('Prompt skipped, already seen');
            }
        }, 1500); // 1.5s delay to ensure app is settled

        return () => clearTimeout(timer);
    }, []);

    // Global Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if focus is on an input or textarea
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
                return;
            }

            if (e.code === 'Space') {
                e.preventDefault(); // Prevent scrolling
                if (audioBuffer && !isLoading) {
                    togglePlay();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePlay, audioBuffer, isLoading]);

    const handleParamChange = <K extends keyof AllParams>(key: K, value: AllParams[K]) => {
      updateParams({ [key]: value } as Partial<AllParams>);
    };

    const handleEffectParamChange = <E extends keyof EffectParams, P extends keyof AllParams[E]>(
      effect: E,
      param: P,
      value: AllParams[E][P]
    ) => {
      const currentEffectParams = params[effect] || {} as any;
      const newEffectParams = { ...currentEffectParams, [param]: value };
      updateParams({ [effect]: newEffectParams } as Partial<AllParams>);
    };

    const handleDemoLoad = (url: string, name: string) => {
        loadAudioFile(url, false, name);
    };

    // Helper functions for Menu Bar to trigger hidden inputs or actions
    const triggerImportPreset = () => presetInputRef.current?.click();

    // Reusable FX Rack Component for flexible placement
    const renderFxRack = () => (
        <div className="bg-[#12161d] rounded-xl border border-white/10 p-1 shadow-xl">
            <div className="p-2 border-b border-white/5 mb-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-widest">FX Rack</h3>
            </div>
            <div className="pr-1">
                <ControlPanel
                    params={params}
                    onParamChange={handleParamChange}
                    onEffectParamChange={handleEffectParamChange}
                    disabled={!audioBuffer || isLoading}
                    generateAiBeat={generateAiBeat}
                    generateAiPattern={generateAiPattern}
                    slices={slices}
                    selectedSliceIndex={selectedSliceIndex}
                    onSliceUpdate={updateSlice}
                    onPlaySlice={playSliceRaw}
                    onLoopSlice={toggleSliceLoop}
                    sliceLoopState={sliceLoopState}
                    audioBuffer={audioBuffer}
                    isProMode={true}
                    visibleSections={['effects']}
                    effectsLayout="vertical"
                    onLoadImpulseResponse={loadImpulseResponse}
                />
            </div>
        </div>
    );

    return (
        <div className={`min-h-screen bg-deep-space font-sans flex flex-col items-center transition-colors duration-500 ${isProMode ? '' : 'p-2 sm:p-4 lg:p-6'}`}>
             
            {/* Hidden Inputs for Menu Bar Triggers */}
            <input type="file" accept=".json" ref={presetInputRef} onChange={async (e) => { if(e.target.files?.[0]) { const txt = await e.target.files[0].text(); importPreset(txt); } e.target.value=''; }} className="hidden" />
            <input type="file" accept="audio/*" ref={audioInputRef} onChange={(e) => { if(e.target.files?.[0]) loadAudioFile(e.target.files[0]); e.target.value=''; }} className="hidden" />

            {/* Dialogs */}
            <SaveDialog 
                isOpen={isSaveDialogOpen}
                onClose={() => setIsSaveDialogOpen(false)}
                user={user}
                sampleName={sampleName}
                params={params}
                sequencer={sequencer}
                slices={slices}
                currentSampleId={currentSampleId}
                currentPresetId={currentPresetId}
                getAudioBlob={getSourceAudio}
            />

            <FeedbackDialog
                isOpen={isFeedbackDialogOpen}
                onClose={() => setIsFeedbackDialogOpen(false)}
                user={user}
            />

            <ContactDialog
                isOpen={isContactDialogOpen}
                onClose={() => setIsContactDialogOpen(false)}
            />

            <VideoTutorialDialog
                isOpen={isVideoDialogOpen}
                onClose={() => setIsVideoDialogOpen(false)}
            />

            <DemoPromptDialog
                isOpen={isPromptOpen}
                onWatchDemo={() => { setIsPromptOpen(false); setIsVideoDialogOpen(true); }}
                onSkip={() => { setIsPromptOpen(false); localStorage.setItem('beat_slicer_quickstart_seen_v3', 'true'); }}
            />

            {/* Global Library Manager Modal */}
            <LibraryManager 
                isOpen={isLibraryOpen}
                onClose={() => setIsLibraryOpen(false)}
                onFileLoad={loadAudioFile}
                onKitLoad={loadConstructionKit}
                onDemoLoad={handleDemoLoad}
                onExport={exportPreset}
                onImport={importPreset}
                onLoadPreset={loadPreset}
                getAudioWav={getAudioWav}
                isLoading={isLoading}
                sampleName={sampleName}
                user={user}
            />

            {/* PRO MODE MENU BAR */}
            {isProMode && (
                <ProMenuBar 
                    projectName={projectName}
                    setProjectName={setProjectName}
                    onOpenLibrary={() => setIsLibraryOpen(true)}
                    onImportPreset={triggerImportPreset}
                    onSavePreset={exportPreset}
                    onSaveToCloud={() => setIsSaveDialogOpen(true)}
                    getAudioWav={getAudioWav}
                    onExportWav={() => { /* Handled in ProMenuBar via getAudioWav */ }}
                    onRandomize={randomizePattern}
                    onClearPattern={() => updateSequencerStep(0, { active: false }) /* Placeholder for clear all */}
                    onAutoSlice={autoSlice}
                    onGenerateBeat={(style) => generateAiBeat(style === 'house' ? 0.2 : style === 'break' ? 0.5 : 0.9)}
                    onToggleMode={() => setIsProMode(false)}
                    onShowMonitor={() => setShowMonitor(true)}
                    user={user}
                    sampleName={sampleName}
                    onReportIssue={() => setIsFeedbackDialogOpen(true)}
                    onOpenVideo={() => setIsVideoDialogOpen(true)}
                    onOpenContact={() => setIsContactDialogOpen(true)}
                />
            )}

            <div className={`w-full max-w-[1920px] mx-auto flex flex-col gap-4 ${isProMode ? 'mt-12 px-4 pb-4' : ''}`}>
                {!isProMode && (
                    <Header
                        isProMode={isProMode}
                        onToggleMode={setIsProMode}
                        onShowMonitor={() => setShowMonitor(true)}
                        user={user}
                        onOpenVideo={() => setIsVideoDialogOpen(true)}
                        onOpenContact={() => setIsContactDialogOpen(true)}
                    />
                )}
                
                <SystemMonitor 
                    isOpen={showMonitor} 
                    onClose={() => setShowMonitor(false)}
                    stats={{
                        session: { isPlaying, isReady, isLoading, mode: isProMode ? 'Pro' : 'Simple', sampleName, user: user ? user.email : 'Guest' },
                        audio: { bpm: params.bpm, duration: audioBuffer?.duration || 0, sliceCount: slices.length, selectedSlice: selectedSliceIndex },
                        engine: { grainSize: params.grainSize, overlap: params.overlap, playbackRate: params.playbackRate },
                        sequencer: { stepCount: sequencer.stepCount, mode: sequencer.mode, activeSteps: sequencer.steps.filter(s => s.active).length },
                        midi: { 
                            enabled: midiConfig.enabled, 
                            inputs: midiInputs.length, 
                            outputs: midiOutputs.length,
                            sendClock: midiConfig.sendClock,
                            // Pass refs directly so SystemMonitor can poll them
                            clockSent: midiDebug.clockCount,
                            log: midiDebug.log,
                            clockDeltas: midiDebug.clockDeltas
                        }
                    }}
                />

                {!isReady ? (
                    <div className="flex justify-center items-center h-96 bg-nebula-blue/30 rounded-xl">
                        <p className="text-xl animate-pulse text-hyper-cyan">Initializing Audio Engine...</p>
                    </div>
                ) : (
                    <>
                        {isProMode ? (
                            // --- PRO MODE LAYOUT ---
                            <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-6 items-start">
                                {/* LEFT COLUMN */}
                                <div className="flex flex-col gap-4 w-full">
                                    <Transport 
                                        isPlaying={isPlaying}
                                        isLooping={sequencer.isLooping}
                                        bpm={params.bpm}
                                        currentStep={sequencer.currentStep}
                                        onTogglePlay={togglePlay}
                                        onToggleLoop={toggleLoop}
                                        onStepForward={stepForward}
                                        onStepBackward={stepBackward}
                                        onBpmChange={setTransportBpm}
                                        disabled={!audioBuffer || isLoading}
                                        midiConfig={midiConfig}
                                        midiInputs={midiInputs}
                                        midiOutputs={midiOutputs}
                                        onMidiConfigChange={updateMidiConfig}
                                        metronomeConfig={metronomeConfig}
                                        onMetronomeConfigChange={updateMetronomeConfig}
                                    />
                                    <div className="hidden lg:block">
                                        {renderFxRack()}
                                    </div>
                                </div>

                                {/* RIGHT COLUMN */}
                                <div className="flex flex-col gap-6 min-w-0 w-full">
                                   <div className="w-full">
                                       <Sequencer 
                                            sequencer={sequencer}
                                            onStepChange={updateSequencerStep}
                                            onModeChange={setSequencerMode}
                                            onStepCountChange={setSequencerStepCount}
                                            onRandomize={randomizePattern}
                                            onEditModeToggle={setSequencerEditMode}
                                            onPlaybackBehaviorChange={setSequencerPlaybackBehavior}
                                            disabled={!audioBuffer || isLoading}
                                            selectedSliceIndex={selectedSliceIndex}
                                            isProMode={true}
                                            slices={slices}
                                       />
                                   </div>

                                   <div className="w-full">
                                       <WaveformDisplay 
                                            audioBuffer={audioBuffer} 
                                            onScrub={scrub} 
                                            isPlaying={isPlaying} 
                                            playerRef={null} 
                                            slices={slices} 
                                            sequencer={sequencer}
                                            selectedSliceIndex={selectedSliceIndex}
                                            onSliceSelect={selectSlice}
                                            onSliceToggle={toggleSliceActive}
                                            onRegionSlice={sliceRegion}
                                            onAutoSlice={autoSlice}
                                            onPlaySlice={playSliceRaw}
                                            onSliceTypeChange={(index, type) => updateSlice(index, { type })}
                                            onPreviewToggle={togglePreviewOriginal}
                                            isPreviewing={isPreviewPlaying}
                                            isProMode={true}
                                            onUploadClick={() => audioInputRef.current?.click()}
                                            onOpenLibrary={() => setIsLibraryOpen(true)}
                                       />
                                   </div>
                                    
                                   <div className="w-full">
                                      <ControlPanel
                                        params={params}
                                        onParamChange={handleParamChange}
                                        onEffectParamChange={handleEffectParamChange}
                                        disabled={!audioBuffer || isLoading}
                                        generateAiBeat={generateAiBeat}
                                        generateAiPattern={generateAiPattern}
                                        slices={slices}
                                        selectedSliceIndex={selectedSliceIndex}
                                        onSliceUpdate={updateSlice}
                                        onPlaySlice={playSliceRaw}
                                        onLoopSlice={toggleSliceLoop}
                                        sliceLoopState={sliceLoopState}
                                        audioBuffer={audioBuffer}
                                        isProMode={true}
                                        visibleSections={['slices', 'pattern', 'engine']}
                                        onLoadImpulseResponse={loadImpulseResponse}
                                      />
                                   </div>

                                   {/* Effects Rack (MOBILE LOCATION) */}
                                   <div className="block lg:hidden w-full">
                                        {renderFxRack()}
                                   </div>
                                </div>
                            </div>
                        ) : (
                            // --- SIMPLE MODE LAYOUT ---
                            <div className="w-full space-y-4">
                                {/* Transport Bar */}
                                <div className="w-full bg-[#12161d] rounded-2xl border border-white/5 shadow-2xl flex flex-row items-center p-1.5 h-20 gap-2 relative overflow-hidden group">
                                     <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-hyper-cyan via-purple-500 to-plasma-pink opacity-50"></div>
                                     
                                     <div className="flex-none w-1/3 sm:w-auto min-w-[150px] pl-1 sm:pl-2 h-full flex items-center">
                                         {/* Simple Mode Library Trigger Widget */}
                                         <div className="flex items-center gap-3 h-full w-full">
                                             <div 
                                                onClick={() => audioInputRef.current?.click()}
                                                className="flex items-center gap-3 min-w-0 cursor-pointer hover:bg-white/5 p-1 rounded-lg transition-colors group/load"
                                            >
                                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-hyper-cyan to-blue-600 flex items-center justify-center text-deep-space font-bold shadow-[0_0_10px_rgba(0,246,255,0.3)] shrink-0 group-hover/load:scale-105 transition-transform">
                                                    📂
                                                </div>
                                                <div className="flex flex-col min-w-0 justify-center">
                                                    <div className="text-white font-bold text-lg outline-none placeholder-white/20 w-32 md:w-48 truncate">My Groove</div>
                                                    <div className="text-[10px] text-star-dust truncate flex items-center gap-1.5">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${audioBuffer ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                                                        <span className="opacity-70">Sample:</span>
                                                        <span className="text-hyper-cyan truncate max-w-[100px]">{sampleName || 'None'}</span>
                                                    </div>
                                                </div>
                                             </div>
                                             <div className="h-8 w-px bg-white/10 mx-1 hidden sm:block"></div>
                                             <Tooltip text="Open Database Manager">
                                                 <button 
                                                    onClick={() => setIsLibraryOpen(true)}
                                                    className="flex items-center gap-2 px-3 h-10 bg-white/5 hover:bg-white/10 rounded-lg text-white border border-white/5 transition-colors group shrink-0"
                                                >
                                                    <span className="group-hover:scale-110 block transition-transform text-lg">📚</span>
                                                    <span className="text-xs font-bold tracking-wide text-star-dust group-hover:text-white hidden lg:inline">LOAD AUDIO</span>
                                                 </button>
                                             </Tooltip>
                                        </div>
                                     </div>

                                     <div className="flex-1 flex items-center justify-center pr-1 sm:pr-2 h-full py-1">
                                          <button
                                                onClick={togglePlay}
                                                disabled={!audioBuffer || isLoading}
                                                className={`
                                                    w-full h-full rounded-xl flex items-center justify-center gap-2 transition-all duration-200 shadow-lg px-6
                                                    ${isPlaying 
                                                        ? 'bg-plasma-pink text-white shadow-[0_0_20px_rgba(255,0,170,0.5)] hover:bg-red-500' 
                                                        : 'bg-hyper-cyan text-deep-space shadow-[0_0_15px_rgba(0,246,255,0.3)] hover:bg-cyan-300 hover:scale-[1.01]'
                                                    }
                                                    disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed
                                                `}
                                            >
                                                <span className="text-2xl sm:text-3xl filter drop-shadow-sm">{isPlaying ? '⏹' : '▶'}</span>
                                                <span className="text-base sm:text-xl font-black tracking-widest uppercase hidden sm:inline">
                                                    {isLoading ? '...' : (isPlaying ? 'STOP' : 'PLAY')}
                                                </span>
                                            </button>
                                     </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 w-full">
                                    <div className="lg:col-span-1 order-2 lg:order-1 h-full">
                                        <CollapsibleSection title="Sound Macros" icon="🎛️" className="h-full">
                                            <ControlPanel
                                                params={params}
                                                onParamChange={handleParamChange}
                                                onEffectParamChange={handleEffectParamChange}
                                                disabled={!audioBuffer || isLoading}
                                                generateAiBeat={generateAiBeat}
                                                generateAiPattern={generateAiPattern}
                                                slices={slices}
                                                selectedSliceIndex={selectedSliceIndex}
                                                onSliceUpdate={updateSlice}
                                                onPlaySlice={playSliceRaw}
                                                onLoopSlice={toggleSliceLoop}
                                                sliceLoopState={sliceLoopState}
                                                audioBuffer={audioBuffer}
                                                isProMode={false}
                                                simpleView="macros"
                                                onLoadImpulseResponse={loadImpulseResponse}
                                            />
                                        </CollapsibleSection>
                                    </div>

                                    <div className="lg:col-span-3 order-1 lg:order-2 flex flex-col gap-4">
                                        <CollapsibleSection title="Waveform" icon="🌊">
                                            <WaveformDisplay 
                                                audioBuffer={audioBuffer} 
                                                onScrub={scrub} 
                                                isPlaying={isPlaying} 
                                                playerRef={null} 
                                                slices={slices} 
                                                sequencer={sequencer}
                                                selectedSliceIndex={selectedSliceIndex}
                                                onSliceSelect={selectSlice}
                                                onSliceToggle={toggleSliceActive}
                                                onRegionSlice={sliceRegion}
                                                onAutoSlice={autoSlice}
                                                onPlaySlice={playSliceRaw}
                                                onSliceTypeChange={(index, type) => updateSlice(index, { type })}
                                                onPreviewToggle={togglePreviewOriginal}
                                                isPreviewing={isPreviewPlaying}
                                                isProMode={false}
                                                onUploadClick={() => audioInputRef.current?.click()}
                                                onOpenLibrary={() => setIsLibraryOpen(true)}
                                            />
                                        </CollapsibleSection>

                                        <CollapsibleSection title="Magic Pattern Gen" icon="✨">
                                            <ControlPanel
                                                params={params}
                                                onParamChange={handleParamChange}
                                                onEffectParamChange={handleEffectParamChange}
                                                disabled={!audioBuffer || isLoading}
                                                generateAiBeat={generateAiBeat}
                                                generateAiPattern={generateAiPattern}
                                                slices={slices}
                                                selectedSliceIndex={selectedSliceIndex}
                                                onSliceUpdate={updateSlice}
                                                onPlaySlice={playSliceRaw}
                                                onLoopSlice={toggleSliceLoop}
                                                sliceLoopState={sliceLoopState}
                                                audioBuffer={audioBuffer}
                                                isProMode={false}
                                                simpleView="magic"
                                                onLoadImpulseResponse={loadImpulseResponse}
                                            />
                                        </CollapsibleSection>

                                        <CollapsibleSection title="Sequencer" icon="🎹">
                                            <Sequencer 
                                                sequencer={sequencer}
                                                onStepChange={updateSequencerStep}
                                                onModeChange={setSequencerMode}
                                                onStepCountChange={setSequencerStepCount}
                                                onRandomize={randomizePattern}
                                                onEditModeToggle={setSequencerEditMode}
                                                disabled={!audioBuffer || isLoading}
                                                selectedSliceIndex={selectedSliceIndex}
                                                isProMode={false}
                                                slices={slices} 
                                            />
                                        </CollapsibleSection>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default App;
