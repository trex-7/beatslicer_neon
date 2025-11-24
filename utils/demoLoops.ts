
import type { DemoKit } from '../types';

export interface DemoLoop {
    name: string;
    url: string; // Can be a web URL or a "data:audio/mp3;base64,..." string
}

export const DEMO_LOOPS: DemoLoop[] = [
    { 
        name: "Funky House 124bpm", 
        url: "https://tonejs.github.io/audio/loop/FWDL.mp3" 
    },
    { 
        name: "Liquid DnB 170bpm", 
        url: "https://tonejs.github.io/audio/loop/breakbeat.mp3" 
    },
    { 
        name: "Dubstep Wobble 140bpm", 
        url: "https://tonejs.github.io/audio/loop/2step.mp3" 
    },
    {
        name: "Glitch Perc 100bpm",
        url: "https://tonejs.github.io/audio/loop/perc.mp3"
    }
];

export const DEMO_KITS: DemoKit[] = [
    {
        name: "808 Kit",
        samples: [
            { name: "Kick", url: "https://tonejs.github.io/audio/drum-samples/808/kick.mp3", type: 'kick' },
            { name: "Snare", url: "https://tonejs.github.io/audio/drum-samples/808/snare.mp3", type: 'snare' },
            { name: "Clap", url: "https://tonejs.github.io/audio/drum-samples/808/clap.mp3", type: 'snare' },
            { name: "HiHat Closed", url: "https://tonejs.github.io/audio/drum-samples/808/closed_hh.mp3", type: 'hihat' },
            { name: "HiHat Open", url: "https://tonejs.github.io/audio/drum-samples/808/open_hh.mp3", type: 'hihat' },
            { name: "Tom High", url: "https://tonejs.github.io/audio/drum-samples/808/hightom.mp3", type: 'perc' },
            { name: "Tom Low", url: "https://tonejs.github.io/audio/drum-samples/808/lowtom.mp3", type: 'perc' },
            { name: "Cowbell", url: "https://tonejs.github.io/audio/drum-samples/CR78/cowbell.mp3", type: 'perc' }
        ]
    },
    {
        name: "Acoustic Kit",
        samples: [
            { name: "Kick", url: "https://tonejs.github.io/audio/drum-samples/Salamander/kick.mp3", type: 'kick' },
            { name: "Snare", url: "https://tonejs.github.io/audio/drum-samples/Salamander/snare.mp3", type: 'snare' },
            { name: "HiHat Closed", url: "https://tonejs.github.io/audio/drum-samples/Salamander/hihat.mp3", type: 'hihat' },
            { name: "HiHat Open", url: "https://tonejs.github.io/audio/drum-samples/Salamander/open_hihat.mp3", type: 'hihat' },
            { name: "Tom 1", url: "https://tonejs.github.io/audio/drum-samples/Salamander/tom1.mp3", type: 'perc' },
            { name: "Tom 2", url: "https://tonejs.github.io/audio/drum-samples/Salamander/tom2.mp3", type: 'perc' }
        ]
    }
];
