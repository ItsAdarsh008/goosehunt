import { authPlayer, check, db, requireHost } from '@/lib/db';
import { HttpError, readJson, route, type CodeCtx } from '@/lib/http';

// Host assigns roles in the lobby.
export const POST = route(async (req, { params }: CodeCtx) => {
  const { code } = await params;
  const { game, player } = await authPlayer(req, code);
  requireHost(player);
  if (game.status !== 'lobby') throw new HttpError(409, 'Roles are locked once the game starts');

  const body = await readJson(req);
  const role = body.role;
  if (role !== 'hider' && role !== 'seeker') throw new HttpError(400, 'Invalid role');
  if (typeof body.playerId !== 'string') throw new HttpError(400, 'Missing playerId');

  const rows = check(
    await db().from('players').update({ role }).eq('id', body.playerId).eq('game_id', game.id).select('id'),
  );
  if (!rows?.length) throw new HttpError(404, 'Player not found');
  return { ok: true };
});
