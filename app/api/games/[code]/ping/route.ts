import { authPlayer, check, db } from '@/lib/db';
import { HttpError, readJson, route, type CodeCtx } from '@/lib/http';
import { currentSlot } from '@/lib/slots';

function num(v: unknown, min: number, max: number, label: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `Invalid ${label}`);
  return n;
}

// A hider broadcasts their location for the current slot. One ping per slot; repeats are no-ops.
export const POST = route(async (req, { params }: CodeCtx) => {
  const { code } = await params;
  const { game, player } = await authPlayer(req, code);

  if (game.status !== 'active' || !game.started_at) throw new HttpError(409, 'Game is not running');
  if (player.role !== 'hider') throw new HttpError(403, 'Only hiders send pings');
  if (player.caught_at) throw new HttpError(409, 'You have been caught');

  const slot = currentSlot(game.started_at, game.ping_interval_seconds, Date.now());
  if (slot < 1) throw new HttpError(409, 'Head start — the first ping is not due yet');
  if (player.last_ping_slot != null && player.last_ping_slot >= slot) return { ok: true, slot, duplicate: true };

  const body = await readJson(req);
  const lat = num(body.lat, -90, 90, 'latitude');
  const lng = num(body.lng, -180, 180, 'longitude');
  const accuracy = body.accuracy == null ? null : num(body.accuracy, 0, 100_000, 'accuracy');
  const at = new Date().toISOString();

  // Conditional update guards against two tabs racing for the same slot.
  const updated = check(
    await db()
      .from('players')
      .update({ last_lat: lat, last_lng: lng, last_accuracy: accuracy, last_ping_at: at, last_ping_slot: slot })
      .eq('id', player.id)
      .or(`last_ping_slot.is.null,last_ping_slot.lt.${slot}`)
      .select('id'),
  );
  if (!updated?.length) return { ok: true, slot, duplicate: true };

  check(
    await db().from('pings').insert({ game_id: game.id, player_id: player.id, slot, lat, lng, accuracy, created_at: at }),
  );
  return { ok: true, slot, at };
});
