
import type { SliceType } from '../types';

export function classifySlice(buffer: AudioBuffer, start: number, duration: number): SliceType {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    
    const startIndex = Math.floor(start * sampleRate);
    const endIndex = Math.min(channelData.length, Math.floor((start + duration) * sampleRate));
    
    // Analyze a chunk of the slice (up to 100ms) to capture the transient character
    // We don't need the tail for classification usually
    const analysisLength = Math.min(endIndex - startIndex, Math.floor(sampleRate * 0.15));
    
    if (analysisLength <= 0) return 'perc';

    let zeroCrossings = 0;
    let totalEnergy = 0;
    let lowFreqEnergy = 0;
    
    // Simple IIR Low Pass Filter state
    // fc ~ 300Hz
    // alpha ~= 2 * PI * dt * fc ~= 6.28 * (1/44100) * 300 ~= 0.04
    const alpha = 0.05; 
    let lpfOutput = 0;

    for (let i = 0; i < analysisLength; i++) {
        const sample = channelData[startIndex + i];
        const prevSample = i > 0 ? channelData[startIndex + i - 1] : 0;
        
        // ZCR
        if ((sample >= 0 && prevSample < 0) || (sample < 0 && prevSample >= 0)) {
            zeroCrossings++;
        }
        
        // Total Energy
        totalEnergy += sample * sample;
        
        // Low Pass Energy
        lpfOutput += alpha * (sample - lpfOutput);
        lowFreqEnergy += lpfOutput * lpfOutput;
    }

    const zcrRate = zeroCrossings / analysisLength;
    const lowRatio = totalEnergy > 0 ? lowFreqEnergy / totalEnergy : 0;
    
    // Heuristics
    // 1. High Low Frequency Content -> Kick
    if (lowRatio > 0.65) {
        return 'kick';
    }
    
    // 2. High Zero Crossing Rate -> HiHat / Noise
    // Threshold tuned for typical hi-hats
    if (zcrRate > 0.15) {
        return 'hihat';
    }
    
    // 3. Mid-range energy dominance -> Snare
    // Often snares have decent low energy (body) but also high noise (snares)
    // so they fall in between kick and hat in both metrics.
    if (lowRatio > 0.2 && lowRatio < 0.65) {
        return 'snare';
    }

    return 'perc';
}
