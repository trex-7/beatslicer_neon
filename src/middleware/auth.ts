import { Request, Response, NextFunction } from 'express';
import { verifyNeonAuthToken, DecodedNeonToken } from '../lib/neon-auth-server.ts';

export interface AuthRequest extends Request {
  user?: DecodedNeonToken;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization token' });
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Empty token' });
  }

  try {
    const decodedUser = await verifyNeonAuthToken(token);
    if (!decodedUser || !decodedUser.uid) {
      return res.status(401).json({ error: 'Unauthorized: Invalid Neon Auth token or session expired' });
    }
    req.user = decodedUser;
    next();
  } catch (error) {
    console.error('Error verifying Neon Auth token:', error);
    return res.status(401).json({ error: 'Unauthorized: Token validation failed' });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1]?.trim();
    if (token) {
      try {
        const decodedUser = await verifyNeonAuthToken(token);
        if (decodedUser && decodedUser.uid) {
          req.user = decodedUser;
        }
      } catch (error) {
        // Ignore token error for optional auth
      }
    }
  }
  next();
};
