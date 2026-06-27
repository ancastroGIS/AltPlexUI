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
  parentTitle?: string;
  parentIndex?: number;
  index?: number;
  year?: number;
  thumb?: string;
  art?: string;
  duration?: number;
  viewOffset?: number;
  contentRating?: string;
  Genre?: { tag: string }[];
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

// Global home hubs, or a single library's hubs when sectionKey is given.
export async function getHubs(sectionKey?: string): Promise<Hub[]> {
  const path = sectionKey ? `/hubs/sections/${sectionKey}` : "/hubs?count=16";
  const mc = await api(path);
  return (mc.Hub || []).filter((h: any) => (h.Metadata || []).length > 0);
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
