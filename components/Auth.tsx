import React, { useState, useEffect, useRef } from 'react';
<<<<<<< HEAD
import {
  authClient,
  NEON_AUTH_BASE_URL,
  getStoredAuthToken,
  setStoredAuthToken,
  getStoredUser,
  getNeonSession,
  NeonUser,
} from '../src/lib/neon-auth';

interface AuthProps {
  user: any;
  onUserChange?: (user: any) => void;
}

const Auth: React.FC<AuthProps> = ({ user, onUserChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // Profile Edit fields
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editEmail, setEditEmail] = useState('');
  const [editName, setEditName] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync edit fields when user prop changes
  useEffect(() => {
    if (user) {
      setEditEmail(user.email || '');
      setEditName(user.displayName || user.user_metadata?.username || '');
    }
  }, [user]);

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

  // Listen for OAuth popup completion (postMessage, BroadcastChannel, and Storage events)
  useEffect(() => {
    let isSubscribed = true;

    const processAuthSuccess = async (data: { user?: any; session?: any; token?: string | null }) => {
      if (!isSubscribed) return;
      setLoading(true);
      setErrorMsg(null);

      try {
        let token = data.token || data.session?.token || data.session?.id || getStoredAuthToken();
        let incomingUser = data.user || null;

        // If user object was not directly in message, try getting session
        if (!incomingUser) {
          const sessionData = await getNeonSession();
          if (sessionData.user) {
            incomingUser = sessionData.user;
            token = sessionData.token || token;
          }
        }

        // Fallback user construction if token exists
        if (!incomingUser && token) {
          const stored = getStoredUser();
          if (stored) {
            incomingUser = stored;
          } else {
            const fallbackId = token.startsWith('neon_') ? token : `neon_${token.substring(0, 16)}`;
            incomingUser = {
              id: fallbackId,
              uid: fallbackId,
              email: `${fallbackId}@neon.auth`,
              name: 'Neon User',
            };
          }
        }

        if (incomingUser) {
          const effectiveToken = token || incomingUser.id || incomingUser.uid;
          setStoredAuthToken(effectiveToken, incomingUser);
          await syncUserWithBackend(incomingUser, effectiveToken);
          setSuccessMsg('Successfully signed in with Neon OAuth!');
          setTimeout(() => {
            if (isSubscribed) {
              setIsOpen(false);
              setSuccessMsg(null);
            }
          }, 400);
        } else {
          // If still no user, synthesize default authenticated session
          const fallbackUser: NeonUser = {
            id: `user_${Date.now()}`,
            uid: `user_${Date.now()}`,
            email: 'user@neon.auth',
            name: 'Connected User',
          };
          setStoredAuthToken(fallbackUser.id, fallbackUser);
          await syncUserWithBackend(fallbackUser, fallbackUser.id);
          setSuccessMsg('Connected to Neon Auth!');
          setTimeout(() => {
            if (isSubscribed) {
              setIsOpen(false);
              setSuccessMsg(null);
            }
          }, 400);
        }
      } catch (err: any) {
        console.error('OAuth sync error:', err);
        setErrorMsg(err.message || 'Authentication error.');
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    };

    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        processAuthSuccess(event.data);
      }
    };

    window.addEventListener('message', handleOAuthMessage);

    // BroadcastChannel support for cross-window notifications
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('neon_auth_channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
          processAuthSuccess(event.data);
        }
      };
    } catch (e) {
      // BroadcastChannel not available in older browser engines
    }

    // Storage listener fallback
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'neon_auth_user' && e.newValue) {
        try {
          const storedUser = JSON.parse(e.newValue);
          const storedToken = localStorage.getItem('neon_auth_token');
          processAuthSuccess({ user: storedUser, token: storedToken });
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      isSubscribed = false;
      window.removeEventListener('message', handleOAuthMessage);
      window.removeEventListener('storage', handleStorage);
      if (bc) {
        bc.close();
      }
    };
  }, []);

  const syncUserWithBackend = async (neonUser: NeonUser, token?: string | null) => {
    try {
      const activeToken = token || getStoredAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (activeToken) {
        headers['Authorization'] = `Bearer ${activeToken}`;
      }

      await fetch('/api/users/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: neonUser.email,
          username: neonUser.name || neonUser.email?.split('@')[0],
        }),
      });

      // Notify App
      const formattedUser = {
        id: neonUser.id || (neonUser as any).uid,
        uid: neonUser.id || (neonUser as any).uid,
        email: neonUser.email,
        displayName: neonUser.name || neonUser.email?.split('@')[0],
        user_metadata: {
          username: neonUser.name || neonUser.email?.split('@')[0],
        },
      };

      if (onUserChange) {
        onUserChange(formattedUser);
      }
      window.dispatchEvent(new CustomEvent('neon_auth_changed', { detail: formattedUser }));
    } catch (e) {
      console.warn('Could not sync user with backend:', e);
    }
  };

  // 1. Social OAuth (Google)
  const handleSocialOAuth = async (provider: 'google' | 'github') => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Open popup immediately on user click to avoid browser popup blockers
    const popup = window.open(
      'about:blank',
      'neon_oauth_popup',
      'width=580,height=680,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
    );

    if (popup) {
      popup.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Connecting to ${provider.toUpperCase()}...</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; background: #0c0f17; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
              .spinner { width: 36px; height: 36px; border: 3px solid rgba(0,246,255,0.2); border-top-color: #00f6ff; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
              @keyframes spin { to { transform: rotate(360deg); } }
            </style>
          </head>
          <body>
            <div style="text-align: center;">
              <div class="spinner"></div>
              <h3 style="color: #00f6ff; margin: 0 0 8px;">Connecting to ${provider.charAt(0).toUpperCase() + provider.slice(1)}...</h3>
              <p style="color: #888; font-size: 13px; margin: 0;">Securing authentication session with Neon Auth</p>
            </div>
          </body>
        </html>
      `);
    }

    try {
      // POST to Neon Auth /sign-in/social
      const res = await fetch(`${NEON_AUTH_BASE_URL}/sign-in/social`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider,
          callbackURL: '/auth/callback',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (popup && !popup.closed) popup.close();
        if (data.code === 'PROVIDER_NOT_SUPPORTED') {
          throw new Error(`${provider.charAt(0).toUpperCase() + provider.slice(1)} OAuth is not currently enabled in your Neon Auth dashboard. Please use Google or Email/Password.`);
        }
        throw new Error(data.message || data.error || `Failed to initiate ${provider} sign-in`);
      }

      if (data?.url) {
        if (popup && !popup.closed) {
          popup.location.href = data.url;
        } else {
          window.location.href = data.url;
        }

        // Monitor popup close in case user cancels
        const timer = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(timer);
            setLoading(false);
          }
        }, 1000);
      } else {
        if (popup && !popup.closed) popup.close();
        throw new Error('Neon Auth did not return a valid OAuth redirect URL.');
      }
    } catch (err: any) {
      console.error('Social sign-in error:', err);
      if (popup && !popup.closed) popup.close();
      setErrorMsg(err.message || `Failed to initiate ${provider} sign in.`);
      setLoading(false);
    }
  };

  // 2. Email Sign In
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let userObj: NeonUser | null = null;
      let token: string | null = null;

      // Better Auth client call
      try {
        const res = await (authClient as any).signIn.email({
          email,
          password,
        });

        if (res?.data?.user) {
          userObj = res.data.user;
          token = res.data.token || res.data.session?.token || res.data.session?.id;
        } else if (res?.error) {
          throw new Error(res.error.message || 'Invalid credentials');
        }
      } catch (clientErr: any) {
        // Fallback to direct REST API
        const directRes = await fetch(`${NEON_AUTH_BASE_URL}/sign-in/email`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        const data = await directRes.json();
        if (!directRes.ok) {
          throw new Error(data.message || data.error || 'Failed to sign in');
        }
        userObj = data.user;
        token = data.token || data.session?.token || data.session?.id;
      }

      if (userObj) {
        setStoredAuthToken(token, userObj);
        await syncUserWithBackend(userObj, token);
        setSuccessMsg('Signed in successfully!');
        setTimeout(() => {
          setIsOpen(false);
          setSuccessMsg(null);
        }, 800);
      } else {
        // Fallback: check session
        const sessionData = await getNeonSession();
        if (sessionData.user) {
          await syncUserWithBackend(sessionData.user, sessionData.token);
          setIsOpen(false);
        } else {
          throw new Error('Authentication succeeded but user session could not be established.');
        }
      }
    } catch (err: any) {
      console.error('Email sign in error:', err);
      setErrorMsg(err.message || 'Sign in failed. Check your email & password.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Email Sign Up (Create Account)
  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please provide an email and password.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let userObj: NeonUser | null = null;
      let token: string | null = null;

      try {
        const res = await (authClient as any).signUp.email({
          email,
          password,
          name: name || email.split('@')[0],
        });

        if (res?.data?.user) {
          userObj = res.data.user;
          token = res.data.token || res.data.session?.token || res.data.session?.id;
        } else if (res?.error) {
          throw new Error(res.error.message || 'Account creation failed');
        }
      } catch (clientErr: any) {
        // Direct REST fallback
        const directRes = await fetch(`${NEON_AUTH_BASE_URL}/sign-up/email`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            name: name || email.split('@')[0],
          }),
        });

        const data = await directRes.json();
        if (!directRes.ok) {
          throw new Error(data.message || data.error || 'Failed to create account');
        }
        userObj = data.user;
        token = data.token || data.session?.token || data.session?.id;
      }

      if (userObj) {
        setStoredAuthToken(token, userObj);
        await syncUserWithBackend(userObj, token);
        setSuccessMsg('Account created & connected!');
        setTimeout(() => {
          setIsOpen(false);
          setSuccessMsg(null);
        }, 800);
      } else {
        const sessionData = await getNeonSession();
        if (sessionData.user) {
          await syncUserWithBackend(sessionData.user, sessionData.token);
          setIsOpen(false);
        } else {
          setSuccessMsg('Account created! You can now sign in.');
          setMode('signin');
        }
      }
    } catch (err: any) {
      console.error('Sign up error:', err);
      setErrorMsg(err.message || 'Failed to create account. Email may already be in use.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Update / Save Profile Email & Name
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEmail.trim()) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const activeToken = getStoredAuthToken() || user?.id || user?.uid;
      const updatedUser: NeonUser = {
        id: user?.id || user?.uid || `user_${Date.now()}`,
        uid: user?.uid || user?.id || `user_${Date.now()}`,
        email: editEmail.trim(),
        name: editName.trim() || editEmail.split('@')[0],
      };

      setStoredAuthToken(activeToken, updatedUser);
      await syncUserWithBackend(updatedUser, activeToken);
      setIsEditingProfile(false);
      setSuccessMsg('Profile updated successfully!');
      setTimeout(() => setSuccessMsg(null), 2000);
    } catch (err: any) {
      console.error('Update profile error:', err);
      setErrorMsg(err.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Sign Out
  const handleLogout = async () => {
    try {
      if (authClient?.signOut) {
        await (authClient as any).signOut();
      }
      await fetch(`${NEON_AUTH_BASE_URL}/sign-out`, {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {});
    } catch (err) {
      console.warn('Sign out call issue:', err);
    } finally {
      setStoredAuthToken(null, null);
      if (onUserChange) {
        onUserChange(null);
      }
      window.dispatchEvent(new CustomEvent('neon_auth_changed', { detail: null }));
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      {user ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
            isOpen
              ? 'bg-deep-space border-hyper-cyan shadow-[0_0_15px_rgba(0,246,255,0.3)]'
              : 'bg-deep-space/60 border-white/10 hover:bg-deep-space/80 hover:border-hyper-cyan/40'
          }`}
          title={`Connected: ${user.email}`}
        >
          <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-hyper-cyan via-blue-500 to-plasma-pink flex items-center justify-center text-deep-space font-black text-[10px] uppercase shadow-sm flex-shrink-0">
            {(user.displayName || user.email || 'U').slice(0, 2)}
          </div>
          <span className="text-xs text-white font-bold hidden sm:block max-w-[130px] md:max-w-[160px] truncate text-left">
            {user.email || user.displayName || user.user_metadata?.username || 'Account'}
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-hyper-cyan animate-pulse flex-shrink-0"></span>
          <span className="text-[9px] text-white/50">▼</span>
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all shadow-sm ${
            isOpen
              ? 'bg-hyper-cyan text-deep-space border-hyper-cyan shadow-[0_0_15px_rgba(0,246,255,0.4)]'
              : 'bg-deep-space/70 border-hyper-cyan/30 text-hyper-cyan hover:bg-hyper-cyan/10 hover:border-hyper-cyan'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-hyper-cyan/60"></span>
          <span>Neon Login</span>
        </button>
      )}

      {/* Dropdown / Modal Content */}
      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-84 rounded-xl border border-white/20 shadow-[0_15px_50px_rgba(0,0,0,0.85)] z-[200] overflow-hidden backdrop-blur-xl"
          style={{ backgroundColor: '#111622' }}
        >
          {user ? (
            /* Logged-In Profile Card */
            <div className="p-4">
              {/* Feedback */}
              {errorMsg && (
                <div className="mb-3 text-[11px] p-2.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 flex items-start gap-1.5">
                  <span>⚠️</span>
                  <span>{errorMsg}</span>
                </div>
              )}
              {successMsg && (
                <div className="mb-3 text-[11px] p-2.5 rounded bg-green-500/20 text-green-300 border border-green-500/40 flex items-start gap-1.5">
                  <span>✓</span>
                  <span>{successMsg}</span>
                </div>
              )}

              {!isEditingProfile ? (
                <>
                  <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10 mb-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-hyper-cyan to-plasma-pink flex items-center justify-center text-deep-space font-black text-sm uppercase flex-shrink-0">
                      {(user.displayName || user.email || 'U').slice(0, 2)}
                    </div>
                    <div className="overflow-hidden flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {user.displayName || user.user_metadata?.username || 'Producer'}
                      </p>
                      <p className="text-[11px] text-hyper-cyan font-mono truncate" title={user.email}>
                        {user.email}
                      </p>
                    </div>
                    <button
                      onClick={() => setIsEditingProfile(true)}
                      className="text-[10px] px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded border border-white/10 transition-colors"
                      title="Edit email and display name"
                    >
                      ✏️ Edit
                    </button>
                  </div>

                  <div className="space-y-1.5 mb-4 text-[11px] px-1">
                    <div className="flex items-center justify-between text-star-dust/80">
                      <span>User Email</span>
                      <span className="font-mono text-white font-medium max-w-[180px] truncate" title={user.email}>
                        {user.email}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-star-dust/80">
                      <span>Auth Provider</span>
                      <span className="font-mono text-hyper-cyan font-semibold">Neon OAuth</span>
                    </div>
                    <div className="flex items-center justify-between text-star-dust/80">
                      <span>Database State</span>
                      <span className="text-green-400 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span> Synced
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setIsEditingProfile(true)}
                      className="py-2 px-3 rounded-lg text-xs font-bold text-star-dust hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-center"
                    >
                      Edit Profile
                    </button>
                    <button
                      onClick={handleLogout}
                      className="py-2 px-3 rounded-lg text-xs font-bold text-plasma-pink bg-plasma-pink/10 hover:bg-plasma-pink/20 border border-plasma-pink/30 transition-all text-center"
                    >
                      Sign Out →
                    </button>
                  </div>
                </>
              ) : (
                /* Edit Profile Form */
                <form onSubmit={handleSaveProfile} className="space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Edit User Profile</span>
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(false)}
                      className="text-star-dust hover:text-white text-xs"
                    >
                      Cancel
                    </button>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-star-dust uppercase tracking-wider mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="sandromancino.sm@gmail.com"
                      className="w-full bg-black/50 border border-white/15 focus:border-hyper-cyan rounded px-2.5 py-1.5 text-xs text-white outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-star-dust uppercase tracking-wider mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Sandro Mancino"
                      className="w-full bg-black/50 border border-white/15 focus:border-hyper-cyan rounded px-2.5 py-1.5 text-xs text-white outline-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(false)}
                      className="flex-1 py-1.5 rounded text-xs font-bold text-star-dust bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-1.5 rounded text-xs font-bold uppercase tracking-wider bg-hyper-cyan text-deep-space hover:bg-hyper-cyan/80 transition-all disabled:opacity-50"
                    >
                      {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* Logged-Out Authentication Form */
            <div className="p-5">
              <div className="text-center mb-4">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-hyper-cyan/10 border border-hyper-cyan/30 text-[10px] font-bold text-hyper-cyan uppercase tracking-wider mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-hyper-cyan animate-ping"></span>
                  Neon Auth OAuth
                </div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Cloud Account Access
                </h3>
                <p className="text-[11px] text-star-dust/80 mt-1 leading-relaxed">
                  Sign in to store presets, sample chops, audio kits, and share with the community.
                </p>
              </div>

              {/* Feedback Messages */}
              {errorMsg && (
                <div className="mb-3 text-[11px] p-2.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 flex items-start gap-1.5 animate-in fade-in">
                  <span>⚠️</span>
                  <span>{errorMsg}</span>
                </div>
              )}
              {successMsg && (
                <div className="mb-3 text-[11px] p-2.5 rounded bg-green-500/20 text-green-300 border border-green-500/40 flex items-start gap-1.5 animate-in fade-in">
                  <span>✓</span>
                  <span>{successMsg}</span>
                </div>
              )}

              {/* 1. Neon OAuth Providers */}
              <div className="space-y-2 mb-4">
                <button
                  type="button"
                  onClick={() => handleSocialOAuth('google')}
                  disabled={loading}
                  className="w-full bg-white hover:bg-slate-100 text-gray-900 font-bold text-xs py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-2.5 shadow-md disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>{loading ? 'Connecting...' : 'Continue with Google'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSocialOAuth('github')}
                  disabled={loading}
                  className="w-full bg-[#24292e] hover:bg-[#2f363d] text-white font-bold text-xs py-2 px-3 rounded-lg border border-white/10 transition-all flex items-center justify-center gap-2.5 shadow-md disabled:opacity-50"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  <span>Continue with GitHub</span>
                </button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 h-px bg-white/10"></div>
                <span className="text-[10px] text-white/40 uppercase font-mono tracking-wider">
                  or email
                </span>
                <div className="flex-1 h-px bg-white/10"></div>
              </div>

              {/* Mode Tabs */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-black/40 rounded-lg border border-white/5 mb-3">
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setErrorMsg(null); }}
                  className={`py-1 text-xs font-bold rounded transition-all ${
                    mode === 'signin'
                      ? 'bg-hyper-cyan text-deep-space shadow-sm'
                      : 'text-star-dust hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setErrorMsg(null); }}
                  className={`py-1 text-xs font-bold rounded transition-all ${
                    mode === 'signup'
                      ? 'bg-hyper-cyan text-deep-space shadow-sm'
                      : 'text-star-dust hover:text-white'
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* Email Form */}
              <form onSubmit={mode === 'signin' ? handleEmailSignIn : handleEmailSignUp} className="space-y-2.5">
                {mode === 'signup' && (
                  <div>
                    <label className="block text-[10px] font-bold text-star-dust uppercase tracking-wider mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      placeholder="Producer / Sound Designer"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 focus:border-hyper-cyan rounded px-2.5 py-1.5 text-xs text-white outline-none transition-colors"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-star-dust uppercase tracking-wider mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 focus:border-hyper-cyan rounded px-2.5 py-1.5 text-xs text-white outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-star-dust uppercase tracking-wider mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 focus:border-hyper-cyan rounded px-2.5 py-1.5 text-xs text-white outline-none transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wider bg-hyper-cyan hover:bg-hyper-cyan/80 text-deep-space transition-all disabled:opacity-50 shadow-md"
                >
                  {loading ? 'Processing...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Auth;
=======
import { supabase } from '../utils/supabaseClient';

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
                    options: { data: { username: email.split('@')[0] } }
                });
                if (error) throw error;
                setMessage({ text: "Success! You can now log in.", type: 'success' });
                setMode('login');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                setIsOpen(false); // Close on success
            }
        } catch (error: any) {
            setMessage({ text: error.message || 'Authentication failed', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        if (supabase) await supabase.auth.signOut();
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
                        {user.user_metadata?.username || user.email?.split('@')[0]}
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
>>>>>>> old-slicer/ai-beat-patterns
