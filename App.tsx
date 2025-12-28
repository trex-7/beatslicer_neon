
import React, { useState, useEffect } from 'react';
import { useAudioEngine } from './hooks/useAudioEngine';
import type { AllParams, EffectParams } from './types';
import Header from './components/Header';
import LibraryManager from './components/LibraryManager';
import WaveformDisplay from './components/WaveformDisplay';
import ControlPanel from './components/ControlPanel';
import Sequencer from './components/Sequencer';
import Tooltip from './components/Tooltip';
import SystemMonitor from './components/SystemMonitor';
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
        loadAudioFile,
        loadConstructionKit,
        togglePlay, 
        updateParams, 
        scrub,
        updateSequencerStep,
        setSequencerMode,
        setSequencerStepCount,
        setSequencerEditMode,
        randomizePattern,
        generateAiBeat,
        selectSlice,
        toggleSliceActive,
        updateSlice,
        sliceRegion,
        autoSlice,
        exportPreset,
        importPreset,
        loadPreset,
        getAudioWav,
        togglePreviewOriginal,
        isPreviewPlaying,
        playSliceRaw,
        toggleSliceLoop,
        sliceLoopState
    } = useAudioEngine();
    
    // Default to Simple Mode for new users
    const [isProMode, setIsProMode] = useState(false);
    const [showMonitor, setShowMonitor] = useState(false);
    const [user, setUser] = useState<any>(null);

    // Auth State Management (Lifted from LibraryManager)
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

    return (
        <div className="min-h-screen bg-deep-space font-sans flex flex-col items-center p-2 sm:p-4 lg:p-6 transition-colors duration-500">
            <div className="w-full max-w-[1920px] mx-auto flex flex-col gap-4">
                <Header 
                    isProMode={isProMode} 
                    onToggleMode={setIsProMode} 
                    onShowMonitor={() => setShowMonitor(true)}
                    user={user}
                />
                
                <SystemMonitor 
                    isOpen={showMonitor} 
                    onClose={() => setShowMonitor(false)}
                    stats={{
                        session: {
                            isPlaying,
                            isReady,
                            isLoading,
                            mode: isProMode ? 'Pro' : 'Simple',
                            sampleName,
                            user: user ? user.email : 'Guest'
                        },
                        audio: {
                            bpm: params.bpm,
                            duration: audioBuffer?.duration || 0,
                            sliceCount: slices.length,
                            selectedSlice: selectedSliceIndex,
                        },
                        engine: {
                            grainSize: params.grainSize,
                            overlap: params.overlap,
                            playbackRate: params.playbackRate,
                        },
                        sequencer: {
                            stepCount: sequencer.stepCount,
                            mode: sequencer.mode,
                            activeSteps: sequencer.steps.filter(s => s.active).length
                        }
                    }}
                />

                {!isReady ? (
                    <div className="flex justify-center items-center h-96 bg-nebula-blue/30 rounded-xl">
                        <p className="text-xl animate-pulse text-hyper-cyan">Initializing Audio Engine...</p>
                    </div>
                ) : (
                    <>
                        {/* 
                          TOP SECTION DASHBOARD (Order 0)
                        */}
                        <div className="w-full order-none">
                            {isProMode ? (
                                // PRO MODE: Separated Top Section
                                <>
                                    <LibraryManager 
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
                                    {/* Standalone Play Button */}
                                    <div className="flex justify-center py-2 mt-4">
                                        <Tooltip text="Start or stop the sequencer" position="bottom">
                                            <button
                                                onClick={togglePlay}
                                                disabled={!audioBuffer || isLoading}
                                                className={`
                                                    transition-all duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 shadow-lg
                                                    w-64 py-3 text-xl font-bold rounded-full bg-hyper-cyan text-deep-space shadow-hyper-cyan/40
                                                    ${isPlaying ? 'bg-plasma-pink text-white shadow-plasma-pink/40' : ''}
                                                `}
                                            >
                                                {isLoading ? 'LOADING...' : (isPlaying ? 'STOP' : 'PLAY')}
                                            </button>
                                        </Tooltip>
                                    </div>
                                </>
                            ) : (
                                // SIMPLE MODE: Single Row Transport Bar
                                <div className="w-full bg-[#12161d] rounded-2xl border border-white/5 shadow-2xl flex flex-row items-center p-1.5 h-20 gap-2 relative overflow-hidden group">
                                     {/* Top Accent Line */}
                                     <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-hyper-cyan via-purple-500 to-plasma-pink opacity-50"></div>
                                     
                                     {/* Left: Compact Library Transport */}
                                     <div className="flex-none w-1/3 sm:w-auto min-w-[150px] pl-1 sm:pl-2">
                                         <LibraryManager 
                                            onFileLoad={loadAudioFile}
                                            onKitLoad={loadConstructionKit}
                                            onDemoLoad={handleDemoLoad}
                                            onExport={exportPreset}
                                            onImport={importPreset}
                                            onLoadPreset={loadPreset}
                                            getAudioWav={getAudioWav}
                                            isLoading={isLoading}
                                            sampleName={sampleName}
                                            variant="transport"
                                            className="h-full w-full"
                                            user={user}
                                        />
                                     </div>

                                     {/* Right: Solid Color Play Button (Fills remaining space) */}
                                     <div className="flex-1 flex items-center justify-center pr-1 sm:pr-2 h-full py-1">
                                          <button
                                            onClick={togglePlay}
                                            disabled={!audioBuffer || isLoading}
                                            className={`
                                                w-full h-full rounded-xl flex items-center justify-center gap-2 transition-all duration-200 shadow-lg
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
                            )}
                        </div>

                        {/* Sequencer */}
                        {/* Simple Mode: Order 2. Pro Mode: Order 1. */}
                        <div className={`w-full ${isProMode ? 'order-1' : 'order-2'}`}>
                           <Sequencer 
                                sequencer={sequencer}
                                onStepChange={updateSequencerStep}
                                onModeChange={setSequencerMode}
                                onStepCountChange={setSequencerStepCount}
                                onRandomize={randomizePattern}
                                onEditModeToggle={setSequencerEditMode}
                                disabled={!audioBuffer || isLoading}
                                selectedSliceIndex={selectedSliceIndex}
                                isProMode={isProMode}
                           />
                        </div>

                        {/* Full Width Waveform */}
                        {/* Simple Mode: Order 3. Pro Mode: Order 2. */}
                        <div className={`w-full ${isProMode ? 'order-2' : 'order-3'}`}>
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
                                isProMode={isProMode}
                           />
                        </div>
                        
                        {/* Control Panel (Macros/Magic Gen) */}
                        {/* Simple Mode: Order 1. Pro Mode: Order 3. */}
                        <div className={`w-full ${isProMode ? 'order-3' : 'order-1'}`}>
                          <ControlPanel 
                            params={params} 
                            onParamChange={handleParamChange}
                            onEffectParamChange={handleEffectParamChange}
                            disabled={!audioBuffer || isLoading} 
                            generateAiBeat={generateAiBeat}
                            slices={slices}
                            selectedSliceIndex={selectedSliceIndex}
                            onSliceUpdate={updateSlice}
                            onPlaySlice={playSliceRaw}
                            onLoopSlice={toggleSliceLoop}
                            sliceLoopState={sliceLoopState}
                            audioBuffer={audioBuffer}
                            isProMode={isProMode}
                          />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default App;
