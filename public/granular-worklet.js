

class GranularEngine extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferL = null;
        this.bufferR = null;
        this.sampleRate = 44100;

        // Transport
        this.currentSample = 0;
        this.isPlaying = false;
        this.bpm = 120;
        this.stepCount = 16;
        this.currentStep = -1;
        this.nextStepTime = 0;
        
        // Data
        this.steps = [];
        this.slices = [];
        
        // Voices (Grains)
        this.grains = [];
        // Max concurrent grains to prevent CPU overload
        this.maxGrains = 64; 

        // Params
        this.params = {
            grainSize: 0.1,
            overlap: 0.05,
            playbackRate: 1.0,
            detune: 0,
            volume: 1.0,
            glitch: { chaos: 0, allowReverse: false, allowOctaveJump: false, pitchShift: true }
        };

        // Communication
        this.port.onmessage = (e) => this.handleMessage(e.data);
    }

    handleMessage(data) {
        if (data.type === 'load') {
            this.bufferL = data.bufferL;
            this.bufferR = data.bufferR;
            this.sampleRate = data.sampleRate || 44100;
        } else if (data.type === 'play') {
            this.isPlaying = data.value;
            if (this.isPlaying) {
                // Reset logic if needed, but keeping phase allows pause/continue feel
            } else {
                this.grains = []; // Kill grains on stop
            }
        } else if (data.type === 'sequencer') {
            this.steps = data.steps;
            this.stepCount = data.stepCount;
            this.bpm = data.bpm;
        } else if (data.type === 'slices') {
            this.slices = data.slices;
        } else if (data.type === 'params') {
            // Merge params
            if (data.params) {
                this.params = { ...this.params, ...data.params };
                if (data.params.glitch) {
                    this.params.glitch = { ...this.params.glitch, ...data.params.glitch };
                }
            }
        }
    }

    spawnGrain(sliceIndex, velocity = 1.0, ratchetCount = 1, ratchetIndex = 0) {
        if (!this.bufferL || !this.slices[sliceIndex]) return;

        const slice = this.slices[sliceIndex];
        if (!slice.isActive) return;

        const grain = {
            active: true,
            position: slice.offset * this.sampleRate, 
            startPosition: slice.offset * this.sampleRate,
            duration: 0, 
            age: 0, 
            speed: this.params.playbackRate,
            amp: velocity * this.params.volume * (slice.level || 1.0),
            attack: 0,
            release: 0,
            isReverse: slice.reverse || false
        };

        // --- Glitch / Chaos Logic (Audio Thread) ---
        const g = this.params.glitch;
        if (g && g.chaos > 0 && Math.random() < g.chaos) {
             if (g.allowReverse && Math.random() < 0.4) grain.isReverse = !grain.isReverse;
             
             if (g.allowOctaveJump && Math.random() < 0.5) {
                 // Random Octave (+/- 1)
                 grain.speed *= (Math.random() > 0.5 ? 2.0 : 0.5);
             }
        }
        
        // Detune calculation: 2^(cents/1200)
        const detuneMult = Math.pow(2, this.params.detune / 1200);
        grain.speed *= detuneMult;

        // Granular Mode vs Slice Mode Heuristic
        if (this.params.grainSize < 0.15) {
             // Granular Texture Mode
             grain.duration = this.params.grainSize * this.sampleRate;
        } else {
             // Slice Playback Mode
             grain.duration = slice.duration * this.sampleRate;
             if (ratchetCount > 1) {
                 grain.duration /= ratchetCount;
             }
        }
        
        // Enveloping - Prioritize Slice Override, Fallback to Global
        const effectiveAttack = (typeof slice.fadeIn === 'number') ? slice.fadeIn : this.params.attack;
        const effectiveRelease = (typeof slice.fadeOut === 'number') ? slice.fadeOut : this.params.release;

        const attackS = Math.max(0.001, effectiveAttack || 0.002);
        const releaseS = Math.max(0.001, effectiveRelease || 0.005);
        
        grain.attack = attackS * this.sampleRate;
        grain.release = releaseS * this.sampleRate;
        
        // Safety: Ensure duration covers envelope
        if (grain.duration < grain.attack + grain.release) {
            grain.duration = grain.attack + grain.release + 500;
        }

        // Voice Allocation (Simple Round Robin / Fill Empty)
        // Check for empty slot
        const emptyIdx = this.grains.findIndex(g => !g.active);
        if (emptyIdx >= 0) {
            this.grains[emptyIdx] = grain;
        } else if (this.grains.length < this.maxGrains) {
            this.grains.push(grain);
        } else {
            // Voice Stealing: Steal oldest (index 0 usually oldest in push model if we shifted, but we don't shift)
            // Just overwrite first slot for simplicity
            this.grains[0] = grain; 
        }
    }

    process(inputs, outputs, parameters) {
        const outputL = outputs[0][0];
        const outputR = outputs[0][1];
        
        if (!outputL) return true;
        
        const bufferSize = outputL.length;

        for (let i = 0; i < bufferSize; i++) {
            // --- SEQUENCER CLOCK ---
            if (this.isPlaying) {
                if (this.currentSample >= this.nextStepTime) {
                    // Trigger Step
                    this.currentStep = (this.currentStep + 1) % this.stepCount;
                    
                    // Calc next step time
                    // BPM / 60 = Beats/Sec. 1 Step = 1/4 Beat (16th note).
                    const samplesPerBeat = (this.sampleRate * 60) / this.bpm;
                    const samplesPerStep = samplesPerBeat / 4;
                    this.nextStepTime += samplesPerStep;

                    // Send UI Update (Throttled by block size naturally)
                    this.port.postMessage({ type: 'step', value: this.currentStep });

                    // Trigger Logic
                    if (this.steps[this.currentStep]) {
                        const stepData = this.steps[this.currentStep];
                        if (stepData.active) {
                            const repeats = stepData.ratchet || 1;
                            this.spawnGrain(stepData.sliceIndex, 1.0, repeats, 0);
                        }
                    }
                }
                this.currentSample++;
            }

            // --- AUDIO GENERATION ---
            let left = 0;
            let right = 0;

            for (let g = 0; g < this.grains.length; g++) {
                const grain = this.grains[g];
                if (!grain.active) continue;

                if (grain.age >= grain.duration) {
                    grain.active = false;
                    continue;
                }

                // Linear Interpolation
                let pos = grain.position;
                let idx = Math.floor(pos);
                let frac = pos - idx;
                
                // Wrap logic for safety (though normally we play within slice bounds)
                if (idx < 0) idx = 0; // Simple clamp
                
                // Read from Buffer
                if (this.bufferL && idx < this.bufferL.length - 1) {
                    const l1 = this.bufferL[idx];
                    const l2 = this.bufferL[idx + 1];
                    const r1 = this.bufferR ? this.bufferR[idx] : l1;
                    const r2 = this.bufferR ? this.bufferR[idx + 1] : l2;
                    
                    let sampL = l1 + frac * (l2 - l1);
                    let sampR = r1 + frac * (r2 - r1);
                    
                    // Envelope
                    let env = 1.0;
                    if (grain.age < grain.attack) {
                        env = grain.age / grain.attack;
                    } else if (grain.age > grain.duration - grain.release) {
                        env = (grain.duration - grain.age) / grain.release;
                    }
                    
                    left += sampL * env * grain.amp;
                    right += sampR * env * grain.amp;
                }

                // Advance Pointer
                if (grain.isReverse) {
                    grain.position -= grain.speed;
                } else {
                    grain.position += grain.speed;
                }
                
                grain.age++;
            }

            // Soft Clipper to prevent digital clipping
            if (left > 1.0) left = 1.0; else if (left < -1.0) left = -1.0;
            if (right > 1.0) right = 1.0; else if (right < -1.0) right = -1.0;

            outputL[i] = left;
            if (outputR) outputR[i] = right;
        }

        return true;
    }
}

registerProcessor('granular-engine', GranularEngine);
