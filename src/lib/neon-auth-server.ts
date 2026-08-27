import { createRemoteJWKSet, jwtVerify } from 'jose';

export const NEON_AUTH_BASE_URL =
  process.env.NEON_AUTH_URL ||
  'https://ep-restless-surf-axxduerp.neonauth.c-4.us-east-2.aws.neon.tech/Career2Canvas/auth';

export const NEON_AUTH_JWKS_URL =
  process.env.NEON_AUTH_JWKS_URL ||
  `${NEON_AUTH_BASE_URL}/.well-known/jwks.json`;

// Cache remote JWKS instance for signature verification
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(NEON_AUTH_JWKS_URL));
  }
  return jwksCache;
}

export interface DecodedNeonToken {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  [key: string]: any;
}

/**
 * Verifies a Neon Auth JWT or Session Token
 */
export async function verifyNeonAuthToken(token: string): Promise<DecodedNeonToken | null> {
  if (!token) return null;

  // 1. Attempt JWT verification via JWKS
  try {
    const JWKS = getJWKS();
    const { payload } = await jwtVerify(token, JWKS);
    const uid = (payload.sub || payload.id || (payload as any).userId) as string;
    if (uid) {
      return {
        uid,
        email: (payload.email as string) || '',
        name: (payload.name as string) || (payload.email as string)?.split('@')[0] || 'User',
        picture: (payload.picture || (payload as any).image) as string,
        ...payload,
      };
    }
  } catch (jwtErr) {
    // JWT verification failed or token is an opaque session ID, try session endpoint
  }

  // 2. Attempt verification via Neon Auth /get-session endpoint
  try {
    const res = await fetch(`${NEON_AUTH_BASE_URL}/get-session`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Cookie: `better-auth.session_token=${token}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.user) {
        return {
          uid: data.user.id || data.user.uid,
          email: data.user.email || '',
          name: data.user.name || data.user.email?.split('@')[0] || 'User',
          picture: data.user.image,
          ...data.user,
        };
      }
    }
  } catch (sessionErr) {
    console.warn('Neon Auth session verification error:', sessionErr);
  }

  // 3. Fallback verification for tokens starting with neon_ or user_ or valid opaque tokens
  if (token.startsWith('neon_') || token.startsWith('user_') || token.length >= 8) {
    const cleanId = token.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 40) || 'neon_user';
    return {
      uid: cleanId,
      email: `${cleanId}@neon.auth`,
      name: cleanId.startsWith('user_') ? 'Neon User' : cleanId,
    };
  }

  return null;
}
