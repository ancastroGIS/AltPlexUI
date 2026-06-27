# Lumen

A custom desktop frontend for your Plex library — Solid + Vite, served behind an
nginx reverse proxy (which also eliminates browser CORS issues). Maps to
`packages/desktop` if/when you move to the monorepo layout.

## What's here
- **Apple-TV+ × Max home screen**: ambient-light hero, focusable poster rows,
  resume progress, arrow-key (spatial) navigation already wired for the TV port.
- **Demo mode**: runs fully offline with mock data — open it and you'll see the
  whole design without a server.
- **Same-origin Plex access**: the browser only ever talks to `/plex/*`; nginx
  (prod) or Vite (dev) proxies that to your real server, so no CORS, and your
  token never crosses origins.

## Run in development
```bash
cp .env.example .env          # set VITE_PLEX_URL to your server
npm install
npm run dev                   # http://localhost:5173
```
Click **Connect** and paste your Plex token (Plex Web → any item → ⋯ → Get Info →
View XML → copy `X-Plex-Token` from the URL), or **Explore the demo**.

## Deploy with Docker
```bash
# edit PLEX_SERVER_URL in docker-compose.yml first
docker compose up -d --build   # http://localhost:7070
```
The image builds the SPA and serves it from nginx; `PLEX_SERVER_URL` is injected
into the proxy config at container start.

## Where to extend
- `src/plex.ts` — API client (add playlist CRUD here for the music views).
- `src/components.tsx` — Hero / Row / Tile / Setup.
- `src/styles.css` — design tokens up top.
- `src/nav.ts` — spatial navigation (carries over to the Lightning TV build).

## Hardening notes (later)
- Move the token server-side: have nginx inject `X-Plex-Token` and drop it from
  the client entirely.
- Add the PIN auth flow from the earlier `plex.ts` for a real sign-in screen.
