# Beat Slicer

**Beat Slicer** is an advanced browser-based granular synthesizer, sample slicer, and real-time effects processor. Built with React, TypeScript, Web Audio API, and AudioWorklet technology, it delivers sample-accurate slicing, probabilistic glitch generation, and low-latency performance.

---

## 🏗️ Architecture & Stack

- **Frontend**: React 19 + TypeScript, Tailwind CSS, Lucide Icons, Vite
- **Audio Engine**: Web Audio API with custom `AudioWorklet` processor for sample-accurate scheduling, transient detection, time-stretching, and modular FX chaining
- **Database & Storage**:
  - **Database**: PostgreSQL / Neon PostgreSQL (managed via Drizzle ORM / SQL schema)
  - **Object Storage**: S3-compatible storage (AWS S3, Cloudflare R2, Wasabi, MinIO) with fallback to local disk storage
  - **Authentication**: Neon Auth / OAuth JWT authentication with token validation
- **Backend**: Express API server (`server.ts`) with Vite middleware
- **Deployment**:
  - **Backend API**: Render (Node.js web service)
  - **Frontend Client**: Netlify / Cloud Run (Single-Page App with `netlify.toml` redirects)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (or Bun)
- npm / yarn / pnpm

### Quick Start (Development)
```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables (optional for offline/local mode)
cp .env.example .env

# 3. Start development server (binds to http://localhost:3000)
npm run dev
```

### Production Build & Launch
```bash
# Build frontend and compile backend bundle
npm run build

# Start production server
npm start
```

---

## 🎮 Interface Modes

### 1. Simple Mode (Play)
Designed for performance, rapid beat production, and live jamming:
- **Macro Performance Sliders**: Instant macro control over complex sound parameters (*Texture, Space, Echo, Grit, Glitch*).
- **Algorithmic Pattern Generator**: Procedural pattern generator with selectable genres (*House, Breakbeat, Chaos, Trap, Ambient*).
- **Visual Display**: Clean, high-contrast waveform visualizer and focused 16-step sequencer interface.

### 2. Pro Mode (Edit & Sound Design)
A full digital audio workstation workflow for in-depth sample manipulation:
- **Interactive Waveform Editor**:
  - Transient detection with automatic slicing
  - Drag to adjust slice start/end markers
  - Zoom in/out, pan, slice preview, and double-click to mute
  - Fine-grained slice controls: pitch shift, gain, reverse, attack/decay envelopes
- **16-Step Sequencer**:
  - Step activation, velocity control, ratchet (note repeats / roll), and slice assignment per step
  - Swing/groove timing adjustment
- **Modular FX Rack**:
  - Re-orderable effect processing chain (Filter, Reverb, Delay, Distortion, Bitcrusher, Compressor)
  - Granular synth parameters: grain size, grain density, jitter, and spray
- **Probabilistic Glitch Engine**:
  - Real-time stochastic modifiers: random ratchets, octave jumps, micro-repeats, reverse chance, and formant shifts
- **MIDI Integration (Web MIDI API)**:
  - Hardware controller input mapping (C1–D#2 triggering slices 1–16)
  - MIDI Clock output sync with latency compensation shift (+/- ms)

---

## ☁️ Cloud Library, Presets & Assets

- **Presets**: Stores sound design parameters, FX chains, 16-step sequencer patterns, and slice definitions.
- **Samples**: Audio files uploaded with automatic transient analysis and waveforms.
- **Kits**: Multi-sample collections packaged into ready-to-play instruments.
- **Project Export/Import**:
  - **WAV Render**: Export master audio buffer output.
  - **ZIP Project**: Bundles audio files with structured JSON project state for seamless backup and sharing.
- **Community Library**: Discover and fork public community presets, drum kits, and loops.

---

## 🗄️ Database & Environment Configuration

### Environment Variables (`.env`)
Configure the following in `.env` for full cloud connectivity:

```env
# PostgreSQL Database (Neon / Cloud SQL)
SQL_HOST=ep-example-pooler.us-east-2.aws.neon.tech
SQL_DB_NAME=neondb
SQL_USER=neondb_owner
SQL_PASSWORD=your_password
SQL_ADMIN_USER=neondb_owner
SQL_ADMIN_PASSWORD=your_password

# Authentication (Neon Auth)
NEON_AUTH_URL=https://<your-neon-auth-domain>/auth
NEON_AUTH_JWKS_URL=https://<your-neon-auth-domain>/auth/.well-known/jwks.json
VITE_NEON_AUTH_URL=https://<your-neon-auth-domain>/auth

# S3-Compatible Storage (AWS S3, Cloudflare R2, MinIO)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET_NAME=beat-slicer-assets
S3_ENDPOINT=
S3_PUBLIC_URL=
S3_FORCE_PATH_STYLE=false
```

### PostgreSQL Schema
The database schema (`schema.sql`) provisions tables for:
- `users`: User profiles and authentication UIDs
- `samples`: Audio assets and metadata
- `kits` & `kit_samples`: Drum kits and multi-sample bundle associations
- `presets`: Full synthesizer, sequencer, and slice configurations
- `feedback`: User suggestions, error reports, and feedback

---

## 🚀 Deployment Guide

### Backend on Render
1. Create a **Web Service** on [Render](https://render.com).
2. Connect your Git repository.
3. Configure the service settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Under **Environment Variables**, add the variables from `.env.example`.

### Frontend on Netlify
1. Create a new site from Git on [Netlify](https://www.netlify.com).
2. Configure build settings (or let `netlify.toml` configure automatically):
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
3. Add any required client-side environment variables (`VITE_NEON_AUTH_URL`, etc.).

---

## 🛠️ Diagnostics & System Monitor

- Access the built-in **System Monitor** dialog to inspect:
  - Audio Context sample rate, state, buffer load, and AudioWorklet health
  - Backend API status and database connectivity latency
  - MIDI device connection status and active clock transmitters
