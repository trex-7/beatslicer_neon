-- Relational Database Schema for Beat Slicer
-- PostgreSQL / Cloud SQL / Neon Compatible

-- 1. Users Table (Linked with Auth UIDs)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    uid TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    username TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Samples Table (Audio assets, factory & user samples)
CREATE TABLE IF NOT EXISTS samples (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    audio_data TEXT,
    is_public BOOLEAN DEFAULT FALSE NOT NULL,
    is_factory BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Kits Table (Sample collection kits)
CREATE TABLE IF NOT EXISTS kits (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    cover_image_url TEXT,
    is_public BOOLEAN DEFAULT FALSE NOT NULL,
    is_factory BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Kit Samples (Many-to-Many junction table)
CREATE TABLE IF NOT EXISTS kit_samples (
    id SERIAL PRIMARY KEY,
    kit_id TEXT NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
    sample_id TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE
);

-- 5. Presets Table (Parameters, slice markers, and sequencer states)
CREATE TABLE IF NOT EXISTS presets (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    parameters JSONB NOT NULL,
    sequencer_data JSONB NOT NULL,
    slices_data JSONB NOT NULL,
    sample_id TEXT,
    is_public BOOLEAN DEFAULT FALSE NOT NULL,
    is_factory BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Feedback Table (User bug reports and suggestions)
CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    user_id TEXT,
    message TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for optimal lookup performance
CREATE INDEX IF NOT EXISTS idx_presets_user_id ON presets(user_id);
CREATE INDEX IF NOT EXISTS idx_presets_is_public ON presets(is_public);
CREATE INDEX IF NOT EXISTS idx_samples_user_id ON samples(user_id);
CREATE INDEX IF NOT EXISTS idx_samples_is_public ON samples(is_public);
CREATE INDEX IF NOT EXISTS idx_kits_user_id ON kits(user_id);
CREATE INDEX IF NOT EXISTS idx_kit_samples_kit_id ON kit_samples(kit_id);
