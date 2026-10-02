import { check, db, hashToken, newGameCode, newToken, type GameRow } from '@/lib/db';
import { cleanName, HttpError, readJson, route } from '@/lib/http';
import type { JoinResult } from '@/lib/types';

const PING_CHOICES = [1, 2, 3, 5, 10, 15];

// Create a game. The creator becomes the host (and starts as a seeker — they can switch in the lobby).
export const POST = route(async (req): Promise<JoinResult> => {
  const body = await readJson(req);
  const name = cleanName(body.name);

  const pingMinutes = Number(body.pingIntervalMinutes ?? 5);
  if (!PING_CHOICES.includes(pingMinutes)) throw new HttpError(400, 'Invalid ping interval');

  const durationMinutes = body.durationMinutes == null ? null : Number(body.durationMinutes);
  if (durationMinutes !== null && !(Number.isInteger(durationMinutes) && durationMinutes >= 5 && durationMinutes <= 600)) {
    throw new HttpError(400, 'Invalid duration');
  }

  let game: GameRow | null = null;
  for (let attempt = 0; attempt < 5 && !game; attempt++) {
    const res = await db()
      .from('games')
      .insert({
        code: newGameCode(),
        ping_interval_seconds: pingMinutes * 60,
        duration_seconds: durationMinutes === null ? null : durationMinutes * 60,
      })
      .select('*')
      .single<GameRow>();
    if (res.error?.code === '23505') continue; // code collision, try another
    game = check(res);
  }
  if (!game) throw new HttpError(503, 'Could not allocate a game code, try again');

  const token = newToken();
  const player = check(
    await db()
      .from('players')
      .insert({ game_id: game.id, name, role: 'seeker', is_host: true, token_hash: hashToken(token) })
      .select('id')
      .single<{ id: string }>(),
  );

  return { code: game.code, playerId: player.id, token };
});
