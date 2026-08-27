class GlitchProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // 4 seconds stereo buffer at 48kHz (enough for 1 bar at 60bpm)
        this.bufferSize = 192000; 
        this.bufferL = new Float32Array(this.bufferSize);
        this.bufferR = new Float32Array(this.bufferSize);
        this.writeIndex = 0;
        
        // Effect State
        this.isPlayingEffect = false;
        this.anchorIndex = 0; // The write pointer position when effect started
        this.readIndex = 0;
        this.stutterPhase = 0; // 0 to length
        this.tapeSpeed = 1.0;
    }
  
    static get parameterDescriptors() {
        return [
            { name: 'active', defaultValue: 0 }, // 0: Bypass, 1: Active
            { name: 'mode', defaultValue: 0 },   // 0: Stutter, 1: Reverse, 2: TapeStop
            { name: 'length', defaultValue: 22050 }, // Length in samples
        ];
    }
  
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        
        // If no input, keep node alive but do nothing
        if (!input || input.length === 0) return true;
        
        const inputL = input[0];
        // Handle mono inputs by duplicating to stereo if needed
        const inputR = input[1] || input[0]; 
        
        const outputL = output[0];
        const outputR = output[1] || output[0]; // Fallback if output is mono
        
        // We take the first sample's parameter value for the block (control rate trigger)
        const active = parameters.active[0] > 0.5;
        const mode = Math.floor(parameters.mode[0]);
        const length = parameters.length[0];
        
        const frameCount = inputL.length;
  
        for (let i = 0; i < frameCount; i++) {
            // 1. Always record input to circular buffer
            this.bufferL[this.writeIndex] = inputL[i];
            this.bufferR[this.writeIndex] = inputR[i];
            
            // 2. Output Logic
            if (active) {
                // Initialize effect state on first active frame
                if (!this.isPlayingEffect) {
                    this.isPlayingEffect = true;
                    this.anchorIndex = this.writeIndex;
                    this.stutterPhase = 0;
                    this.tapeSpeed = 1.0;
                    
                    if (mode === 1) { // Reverse
                        // Start reading exactly where we are
                        this.readIndex = this.writeIndex;
                    } else if (mode === 2) { // Tape Stop
                        this.readIndex = this.writeIndex;
                    }
                }
  
                // --- EFFECT DSP ---
                let sampleL = 0;
                let sampleR = 0;

                // Mode 0: STUTTER (Loop the last 'length' samples)
                if (mode === 0) {
                    // We want to loop the segment [Anchor - Length] to [Anchor]
                    // We use a phase counter 0..length
                    this.stutterPhase++;
                    if (this.stutterPhase >= length) this.stutterPhase = 0;
                    
                    let ptr = this.anchorIndex - length + this.stutterPhase;
                    
                    // Handle circular wrapping
                    while (ptr < 0) ptr += this.bufferSize;
                    while (ptr >= this.bufferSize) ptr -= this.bufferSize;
                    
                    const idx = Math.floor(ptr);
                    sampleL = this.bufferL[idx];
                    sampleR = this.bufferR[idx];
                }
                
                // Mode 1: REVERSE (Play buffer backwards from anchor)
                else if (mode === 1) {
                    this.readIndex -= 1; 
                    if (this.readIndex < 0) this.readIndex += this.bufferSize;
                    
                    const idx = Math.floor(this.readIndex);
                    sampleL = this.bufferL[idx];
                    sampleR = this.bufferR[idx];
                }
                
                // Mode 2: TAPE STOP (Slow down read pointer)
                else if (mode === 2) {
                    this.tapeSpeed *= 0.9992; // Decay speed
                    if (this.tapeSpeed < 0.001) this.tapeSpeed = 0;
                    
                    this.readIndex += this.tapeSpeed;
                    // Keep readIndex constrained to buffer for safety, 
                    // though realistically it stays near recent writes
                    while (this.readIndex >= this.bufferSize) this.readIndex -= this.bufferSize;
                    
                    const idx = Math.floor(this.readIndex);
                    sampleL = this.bufferL[idx];
                    sampleR = this.bufferR[idx];
                }

                outputL[i] = sampleL;
                if (outputR) outputR[i] = sampleR;

            } else {
                // BYPASS
                this.isPlayingEffect = false;
                outputL[i] = inputL[i];
                if (outputR) outputR[i] = inputR[i];
            }
  
            // Advance Write Pointer
            this.writeIndex++;
            if (this.writeIndex >= this.bufferSize) this.writeIndex = 0;
        }
  
        return true;
    }
}
  
registerProcessor('glitch-processor', GlitchProcessor);