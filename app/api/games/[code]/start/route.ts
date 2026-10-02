import { authPlayer, check, db, requireHost, type PlayerRow } from '@/lib/db';
import { HttpError, route, type CodeCtx } from '@/lib/http';

export const POST = route(async (req, { params }: CodeCtx) => {
  const { code } = await params;
  const { game, player } = await authPlayer(req, code);
  requireHost(player);
  if (game.status !== 'lobby') throw new HttpError(409, 'Game already started');

  const players = check(
    await db().from('players').select('role').eq('game_id', game.id).returns<Pick<PlayerRow, 'role'>[]>(),
  );
  if (!players.some((p) => p.role === 'seeker')) throw new HttpError(409, 'Pick at least one seeker');
  if (!players.some((p) => p.role === 'hider')) throw new HttpError(409, 'Need at least one hider');

  check(
    await db()
      .from('games')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', game.id)
      .eq('status', 'lobby'),
  );
  return { ok: true };
});
