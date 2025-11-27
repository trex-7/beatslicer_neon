
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types';

// --- MANUAL CONFIGURATION ---
// Since you cannot use a .env file, paste your Supabase credentials here.
// You can find these in your Supabase Dashboard -> Project Settings -> API.
const MANUAL_URL = "https://zwqzjwgghgteclxnmtsz.supabase.co"; // e.g. "https://xyz.supabase.co"
const MANUAL_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3cXpqd2dnaGd0ZWNseG5tdHN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNDEwNDEsImV4cCI6MjA3OTcxNzA0MX0.Aqnu8FoPFg33fvVnGWYtPRwZBdA755QaOMLiTCqfgGM"; // e.g. "eyJh..."

// ---------------------------

const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

const supabaseUrl = envUrl || MANUAL_URL;
const supabaseAnonKey = envKey || MANUAL_KEY;

// Check if configuration is present to prevent crashes
const isValid = supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http');

if (!isValid) {
    console.warn("Supabase is not configured. Please edit utils/supabaseClient.ts with your credentials.");
}

// Export null if not configured so the app can check isSupabaseConfigured()
export const supabase = isValid 
    ? createClient<Database>(supabaseUrl, supabaseAnonKey) 
    : null;

export const isSupabaseConfigured = () => {
    return !!supabase;
};
