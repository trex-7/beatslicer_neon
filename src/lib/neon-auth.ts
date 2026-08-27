import { createAuthClient } from 'better-auth/react';

export const NEON_AUTH_BASE_URL =
  (typeof window !== 'undefined' && (window as any).__NEON_AUTH_URL__) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_NEON_AUTH_URL) ||
  'https://ep-restless-surf-axxduerp.neonauth.c-4.us-east-2.aws.neon.tech/Career2Canvas/auth';

export const NEON_AUTH_JWKS_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_NEON_AUTH_JWKS_URL) ||
  `${NEON_AUTH_BASE_URL}/.well-known/jwks.json`;

// Initialize Better Auth Client for Neon Auth
export const authClient = createAuthClient({
  baseURL: NEON_AUTH_BASE_URL,
  fetchOptions: {
    credentials: 'include',
  },
});

export interface NeonUser {
  id: string;
  uid?: string;
  email: string;
  name?: string;
  image?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  [key: string]: any;
}

export interface NeonSession {
  id: string;
  userId: string;
  token?: string;
  expiresAt: string | Date;
  [key: string]: any;
}

// Storage helpers for persisting active auth token
const TOKEN_KEY = 'neon_auth_token';
const USER_KEY = 'neon_auth_user';

export const getStoredAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
};

export const setStoredAuthToken = (token: string | null, user?: NeonUser | null) => {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else if (user === null) {
    localStorage.removeItem(USER_KEY);
  }
};

export const getStoredUser = (): NeonUser | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/**
 * Fetch current session from Neon Auth server (with backend proxy fallback)
 */
export async function getNeonSession(): Promise<{ user: NeonUser | null; session: NeonSession | null; token?: string | null }> {
  const activeToken = getStoredAuthToken();
  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
  };

  // 1. Try direct Neon Auth endpoint
  try {
    const res = await fetch(`${NEON_AUTH_BASE_URL}/get-session`, {
      method: 'GET',
      credentials: 'include',
      headers: authHeaders,
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.user) {
        const token = data.session?.token || data.session?.id || activeToken || data.token;
        setStoredAuthToken(token, data.user);
        return { user: data.user, session: data.session, token };
      }
    }
  } catch (error) {
    console.warn('Direct Neon session fetch failed, attempting backend proxy:', error);
  }

  // 2. Fallback to local server proxy endpoint (bypasses cross-site iframe cookie restrictions)
  try {
    const proxyRes = await fetch('/api/neon-auth/get-session', {
      method: 'GET',
      credentials: 'include',
      headers: authHeaders,
    });

    if (proxyRes.ok) {
      const proxyData = await proxyRes.json();
      if (proxyData && proxyData.user) {
        const token = proxyData.session?.token || proxyData.session?.id || activeToken || proxyData.token;
        setStoredAuthToken(token, proxyData.user);
        return { user: proxyData.user, session: proxyData.session, token };
      }
    }
  } catch (proxyError) {
    console.warn('Backend proxy Neon session fetch failed:', proxyError);
  }

  // 3. Fallback to persisted stored user
  const stored = getStoredUser();
  if (stored && activeToken) {
    return { user: stored, session: null, token: activeToken };
  }

  return { user: null, session: null, token: null };
}
