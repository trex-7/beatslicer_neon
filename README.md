
# Granular Synth FX - Beta User Guide

**Granular Synth FX** is an advanced browser-based granular synthesizer and effects processor. It uses `AudioWorklet` technology for sample-accurate timing and low-latency performance.

## 🚀 Getting Started

1.  **Launch the App**: Open the application in a modern browser (Chrome, Edge, or Firefox recommended for Web MIDI/AudioWorklet support).
2.  **Audio Context**: Click anywhere or press `Space` to initialize the audio engine.
3.  **Load Sound**: By default, an empty state is shown.
    *   **Simple Mode**: Use the "Load From..." buttons in the Transport bar.
    *   **Pro Mode**: Use **File > Browse Database** or drag-and-drop an audio file onto the window.

---

## 🎮 Interface Modes

### 1. Simple Mode (Play) (🚧 Beta / WIP)
Designed for performance and quick inspiration. **Note: This mode is currently under active development and features may change.**
*   **Macros**: Five large sliders control complex underlying parameters (Texture, Space, Echo, Grit, Glitch).
*   **Magic Pattern Gen**: Generates beats automatically based on genres (House, Break, Chaos).
*   **Visuals**: Large waveform display and simplified sequencer.

### 2. Pro Mode (Edit)
A full DAW-style interface for deep sound design.
*   **Waveform Editor**: Drag to create custom slices. Zoom in/out. Double-click slices to mute.
*   **Sequencer**: 16-step sequencer with "Ratchet" (note repeat) support.
*   **FX Rack**: A re-orderable chain of effects. Drag effect modules up/down to change signal flow.
*   **Slice Properties**: Fine-tune pitch, gain, reverse, and envelopes for every individual slice.

---

## ☁️ Cloud Library & Database

The app connects to a cloud database for saving your creations and sharing samples.

### Login
*   Click the **Cloud Login** button in the top right (or "Auth" in the header).
*   You can browse public content without logging in, but you must log in to **Save** or **Upload**.

### Saving Presets
*   **Preset**: Saves your parameter settings, sequencer pattern, and slice definitions.
*   **Sample**: Uploads raw audio only.
*   **Kit**: When uploading multiple files, you can group them as a "Kit" which creates a playable preset automatically.

### Upload Limits (Beta)
*   **Max File Size**: 30MB per file.
*   **Max Kit Size**: 16 files or 100MB total.
*   **Audio Format**: WAV/MP3 supported. Files are converted to WAV upon upload.

---

## 🎹 MIDI Integration

Granular Synth FX supports Web MIDI API for hardware integration.

**Setup:**
1.  Connect your MIDI device.
2.  In **Pro Mode**, click the **MIDI** button in the Transport section.
3.  **Input**: Select your MIDI controller to trigger slices (Notes C1-D#2 map to Slices 1-16).
4.  **Sync (Clock)**:
    *   **Send Clock**: Sends MIDI Clock to external hardware (e.g., drum machines, synths) to sync them to the app's BPM.
    *   **Sync Shift**: Adjust latency compensation (+/- ms) if your hardware lags behind the browser audio.

---

## 🛠️ Advanced Features

*   **Auto-Slice**: Automatically detects transients in the audio file to create slices.
*   **Glitch Engine**: A probabilistic chaos engine.
    *   *Ratchet*: Random note repeats.
    *   *Reverse*: Random slice reversal.
    *   *Octave*: Random pitch jumps (+/- 1200 cents).
    *   *Formant*: Random grain size modulation.
*   **Audio Export**: Go to **File > Export WAV** to render the current buffer output, or **Export Project ZIP** to bundle the audio + JSON data.

---

## 🐛 Beta Testing Notes

*   **Browser Compatibility**: Please test on Chrome/Edge for best results. Safari typically blocks AudioWorklets in strict modes.
*   **Reporting Issues**: Click **Help > Report Issue** in Pro Mode, the feedback link in the Simple Mode header, or email **support@granularfx.com**.
*   **Resource Usage**: The Granular Engine is CPU intensive. If audio crackles, try increasing the buffer size or closing other tabs.

---

## 🚨 Troubleshooting & SQL Fixes

If you see errors like **"new row violates row-level security policy for table kits"**, you must run this SQL in your Supabase Dashboard SQL Editor to fix permissions:

```sql
-- Fix RLS for kits
ALTER TABLE public.kits ENABLE ROW LEVEL SECURITY;

-- Remove old/conflicting policies
DROP POLICY IF EXISTS "Enable all access for kits" ON public.kits;
DROP POLICY IF EXISTS "Public kits are viewable by everyone." ON public.kits;
DROP POLICY IF EXISTS "Users can see own kits." ON public.kits;
DROP POLICY IF EXISTS "Users can insert own kits." ON public.kits;
DROP POLICY IF EXISTS "Users can update own kits." ON public.kits;
DROP POLICY IF EXISTS "Users can delete own kits." ON public.kits;

-- Re-apply correct policies
CREATE POLICY "Public kits are viewable by everyone." 
ON public.kits FOR SELECT 
USING (is_public = true OR is_factory = true);

CREATE POLICY "Users can see own kits." 
ON public.kits FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own kits." 
ON public.kits FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own kits." 
ON public.kits FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own kits." 
ON public.kits FOR DELETE 
USING (auth.uid() = user_id);

-- Fix RLS for kit_samples (Join table)
ALTER TABLE public.kit_samples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to kit_samples" ON public.kit_samples;

CREATE POLICY "Allow all access to kit_samples" 
ON public.kit_samples FOR ALL 
USING (true)
WITH CHECK (true);
```

---

## 📦 Deployment (For Developers)

To make your own folders and files appear in the application pulldowns automatically without a database:

1.  Create an `audio` folder in the public web root.
2.  Add a `library.json` file inside `audio`:

```json
{
  "loops": [
    { "name": "Cool Loop", "url": "loops/cool.mp3" }
  ],
  "kits": [
    {
      "name": "My Drum Kit",
      "samples": [
        { "name": "Kick", "url": "kits/kick.wav", "type": "kick" }
      ]
    }
  ]
}
```

---

## 💾 Database Schema (Supabase SQL)

Copy and run this SQL in your Supabase SQL Editor to set up the necessary tables and policies.

```sql
-- 1. PROFILES TABLE (Extends Auth)
create table public.profiles (
  id uuid references auth.users not null primary key,
  username text unique,
  email text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. SAMPLES TABLE
create table public.samples (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null,
  title text not null,
  url text not null,
  is_public boolean default false,
  is_factory boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. KITS TABLE
create table public.kits (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null,
  name text not null,
  description text null,
  cover_image_url text null,
  is_public boolean default false,
  is_factory boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. KIT_SAMPLES (Join Table)
create table public.kit_samples (
  kit_id uuid not null,
  sample_id uuid not null,
  constraint kit_samples_pkey primary key (kit_id, sample_id),
  constraint kit_samples_kit_id_fkey foreign KEY (kit_id) references kits (id) on delete CASCADE,
  constraint kit_samples_sample_id_fkey foreign KEY (sample_id) references samples (id) on delete CASCADE
) TABLESPACE pg_default;

-- 5. PRESETS TABLE
create table public.presets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null,
  name text not null,
  parameters jsonb not null,
  sequencer_data jsonb not null,
  slices_data jsonb not null,
  sample_id uuid references public.samples(id),
  is_public boolean default false,
  is_factory boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. FEEDBACK TABLE
create table public.feedback (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id), -- Nullable for anonymous
  message text not null,
  category text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ENABLE ROW LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.samples enable row level security;
alter table public.kits enable row level security;
alter table public.kit_samples enable row level security;
alter table public.presets enable row level security;
alter table public.feedback enable row level security;

-- POLICIES (Simplistic for Demo)

-- Profiles
create policy "Public profiles are viewable by everyone." on public.profiles for select using (true);
create policy "Users can insert their own profile." on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on public.profiles for update using (auth.uid() = id);

-- Samples
create policy "Public samples are viewable by everyone." on public.samples for select using (is_public = true or is_factory = true);
create policy "Users can see own samples." on public.samples for select using (auth.uid() = user_id);
create policy "Users can insert own samples." on public.samples for insert with check (auth.uid() = user_id);
create policy "Users can update own samples." on public.samples for update using (auth.uid() = user_id);
create policy "Users can delete own samples." on public.samples for delete using (auth.uid() = user_id);

-- Kits
create policy "Public kits are viewable by everyone." on public.kits for select using (is_public = true or is_factory = true);
create policy "Users can see own kits." on public.kits for select using (auth.uid() = user_id);
create policy "Users can insert own kits." on public.kits for insert with check (auth.uid() = user_id);
create policy "Users can update own kits." on public.kits for update using (auth.uid() = user_id);
create policy "Users can delete own kits." on public.kits for delete using (auth.uid() = user_id);

-- Kit Samples (Join)
create policy "Public kit samples are viewable by everyone." on public.kit_samples for select using (true); 
create policy "Users can insert kit samples." on public.kit_samples for insert with check (true); 
-- Note: Real apps should check kit ownership here, simplified for demo.

-- Presets
create policy "Public presets are viewable by everyone." on public.presets for select using (is_public = true or is_factory = true);
create policy "Users can see own presets." on public.presets for select using (auth.uid() = user_id);
create policy "Users can insert own presets." on public.presets for insert with check (auth.uid() = user_id);
create policy "Users can update own presets." on public.presets for update using (auth.uid() = user_id);
create policy "Users can delete own presets." on public.presets for delete using (auth.uid() = user_id);

-- Feedback
create policy "Anyone can insert feedback." on public.feedback for insert with check (true);
create policy "Admins can read feedback." on public.feedback for select using (true);

-- TRIGGER: Create Profile on Signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, username)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- STORAGE (Run manually in Dashboard if needed)
-- 1. Create a public bucket named 'audio-assets'
-- 2. Add Policy: "Public Access" -> SELECT for all users
-- 3. Add Policy: "Authenticated Upload" -> INSERT for authenticated users
