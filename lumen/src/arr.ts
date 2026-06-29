// arr.ts — Radarr/Sonarr API client
// All routes proxy through nginx which injects X-Api-Key server-side.

export interface ArrImage {
  coverType: string;
  url?: string;
  remoteUrl?: string;
}

export interface ArrMovie {
  id: number;             // >0 if already in Radarr library
  tmdbId: number;
  title: string;
  year: number;
  overview: string;
  images: ArrImage[];
  hasFile: boolean;       // true = downloaded (likely in Plex)
  monitored: boolean;
  status: string;
  titleSlug: string;
  qualityProfileId: number;
  minimumAvailability: string;
  genres: string[];
  runtime: number;
  studio?: string;
}

export interface ArrSeries {
  id: number;             // >0 if already in Sonarr library
  tvdbId: number;
  title: string;
  year: number;
  overview: string;
  images: ArrImage[];
  monitored: boolean;
  status: string;
  seriesType: string;
  qualityProfileId: number;
  seasons: unknown[];
  genres: string[];
  runtime: number;
  network?: string;
}

export interface QualityProfile { id: number; name: string }
export interface RootFolder     { id: number; path: string }

export function arrPoster(images: ArrImage[]): string {
  const p = images.find((i) => i.coverType === "poster");
  return p?.remoteUrl ?? p?.url ?? "";
}

async function arrGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function arrPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Search ─────────────────────────────────────────────────────────────────

export function searchMovies(query: string): Promise<ArrMovie[]> {
  return arrGet(`/radarr/api/v3/movie/lookup?term=${encodeURIComponent(query)}`);
}

export function searchSeries(query: string): Promise<ArrSeries[]> {
  return arrGet(`/sonarr/api/v3/series/lookup?term=${encodeURIComponent(query)}`);
}

// ── Config (profiles + root folders) ──────────────────────────────────────

export function getRadarrProfiles(): Promise<QualityProfile[]> {
  return arrGet<QualityProfile[]>("/radarr/api/v3/qualityprofile").catch(() => []);
}
export function getSonarrProfiles(): Promise<QualityProfile[]> {
  return arrGet<QualityProfile[]>("/sonarr/api/v3/qualityprofile").catch(() => []);
}
export function getRadarrRootFolders(): Promise<RootFolder[]> {
  return arrGet<RootFolder[]>("/radarr/api/v3/rootfolder").catch(() => []);
}
export function getSonarrRootFolders(): Promise<RootFolder[]> {
  return arrGet<RootFolder[]>("/sonarr/api/v3/rootfolder").catch(() => []);
}

// ── Add ────────────────────────────────────────────────────────────────────

export function addMovie(
  movie: ArrMovie,
  qualityProfileId: number,
  rootFolderPath: string
): Promise<ArrMovie> {
  return arrPost("/radarr/api/v3/movie", {
    ...(movie as Record<string, unknown>),
    qualityProfileId,
    rootFolderPath,
    monitored: true,
    minimumAvailability: movie.minimumAvailability || "announced",
    addOptions: { searchForMovie: true },
  });
}

export function addSeries(
  series: ArrSeries,
  qualityProfileId: number,
  rootFolderPath: string
): Promise<ArrSeries> {
  return arrPost("/sonarr/api/v3/series", {
    ...(series as Record<string, unknown>),
    qualityProfileId,
    rootFolderPath,
    monitored: true,
    seasonFolder: true,
    addOptions: { monitor: "all", searchForMissingEpisodes: true },
  });
}
