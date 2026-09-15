
import React, { useState, useEffect, useRef } from 'react';
import { useAudioEngine } from './hooks/useAudioEngine';
import type { AllParams, EffectParams } from './types';
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
        audioDebug,
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
    
    const [showMonitor, setShowMonitor] = useState(false);
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
    const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
    const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
    const [isVideoDialogOpen, setIsVideoDialogOpen] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [projectName, setProjectName] = useState("My Groove");

    // Hidden input for File Menu triggers
    const presetInputRef = useRef<HTMLInputElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);

    // Auth State Management (Neon Auth & Local Session)
    useEffect(() => {
        const syncUser = () => {
            const stored = localStorage.getItem('neon_auth_user');
            if (stored) {
                try {
                    setUser(JSON.parse(stored));
                } catch {
                    setUser(null);
                }
            } else {
                setUser(null);
            }
        };

        syncUser();
        window.addEventListener('neon_auth_change', syncUser);
        window.addEventListener('storage', syncUser);
        return () => {
            window.removeEventListener('neon_auth_change', syncUser);
            window.removeEventListener('storage', syncUser);
        };
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

    return (
        <div className="min-h-screen bg-deep-space font-sans flex flex-col items-center transition-colors duration-500">
             
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

            {/* PRO MENU BAR */}
            <ProMenuBar 
                projectName={projectName}
                setProjectName={setProjectName}
                onOpenLibrary={() => setIsLibraryOpen(true)}
                onImportPreset={triggerImportPreset}
                onSavePreset={() => exportPreset(projectName)}
                onSaveToCloud={() => setIsSaveDialogOpen(true)}
                getAudioWav={getAudioWav}
                onExportWav={() => { /* Handled in ProMenuBar via getAudioWav */ }}
                onRandomize={randomizePattern}
                onClearPattern={() => sequencer.steps.forEach((_, i) => updateSequencerStep(i, { active: false }))}
                onAutoSlice={autoSlice}
                onGenerateBeat={(style) => generateAiBeat(style === 'house' ? 0.2 : style === 'break' ? 0.5 : 0.9)}
                onShowMonitor={() => setShowMonitor(true)}
                user={user}
                sampleName={sampleName}
                onReportIssue={() => setIsFeedbackDialogOpen(true)}
                onOpenVideo={() => setIsVideoDialogOpen(true)}
                onOpenContact={() => setIsContactDialogOpen(true)}
            />

            <div className="w-full max-w-[1920px] mx-auto flex flex-col gap-4 mt-12 px-4 pb-4">
                <SystemMonitor 
                    isOpen={showMonitor} 
                    onClose={() => setShowMonitor(false)}
                    stats={{
                        session: { isPlaying, isReady, isLoading, mode: 'Pro', sampleName, user: user ? user.email : 'Guest' },
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
                        },
                        audioDebug: audioDebug
                    }}
                />

                {!isReady ? (
                    <div className="flex justify-center items-center h-96 bg-nebula-blue/30 rounded-xl">
                        <p className="text-xl animate-pulse text-hyper-cyan">Initializing Audio Engine...</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Top Pro Transport Bar */}
                        <div className="w-full">
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
                        </div>

                        {/* Waveform Display & Slice Visualizer */}
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

                        {/* Step Sequencer */}
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
                        
                        {/* AI Pattern Studio (Main Feature) & Collapsible Studio Drawers */}
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
                                onLoadImpulseResponse={loadImpulseResponse}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;
