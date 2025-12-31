
import type { SliceType } from '../types';

export function classifySlice(buffer: AudioBuffer, start: number, duration: number): SliceType {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    
    const startIndex = Math.floor(start * sampleRate);
    // Analyze mostly the transient attack (first 100ms) or the whole slice if shorter
    const analysisLen = Math.min(Math.floor(duration * sampleRate), Math.floor(sampleRate * 0.12));
    const endIndex = startIndex + analysisLen;

    if (analysisLen < 64) return 'perc';

    // -- Energy Accumulators --
    let totalSq = 0;
    let subSq = 0;
    let midSq = 0;
    let highSq = 0;
    let zeroCrossings = 0;

    // -- Filter Coefficients (1-pole RC) --
    const dt = 1.0 / sampleRate;
    // Helper to calculate LPF alpha: alpha = dt / (RC + dt)
    const calcLpAlpha = (cutoff: number) => {
        const rc = 1.0 / (cutoff * 2 * Math.PI);
        return dt / (rc + dt);
    };

    // 1. SUB Band: LPF @ 150 Hz (Deep bass only)
    const alphaSub = calcLpAlpha(150);
    let subSample = 0;

    // 2. MID Band: BPF ~250 Hz to ~2000 Hz
    // Implemented as HPF @ 250 -> LPF @ 2000
    // HPF Alpha = RC / (RC + dt) = 1 - LPF_Alpha
    const alphaMidHP = 1 - calcLpAlpha(250); 
    const alphaMidLP = calcLpAlpha(2000);
    let midHPSample = 0;
    let midSample = 0;
    let midPrevInput = 0;

    // 3. HIGH Band: HPF @ 5000 Hz (Sizzle / Noise)
    const alphaHigh = 1 - calcLpAlpha(5000);
    let highSample = 0;
    let highPrevInput = 0;

    // Initialize filter states to avoid transient spike at t=0
    if (startIndex > 0) {
        const pre = channelData[startIndex - 1];
        subSample = pre;
        midPrevInput = pre;
        highPrevInput = pre;
    }

    for (let i = 0; i < analysisLen; i++) {
        const raw = channelData[startIndex + i];
        
        // Total RMS
        totalSq += raw * raw;

        // Zero Crossings
        if (i > 0) {
            const prev = channelData[startIndex + i - 1];
            if ((raw >= 0 && prev < 0) || (raw < 0 && prev >= 0)) zeroCrossings++;
        }

        // -- Filter Processing --

        // Sub LPF
        subSample = subSample + alphaSub * (raw - subSample);
        subSq += subSample * subSample;

        // Mid HPF -> LPF
        // y[i] = alpha * (y[i-1] + x[i] - x[i-1])
        midHPSample = alphaMidHP * (midHPSample + raw - midPrevInput);
        midPrevInput = raw;
        // then LPF
        midSample = midSample + alphaMidLP * (midHPSample - midSample);
        midSq += midSample * midSample;

        // High HPF
        highSample = alphaHigh * (highSample + raw - highPrevInput);
        highPrevInput = raw;
        highSq += highSample * highSample;
    }

    // Safety check for silence
    if (totalSq < 0.000001) return 'perc';

    // Ratios relative to total energy
    const subRatio = subSq / totalSq;
    const midRatio = midSq / totalSq;
    const highRatio = highSq / totalSq;
    const zcr = zeroCrossings / analysisLen;

    // --- Classification Logic ---

    // 1. KICK DETECTION
    // Kicks are heavily dominated by sub energy.
    // Deep Kick: > 50% Sub energy
    if (subRatio > 0.50) return 'kick';
    // Punchy Kick: Moderate sub but very little high end
    if (subRatio > 0.35 && highRatio < 0.05) return 'kick';

    // 2. HI-HAT DETECTION
    // Hats are dominated by high frequencies or pure noise (ZCR).
    // Open Hat / Crash: Significant high band energy
    if (highRatio > 0.30) return 'hihat';
    // Closed Hat / Noise burst: High ZCR and low bass
    if (zcr > 0.15 && subRatio < 0.1) return 'hihat';
    // Thin metallic sound
    if (highRatio > 0.15 && midRatio < 0.2 && subRatio < 0.05) return 'hihat';

    // 3. SNARE DETECTION
    // Snares are "Broadband": they have body (Mid) AND snap (High).
    // Standard Snare: Good Mid presence + some Highs
    if (midRatio > 0.25 && highRatio > 0.05) return 'snare';
    // Boxy/Fat Snare: High Mid energy, decent Sub, but not a Kick
    if (midRatio > 0.40 && subRatio < 0.35) return 'snare';
    
    // 4. PERC / TOM DETECTION
    // Toms usually have resonance (Mid) but lack the "wires" (High) of a snare
    if (midRatio > 0.30 && highRatio < 0.05) return 'perc';

    // Fallbacks for ambiguous sounds
    if (subRatio > midRatio && subRatio > highRatio) return 'kick';
    if (highRatio > midRatio) return 'hihat';
    
    // Default
    return 'perc';
}
