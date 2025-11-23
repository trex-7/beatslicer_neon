import React from 'react';
import { useAudioEngine } from './hooks/useAudioEngine';
import type { AllParams, EffectParams } from './types';
import Header from './components/Header';
import FileLoader from './components/FileLoader';
import WaveformDisplay from './components/WaveformDisplay';
import ControlPanel from './components/ControlPanel';
import Sequencer from './components/Sequencer';
import Tooltip from './components/Tooltip';
import PresetManager from './components/PresetManager';

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
        loadAudioFile, 
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
        togglePreviewOriginal,
        isPreviewPlaying,
        playSliceRaw,
        toggleSliceLoop,
        sliceLoopState
    } = useAudioEngine();
    
    // Updated default URL to a reliable Tone.js sample
    const defaultSampleUrl = 'https://tonejs.github.io/audio/loop/FWDL.mp3';

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

    return (
        <div className="min-h-screen bg-deep-space font-sans flex flex-col items-center p-2 sm:p-4 lg:p-6">
            <div className="w-full max-w-[1920px] mx-auto space-y-4">
                <Header />
                
                {!isReady ? (
                    <div className="flex justify-center items-center h-96 bg-nebula-blue/30 rounded-xl">
                        <p className="text-xl animate-pulse text-hyper-cyan">Initializing Audio Engine...</p>
                    </div>
                ) : (
                    <>
                        {/* Top Utility Bar */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center bg-nebula-blue/20 p-2 rounded-xl border border-white/5">
                            <div className="lg:col-span-4">
                                <FileLoader
                                    onFileLoad={loadAudioFile}
                                    onDefaultLoad={() => loadAudioFile(defaultSampleUrl)}
                                    isLoading={isLoading}
                                    onPreviewToggle={togglePreviewOriginal}
                                    isPreviewing={isPreviewPlaying}
                                />
                            </div>
                            <div className="lg:col-span-4 flex justify-center">
                                <Tooltip text="Start or stop the sequencer" position="bottom">
                                    <button
                                        onClick={togglePlay}
                                        disabled={!audioBuffer || isLoading}
                                        className={`w-full max-w-[200px] py-2 text-lg font-bold rounded-full transition-all duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100
                                            ${isPlaying ? 'bg-plasma-pink text-white shadow-lg shadow-plasma-pink/30' : 'bg-hyper-cyan text-deep-space shadow-lg shadow-hyper-cyan/30'}`}
                                    >
                                        {isLoading ? 'LOADING...' : (isPlaying ? 'STOP' : 'PLAY')}
                                    </button>
                                </Tooltip>
                            </div>
                            <div className="lg:col-span-4">
                                <PresetManager 
                                    onExport={exportPreset}
                                    onImport={importPreset}
                                    disabled={!audioBuffer || isLoading}
                                />
                            </div>
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
                          />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default App;