import { authPlayer, check, db, type GameRow, type PingRow, type PlayerRow } from '@/lib/db';
import { route, type CodeCtx } from '@/lib/http';
import { currentSlot } from '@/lib/slots';
import type { GameState, PingPoint, PublicPlayer } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TRAIL_LENGTH = 3;

/** Seekers see hiders; everyone sees themselves; everyone sees everything once the game ends. */
function canSeeLocation(game: GameRow, viewer: PlayerRow, target: PlayerRow) {
  return game.status === 'ended' || viewer.id === target.id || (viewer.role === 'seeker' && target.role === 'hider');
}

const toPoint = (p: PingRow): PingPoint => ({
  lat: p.lat,
  lng: p.lng,
  accuracy: p.accuracy,
  at: p.created_at,
  slot: p.slot,
});

export const GET = route(async (req, { params }: CodeCtx): Promise<GameState> => {
  const { code } = await params;
  const { game, player: me } = await authPlayer(req, code);

  const players = check(
    await db().from('players').select('*').eq('game_id', game.id).order('joined_at').returns<PlayerRow[]>(),
  );

  const visible = players.filter((p) => canSeeLocation(game, me, p));
  const pingsByPlayer = new Map<string, PingRow[]>();
  if (game.started_at && visible.length) {
    const nowMs = game.ended_at ? Date.parse(game.ended_at) : Date.now();
    const slot = currentSlot(game.started_at, game.ping_interval_seconds, nowMs);
    const pings = check(
      await db()
        .from('pings')
        .select('player_id, slot, lat, lng, accuracy, created_at')
        .eq('game_id', game.id)
        .in('player_id', visible.map((p) => p.id))
        .gte('slot', Math.max(1, slot - TRAIL_LENGTH))
        .order('slot', { ascending: false })
        .returns<PingRow[]>(),
    );
    for (const p of pings) {
      const list = pingsByPlayer.get(p.player_id) ?? [];
      list.push(p);
      pingsByPlayer.set(p.player_id, list);
    }
  }

  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const out: PublicPlayer[] = players.map((p) => {
    const seen = canSeeLocation(game, me, p);
    const location: PingPoint | null =
      seen && p.last_lat != null && p.last_lng != null && p.last_ping_at && p.last_ping_slot != null
        ? { lat: p.last_lat, lng: p.last_lng, accuracy: p.last_accuracy, at: p.last_ping_at, slot: p.last_ping_slot }
        : null;
    const trail = seen
      ? (pingsByPlayer.get(p.id) ?? []).filter((x) => x.slot !== p.last_ping_slot).slice(0, TRAIL_LENGTH).map(toPoint)
      : [];
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      isHost: p.is_host,
      caughtAt: p.caught_at,
      caughtByName: p.caught_by ? (nameById.get(p.caught_by) ?? null) : null,
      lastPingAt: p.last_ping_at,
      lastPingSlot: p.last_ping_slot,
      location,
      trail,
    };
  });

  return {
    serverNow: new Date().toISOString(),
    meId: me.id,
    game: {
      code: game.code,
      status: game.status,
      pingIntervalSeconds: game.ping_interval_seconds,
      durationSeconds: game.duration_seconds,
      startedAt: game.started_at,
      endedAt: game.ended_at,
      endReason: game.end_reason,
    },
    players: out,
  };
});
