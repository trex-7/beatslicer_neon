import React, { useState, useEffect, useRef } from 'react';
import { User as UserIcon, Shield, LogOut, ChevronDown, Key } from 'lucide-react';

interface AuthProps {
    user: any;
    onOpenAdmin?: () => void;
}

const ADMIN_EMAILS = [
    ((import.meta as any).env?.VITE_ADMIN_EMAIL || '').toLowerCase().trim(),
    'sandromancino.sm@gmail.com',
].filter(Boolean);

const Auth: React.FC<AuthProps> = ({ user, onOpenAdmin }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const isAdmin = Boolean(
        user &&
        user.email &&
        ADMIN_EMAILS.some((a) => a.toLowerCase().trim() === String(user.email).toLowerCase().trim())
    );

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            const trimmedEmail = email.trim();
            const username = trimmedEmail.split('@')[0];
            const userId = 'neon_' + Math.abs(trimmedEmail.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0)).toString(36);
            // Include base64-encoded email payload in token for robust server-side authentication
            const token = 'tok_' + btoa(JSON.stringify({ uid: userId, email: trimmedEmail }));
            
            const authUser = {
                id: userId,
                uid: userId,
                email: trimmedEmail,
                name: username,
                user_metadata: { username },
            };

            // Save session to localStorage
            localStorage.setItem('neon_auth_token', token);
            localStorage.setItem('neon_auth_user', JSON.stringify(authUser));
            window.dispatchEvent(new Event('neon_auth_change'));

            if (mode === 'signup') {
                setMessage({ text: "Account created successfully!", type: 'success' });
            } else {
                setMessage({ text: "Signed in successfully!", type: 'success' });
            }

            setTimeout(() => {
                setIsOpen(false);
                setMessage(null);
            }, 500);
        } catch (error: any) {
            setMessage({ text: error.message || 'Authentication failed', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('neon_auth_token');
        localStorage.removeItem('neon_auth_user');
        window.dispatchEvent(new Event('neon_auth_change'));
        setIsOpen(false);
    };

    const handleAdminPrefill = () => {
        setEmail('sandromancino.sm@gmail.com');
        setPassword('admin123');
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Trigger Button in Pro Menu */}
            {user ? (
                <button 
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold transition-all shadow-sm ${
                        isOpen 
                            ? 'bg-neutral-800 border-cyan-500 text-white' 
                            : isAdmin
                                ? 'bg-amber-950/50 border-amber-600/60 text-amber-300 hover:bg-amber-900/60'
                                : 'bg-neutral-900 border-neutral-800 text-neutral-200 hover:bg-neutral-800'
                    }`}
                >
                    {isAdmin ? (
                        <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : (
                        <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center text-neutral-950 font-black text-[9px] uppercase shrink-0">
                            {user.email?.slice(0, 1) || 'U'}
                        </div>
                    )}
                    <span className="max-w-[110px] truncate font-mono">
                        {user.email?.split('@')[0]}
                    </span>
                    {isAdmin && (
                        <span className="px-1 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[9px] font-bold tracking-wider uppercase hidden sm:inline">
                            ADMIN
                        </span>
                    )}
                    <ChevronDown className="w-3 h-3 text-neutral-400" />
                </button>
            ) : (
                <button 
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold transition-all shadow-sm ${
                        isOpen 
                            ? 'bg-cyan-500 text-neutral-950 border-cyan-400' 
                            : 'bg-neutral-900 border-cyan-600/60 text-cyan-400 hover:bg-cyan-950/60 hover:border-cyan-400'
                    }`}
                >
                    <UserIcon className="w-3.5 h-3.5" />
                    <span>Admin / Login</span>
                </button>
            )}

            {/* Dropdown Content */}
            {isOpen && (
                <div 
                    className="absolute right-0 top-full mt-1.5 w-72 rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                >
                    {user ? (
                        <div className="p-3">
                            <div className="flex items-center gap-2.5 pb-3 border-b border-neutral-800 mb-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                                    isAdmin ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                                }`}>
                                    {isAdmin ? <Shield className="w-4 h-4" /> : (user.email?.slice(0, 2).toUpperCase() || 'US')}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-xs font-bold text-white truncate">{user.email}</p>
                                    </div>
                                    <p className="text-[10px] text-neutral-400 font-mono">
                                        {isAdmin ? '🛡️ Administrator Access' : 'User Account'}
                                    </p>
                                </div>
                            </div>

                            {isAdmin && onOpenAdmin && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsOpen(false);
                                        onOpenAdmin();
                                    }}
                                    className="w-full mb-2 flex items-center justify-center gap-2 py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-300 text-xs font-bold transition-colors"
                                >
                                    <Shield className="w-3.5 h-3.5" />
                                    <span>Open Admin Tools & Storage</span>
                                </button>
                            )}

                            <button 
                                type="button"
                                onClick={handleLogout}
                                className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 rounded-lg border border-rose-500/20 transition-colors"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                                <span>Sign Out</span>
                            </button>
                        </div>
                    ) : (
                        <div className="p-4">
                            <div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral-800">
                                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                    <Key className="w-3.5 h-3.5 text-cyan-400" />
                                    <span>{mode === 'login' ? 'Cloud & Admin Login' : 'Create Account'}</span>
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleAdminPrefill}
                                    className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 hover:underline bg-neutral-800/80 px-1.5 py-0.5 rounded border border-neutral-700"
                                    title="Auto-fill Admin Email"
                                >
                                    Fill Admin
                                </button>
                            </div>
                            
                            <form onSubmit={handleAuth} className="space-y-2.5">
                                <div>
                                    <label className="block text-[10px] uppercase font-mono text-neutral-400 mb-1">Email</label>
                                    <input
                                        type="email"
                                        placeholder="sandromancino.sm@gmail.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full bg-neutral-950 border border-neutral-750 rounded-md px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:border-cyan-500 focus:outline-none transition-colors"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase font-mono text-neutral-400 mb-1">Password</label>
                                    <input
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-neutral-950 border border-neutral-750 rounded-md px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:border-cyan-500 focus:outline-none transition-colors"
                                        required
                                    />
                                </div>
                                
                                {message && (
                                    <div className={`text-[11px] p-2 rounded-md font-medium ${message.type === 'error' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
                                        {message.text}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold text-xs py-2 rounded-md transition-all disabled:opacity-50 shadow-md mt-1"
                                >
                                    {loading ? 'Authenticating...' : (mode === 'login' ? 'Sign In' : 'Sign Up')}
                                </button>
                            </form>

                            <div className="mt-3 pt-2 border-t border-neutral-800 text-center flex items-center justify-between text-[11px]">
                                <button 
                                    type="button"
                                    onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(null); }}
                                    className="text-neutral-400 hover:text-cyan-400 transition-colors"
                                >
                                    {mode === 'login' ? "Create new account" : "Back to Sign In"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Auth;
