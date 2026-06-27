// src/plex.ts — talks to the same-origin /plex proxy (nginx in prod, Vite in dev)
const BASE = "/plex";
const PLEX_TV = "/plextv";
const LS_TOKEN = "lumen_token";
const LS_CLIENT_ID = "lumen_client_id";

export function getToken() {
  return localStorage.getItem(LS_TOKEN) || "";
}
export function setToken(t: string) {
  localStorage.setItem(LS_TOKEN, t.trim());
}
export function clearToken() {
  localStorage.removeItem(LS_TOKEN);
}

function uuid(): string {
  // crypto.randomUUID() requires a secure context (HTTPS / localhost).
  // Fall back to a manual v4 UUID so plain-HTTP deployments still work.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getClientId(): string {
  let id = localStorage.getItem(LS_CLIENT_ID);
  if (!id) {
    id = uuid();
    localStorage.setItem(LS_CLIENT_ID, id);
  }
  return id;
}

// Carries Plex's numeric error code so callers can branch on specific cases
// (e.g. 1029 = two-factor auth required).
export class PlexError extends Error {
  constructor(message: string, public readonly code: number) {
    super(message);
    this.name = "PlexError";
  }
}

const PLEX_HEADERS = () => ({
  "X-Plex-Client-Identifier": getClientId(),
  "X-Plex-Product": "Lumen",
  "X-Plex-Version": "1.0",
  Accept: "application/json",
});

// Exchange Plex.tv credentials for an auth token, then persist it.
// The password is never stored — only the resulting token.
// Throws PlexError(1029) when two-factor auth is required.
export async function signIn(username: string, password: string): Promise<void> {
  const res = await fetch(`${PLEX_TV}/users/sign_in.json`, {
    method: "POST",
    headers: { ...PLEX_HEADERS(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ "user[login]": username, "user[password]": password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; code?: number };
    throw new PlexError(body.error ?? `Sign in failed (${res.status})`, body.code ?? res.status);
  }
  const body = await res.json() as { user: { authToken: string } };
  setToken(body.user.authToken);
}

// PIN-based OAuth — works with 2FA and SSO.
// Step 1: create a PIN, open plexAuthUrl(pin.code) in a popup.
// Step 2: poll checkPin(pin.id) until authToken appears.
export async function createPin(): Promise<{ id: number; code: string }> {
  const res = await fetch(`${PLEX_TV}/api/v2/pins?strong=true`, {
    method: "POST",
    headers: PLEX_HEADERS(),
  });
  if (!res.ok) throw new PlexError("Failed to start Plex sign-in", res.status);
  const data = await res.json() as { id: number; code: string };
  return { id: data.id, code: data.code };
}

export async function checkPin(id: number): Promise<string | null> {
  const res = await fetch(`${PLEX_TV}/api/v2/pins/${id}`, { headers: PLEX_HEADERS() });
  if (!res.ok) return null;
  const data = await res.json() as { authToken?: string | null };
  return data.authToken ?? null;
}

export function plexAuthUrl(code: string): string {
  const params = new URLSearchParams({
    clientID: getClientId(),
    code,
    "context[device][product]": "Lumen",
    "context[device][platform]": "Web",
  });
  return `https://app.plex.tv/auth#?${params.toString()}`;
}

export interface Item {
  ratingKey: string;
  type: string;
  title: string;
  grandparentTitle?: string;
  grandparentRatingKey?: string;
  parentTitle?: string;
  parentRatingKey?: string;
  parentIndex?: number;
  index?: number;
  year?: number;
  thumb?: string;
  art?: string;
  duration?: number;
  viewOffset?: number;
  contentRating?: string;
  Genre?: { tag: string }[];
  leafCount?: number;      // total episodes in a show/season
  viewedLeafCount?: number; // watched episodes
}
export interface Hub {
  title: string;
  hubIdentifier: string;
  Metadata?: Item[];
}
export interface Section {
  key: string;
  title: string;
  type: string;
}

async function api(path: string) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE}${path}${sep}X-Plex-Token=${encodeURIComponent(getToken())}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Plex responded ${res.status}`);
  return (await res.json()).MediaContainer;
}

export async function getIdentity(): Promise<string> {
  const mc = await api("/");
  return (mc.friendlyName as string) || (mc.machineIdentifier as string);
}

export async function getSections(): Promise<Section[]> {
  const mc = await api("/library/sections");
  return (mc.Directory || []).map((d: any) => ({
    key: d.key,
    title: d.title,
    type: d.type,
  }));
}

// All items in a library section (for full-library browsing).
export async function getAllItems(sectionKey: string): Promise<Item[]> {
  const mc = await api(`/library/sections/${sectionKey}/all`);
  return (mc.Metadata || []) as Item[];
}

// Children of a container item: seasons of a show, episodes of a season,
// albums of an artist, or tracks of an album.
export async function getChildren(ratingKey: string): Promise<Item[]> {
  const mc = await api(`/library/metadata/${ratingKey}/children`);
  return (mc.Metadata || []) as Item[];
}

// Global home hubs, or a single library's hubs when sectionKey is given.
export async function getHubs(sectionKey?: string): Promise<Hub[]> {
  const path = sectionKey ? `/hubs/sections/${sectionKey}` : "/hubs?count=16";
  const mc = await api(path);
  return (mc.Hub || []).filter((h: any) => (h.Metadata || []).length > 0);
}

// Generate a unique ID for a transcode session.
export function newSessionId(): string {
  return uuid();
}

// Build a Plex Universal Transcode HLS URL.
// directPlay=1 + directStream=1 tells Plex to:
//   1. Serve the raw file if the client can handle it (no Plex work)
//   2. Remux the container without re-encoding video if needed (fast)
//   3. Fully transcode only when the codec is incompatible (HEVC, AC3, etc.)
// The response is always an HLS .m3u8 manifest.
export function buildHlsUrl(ratingKey: string, sessionId: string): string {
  const params = new URLSearchParams({
    path: `/library/metadata/${ratingKey}`,
    mediaIndex: "0",
    partIndex: "0",
    protocol: "hls",
    fastSeek: "1",
    directPlay: "1",
    directStream: "1",
    videoResolution: "1920x1080",
    maxVideoBitrate: "20000",
    videoBitrate: "20000",
    audioBoost: "100",
    "X-Plex-Token": getToken(),
    "X-Plex-Client-Identifier": getClientId(),
    "X-Plex-Platform": "Chrome",
    "X-Plex-Product": "Lumen",
    "X-Plex-Version": "1.0",
    "X-Plex-Session-Identifier": sessionId,
  });
  return `${BASE}/video/:/transcode/universal/start.m3u8?${params}`;
}

// Tell the Plex server to release the transcode process for this session.
// Call on player close so the server doesn't keep a ghost transcode running.
export function stopTranscodeSession(sessionId: string): void {
  const params = new URLSearchParams({
    session: sessionId,
    "X-Plex-Token": getToken(),
  });
  fetch(`${BASE}/video/:/transcode/universal/stop?${params}`).catch(() => {});
}

export async function getMediaPart(ratingKey: string): Promise<{ key: string }> {
  const mc = await api(`/library/metadata/${ratingKey}`);
  const part = mc.Metadata?.[0]?.Media?.[0]?.Part?.[0];
  if (!part?.key) throw new Error("No playable media found");
  return { key: part.key as string };
}

// Direct-play URL served through the nginx /plex proxy.
export function directPlayUrl(partKey: string): string {
  return `${BASE}${partKey}?X-Plex-Token=${encodeURIComponent(getToken())}&download=0`;
}

// Fire-and-forget timeline report so Plex tracks resume position.
export function reportProgress(
  ratingKey: string,
  timeMs: number,
  durationMs: number,
  state: "playing" | "paused" | "stopped"
): void {
  const params = new URLSearchParams({
    ratingKey,
    key: `/library/metadata/${ratingKey}`,
    state,
    time: String(Math.floor(timeMs)),
    duration: String(Math.floor(durationMs)),
    "X-Plex-Token": getToken(),
  });
  fetch(`${BASE}/:/timeline?${params}`).catch(() => {});
}

// Resized image via Plex's photo transcoder. ALWAYS request the size you render
// at — decoding full-res posters into small tiles is a top cause of TV jank.
export function img(path: string | undefined, w: number, h: number): string {
  if (!path) return "";
  const u = new URLSearchParams({
    width: String(w),
    height: String(h),
    minSize: "1",
    upscale: "1",
    url: path,
    "X-Plex-Token": getToken(),
  });
  return `${BASE}/photo/:/transcode?${u}`;
}
