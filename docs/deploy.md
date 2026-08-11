# Deploying Slate (MVP)

Slate is a three-piece deployment. **Nothing requires local Docker** — the
database and every service live in the cloud:

| Piece | Host | What it runs |
|---|---|---|
| **Postgres** | Neon (serverless, free tier) | All data + the LangGraph checkpointer |
| **API** | Render (or Railway / Fly.io) | Fastify + the AI workflow engine (runs in-process for the MVP) |
| **Web** | Vercel | Next.js — the public landing + the Cutting Room studio |

The API **cannot** run on Vercel (it's a long-running Fastify server with SSE
streaming); it needs its own host. The steps below are copy-paste once you have
the accounts.

---

## 1. Database — Neon

1. Create a Neon project (neon.tech → New Project → pick a region close to your
   viewers).
2. Copy the **pooled** connection string from the dashboard:
   `postgresql://neondb_owner:...@ep-xxx-...pooler.us-east-1.aws.neon.tech/neondb`
3. That URL is your `DATABASE_URL`. The API creates the tables it needs on
   first run via Drizzle migrations — no manual schema setup. (For local dev
   you can point the same URL at Neon too and stop using Docker entirely.)

## 2. API — Render

1. Render → **New → Web Service** → connect the GitHub repo (`slate`).
2. Leave **Root Directory** empty (repo root — required so pnpm installs the
   workspace packages).
   - Build command: `pnpm install --frozen-lockfile`
   - Start command: `pnpm --filter @slate/api start`
3. Environment variables:
   - `DATABASE_URL` — the Neon pooled URL
   - `NEXT_PUBLIC_API_URL` — not needed here (that's web-side)
   - `CLERK_SECRET_KEY` — from Clerk
   - `NVIDIA_API_KEY` — for real generation (omit + `FAKE_PROVIDER=1` for a no-key demo)
   - `CORS_ORIGIN` — `https://<your-app>.vercel.app` (locks CORS; omit to allow any origin)
   - `PORT` — Render sets this automatically (the API reads `process.env.PORT`)
4. Health check path: `/api/v1/health` — Render shows the service as Healthy.
5. Note the public URL, e.g. `https://slate-api.onrender.com`.

> Railway / Fly.io work identically: same start command, same env vars.

## 3. Web — Vercel

1. Vercel → **Add New → Project** → import the `slate` repo.
2. **Root Directory:** `apps/web` (the Next.js app). Framework preset auto-
   detects Next.js.
3. Environment variables (set in the project):
   - `NEXT_PUBLIC_API_URL` — the **deployed API URL** from step 2, e.g.
     `https://slate-api.onrender.com` (read at build time)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk
   - `CLERK_SECRET_KEY` — Clerk
4. Deploy. Build runs `next build` (verified clean: `/`, `/studio`,
   `/projects/[id]`, `/sign-in`, `/sign-up`).

## 4. Clerk

1. Clerk dashboard → create an application → copy the two keys above.
2. **Add your domains:** in Clerk → Domains, add the Vercel URL
   (`https://<app>.vercel.app`) and set it as the primary production domain.
   Add `http://localhost:3000` as a development domain so local dev keeps
   working.
3. Enable at least one sign-in strategy (Email + password is enough for MVP)
   so the live sign-up page works.

## 5. NVIDIA (real generation)

- `NVIDIA_API_KEY` on the API host. The provider layer falls back to
  `FAKE_PROVIDER=1` (scripted demo responses) when no key is set — useful for a
  live walkthrough of the whole flow without spending credits.

---

## Dummy user for testing

Three ways, depending on how you deployed:

- **With Clerk keys (recommended):** open `/sign-up` on the live site and
  create any account — e.g. `demo@slate.test` with a throwaway password.
  Sign-up is open because the app is deployed, not in Clerk dev mode.
- **From the Clerk dashboard:** Users → Add user → set email + password →
  sign in on the live site with those exact credentials.
- **No keys (demo mode):** with `FAKE_PROVIDER=1` and no Clerk keys, the studio
  is open — anyone can use it without logging in.

## Verify the live stack

1. `https://<app>.vercel.app/` — the landing page renders (hero + 5-phase
   pipeline + workspace shot).
2. `https://<app>.vercel.app/studio` — anonymous → redirected to `/sign-in`;
   signed-in → the dashboard.
3. Type an idea → **Begin production** → the workflow pauses at the
   **Research** gate → approve → **Script** gate (scores in the coverage rail,
   retake + approve) → **Storyboard** (drag-reorder, edit scenes, prompt packs)
   → approve → locked **production plan**.
4. Multi-user isolation: a second account cannot see the first account's
   projects (404, not 403).

## Gotchas

- **SSE streaming:** the workspace refreshes via Server-Sent Events — plain
  chunked HTTP, works through Render/Railway's proxies. If you ever see stale
  state, check the API host's idle-sleep setting (Render free tier sleeps after
  inactivity — the first request after a nap takes a few seconds).
- **`NEXT_PUBLIC_API_URL` is build-time:** change it → redeploy the web app.
- **CORS:** until you set `CORS_ORIGIN`, the API reflects any origin (local-
  first default, fine for MVP; lock it down before sharing the URL publicly).
