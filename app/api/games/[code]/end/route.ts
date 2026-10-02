import { authPlayer, endGame, requireHost } from '@/lib/db';
import { HttpError, route, type CodeCtx } from '@/lib/http';

export const POST = route(async (req, { params }: CodeCtx) => {
  const { code } = await params;
  const { game, player } = await authPlayer(req, code);
  requireHost(player);
  if (game.status !== 'active') throw new HttpError(409, 'Game is not running');
  await endGame(game, 'host');
  return { ok: true };
});
