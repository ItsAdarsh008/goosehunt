import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';
import { HttpError } from './http';
import type { EndReason, GameStatus, Role } from './types';

export interface GameRow {
  id: string;
  code: string;
  status: GameStatus;
  ping_interval_seconds: number;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
  end_reason: EndReason | null;
  created_at: string;
}

export interface PlayerRow {
  id: string;
  game_id: string;
  name: string;
  role: Role;
  is_host: boolean;
  token_hash: string;
  caught_at: string | null;
  caught_by: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_accuracy: number | null;
  last_ping_at: string | null;
  last_ping_slot: number | null;
  joined_at: string;
}

export interface PingRow {
  player_id: string;
  slot: number;
  lat: number;
  lng: number;
  accuracy: number | null;
  created_at: string;
}

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new HttpError(500, 'Server is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (see SETUP.md)');
    }
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

type DbResult<T> = { data: T | null; error: { message: string; code?: string } | null };

/** Unwraps a Supabase result, throwing on error. */
export function check<T>(res: DbResult<T>): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
  return res.data as T;
}

export const newToken = () => randomBytes(24).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// No 0/O, 1/I/L — codes get read aloud across a quad.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newGameCode(): string {
  return Array.from(randomBytes(5), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export async function loadGame(code: string): Promise<GameRow> {
  const game = check(
    await db().from('games').select('*').eq('code', code.trim().toUpperCase()).maybeSingle<GameRow>(),
  );
  if (!game) throw new HttpError(404, 'Game not found — check the code');
  return game;
}

export async function authPlayer(req: Request, code: string) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new HttpError(401, 'Missing player token');
  const game = await expireIfOver(await loadGame(code));
  const player = check(
    await db()
      .from('players')
      .select('*')
      .eq('game_id', game.id)
      .eq('token_hash', hashToken(token))
      .maybeSingle<PlayerRow>(),
  );
  if (!player) throw new HttpError(401, 'You are not in this game');
  return { game, player };
}

export function requireHost(player: PlayerRow) {
  if (!player.is_host) throw new HttpError(403, 'Only the host can do that');
}

/** Ends the game in place if it is active and its time limit has passed. */
export async function expireIfOver(game: GameRow): Promise<GameRow> {
  if (game.status !== 'active' || !game.duration_seconds || !game.started_at) return game;
  const endsAt = Date.parse(game.started_at) + game.duration_seconds * 1000;
  if (Date.now() < endsAt) return game;
  return endGame(game, 'time', new Date(endsAt).toISOString());
}

export async function endGame(game: GameRow, reason: EndReason, at = new Date().toISOString()) {
  const rows = check(
    await db()
      .from('games')
      .update({ status: 'ended', ended_at: at, end_reason: reason })
      .eq('id', game.id)
      .eq('status', 'active')
      .select('*')
      .returns<GameRow[]>(),
  );
  return rows[0] ?? (await loadGame(game.code));
}

/** Ends the game if no uncaught hiders remain. */
export async function endIfAllCaught(game: GameRow) {
  const { count, error } = await db()
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', game.id)
    .eq('role', 'hider')
    .is('caught_at', null);
  if (error) throw new Error(error.message);
  if (count === 0) await endGame(game, 'all_caught');
}
