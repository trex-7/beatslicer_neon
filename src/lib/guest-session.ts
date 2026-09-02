/**
 * Guest Session & Spend Control Service
 * 
 * Manages public guest access with a 5-minute AI pattern trial window.
 * After 5 minutes, the app automatically and seamlessly falls back to the
 * zero-cost, high-performance Algorithmic Music-Theory Pattern Engine
 * to control public app/AI spend.
 */

export const GUEST_AI_TIME_LIMIT_SECONDS = 300; // 5 minutes

export interface GuestStatus {
  isGuest: boolean;
  sessionStart: number;
  timeRemainingSeconds: number;
  timeElapsedSeconds: number;
  isAiLimitReached: boolean;
  formattedRemaining: string;
}

export function getGuestSessionStartTime(): number {
  if (typeof window === 'undefined') return Date.now();
  
  let startStr = localStorage.getItem('beat_slicer_guest_session_start');
  if (!startStr) {
    const now = Date.now();
    localStorage.setItem('beat_slicer_guest_session_start', String(now));
    return now;
  }
  
  const start = parseInt(startStr, 10);
  if (isNaN(start) || start <= 0) {
    const now = Date.now();
    localStorage.setItem('beat_slicer_guest_session_start', String(now));
    return now;
  }
  
  return start;
}

export function getGuestStatus(user?: any, customApiKey?: string): GuestStatus {
  // If user is authenticated or custom API key is provided, not restricted by guest 5-min limit
  const isGuest = !user && (!customApiKey || customApiKey.trim().length === 0);
  
  if (!isGuest) {
    return {
      isGuest: false,
      sessionStart: 0,
      timeRemainingSeconds: GUEST_AI_TIME_LIMIT_SECONDS,
      timeElapsedSeconds: 0,
      isAiLimitReached: false,
      formattedRemaining: 'Unlimited',
    };
  }

  const sessionStart = getGuestSessionStartTime();
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - sessionStart) / 1000));
  const remainingSeconds = Math.max(0, GUEST_AI_TIME_LIMIT_SECONDS - elapsedSeconds);
  const isAiLimitReached = remainingSeconds <= 0;

  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const formattedRemaining = `${mins}:${secs.toString().padStart(2, '0')}`;

  return {
    isGuest: true,
    sessionStart,
    timeRemainingSeconds: remainingSeconds,
    timeElapsedSeconds: elapsedSeconds,
    isAiLimitReached,
    formattedRemaining,
  };
}
