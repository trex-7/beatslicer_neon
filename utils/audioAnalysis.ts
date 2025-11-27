
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
    let peakAmp = 0;
    
    // IIR Low Pass Filter
    // Previous 150Hz was too low to catch Snare body (~200Hz).
    // Moving cutoff to 600Hz allows us to distinguish:
    // - Kicks: Dominant < 600Hz
    // - Snares: Mixed (Body < 600Hz + Wires > 600Hz)
    // - Hats: Dominant > 600Hz
    const cutoff = 600; 
    const dt = 1.0 / sampleRate;
    const rc = 1.0 / (cutoff * 2 * Math.PI);
    const alpha = dt / (rc + dt);
    
    // Initialize filter state with first sample to prevent ramp-up lag
    let lpfOutput = channelData[startIndex] || 0;

    for (let i = 0; i < analysisLength; i++) {
        const sample = channelData[startIndex + i];
        const prevSample = i > 0 ? channelData[startIndex + i - 1] : 0;
        
        // Zero Crossing Rate (High frequency proxy)
        if ((sample >= 0 && prevSample < 0) || (sample < 0 && prevSample >= 0)) {
            zeroCrossings++;
        }
        
        // Total RMS Energy Accumulator
        const sq = sample * sample;
        totalEnergy += sq;
        
        // Peak Amplitude Check
        const abs = Math.abs(sample);
        if (abs > peakAmp) peakAmp = abs;

        // Low Frequency Energy (< 600Hz)
        // Simple 1-pole Low Pass
        lpfOutput += alpha * (sample - lpfOutput);
        lowFreqEnergy += lpfOutput * lpfOutput;
    }

    const zcrRate = zeroCrossings / analysisLength;
    
    // Ratios
    const lowRatio = totalEnergy > 0.00001 ? lowFreqEnergy / totalEnergy : 0;
    
    // --- Classification Logic ---

    // 1. Kick Drum
    // Dominant sub/low-mids (< 600Hz). Almost no high frequency content compared to bass.
    if (lowRatio > 0.85) {
        return 'kick';
    }

    // 2. HiHat / Shaker
    // "Skewed toward upper frequencies"
    // With 600Hz split, Hats have very little low energy.
    // We also expect high ZCR, but the energy ratio is the strongest indicator.
    if (lowRatio < 0.20) {
        return 'hihat';
    }

    // 3. Snare Drum
    // "Broadband noise"
    // Snares sit in the middle. They have body (Low Energy) AND wires (High Energy).
    // So lowRatio should be balanced (0.2 to 0.85).
    // We also check ZCR to distinguish from Toms (which are mid-heavy but low ZCR).
    if (lowRatio >= 0.20 && lowRatio <= 0.85) {
        // Toms usually have ZCR < 0.05. Snares usually > 0.05.
        // Also check peak level - Snares are usually transient heavy.
        if (zcrRate > 0.06) {
            return 'snare';
        }
    }

    // 4. Percussion / Misc (Fallback)
    // Toms, vocal chops, weak transients, or ambiguous sounds
    return 'perc';
}
