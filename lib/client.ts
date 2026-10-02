// Browser-only helpers: API calls, per-game session storage, formatting.

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, opts: { token?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.body !== undefined ? 'POST' : 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'No connection — check your signal');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface Session {
  playerId: string;
  token: string;
}

const sessionKey = (code: string) => `goosehunt:${code.toUpperCase()}`;

export function loadSession(code: string): Session | null {
  try {
    const raw = localStorage.getItem(sessionKey(code));
    const s = raw ? JSON.parse(raw) : null;
    return s && typeof s.token === 'string' && typeof s.playerId === 'string' ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(code: string, s: Session) {
  try {
    localStorage.setItem(sessionKey(code), JSON.stringify(s));
  } catch {
    /* storage blocked — the rejoin link still works */
  }
}

export function clearSession(code: string) {
  try {
    localStorage.removeItem(sessionKey(code));
  } catch {
    /* ignore */
  }
}

/** Rejoin links carry the session in the URL hash (never sent to the server in logs). */
export function rejoinLink(code: string, s: Session) {
  return `${location.origin}/g/${code}#p=${encodeURIComponent(s.playerId)}&t=${encodeURIComponent(s.token)}`;
}

export function sessionFromHash(): Session | null {
  const params = new URLSearchParams(location.hash.slice(1));
  const playerId = params.get('p');
  const token = params.get('t');
  return playerId && token ? { playerId, token } : null;
}

export function fmtClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function fmtAgo(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

export function fmtDistance(m: number) {
  return m < 1000 ? `${Math.round(m / 5) * 5} m` : `${(m / 1000).toFixed(1)} km`;
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern); // Android only; iOS Safari ignores it
  } catch {
    /* ignore */
  }
}
