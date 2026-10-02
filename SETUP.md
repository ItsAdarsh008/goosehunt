# Goosehunt — Setup Guide

Everything you need to do by hand to get Goosehunt running on real phones. It takes about 15 minutes, and every service it uses has a free tier.

| Service | Used for | Cost | API key? |
|---|---|---|---|
| **Supabase** | Postgres database (games, players, pings) | Free tier | Yes, 2 values |
| **Vercel** | Hosting plus HTTPS (phones only share location over HTTPS) | Free (Hobby) | No, you just log in |
| **GitHub** | Where Vercel deploys from | Free | No |
| OpenStreetMap | Map tiles | Free | **No key needed** |

Supabase is the only API you have to connect.

---

## 1. Create the Supabase database

1. Go to **https://supabase.com** → **Sign in** (GitHub login works) → **New project**.
2. Fill in:
   - **Name:** `goosehunt`
   - **Database password:** generate one and save it somewhere. The app doesn't use it, but you'll want it if you ever connect directly.
   - **Region:** pick the one closest to you, e.g. `Canada (Central)` or `East US (North Virginia)`.
   - Click **Create new project** and wait about 2 minutes for it to provision.
3. In the left sidebar open **SQL Editor** → **New query**.
4. Open `supabase/schema.sql` from this repo, copy **all** of it, paste it into the editor, and click **Run**. You should see `Success. No rows returned`.
5. Check it worked: open **Table Editor** in the sidebar. You should see three tables: `games`, `players`, `pings`.

### Get your two keys

6. Click **Project Settings** (gear icon) → **Data API** (or **API**, depending on dashboard version) and copy the **Project URL**. It looks like `https://abcdefghijkl.supabase.co`.
7. Click **Project Settings** → **API Keys**, then copy the **server-side key**. Which one you see depends on your project's age:
   - Newer projects: under **Secret keys**, copy the key that starts with `sb_secret_…` (create one if none exists).
   - Older projects: under **Legacy API keys**, reveal and copy **`service_role`** (a long `eyJ…` string).

> ⚠️ **This key bypasses all database security. Never put it in client code, never commit it, and never share it.** In this app it's only read by server-side API routes. Do **not** use the `anon` / `publishable` key; the app is designed so that key can read nothing.

---

## 2. Run it locally (optional but recommended)

Requires Node.js 18.18+ (20+ recommended).

```bash
cd goosehunt
cp .env.example .env.local      # on Windows PowerShell: copy .env.example .env.local
```

Edit `.env.local`:

```env
SUPABASE_URL=https://abcdefghijkl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxxxxxxxxxxxxx
```

Then:

```bash
npm install
npm run dev
```

Open **http://localhost:3000** on your computer. Create a game in one browser window and join it from a private/incognito window, which counts as a second player.

> **Phones can't test against `localhost` or `http://192.168.x.x:3000`.** Browsers only allow geolocation on HTTPS (or on `localhost` itself). Either deploy to Vercel (step 3), which is easiest, or use a tunnel:
> ```bash
> npx cloudflared tunnel --url http://localhost:3000
> ```
> This prints an `https://….trycloudflare.com` URL you can open on your phone.

---

## 3. Deploy to Vercel

### 3a. Push the code to GitHub

```bash
cd goosehunt
git add .
git commit -m "Goosehunt v1"
```

On **https://github.com/new**, create an **empty** repository named `goosehunt` with no README and no .gitignore. Then:

```bash
git remote add origin https://github.com/<your-username>/goosehunt.git
git branch -M main
git push -u origin main
```

`.env.local` is in `.gitignore`, so your secret key won't be pushed. Run `git status` before committing to double-check.

### 3b. Import it into Vercel

1. Go to **https://vercel.com** → sign in with GitHub → **Add New… → Project**.
2. Find `goosehunt` in the list → **Import**. (If it isn't listed, click **Adjust GitHub App Permissions** and grant access to the repo.)
3. Framework Preset should auto-detect **Next.js**. Leave the build settings as they are.
4. Expand **Environment Variables** and add both:

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | your secret / service_role key |

5. Click **Deploy**. After about a minute you'll get a URL like `https://goosehunt-xyz.vercel.app`.

> If you add or change environment variables **after** deploying, go to **Deployments → ⋯ on the latest → Redeploy**. Env vars only apply to new builds.

### 3c. Smoke test

Open your Vercel URL on your laptop and create a game. If you see *"Server is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"*, the env vars weren't saved or you haven't redeployed since adding them.

---

## 4. Phone setup (tell your players)

The app runs in the browser, so there's nothing to install. Share the game link or the 5-letter code.

### iPhone (Safari or Chrome)

1. **Settings → Privacy & Security → Location Services → On.**
2. In that same list, tap **Safari Websites** (or **Chrome** if they use Chrome) and set it to **While Using the App**, with **Precise Location ON**. Without Precise Location, accuracy drops to around 1–3 km, which makes the game unplayable.
3. When the game asks for location, tap **Allow**. If they tapped Don't Allow by mistake: in Safari, tap **aA → Website Settings → Location → Allow**, then reload.
4. **Turn off Low Power Mode** during the game, because it can let the screen auto-lock anyway.
5. Recommended: **Share → Add to Home Screen**, then launch from the icon for a full-screen app. Home-screen apps keep their own storage, so after adding to the home screen, open the game from inside the app. To keep the same player, use **Copy your rejoin link** in the lobby and open that link inside the app.
6. Requires iOS 16.4+ for keep-screen-awake. On older iOS, set **Settings → Display & Brightness → Auto-Lock → Never** for the game.

### Android (Chrome)

1. Turn **Location** on in quick settings, and set mode/accuracy to high (**Settings → Location → Location Services → Google Location Accuracy → On**).
2. Tap **Allow** when Chrome asks. If they blocked it: tap the icon left of the address bar → **Permissions → Location → Allow**, then reload.
3. Optional: **⋮ → Add to Home screen** (or **Install app**).
4. Turn off **Battery Saver** during the game.

---

## 5. How a game works

1. **Host** creates a game (picks ping interval, default 5 min, and game length) and shares the code or link.
2. Players join and become hiders by default. The host taps **Hider / Seeker** next to each name to assign roles. The host starts as a seeker and can switch.
3. Everyone taps **Enable location** in the lobby. The host taps **Start game**.
4. **Head start:** hiders get one full interval before the first ping.
5. **Every interval,** all hiders' phones send their location at the same moment. Seekers see orange pulsing pins (the current round), grey pins (older rounds), a dotted trail of the last few pings, and the distance from them to each hider. Android phones vibrate when pings go out or arrive.
6. Seekers tap **Caught** (twice, to confirm) on a hider. Hiders can also tap **I've been caught**.
7. The game ends when all hiders are caught, time runs out, or the host taps **End game**. After that, everyone sees the results.

Locations are **only sent at ping time**. Seekers' locations are never uploaded, and hiders never see anyone else's position.

---

## 6. The one big limitation: keep the page open

**No website, on iPhone or Android, can access location while the phone is locked or the browser is in the background.** Only native apps can do that. So:

- Hiders **must keep Goosehunt open with the screen on.** The app keeps the screen awake automatically on Android Chrome and iOS 16.4+.
- If a hider locks their phone or switches apps, they **miss** that ping. Their ping goes out **as soon as they come back**, and seekers see a **"missed ping"** tag plus how old the location is. Treat repeated "missed pings" as a house-rules issue.
- Expect roughly 15–25% battery per hour (screen on plus GPS). Tell people to charge first, or bring a power bank.

If you later want true background tracking, that requires a native app (for example, wrapping this in Capacitor with a background-geolocation plugin). That's a much bigger project and needs App Store / Play Store builds.

---

## 7. Maintenance notes

- **Supabase free projects pause after ~7 days with no activity.** If the app suddenly errors after a quiet week, open the Supabase dashboard and click **Restore project**, then wait a minute.
- **Clearing old games:** run this in the SQL Editor whenever you like. It cascades to players and pings:
  ```sql
  delete from games where created_at < now() - interval '2 days';
  ```
- **Map tiles** come from OpenStreetMap's free public servers, which are fine for casual use by a group of friends. If you ever run big events (hundreds of players), switch to a free-tier tile provider such as MapTiler or Stadia: change the URL in `components/GameMap.tsx` (`L.tileLayer(...)`) and keep the attribution.
- **Custom domain (optional):** Vercel → Project → **Settings → Domains**.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| "Server is missing SUPABASE_URL…" | Env vars not set in Vercel, or you didn't redeploy after adding them. |
| "Server error" on create/join | Usually the schema wasn't run, or you used the `anon` key instead of the secret/service_role key. Check **Vercel → Project → Logs**. |
| Location never loads on phone | You're on `http://`, not `https://`. Use the Vercel URL. |
| iPhone: "Location blocked" | Settings → Privacy & Security → Location Services → Safari Websites → While Using + Precise. Then **aA → Website Settings → Location → Allow** and reload. |
| Location is km off | Precise Location is off (iPhone), or Google Location Accuracy is off (Android). Also try stepping outside. |
| Screen still locks | Low Power Mode / Battery Saver is on, or iOS < 16.4. Set Auto-Lock to Never for the game. |
| "That name is taken" when rejoining | The name is still held by your old session. Use your rejoin link from the original browser, or join with a different name. |
| Lost my session (cleared browser, new phone) | Use the **rejoin link** you copied in the lobby. If you don't have it, join again under a new name. |
| Hider shows "missed ping" | Their phone was locked or in another app at ping time. The ping sends when they reopen the page. |

---

## Project layout (for reference)

```
app/
  page.tsx                    Home: create / join
  g/[code]/page.tsx           Game screen (lobby → map → results)
  api/games/route.ts          POST create game
  api/games/[code]/…          join · state · ping · start · end · role · catch
  manifest.ts, pwa-icon/      Add-to-home-screen support
components/
  GameClient.tsx              All game UI + ping loop
  GameMap.tsx                 Leaflet map
  hooks.ts                    Polling, GPS watch, screen wake lock
lib/                          DB access, auth tokens, shared types, ping-slot math
supabase/schema.sql           Run once in Supabase SQL Editor
```

Players don't create accounts. Each player gets a random secret token on join, which is stored in their browser. The server only stores its SHA-256 hash. All database access goes through the API routes, which enforce who can see whose location.
