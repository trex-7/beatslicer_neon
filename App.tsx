
import React from 'react';
import { useAudioEngine } from './hooks/useAudioEngine';
import type { AllParams, EffectParams } from './types';
import Header from './components/Header';
import FileLoader from './components/FileLoader';
import WaveformDisplay from './components/WaveformDisplay';
import ControlPanel from './components/ControlPanel';
import Sequencer from './components/Sequencer';

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
        randomizePattern,
        selectSlice,
        djActions
    } = useAudioEngine();
    
    const defaultSampleUrl = 'https://tonejs.github.io/audio/berklee/gong_channel.mp3';

    const handleParamChange = <K extends keyof AllParams>(key: K, value: AllParams[K]) => {
      updateParams({ [key]: value } as Partial<AllParams>);
    };

    const handleEffectParamChange = <E extends keyof EffectParams, P extends keyof AllParams[E]>(
      effect: E,
      param: P,
      value: AllParams[E][P]
    ) => {
      const newEffectParams = { ...params[effect], [param]: value };
      updateParams({ [effect]: newEffectParams } as Partial<AllParams>);
    };

    return (
        <div className="min-h-screen bg-deep-space font-sans flex flex-col items-center p-4 sm:p-6 lg:p-8">
            <div className="w-full max-w-7xl mx-auto">
                <Header />
                <main className="mt-6 bg-nebula-blue/30 rounded-xl shadow-2xl shadow-black/30 ring-1 ring-white/10 p-4 sm:p-6 lg:p-8">
                    {!isReady ? (
                        <div className="flex justify-center items-center h-96">
                            <p className="text-xl animate-pulse">Initializing Audio Engine...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                            <div className="lg:col-span-4 space-y-6">
                                <FileLoader
                                    onFileLoad={loadAudioFile}
                                    onDefaultLoad={() => loadAudioFile(defaultSampleUrl)}
                                    isLoading={isLoading}
                                />
                                <div className="flex justify-center">
                                    <button
                                        onClick={togglePlay}
                                        disabled={!audioBuffer || isLoading}
                                        className={`px-10 py-4 text-xl font-bold rounded-full transition-all duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100
                                            ${isPlaying ? 'bg-plasma-pink text-white shadow-lg shadow-plasma-pink/30' : 'bg-hyper-cyan text-deep-space shadow-lg shadow-hyper-cyan/30'}`}
                                    >
                                        {isLoading ? 'LOADING...' : (isPlaying ? 'STOP' : 'PLAY')}
                                    </button>
                                </div>
                            </div>
                            <div className="lg:col-span-8 space-y-4">
                               <WaveformDisplay 
                                    audioBuffer={audioBuffer} 
                                    onScrub={scrub} 
                                    isPlaying={isPlaying} 
                                    playerRef={null} 
                                    slices={slices}
                                    sequencer={sequencer}
                                    selectedSliceIndex={selectedSliceIndex}
                                    onSliceSelect={selectSlice}
                               />
                               <Sequencer 
                                    sequencer={sequencer}
                                    onStepChange={updateSequencerStep}
                                    onModeChange={setSequencerMode}
                                    onStepCountChange={setSequencerStepCount}
                                    onRandomize={randomizePattern}
                                    disabled={!audioBuffer || isLoading}
                                    selectedSliceIndex={selectedSliceIndex}
                               />
                            </div>
                            
                            <div className="lg:col-span-12">
                              <ControlPanel 
                                params={params} 
                                onParamChange={handleParamChange}
                                onEffectParamChange={handleEffectParamChange}
                                disabled={!audioBuffer || isLoading} 
                                djActions={djActions}
                              />
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default App;
