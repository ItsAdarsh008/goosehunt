import { db, hashToken, loadGame, newToken } from '@/lib/db';
import { cleanName, HttpError, readJson, route, type CodeCtx } from '@/lib/http';
import type { JoinResult } from '@/lib/types';

// Join as a hider. Late joiners are allowed while the game is running.
export const POST = route(async (req, { params }: CodeCtx): Promise<JoinResult> => {
  const { code } = await params;
  const game = await loadGame(code);
  if (game.status === 'ended') throw new HttpError(409, 'That game has ended');

  const name = cleanName((await readJson(req)).name);
  const token = newToken();
  const res = await db()
    .from('players')
    .insert({ game_id: game.id, name, role: 'hider', token_hash: hashToken(token) })
    .select('id')
    .single<{ id: string }>();
  if (res.error?.code === '23505') throw new HttpError(409, `“${name}” is taken in this game — pick another name`);
  if (res.error || !res.data) throw new Error(res.error?.message ?? 'Join failed');

  return { code: game.code, playerId: res.data.id, token };
});
