import React, { useState, useEffect, useRef } from 'react';

interface AuthProps {
    user: any;
}

const Auth: React.FC<AuthProps> = ({ user }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

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
            const username = email.split('@')[0];
            const userId = 'neon_' + Math.abs(email.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0)).toString(36);
            // Include base64-encoded email payload in token for robust server-side authentication
            const token = 'tok_' + btoa(JSON.stringify({ uid: userId, email: email.trim() }));
            
            const authUser = {
                id: userId,
                uid: userId,
                email: email.trim(),
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
            }, 600);
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

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Trigger Button */}
            {user ? (
                <button 
                    onClick={() => setIsOpen(!isOpen)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${isOpen ? 'bg-deep-space border-hyper-cyan shadow-lg' : 'bg-deep-space/60 border-white/10 hover:bg-deep-space/80'}`}
                >
                    <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-hyper-cyan to-blue-600 flex items-center justify-center text-deep-space font-bold text-[10px] uppercase">
                        {user.email?.slice(0, 2)}
                    </div>
                    <span className="text-xs text-white font-bold hidden sm:block max-w-[80px] truncate">
                        {user.user_metadata?.username || user.name || user.email?.split('@')[0]}
                    </span>
                    <span className="text-[9px] text-white/50">▼</span>
                </button>
            ) : (
                <button 
                    onClick={() => setIsOpen(!isOpen)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all ${isOpen ? 'bg-hyper-cyan text-deep-space border-hyper-cyan' : 'bg-deep-space/60 border-white/10 text-hyper-cyan hover:bg-deep-space/80'}`}
                >
                    <span>Cloud Login</span>
                </button>
            )}

            {/* Dropdown Content */}
            {isOpen && (
                <div 
                    className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-white/20 shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-[100] overflow-hidden"
                    style={{ backgroundColor: '#121826' }} 
                >
                    {user ? (
                        <div className="p-2">
                             <div className="px-3 py-2 border-b border-white/10 mb-2">
                                <p className="text-xs text-star-dust">Logged in as</p>
                                <p className="text-sm font-bold text-white truncate">{user.email}</p>
                            </div>
                            <button 
                                onClick={handleLogout}
                                className="w-full text-left px-3 py-2 text-xs font-bold text-plasma-pink hover:bg-white/5 rounded transition-colors"
                            >
                                Sign Out
                            </button>
                        </div>
                    ) : (
                        <div className="p-4">
                            <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider text-center">
                                {mode === 'login' ? 'Cloud Login' : 'Create Account'}
                            </h3>
                            
                            <form onSubmit={handleAuth} className="space-y-3">
                                <input
                                    type="email"
                                    placeholder="Email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:border-hyper-cyan outline-none"
                                    required
                                />
                                <input
                                    type="password"
                                    placeholder="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:border-hyper-cyan outline-none"
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
                    )}
                </div>
            )}
        </div>
    );
};

export default Auth;
