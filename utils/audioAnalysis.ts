
import type { SliceType } from '../types';

export function classifySlice(buffer: AudioBuffer, start: number, duration: number): SliceType {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    
    const startIndex = Math.floor(start * sampleRate);
    const endIndex = Math.min(channelData.length, Math.floor((start + duration) * sampleRate));
    
    // Analyze up to 100ms. Kicks/Snares reveal their character in the first 50-100ms.
    const analysisLength = Math.min(endIndex - startIndex, Math.floor(sampleRate * 0.1));
    
    if (analysisLength <= 0) return 'perc';

    let zeroCrossings = 0;
    let totalEnergy = 0;
    let lowFreqEnergy = 0;
    
    // IIR Low Pass Filter tailored for 150Hz split
    // alpha = 2 * PI * dt * fc 
    // dt = 1/44100, fc = 150Hz
    // alpha ~= 6.28 * 0.0000226 * 150 ~= 0.021
    const alpha = 0.021; 
    
    // Initialize filter state with first sample to prevent ramp-up lag
    let lpfOutput = channelData[startIndex] || 0;

    for (let i = 0; i < analysisLength; i++) {
        const sample = channelData[startIndex + i];
        const prevSample = i > 0 ? channelData[startIndex + i - 1] : 0;
        
        // Zero Crossing Rate (High frequency proxy)
        if ((sample >= 0 && prevSample < 0) || (sample < 0 && prevSample >= 0)) {
            zeroCrossings++;
        }
        
        // Total RMS Energy
        totalEnergy += sample * sample;
        
        // Low Frequency Energy (< 150Hz)
        // Simple 1-pole Low Pass
        lpfOutput += alpha * (sample - lpfOutput);
        lowFreqEnergy += lpfOutput * lpfOutput;
    }

    const zcrRate = zeroCrossings / analysisLength;
    
    // Avoid division by zero for silence
    const lowRatio = totalEnergy > 0.00001 ? lowFreqEnergy / totalEnergy : 0;
    
    // --- Classification Logic ---

    // 1. HiHat / Shaker
    // Characterized by very high frequency content (ZCR) and almost no sub-bass
    if (zcrRate > 0.3 && lowRatio < 0.1) {
        return 'hihat';
    }

    // 2. Kick Drum
    // Characterized by dominant energy below 150Hz.
    // Even "clicky" kicks have the majority of their sustain power in the sub.
    // Threshold set to 0.40 (40% of energy is sub-150Hz)
    if (lowRatio > 0.40) {
        return 'kick';
    }

    // 3. Snare Drum (Fallback)
    // Snares have strong energy (unlike hats) but it's centered around 200-400Hz (body)
    // and > 2kHz (wires). This means 'lowRatio' will be small (< 0.40),
    // but 'totalEnergy' is significant.
    
    return 'snare';
}