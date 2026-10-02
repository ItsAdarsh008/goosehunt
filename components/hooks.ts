'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/client';
import type { GameState } from '@/lib/types';

const POLL_MS = 5000;

/** Polls game state while the page is visible, and keeps a server clock offset. */
export function useGameState(code: string, token: string, onAuthLost: (msg: string) => void) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const authLost = useRef(onAuthLost);
  authLost.current = onAuthLost;

  const refresh = useCallback(async () => {
    const t0 = Date.now();
    try {
      const s = await api<GameState>(`/api/games/${code}/state`, { token });
      const t1 = Date.now();
      setOffset(Date.parse(s.serverNow) - (t0 + t1) / 2);
      setState(s);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 404)) authLost.current(e.message);
      else setError(e instanceof Error ? e.message : 'Connection problem');
    }
  }, [code, token]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', refresh);
    };
  }, [refresh]);

  return { state, error, offset, refresh };
}

/** Re-renders every `ms` and returns Date.now(). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Bumps whenever the page comes back to the foreground. */
function useForegroundNonce() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') setN((x) => x + 1);
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onVis);
    };
  }, []);
  return n;
}

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
  /** Local receipt time (ms). Some iOS versions report odd position timestamps. */
  at: number;
}

/**
 * Watches GPS while enabled. The watch is restarted on returning to the foreground,
 * because mobile Safari can silently stop delivering updates after the tab was hidden.
 */
export function useGeolocation(enabled: boolean) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const nonce = useForegroundNonce();

  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) {
      setError('This browser has no location support');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now() });
        setError(null);
        setDenied(false);
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          setDenied(true);
          setError('Location permission denied');
        } else if (e.code === e.POSITION_UNAVAILABLE) {
          setError('GPS unavailable — try stepping outside');
        }
        // TIMEOUT is transient during a watch; keep the last fix.
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, nonce]);

  return { fix, error, denied };
}

/** Holds a screen wake lock (Android Chrome, iOS Safari 16.4+) while enabled. */
export function useWakeLock(enabled: boolean) {
  const [supported, setSupported] = useState(true);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!('wakeLock' in navigator)) {
      setSupported(false);
      return;
    }
    if (!enabled) return;
    let sentinel: WakeLockSentinel | null = null;
    let pending = false;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || sentinel || pending || document.visibilityState !== 'visible') return;
      pending = true;
      try {
        const s = await navigator.wakeLock.request('screen');
        if (cancelled) {
          s.release();
          return;
        }
        sentinel = s;
        setActive(true);
        s.addEventListener('release', () => {
          sentinel = null;
          setActive(false);
        });
      } catch {
        setActive(false); // e.g. iOS wants a user gesture first — retried on next tap
      } finally {
        pending = false;
      }
    };

    acquire();
    const onVis = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('pointerdown', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('pointerdown', acquire);
      sentinel?.release();
      setActive(false);
    };
  }, [enabled]);

  return { supported, active };
}
