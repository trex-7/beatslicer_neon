
import React, { useState } from 'react';
import { useAudioEngine } from './hooks/useAudioEngine';
import type { AllParams, EffectParams } from './types';
import Header from './components/Header';
import LibraryManager from './components/LibraryManager';
import WaveformDisplay from './components/WaveformDisplay';
import ControlPanel from './components/ControlPanel';
import Sequencer from './components/Sequencer';
import Tooltip from './components/Tooltip';

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
        djActions,
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
            <div className="w-full max-w-[1920px] mx-auto space-y-4">
                <Header isProMode={isProMode} onToggleMode={setIsProMode} />
                
                {!isReady ? (
                    <div className="flex justify-center items-center h-96 bg-nebula-blue/30 rounded-xl">
                        <p className="text-xl animate-pulse text-hyper-cyan">Initializing Audio Engine...</p>
                    </div>
                ) : (
                    <>
                        {/* Unified Library & IO Manager */}
                        <div className="w-full">
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
                            />
                        </div>

                        {/* BIG PLAY BUTTON */}
                        <div className="flex justify-center py-2">
                            <Tooltip text="Start or stop the sequencer" position="bottom">
                                <button
                                    onClick={togglePlay}
                                    disabled={!audioBuffer || isLoading}
                                    className={`
                                        transition-all duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 shadow-lg
                                        ${isProMode 
                                            ? 'w-64 py-3 text-xl font-bold rounded-full bg-hyper-cyan text-deep-space shadow-hyper-cyan/40' 
                                            : 'w-48 h-48 rounded-full border-4 border-white/10 text-4xl font-black tracking-widest bg-gradient-to-br from-hyper-cyan to-blue-600 text-white shadow-[0_0_50px_rgba(0,246,255,0.3)] hover:shadow-[0_0_80px_rgba(0,246,255,0.6)]'
                                        }
                                        ${isPlaying ? (isProMode ? 'bg-plasma-pink text-white shadow-plasma-pink/40' : 'from-plasma-pink to-red-600 shadow-[0_0_50px_rgba(255,0,170,0.4)] animate-pulse') : ''}
                                    `}
                                >
                                    {isLoading ? 'LOADING...' : (isPlaying ? 'STOP' : 'PLAY')}
                                </button>
                            </Tooltip>
                        </div>

                        {/* Full Width Waveform */}
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
                                isProMode={isProMode}
                           />
                        </div>

                        {/* Sequencer */}
                        <div className="w-full">
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
                        
                        {/* Control Panel */}
                        <div className="w-full">
                          <ControlPanel 
                            params={params} 
                            onParamChange={handleParamChange}
                            onEffectParamChange={handleEffectParamChange}
                            disabled={!audioBuffer || isLoading} 
                            djActions={djActions}
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
