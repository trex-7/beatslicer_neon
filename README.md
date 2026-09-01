# 🎛️ Beat Slicer

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg?style=flat&logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF.svg?style=flat&logo=vite)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-38bdf8.svg?style=flat&logo=tailwindcss)](https://tailwindcss.com/)
[![Web Audio API](https://img.shields.io/badge/Web%20Audio-AudioWorklet-orange.svg?style=flat)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![Neon Postgres](https://img.shields.io/badge/Database-Neon%20PostgreSQL-00E599.svg?style=flat)](https://neon.tech/)
[![Render](https://img.shields.io/badge/Backend-Render-46E3B7.svg?style=flat&logo=render)](https://render.com/)
[![Netlify](https://img.shields.io/badge/Frontend-Netlify-00C7B7.svg?style=flat&logo=netlify)](https://www.netlify.com/)

**Beat Slicer** is an advanced browser-based granular synthesizer, sample slicer, and real-time stochastic effects processor. Built with React, TypeScript, Tone.js, and the Web Audio API (with custom AudioWorklets), it delivers sample-accurate slicing, probabilistic glitch generation, tempo-synced FX, and low-latency performance on desktop and mobile browsers.

---

## 📑 Table of Contents

- [✨ Features](#-features)
- [🏗️ Architecture & Tech Stack](#️-architecture--tech-stack)
- [🚀 Quick Start (Local Development)](#-quick-start-local-development)
- [🎮 User Interface & Workflows](#-user-interface--workflows)
- [🎚️ Modular FX Rack & Glitch Engine](#️-modular-fx-rack--glitch-engine)
- [🎹 Web MIDI & Hardware Integration](#-web-midi--hardware-integration)
- [☁️ Cloud Library & Cascading File Storage](#️-cloud-library--cascading-file-storage)
- [🗄️ Database & Environment Configuration](#️-database--environment-configuration)
- [🚢 Deployment (Render + Netlify)](#-deployment-render--netlify)
- [⌨️ Keyboard Shortcuts](#️-keyboard-shortcuts)
- [📂 Project Directory Structure](#-project-directory-structure)
- [📚 Documentation Index](#-documentation-index)
- [📄 License](#-license)

---

## ✨ Features

- **Sample-Accurate Transient Detection & Slicing**: Automatically detects percussive transients across audio buffers; drag start/end markers with zoom and sub-sample precision.
- **Granular Synthesis Engine**: Real-time micro-grain synthesis with adjustable grain size, overlap, detune, spray, and micro-envelopes.
- **16-Step Pattern Sequencer**: Velocity control, per-step ratchet/roll triggers (1x, 2x, 3x, 4x), swing timing, and direction modes (*Forward, Backward, Pendulum, Random*).
- **Probabilistic Stochastic Glitch Processor**: Non-deterministic octave jumps, reverse buffer playback, spontaneous ratchets, and formant shifts.
- **Modular Multi-FX Rack**: Fully re-orderable DSP chain featuring multimode Biquad Filter (with LFO & envelope depth), Tempo-Synced Stereo Delay, Convolution Reverb, Distortion, Bitcrusher, Compressor, and Vinyl warmth.
- **Web MIDI API Integration**: Hardware drum pad mapping (`C1`–`D#2`), velocity sensitivity, and 24-PPQ MIDI Clock output synchronization with latency compensation (+/- ms).
- **Cloud Library & Complete Storage Lifecycle**: Save presets, sample packs, and multi-sample construction kits to **Neon PostgreSQL** and **S3-compatible Object Storage** (Neon Storage / Cloudflare R2 / AWS S3) with automatic cascading cleanup on deletion.
- **WAV & Project ZIP Export**: Export studio-grade 32-bit float WAV master recordings or packaged `.zip` project bundles containing all audio files and state definitions.

---

## 🏗️ Architecture & Tech Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    Client (Netlify / SPA)                   │
│   React 19 + TypeScript + Tailwind CSS + Lucide Icons       │
│   Tone.js + Web Audio API + AudioWorklet + Web MIDI         │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / REST / JWT
┌──────────────────────────────▼──────────────────────────────┐
│                    Backend (Render API)                     │
│   Node.js + Express + Multer + Drizzle ORM + esbuild        │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
┌──────────────▼──────────────┐┌──────────────▼───────────────┐
│     Neon PostgreSQL DB      ││  S3-Compatible Object Store  │
│  (Users, Presets, Kits,     ││  (Neon Storage, AWS S3, R2,  │
│   Samples, Feedback)        ││   Local Disk Storage)        │
└─────────────────────────────┘└──────────────────────────────┘
```

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 6, Tailwind CSS, Lucide React |
| **Audio Engine** | Web Audio API, Tone.js, AudioWorklet, Web MIDI API |
| **Backend API** | Express.js, TypeScript, Multer, Drizzle ORM, esbuild |
| **Database** | Neon PostgreSQL (Serverless Postgres) |
| **Auth** | Neon Auth / OAuth JWT Bearer validation |
| **Storage** | Neon S3-Compatible Object Storage, AWS S3, Cloudflare R2 |
| **Hosting** | Netlify (Frontend SPA) + Render (Backend API Web Service) |

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher (or [Bun](https://bun.sh))
- **npm** / **yarn** / **pnpm** / **bun**

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/your-username/beat-slicer.git
cd beat-slicer

# Install dependencies
npm install
```

### 3. Setup Environment Variables
Copy the example environment file:
```bash
cp .env.example .env
```
*(The application runs out of the box in offline/local mode with built-in presets even without database credentials).*

### 4. Launch Development Server
```bash
npm run dev
```
Open your browser and navigate to **`http://localhost:3000`**.

### 5. Production Build
```bash
# Builds client bundle and compiles server.ts into dist/server.cjs
npm run build

# Run production server
npm start
```

---

## 🎮 User Interface & Workflows

### 1. Simple Mode (Live Jamming & Macros)
- **Macro Performance Sliders**: Instant macroscopic shaping over complex parameters (*Texture, Space, Echo, Grit, Glitch*).
- **Algorithmic Genre Generator**: One-click pattern generator for *House, Breakbeat, Chaos, Trap, and Ambient* styles.
- **Streamlined Workflow**: Direct access to transport, tempo, volume, and playback without deep parameter editing.

### 2. Pro Mode (Digital Audio Workstation & Sound Design)
- **Interactive Waveform Slicer**:
  - Automatic and manual transient slicing.
  - Individual slice controls: Gain, Pitch Shift (+/- 24 semitones), Reverse, Attack, Decay, and Mute.
  - Zoom, pan, scrub, and slice preview auditioning.
- **16-Step Grid Sequencer**:
  - Per-step slice trigger selection and velocity control.
  - Multi-ratchet triggers (1x, 2x, 3x, 4x roll multipliers).
  - Global swing/groove adjustment.
- **System Monitor & Diagnostics**:
  - Live AudioContext state, sample rate, voice allocation count, memory usage, and MIDI telemetry.

---

## 🎚️ Modular FX Rack & Glitch Engine

Beat Slicer features a studio-grade modular effects processor:

- **Multimode Filter**: Lowpass, Highpass, Bandpass, Notch, Peaking, and Shelf with dedicated LFO rate, LFO depth, and envelope modulation.
- **Tempo-Synced Stereo Delay**: Ping-pong and standard stereo delay with note subdivisions (`1m`, `2n`, `4n`, `8n`, `16n`, triplets) and high/low cut filters.
- **Convolution & Algorithmic Reverb**: Custom impulse response loader, adjustable decay time, room size, and high-frequency dampening.
- **Distortion & Saturator**: Overdrive waveshaping with wet/dry blend.
- **Bitcrusher**: Variable bit-depth reduction (1 to 16 bits) and sample rate decimation for vintage lofi grit.
- **Dynamic Compressor**: Threshold, ratio, attack, and release with visual gain reduction metering.
- **Vinyl Noise Simulator**: Subtle crackle, dust, and warm analog flutter.
- **Stochastic Glitch Generator**: Chaos factor, reverse probability, random octave jumps, ratchet bursts, and formant shifts.

---

## 🎹 Web MIDI & Hardware Integration

Connect hardware MIDI controllers or drum pads directly via Chrome, Edge, or Opera (Web MIDI API supported):

### Drum Pad Trigger Mapping
| Pad / Key | Note | Frequency | Assigned Trigger |
| :--- | :--- | :--- | :--- |
| **Pad 1** | `C1` (36) | 65.41 Hz | Slice 1 (Kick) |
| **Pad 2** | `C#1` (37) | 69.30 Hz | Slice 2 |
| **Pad 3** | `D1` (38) | 73.42 Hz | Slice 3 (Snare) |
| **Pad 4** | `D#1` (39) | 77.78 Hz | Slice 4 |
| ... | ... | ... | ... |
| **Pad 16** | `D#2` (51) | 155.56 Hz | Slice 16 |

### MIDI Clock Output
- Sends standard 24 PPQ MIDI Clock (`0xF8`) sync messages to external synthesizers and drum machines.
- Supports MIDI Start (`0xFA`), Stop (`0xFC`), and Continue (`0xFB`).
- Latency compensation slider for microsecond hardware delay alignment.

---

## ☁️ Cloud Library & Cascading File Storage

Beat Slicer provides seamless cloud persistence with zero orphaned storage clutter:

- **Presets**: Sound design parameters, sequencer patterns, and slice definitions.
- **Samples**: Audio files uploaded with automatic transient analysis and waveforms.
- **Construction Kits**: Multi-sample instrument packages with visual artwork.
- **Cascading Deletion**: Deleting a preset or kit automatically detects, unlinks, and **permanently removes all associated sample records and object storage files** (S3 / Neon Storage / disk) in a single atomic operation.

---

## 🗄️ Database & Environment Configuration

### Environment Variables Reference (`.env`)

```env
# ==========================================
# Database (Neon PostgreSQL / Cloud SQL)
# ==========================================
SQL_HOST=ep-example-pooler.us-east-2.aws.neon.tech
SQL_DB_NAME=neondb
SQL_USER=neondb_owner
SQL_PASSWORD=your_db_password
SQL_ADMIN_USER=neondb_owner
SQL_ADMIN_PASSWORD=your_db_password

# ==========================================
# Authentication (Neon Auth / OAuth)
# ==========================================
NEON_AUTH_URL=https://<your-neon-auth-domain>/auth
NEON_AUTH_JWKS_URL=https://<your-neon-auth-domain>/auth/.well-known/jwks.json
VITE_NEON_AUTH_URL=https://<your-neon-auth-domain>/auth

# ==========================================
# Object Storage (Neon S3, AWS S3, Cloudflare R2)
# ==========================================
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-2
NEON_STORAGE_BUCKET=beat-slicer
NEON_STORAGE_ENDPOINT=https://<storage-endpoint>.neon.tech
NEON_STORAGE_PUBLIC_URL=
NEON_STORAGE_FORCE_PATH_STYLE=true

# ==========================================
# Administration & AI Service (Optional)
# ==========================================
ADMIN_EMAIL=your_admin_email@example.com
GEMINI_API_KEY=AIzaSy...
```

---

## 🚢 Deployment (Render + Netlify)

For complete step-by-step instructions, see the **[Deployment Guide](docs/DEPLOYMENT.md)**.

### Quick Deployment Summary:

1. **Database Setup**:
   - Provision a PostgreSQL database on [Neon](https://neon.tech).
   - Execute `schema.sql` in the Neon SQL Editor.

2. **Backend API on Render**:
   - Create a new **Web Service** on [Render](https://render.com) connected to your repository.
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Add environment variables from `.env.example`.

3. **Frontend SPA on Netlify**:
   - Connect your repository to [Netlify](https://netlify.com).
   - Build Command: `npm run build`
   - Publish Directory: `dist`
   - Set `VITE_NEON_AUTH_URL` under Netlify environment variables.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Space` | Toggle Global Play / Pause Transport |
| `1` – `8` | Audition / Trigger Slices 1 through 8 |
| `Click + Drag` | Adjust Slice Start / End Markers |
| `Double Click Marker` | Reset Slice Boundary |
| `Shift + Click` | Mute / Unmute Slice |
| `Escape` | Close Open Modals and Dialogs |

---

## 📂 Project Directory Structure

```
beat-slicer/
├── components/                 # React UI Components
│   ├── ControlPanel.tsx        # Macro & DSP parameter controls
│   ├── EffectSection.tsx       # Re-orderable modular FX rack
│   ├── Header.tsx              # Navigation, mode toggle & monitor
│   ├── LibraryManager.tsx      # Cloud presets, samples & kits manager
│   ├── SaveDialog.tsx          # Preset / Kit creation dialog
│   ├── Sequencer.tsx           # 16-step grid sequencer with ratchets
│   ├── SliceWaveformEditor.tsx # Interactive canvas waveform slicer
│   ├── SystemMonitor.tsx       # AudioContext & API telemetry monitor
│   ├── Transport.tsx           # Play, stop, BPM & loop controls
│   └── WaveformDisplay.tsx     # Real-time oscilloscope visualizer
├── docs/                       # Technical Documentation
│   ├── API.md                  # REST API Endpoints & schemas
│   ├── AUDIO_ENGINE.md         # DSP, Web Audio, AudioWorklet & MIDI
│   └── DEPLOYMENT.md           # Render, Netlify & Neon setup guide
├── hooks/
│   └── useAudioEngine.ts       # Primary AudioContext & Tone.js hook
├── public/                     # Static assets & sample libraries
├── src/
│   ├── db/                     # Drizzle ORM schemas & database queries
│   │   ├── index.ts            # Neon Postgres client initialization
│   │   ├── queries.ts          # CRUD queries with cascading deletes
│   │   ├── schema.ts           # Drizzle table schemas
│   │   └── users.ts            # User profile management
│   ├── lib/                    # Storage, AI & Supabase migration helpers
│   │   ├── ai-pattern-service.ts
│   │   ├── s3.ts               # S3 & Neon object storage client
│   │   └── supabase-migrator.ts
│   └── middleware/
│       └── auth.ts             # Neon Auth JWT verification middleware
├── utils/                      # Audio math & preset utilities
│   ├── audioAnalysis.ts        # Spectral analysis & centroid calculation
│   ├── bpmDetector.ts          # Auto BPM tempo detection
│   ├── db.ts                   # Client-side API fetch client
│   ├── factoryPresets.ts       # Built-in factory presets & kits
│   └── transientDetection.ts   # Onset detection algorithm
├── App.tsx                     # Main React application component
├── netlify.toml                # Netlify build & SPA routing configuration
├── schema.sql                  # PostgreSQL table definitions
├── server.ts                   # Express API server with Vite middleware
├── types.ts                    # TypeScript interface definitions
└── vite.config.ts              # Vite bundler configuration
```

---

## 📚 Documentation Index

- 📖 **[Deployment Guide](docs/DEPLOYMENT.md)** — Production setup for Render, Netlify, Neon PostgreSQL, and S3 Storage.
- 🔌 **[REST API Reference](docs/API.md)** — Complete endpoint specifications, authentication headers, and request payloads.
- 🎛️ **[Audio Engine & DSP Guide](docs/AUDIO_ENGINE.md)** — In-depth guide to the Web Audio architecture, transient detection, granular synthesis, and MIDI clock mechanics.

---

## 📄 License

This project is licensed under the **MIT License**. Feel free to use, modify, and distribute for personal and commercial audio production.
