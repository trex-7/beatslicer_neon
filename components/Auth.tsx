
import React, { useState } from 'react';
import { supabase } from '../utils/supabaseClient';

interface AuthProps {
    user: any;
    onClose?: () => void;
}

const Auth: React.FC<AuthProps> = ({ user, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        if (!supabase) {
            setMessage({ text: "Database not configured.", type: 'error' });
            setLoading(false);
            return;
        }

        try {
            if (mode === 'signup') {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { data: { username: email.split('@')[0] } } // Default username
                });
                if (error) throw error;
                setMessage({ text: "Sign up successful! You can now log in.", type: 'success' });
                setMode('login');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                // Session updates automatically via onAuthStateChange in parent
                if (onClose) onClose();
            }
        } catch (error: any) {
            setMessage({ text: error.message || 'Authentication failed', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        if (supabase) await supabase.auth.signOut();
    };

    if (user) {
        return (
            <div className="flex items-center gap-3 bg-deep-space/90 p-2 rounded-lg border border-hyper-cyan/30">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-hyper-cyan to-blue-600 flex items-center justify-center text-deep-space font-bold text-xs uppercase">
                    {user.email?.slice(0, 2)}
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-white font-bold">{user.user_metadata?.username || user.email?.split('@')[0]}</span>
                    <button onClick={handleLogout} className="text-[9px] text-plasma-pink hover:text-white text-left">Sign Out</button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-deep-space/95 p-4 rounded-xl border border-white/10 shadow-xl w-64 absolute top-12 right-0 z-50 backdrop-blur-md">
            <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider text-center">
                {mode === 'login' ? 'Cloud Login' : 'Create Account'}
            </h3>
            
            <form onSubmit={handleAuth} className="space-y-3">
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:border-hyper-cyan outline-none"
                    required
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:border-hyper-cyan outline-none"
                    required
                />
                
                {message && (
                    <div className={`text-[10px] p-1.5 rounded ${message.type === 'error' ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>
                        {message.text}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-hyper-cyan hover:bg-hyper-cyan/80 text-deep-space font-bold text-xs py-2 rounded transition-all disabled:opacity-50"
                >
                    {loading ? 'Processing...' : (mode === 'login' ? 'ENTER' : 'JOIN')}
                </button>
            </form>

            <div className="mt-3 text-center">
                <button 
                    onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(null); }}
                    className="text-[10px] text-star-dust hover:text-white underline"
                >
                    {mode === 'login' ? "Need an account?" : "Have an account?"}
                </button>
            </div>
        </div>
    );
};

export default Auth;
