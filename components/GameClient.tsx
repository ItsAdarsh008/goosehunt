'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  ApiError,
  buzz,
  clearSession,
  distanceMeters,
  fmtAgo,
  fmtClock,
  fmtDistance,
  isIOS,
  loadSession,
  rejoinLink,
  saveSession,
  sessionFromHash,
  type Session,
} from '@/lib/client';
import { currentSlot, slotStartMs } from '@/lib/slots';
import type { GameState, JoinResult, PublicPlayer } from '@/lib/types';
import type { MapCommand, MapMarker } from './GameMap';
import { useGameState, useGeolocation, useNow, useWakeLock, type Fix } from './hooks';

const GameMap = dynamic(() => import('./GameMap'), { ssr: false, loading: () => <div className="map" /> });

/** A GPS fix older than this is not good enough to broadcast. */
const FIX_MAX_AGE_MS = 60_000;
/** A hider is flagged "missed" if they haven't pinged this long into a slot. */
const MISSED_GRACE_MS = 45_000;

export default function GameClient({ code }: { code: string }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const fromHash = sessionFromHash();
    if (fromHash) {
      saveSession(code, fromHash);
      history.replaceState(null, '', location.pathname);
      setSession(fromHash);
    } else {
      setSession(loadSession(code));
    }
  }, [code]);

  if (session === undefined) return <Splash text="Loading…" />;
  if (!session) {
    return (
      <JoinGate
        code={code}
        notice={notice}
        onJoined={(s) => {
          saveSession(code, s);
          setNotice(null);
          setSession(s);
        }}
      />
    );
  }
  return (
    <Game
      key={session.token}
      code={code}
      session={session}
      onLeave={(msg) => {
        clearSession(code);
        setNotice(msg ?? null);
        setSession(null);
      }}
    />
  );
}

/* ───────────────────────────── Join ───────────────────────────── */

function JoinGate({ code, notice, onJoined }: { code: string; notice: string | null; onJoined: (s: Session) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<JoinResult>(`/api/games/${code}/join`, { body: { name } });
      onJoined({ playerId: r.playerId, token: r.token });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join');
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <TopBar code={code} />
      {notice && <div className="banner">{notice}</div>}
      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}
      <form className="card" onSubmit={submit}>
        <h2>
          Join game <span className="mono">{code}</span>
        </h2>
        <label className="field">
          <span>Your name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="Honk McGee"
            autoComplete="nickname"
            autoFocus
            required
          />
        </label>
        <button className="btn btn--primary" disabled={busy}>
          {busy ? 'Joining…' : 'Join'}
        </button>
      </form>
      <p className="muted center">
        Already joined on another browser? Use your rejoin link from that device, or <Link href="/">start over</Link>.
      </p>
    </main>
  );
}

/* ───────────────────────────── Game shell ───────────────────────────── */

function Game({ code, session, onLeave }: { code: string; session: Session; onLeave: (msg?: string) => void }) {
  const { state, error, offset, refresh } = useGameState(code, session.token, (msg) => onLeave(msg));
  const now = useNow(1000) + offset;

  const game = state?.game;
  const me = state?.players.find((p) => p.id === state.meId);
  const status = game?.status;
  const hiderLive = status === 'active' && me?.role === 'hider' && !me.caughtAt;

  // GPS: start automatically if already permitted, otherwise on tap (or when the game starts).
  const [geoRequested, setGeoRequested] = useState(false);
  useEffect(() => {
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        if (p.state === 'granted') setGeoRequested(true);
      })
      .catch(() => {});
  }, []);
  const geo = useGeolocation((geoRequested || status === 'active') && status !== 'ended');
  const wake = useWakeLock(status === 'active');

  const slot = game ? currentSlot(game.startedAt, game.pingIntervalSeconds, now) : 0;

  // ── Hider broadcast loop: once per slot, as soon as a fresh fix is available.
  const lastSent = useRef(-1);
  const inflight = useRef(false);
  const retryAt = useRef(0);
  const [pingNote, setPingNote] = useState<{ kind: 'ok' | 'wait' | 'err'; text: string } | null>(null);
  useEffect(() => {
    if (me?.lastPingSlot != null) lastSent.current = Math.max(lastSent.current, me.lastPingSlot);
  }, [me?.lastPingSlot]);

  useEffect(() => {
    if (!hiderLive || slot < 1 || lastSent.current >= slot || inflight.current || Date.now() < retryAt.current) return;
    const fix = geo.fix;
    if (!fix || Date.now() - fix.at > FIX_MAX_AGE_MS) {
      setPingNote({ kind: 'wait', text: geo.denied ? 'Ping blocked — location is off' : 'Ping due — waiting for GPS…' });
      return;
    }
    inflight.current = true;
    setPingNote({ kind: 'wait', text: 'Sending ping…' });
    api<{ slot: number }>(`/api/games/${code}/ping`, {
      token: session.token,
      body: { lat: fix.lat, lng: fix.lng, accuracy: Math.round(fix.accuracy) },
    })
      .then((r) => {
        lastSent.current = Math.max(lastSent.current, r.slot);
        setPingNote({ kind: 'ok', text: 'Location pinged to seekers' });
        buzz([120, 80, 120]);
        refresh();
      })
      .catch((e) => {
        retryAt.current = Date.now() + 5000;
        setPingNote({ kind: 'err', text: `Ping failed: ${e instanceof Error ? e.message : 'error'} — retrying` });
        if (e instanceof ApiError && e.status === 409) refresh();
      })
      .finally(() => {
        inflight.current = false;
      });
  }, [hiderLive, slot, geo.fix, geo.denied, now, code, session.token, refresh]);

  // ── Seekers: buzz when a new round of pings lands.
  const seenSlot = useRef<number | null>(null);
  const newestPing = state ? Math.max(0, ...state.players.map((p) => p.lastPingSlot ?? 0)) : 0;
  useEffect(() => {
    if (me?.role !== 'seeker') return;
    if (seenSlot.current !== null && newestPing > seenSlot.current) buzz([60, 40, 60, 40, 60]);
    seenSlot.current = newestPing;
  }, [newestPing, me?.role]);

  // ── Actions
  const [actionError, setActionError] = useState<string | null>(null);
  const act = async (path: string, body: Record<string, unknown> = {}) => {
    setActionError(null);
    try {
      await api(`/api/games/${code}/${path}`, { token: session.token, body });
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  if (!state || !game || !me) {
    return <Splash text={error ?? 'Loading game…'} />;
  }

  const ctx: Ctx = {
    code,
    session,
    state,
    me,
    now,
    slot,
    geo,
    wake,
    act,
    onLeave,
    requestGeo: () => setGeoRequested(true),
    geoRequested,
    error: actionError ?? error,
    pingNote,
  };

  if (status === 'lobby') return <Lobby {...ctx} />;
  if (status === 'ended') return <Results {...ctx} />;
  return <Play {...ctx} />;
}

interface Ctx {
  code: string;
  session: Session;
  state: GameState;
  me: PublicPlayer;
  now: number;
  slot: number;
  geo: { fix: Fix | null; error: string | null; denied: boolean };
  wake: { supported: boolean; active: boolean };
  act: (path: string, body?: Record<string, unknown>) => Promise<void>;
  onLeave: (msg?: string) => void;
  requestGeo: () => void;
  geoRequested: boolean;
  error: string | null;
  pingNote: { kind: 'ok' | 'wait' | 'err'; text: string } | null;
}

/* ───────────────────────────── Lobby ───────────────────────────── */

function Lobby(c: Ctx) {
  const { state, me, act } = c;
  const g = state.game;
  const seekers = state.players.filter((p) => p.role === 'seeker').length;
  const hiders = state.players.length - seekers;
  const canStart = seekers > 0 && hiders > 0;
  const [shareNote, setShareNote] = useState<string | null>(null);

  async function share() {
    const url = `${location.origin}/g/${g.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Goosehunt', text: `Join my Goosehunt game — code ${g.code}`, url });
        return;
      } catch {
        /* cancelled — fall through to copy */
      }
    }
    setShareNote((await copyText(url)) ? 'Link copied' : url);
  }

  return (
    <main className="page">
      <TopBar code={g.code} onLeave={() => c.onLeave()} />
      {c.error && <div className="banner banner--error">{c.error}</div>}

      <section className="card card--code">
        <span className="eyebrow">Game code</span>
        <div className="bigcode">{g.code}</div>
        <button className="btn btn--dark" onClick={share}>
          Invite players
        </button>
        {shareNote && <span className="muted small">{shareNote}</span>}
      </section>

      <section className="card">
        <h2>
          Players <span className="muted">· {state.players.length}</span>
        </h2>
        <ul className="roster">
          {state.players.map((p) => (
            <li key={p.id} className="roster__row">
              <span className="roster__name">
                {p.name}
                {p.id === me.id && <span className="muted"> (you)</span>}
                {p.isHost && <span className="tag">host</span>}
              </span>
              {me.isHost ? (
                <span className="seg" role="group" aria-label={`Role for ${p.name}`}>
                  {(['hider', 'seeker'] as const).map((r) => (
                    <button
                      key={r}
                      className={p.role === r ? 'seg__btn seg__btn--on' : 'seg__btn'}
                      onClick={() => p.role !== r && act('role', { playerId: p.id, role: r })}
                    >
                      {r}
                    </button>
                  ))}
                </span>
              ) : (
                <RoleChip role={p.role} />
              )}
            </li>
          ))}
        </ul>
        <p className="muted small">
          Ping every {g.pingIntervalSeconds / 60} min · head start {g.pingIntervalSeconds / 60} min ·{' '}
          {g.durationSeconds ? `${g.durationSeconds / 60} min game` : 'no time limit'}
        </p>
      </section>

      <LocationCard {...c} />

      {me.isHost ? (
        <div className="stack">
          <button className="btn btn--primary btn--big" disabled={!canStart} onClick={() => act('start')}>
            Start game
          </button>
          {!canStart && (
            <p className="muted small center">
              {seekers === 0 ? 'Make at least one player a seeker.' : 'Need at least one hider.'}
            </p>
          )}
        </div>
      ) : (
        <div className="waiting">
          <span className="pulse" aria-hidden /> Waiting for the host to start…
          <div className="muted small">
            You’re a <b>{me.role}</b>.
          </div>
        </div>
      )}

      <section className="card card--muted">
        <h3>Before you run</h3>
        <ul className="tips">
          <li>
            <b>Hiders: keep this page open with the screen on.</b> Phones don’t let websites share location from a
            locked screen or another app. If you switch away, your ping goes out the moment you come back — marked late.
          </li>
          <li>Charge up. GPS plus an always-on screen uses battery.</li>
          <li>
            Optional: add Goosehunt to your home screen ({isIOSSafe() ? 'Share → Add to Home Screen' : 'menu ⋮ → Add to Home screen'}
            ) for a full-screen view.
          </li>
        </ul>
        <RejoinLink code={c.code} session={c.session} />
      </section>
    </main>
  );
}

function LocationCard({ geo, geoRequested, requestGeo, me }: Ctx) {
  const ready = !!geo.fix;
  return (
    <section className={`card ${ready ? '' : 'card--attention'}`}>
      <h2>Location</h2>
      {ready ? (
        <p className="ok">✓ Location ready · ±{Math.round(geo.fix!.accuracy)} m</p>
      ) : geo.denied ? (
        <LocationHelp />
      ) : geoRequested ? (
        <p className="muted">{geo.error ?? 'Getting a GPS fix… (allow the prompt if one appears)'}</p>
      ) : (
        <>
          <p className="muted small">
            {me.role === 'hider'
              ? 'Required for hiders — your position is sent to seekers at every ping.'
              : 'Seekers: shows you on the map and the distance to each hider. Never shared.'}
          </p>
          <button className="btn btn--primary" onClick={requestGeo}>
            Enable location
          </button>
        </>
      )}
    </section>
  );
}

function LocationHelp() {
  return (
    <div className="help">
      <p>
        <b>Location is blocked.</b> Turn it on, then reload this page:
      </p>
      {isIOSSafe() ? (
        <ol>
          <li>Settings → Privacy &amp; Security → Location Services → On.</li>
          <li>
            In that list: <b>Safari Websites</b> (or Chrome) → <b>While Using the App</b>, Precise Location on.
          </li>
          <li>
            In Safari, tap <b>aA</b> → Website Settings → Location → <b>Allow</b>.
          </li>
        </ol>
      ) : (
        <ol>
          <li>Turn on Location in your quick settings.</li>
          <li>
            Tap the icon left of the address bar → Permissions → <b>Location → Allow</b>.
          </li>
        </ol>
      )}
      <button className="btn btn--dark" onClick={() => location.reload()}>
        Reload
      </button>
    </div>
  );
}

/* ───────────────────────────── Play ───────────────────────────── */

function Play(c: Ctx) {
  const { state, me, now, slot, geo } = c;
  const g = state.game;
  const startedAt = g.startedAt!;
  const isSeeker = me.role === 'seeker';
  const [cmd, setCmd] = useState<MapCommand | null>(null);
  const command = (kind: MapCommand['kind'], lat?: number, lng?: number) =>
    setCmd((prev) => ({ kind, lat, lng, n: (prev?.n ?? 0) + 1 }));

  const nextPingAt = slotStartMs(startedAt, g.pingIntervalSeconds, slot + 1);
  const endsAt = g.durationSeconds ? Date.parse(startedAt) + g.durationSeconds * 1000 : null;
  const finalStretch = endsAt !== null && nextPingAt > endsAt;
  const pingLabel = slot === 0 ? (isSeeker ? 'Hiders revealed in' : 'Head start — first ping in') : 'Next ping in';
  const urgent = !finalStretch && nextPingAt - now < 30_000;

  const markers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [];
    for (const p of state.players) {
      if (!p.location) continue;
      if (isSeeker && p.role !== 'hider') continue;
      if (!isSeeker && p.id !== me.id) continue;
      out.push({
        id: p.id,
        label: p.id === me.id ? 'Your last ping' : p.name,
        sub: p.caughtAt ? 'caught' : fmtAgo(now - Date.parse(p.location.at)),
        lat: p.location.lat,
        lng: p.location.lng,
        accuracy: p.location.accuracy,
        tone: p.id === me.id ? 'self' : p.caughtAt ? 'caught' : p.location.slot === slot ? 'fresh' : 'stale',
        trail: p.trail.map((t) => ({ lat: t.lat, lng: t.lng })),
      });
    }
    return out;
    // `now` only affects the "ago" labels; refresh them every ~10s rather than every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isSeeker, me.id, slot, Math.floor(now / 10_000)]);

  return (
    <div className="play">
      <GameMap me={geo.fix} markers={markers} command={cmd} />

      <header className="hud">
        <div className="hud__row">
          <RoleChip role={me.role} />
          <span className="mono small">{g.code}</span>
          {endsAt && <span className="mono small hud__ends">ends {fmtClock(endsAt - now)}</span>}
        </div>
        <div className={`hud__count ${urgent ? 'hud__count--urgent' : ''}`}>
          <span className="hud__label">{finalStretch ? 'Final stretch — no more pings' : pingLabel}</span>
          {!finalStretch && <span className="hud__clock">{fmtClock(nextPingAt - now)}</span>}
        </div>
      </header>

      <div className="mapbtns">
        <button className="mapbtn" onClick={() => command('me')} disabled={!geo.fix} aria-label="Center on me">
          Me
        </button>
        <button className="mapbtn" onClick={() => command('fit')} aria-label="Show everyone">
          All
        </button>
      </div>

      <section className="sheet">
        {c.error && <div className="banner banner--error">{c.error}</div>}
        {isSeeker ? <SeekerPanel {...c} onFind={(lat, lng) => command('point', lat, lng)} /> : <HiderPanel {...c} />}
        {me.isHost && (
          <ConfirmButton className="btn btn--ghost" confirm="Tap again to end the game" onConfirm={() => c.act('end')}>
            End game for everyone
          </ConfirmButton>
        )}
      </section>
    </div>
  );
}

function HiderPanel(c: Ctx) {
  const { me, now, slot, geo, wake, pingNote } = c;

  if (me.caughtAt) {
    return (
      <div className="caught">
        <h2>You’ve been caught.</h2>
        <p className="muted">Your pings have stopped. Stick around — results show when the game ends.</p>
      </div>
    );
  }

  const lastAge = me.lastPingAt ? now - Date.parse(me.lastPingAt) : null;
  return (
    <>
      {geo.denied && <LocationHelp />}
      {pingNote && slot >= 1 && <div className={`note note--${pingNote.kind}`}>{pingNote.text}</div>}
      <dl className="stats">
        <div>
          <dt>Last ping</dt>
          <dd>{lastAge === null ? (slot === 0 ? 'Head start' : 'None yet') : fmtAgo(lastAge)}</dd>
        </div>
        <div>
          <dt>GPS</dt>
          <dd>{geo.fix ? `±${Math.round(geo.fix.accuracy)} m` : geo.denied ? 'Blocked' : 'Searching…'}</dd>
        </div>
        <div>
          <dt>Screen</dt>
          <dd>{wake.active ? 'Kept awake' : wake.supported ? 'Tap to keep on' : 'Disable auto-lock'}</dd>
        </div>
      </dl>
      <p className="muted small">
        Keep this page open with the screen on. Locking your phone or switching apps pauses location — your ping goes out
        late when you return.
      </p>
      <ConfirmButton className="btn btn--outline" confirm="Tap again — you’re out" onConfirm={() => c.act('catch')}>
        I’ve been caught
      </ConfirmButton>
    </>
  );
}

function SeekerPanel(c: Ctx & { onFind: (lat: number, lng: number) => void }) {
  const { state, now, slot, geo, onFind } = c;
  const g = state.game;
  const startedAt = g.startedAt!;
  const slotAge = now - slotStartMs(startedAt, g.pingIntervalSeconds, slot);

  const hiders = state.players
    .filter((p) => p.role === 'hider')
    .sort((a, b) => {
      if (!!a.caughtAt !== !!b.caughtAt) return a.caughtAt ? 1 : -1;
      return (b.lastPingSlot ?? -1) - (a.lastPingSlot ?? -1);
    });
  const left = hiders.filter((h) => !h.caughtAt).length;

  return (
    <>
      <h2 className="sheet__title">
        Hiders <span className="muted">· {left} left</span>
      </h2>
      <ul className="hiders">
        {hiders.map((h) => {
          const missed = !h.caughtAt && slot >= 1 && (h.lastPingSlot ?? 0) < slot && slotAge > MISSED_GRACE_MS;
          const dist = geo.fix && h.location ? distanceMeters(geo.fix, h.location) : null;
          return (
            <li key={h.id} className={`hider ${h.caughtAt ? 'hider--caught' : ''}`}>
              <div className="hider__main">
                <span className="hider__name">{h.name}</span>
                <span className="hider__meta mono">
                  {h.caughtAt
                    ? 'caught'
                    : h.location
                      ? `${fmtAgo(now - Date.parse(h.location.at))}${dist !== null ? ` · ${fmtDistance(dist)}` : ''}`
                      : slot === 0
                        ? 'hiding…'
                        : 'no ping yet'}
                  {missed && <span className="tag tag--warn">missed ping</span>}
                </span>
              </div>
              {!h.caughtAt && (
                <div className="hider__actions">
                  {h.location && (
                    <button className="btn btn--small" onClick={() => onFind(h.location!.lat, h.location!.lng)}>
                      Find
                    </button>
                  )}
                  <ConfirmButton
                    className="btn btn--small btn--primary"
                    confirm="Confirm"
                    onConfirm={() => c.act('catch', { playerId: h.id })}
                  >
                    Caught
                  </ConfirmButton>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/* ───────────────────────────── Results ───────────────────────────── */

function Results(c: Ctx) {
  const { state, me } = c;
  const g = state.game;
  const hiders = state.players.filter((p) => p.role === 'hider');
  const survivors = hiders.filter((h) => !h.caughtAt);
  const startMs = g.startedAt ? Date.parse(g.startedAt) : 0;

  const headline =
    g.endReason === 'all_caught'
      ? 'Seekers win — everyone was caught.'
      : g.endReason === 'time'
        ? survivors.length
          ? `Time’s up — ${survivors.length} hider${survivors.length === 1 ? '' : 's'} survived.`
          : 'Time’s up.'
        : 'Game ended by the host.';

  return (
    <main className="page">
      <TopBar code={g.code} />
      <section className="card card--code">
        <span className="eyebrow">Game over</span>
        <h1 className="results__title">{headline}</h1>
        {g.startedAt && g.endedAt && (
          <span className="muted mono small">played {fmtClock(Date.parse(g.endedAt) - startMs)}</span>
        )}
      </section>
      <section className="card">
        <h2>Hiders</h2>
        <ul className="roster">
          {hiders.map((h) => (
            <li key={h.id} className="roster__row">
              <span className="roster__name">
                {h.name}
                {h.id === me.id && <span className="muted"> (you)</span>}
              </span>
              <span className="mono small">
                {h.caughtAt
                  ? `caught at ${fmtClock(Date.parse(h.caughtAt) - startMs)}${h.caughtByName ? ` by ${h.caughtByName}` : ''}`
                  : 'survived'}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <div className="stack">
        <Link className="btn btn--primary btn--big" href="/">
          New game
        </Link>
        <button className="btn btn--ghost" onClick={() => c.onLeave()}>
          Leave
        </button>
      </div>
    </main>
  );
}

/* ───────────────────────────── Bits ───────────────────────────── */

function TopBar({ code, onLeave }: { code: string; onLeave?: () => void }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand__dot" aria-hidden />
        Goosehunt
      </Link>
      <span className="mono small muted">{code}</span>
      {onLeave && (
        <ConfirmButton className="link" confirm="Leave? Tap again" onConfirm={onLeave}>
          Leave
        </ConfirmButton>
      )}
    </header>
  );
}

function RoleChip({ role }: { role: 'hider' | 'seeker' }) {
  return <span className={`chip chip--${role}`}>{role}</span>;
}

function ConfirmButton({
  children,
  confirm,
  onConfirm,
  className,
}: {
  children: React.ReactNode;
  confirm: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`${className ?? ''} ${armed ? 'is-armed' : ''}`}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirm : children}
    </button>
  );
}

function RejoinLink({ code, session }: { code: string; session: Session }) {
  const [note, setNote] = useState<string | null>(null);
  return (
    <p className="muted small">
      Switching browsers or adding to home screen?{' '}
      <button
        className="link"
        onClick={async () => setNote((await copyText(rejoinLink(code, session))) ? 'Copied — open it there.' : 'Copy failed')}
      >
        Copy your rejoin link
      </button>{' '}
      (keep it private — it <i>is</i> you). {note}
    </p>
  );
}

function Splash({ text }: { text: string }) {
  return (
    <main className="splash">
      <span className="pulse" aria-hidden />
      <p>{text}</p>
      <Link href="/" className="muted small">
        Home
      </Link>
    </main>
  );
}

function isIOSSafe() {
  return typeof navigator !== 'undefined' && isIOS();
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
