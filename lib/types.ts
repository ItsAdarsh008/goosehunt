export type GameStatus = 'lobby' | 'active' | 'ended';
export type Role = 'hider' | 'seeker';
export type EndReason = 'host' | 'time' | 'all_caught';

export interface PingPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  at: string;
  slot: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  role: Role;
  isHost: boolean;
  caughtAt: string | null;
  caughtByName: string | null;
  lastPingAt: string | null;
  lastPingSlot: number | null;
  /** Last broadcast location — only present if the viewer is allowed to see it. */
  location: PingPoint | null;
  /** Earlier pings, newest first (excludes `location`). */
  trail: PingPoint[];
}

export interface GameInfo {
  code: string;
  status: GameStatus;
  pingIntervalSeconds: number;
  durationSeconds: number | null;
  startedAt: string | null;
  endedAt: string | null;
  endReason: EndReason | null;
}

export interface GameState {
  serverNow: string;
  game: GameInfo;
  meId: string;
  players: PublicPlayer[];
}

export interface JoinResult {
  code: string;
  playerId: string;
  token: string;
}
