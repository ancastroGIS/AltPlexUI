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

export function getClientId(): string {
  let id = localStorage.getItem(LS_CLIENT_ID);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(LS_CLIENT_ID, id);
  }
  return id;
}

// Exchange Plex.tv credentials for an auth token, then persist it.
// The password is never stored — only the resulting token.
export async function signIn(username: string, password: string): Promise<void> {
  const res = await fetch(`${PLEX_TV}/users/sign_in.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Plex-Client-Identifier": getClientId(),
      "X-Plex-Product": "Lumen",
      "X-Plex-Version": "1.0",
      Accept: "application/json",
    },
    body: new URLSearchParams({ "user[login]": username, "user[password]": password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(body.error ?? `Sign in failed (${res.status})`);
  }
  const body = await res.json() as { user: { authToken: string } };
  setToken(body.user.authToken);
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
