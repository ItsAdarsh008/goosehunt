import { authPlayer, check, db, endIfAllCaught, type PlayerRow } from '@/lib/db';
import { HttpError, readJson, route, type CodeCtx } from '@/lib/http';

// Mark a hider caught. Allowed for any seeker, the host, or the hider themself.
export const POST = route(async (req, { params }: CodeCtx) => {
  const { code } = await params;
  const { game, player } = await authPlayer(req, code);
  if (game.status !== 'active') throw new HttpError(409, 'Game is not running');

  const body = await readJson(req);
  const targetId = typeof body.playerId === 'string' ? body.playerId : player.id;
  if (!(player.role === 'seeker' || player.is_host || player.id === targetId)) {
    throw new HttpError(403, 'Only seekers can tag other players');
  }

  const target = check(
    await db().from('players').select('*').eq('id', targetId).eq('game_id', game.id).maybeSingle<PlayerRow>(),
  );
  if (!target) throw new HttpError(404, 'Player not found');
  if (target.role !== 'hider') throw new HttpError(409, 'Only hiders can be caught');
  if (target.caught_at) return { ok: true };

  check(
    await db()
      .from('players')
      .update({ caught_at: new Date().toISOString(), caught_by: player.role === 'seeker' ? player.id : null })
      .eq('id', target.id)
      .is('caught_at', null),
  );
  await endIfAllCaught(game);
  return { ok: true };
});
