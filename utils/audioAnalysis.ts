
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
    let lowEnergy = 0;
    let highEnergy = 0;
    let peakAmp = 0;
    
    // Filter Setup
    // 1. Low Pass @ 500Hz (Captures Kick body and Snare fundamental)
    const lpCutoff = 500;
    const dt = 1.0 / sampleRate;
    const lpRc = 1.0 / (lpCutoff * 2 * Math.PI);
    const lpAlpha = dt / (lpRc + dt);

    // 2. High Pass @ 5000Hz (Captures Hi-Hat sizzle and Snare wires)
    const hpCutoff = 5000;
    const hpRc = 1.0 / (hpCutoff * 2 * Math.PI);
    const hpAlpha = hpRc / (hpRc + dt);
    
    // Filter State
    let lpOut = 0;
    let hpOut = 0;
    let hpPrevIn = 0;

    // Initialize with first sample to reduce transient error
    if (startIndex > 0) {
        lpOut = channelData[startIndex - 1];
        hpPrevIn = channelData[startIndex - 1];
    }

    for (let i = 0; i < analysisLength; i++) {
        const sample = channelData[startIndex + i];
        const prevSample = i > 0 ? channelData[startIndex + i - 1] : hpPrevIn;
        
        // 1. Zero Crossing Rate (Noise Proxy)
        if ((sample >= 0 && prevSample < 0) || (sample < 0 && prevSample >= 0)) {
            zeroCrossings++;
        }
        
        // 2. Total RMS Energy & Peak
        const sq = sample * sample;
        totalEnergy += sq;
        if (Math.abs(sample) > peakAmp) peakAmp = Math.abs(sample);

        // 3. Low Frequency Energy (1-pole LPF)
        // y[i] = y[i-1] + α * (x[i] - y[i-1])
        lpOut = lpOut + lpAlpha * (sample - lpOut);
        lowEnergy += lpOut * lpOut;

        // 4. High Frequency Energy (1-pole HPF)
        // y[i] = α * (y[i-1] + x[i] - x[i-1])
        hpOut = hpAlpha * (hpOut + sample - hpPrevIn);
        hpPrevIn = sample;
        highEnergy += hpOut * hpOut;
    }

    // Safety check for silence
    if (totalEnergy < 0.000001) return 'perc';

    const zcr = zeroCrossings / analysisLength;
    const lowRatio = lowEnergy / totalEnergy;
    const highRatio = highEnergy / totalEnergy;
    
    // --- Classification Logic ---

    // 1. KICK: Dominant Low End
    // Kicks have massive energy below 500Hz (> 75%) and very little high freq content.
    if (lowRatio > 0.75) {
        return 'kick';
    }

    // 2. HI-HAT: High Freq + Low Body
    // Hats have very little energy < 500Hz (< 20%).
    // They have significant Highs (> 30%) OR just lots of noise (High ZCR).
    if (lowRatio < 0.20) {
        if (highRatio > 0.30 || zcr > 0.15) {
            return 'hihat';
        }
    }

    // 3. SNARE: "Loud Noise" (Body + Wires)
    // Snares are the middle ground. They have Body (200-500Hz) unlike Hats, 
    // but they also have Noise/Highs (Wires) unlike Kicks/Toms.
    if (lowRatio >= 0.20 && lowRatio <= 0.75) {
        // If it has decent body AND decent noise/highs, it's a snare.
        // Toms usually have body but low ZCR/Highs.
        if (zcr > 0.05 || highRatio > 0.05) {
            return 'snare';
        }
        // Body without noise -> likely a Tom or low Perc
        return 'perc'; 
    }

    // 4. Fallback Cases
    
    // Chunkier Hats (Open Hats) might have more low-mids but still lots of highs
    if (highRatio > 0.4 && zcr > 0.1) {
        return 'hihat';
    }

    // Ambiguous
    return 'perc';
}
