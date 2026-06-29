// rd.ts — Real-Debrid instant-availability client
// Proxied through /api/rd/ by nginx, which injects Authorization: Bearer <token>
// server-side — the key never touches the browser.

export interface RdFile {
  filename: string;
  filesize: number;
}

// Shape returned by /rest/1.0/torrents/instantAvailability/{hash1}/{hash2}/…
// { "abc123": { "rd": [{ "1": {filename, filesize}, … }] } }
export type RdAvailability = Record<
  string,
  { rd?: Array<Record<string, RdFile>> }
>;

// Up to 40 hashes per call (RD limit per URL length).
export async function checkInstantAvailability(
  hashes: string[]
): Promise<RdAvailability> {
  if (!hashes.length) return {};
  const path = hashes
    .slice(0, 40)
    .map((h) => h.toLowerCase())
    .join("/");
  const res = await fetch(`/api/rd/torrents/instantAvailability/${path}`);
  if (!res.ok) return {};
  return res.json() as Promise<RdAvailability>;
}

export function isAvailable(avail: RdAvailability, hash: string): boolean {
  const entry = avail[hash.toLowerCase()];
  return Array.isArray(entry?.rd) && entry.rd.length > 0;
}
