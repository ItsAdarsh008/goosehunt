'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import CourseHero from '@/components/CourseHero';
import Logo from '@/components/Logo';
import { api, saveSession } from '@/lib/client';
import type { JoinResult } from '@/lib/types';

const PING_OPTIONS = [1, 2, 3, 5, 10, 15];
const DURATION_OPTIONS: { label: string; value: number | null }[] = [
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 hour', value: 60 },
  { label: '90 min', value: 90 },
  { label: '2 hours', value: 120 },
  { label: 'No limit', value: null },
];

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [hostName, setHostName] = useState('');
  const [ping, setPing] = useState(5);
  const [duration, setDuration] = useState<number | null>(60);
  const [busy, setBusy] = useState<'join' | 'host' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enter = (r: JoinResult) => {
    saveSession(r.code, { playerId: r.playerId, token: r.token });
    router.push(`/g/${r.code}`);
  };

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy('join');
    setError(null);
    try {
      const code = joinCode.trim().toUpperCase();
      enter(await api<JoinResult>(`/api/games/${encodeURIComponent(code)}/join`, { body: { name: joinName } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join');
      setBusy(null);
    }
  }

  async function host(e: React.FormEvent) {
    e.preventDefault();
    setBusy('host');
    setError(null);
    try {
      enter(
        await api<JoinResult>('/api/games', {
          body: { name: hostName, pingIntervalMinutes: ping, durationMinutes: duration },
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create game');
      setBusy(null);
    }
  }

  return (
    <main className="home">
      <header className="hero">
        <div className="hero__map">
          <CourseHero />
        </div>
        <h1 className="hero__title">
          <Logo size={56} animated />
          Goosehunt
        </h1>
        <p className="hero__lede">
          Campus manhunt. Hiders scatter, and every few minutes their phones ping a location to the seekers.
        </p>
      </header>

      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}

      <form className="card" onSubmit={join}>
        <h2>Join a game</h2>
        <label className="field">
          <span>Game code</span>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="ABCDE"
            maxLength={5}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            className="input input--code"
            required
          />
        </label>
        <label className="field">
          <span>Your name</span>
          <input
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="Honk McGee"
            maxLength={24}
            autoComplete="nickname"
            className="input"
            required
          />
        </label>
        <button className="btn btn--primary" disabled={busy !== null || joinCode.length < 5}>
          {busy === 'join' ? 'Joining…' : 'Join'}
        </button>
      </form>

      <form className="card card--host" onSubmit={host}>
        <h2>Host a game</h2>
        <label className="field">
          <span>Your name</span>
          <input
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
            placeholder="Host"
            maxLength={24}
            autoComplete="nickname"
            className="input"
            required
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Ping every</span>
            <select className="input" value={ping} onChange={(e) => setPing(Number(e.target.value))}>
              {PING_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Game length</span>
            <select
              className="input"
              value={duration ?? ''}
              onChange={(e) => setDuration(e.target.value === '' ? null : Number(e.target.value))}
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d.label} value={d.value ?? ''}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="btn btn--dark" disabled={busy !== null}>
          {busy === 'host' ? 'Creating…' : 'Create game'}
        </button>
      </form>

      <section className="howto">
        <h2>How it works</h2>
        <ol>
          <li>Host creates a game and shares the code. Everyone joins on their phone.</li>
          <li>Host picks the seekers and starts. Hiders get one ping interval as a head start.</li>
          <li>
            Every interval, each hider’s location is sent to the seekers. <strong>Hiders: keep the page open</strong> —
            phones won’t share location from a locked screen.
          </li>
          <li>Seekers tag hiders as caught. Game ends when everyone’s caught or time runs out.</li>
        </ol>
      </section>
    </main>
  );
}
