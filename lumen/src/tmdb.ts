// src/tmdb.ts — trending/popular content for the Discover view.
// Calls go through the same-origin /api/tmdb nginx proxy, which injects the
// TMDB v4 Read Access Token server-side (browser never sees it). Poster
// images come straight from TMDB's public CDN — no key needed there.
const BASE = "/api/tmdb";

export interface TmdbItem {
  id: number;
  media_type?: "movie" | "tv";
  title?: string;            // movies
  name?: string;             // tv
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;     // movies
  first_air_date?: string;   // tv
  overview?: string;
  vote_average?: number;
}

export const tmdbTitle = (it: TmdbItem) => it.title ?? it.name ?? "";
export const tmdbYear = (it: TmdbItem) => {
  const d = it.release_date ?? it.first_air_date ?? "";
  return d ? d.slice(0, 4) : "";
};

export function tmdbPoster(path: string | null | undefined, size = "w342"): string {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
}

// Thrown (as a rejected promise value) when the proxy has no TMDB key so the
// view can distinguish "not configured" from "no results".
export class TmdbNotConfiguredError extends Error {
  constructor() {
    super("TMDB API key not configured");
    this.name = "TmdbNotConfiguredError";
  }
}

async function tmdbGet(path: string): Promise<TmdbItem[]> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } });
  if (res.status === 401) throw new TmdbNotConfiguredError();
  if (!res.ok) throw new Error(`TMDB responded ${res.status}`);
  const data = await res.json() as { results?: TmdbItem[] };
  return data.results ?? [];
}

export function getTrending(media: "movie" | "tv"): Promise<TmdbItem[]> {
  return tmdbGet(`/trending/${media}/week`);
}

export function getPopular(media: "movie" | "tv"): Promise<TmdbItem[]> {
  return tmdbGet(`/${media}/popular`);
}
