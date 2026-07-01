// src/routes.ts — URL helpers for the app's page routes.
// Paths are "hybrid": they match on a stable key (Plex ratingKey / section
// key) with a human-readable slug appended for looks. The router only reads
// the key segment; the slug is purely decorative.
import type { Item, Section } from "./plex";

// Turn a title into a URL-safe slug. Falls back to "x" so a path segment is
// never empty (which would change the route shape).
export function slug(s: string | undefined): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "x";
}

// ── Builders ────────────────────────────────────────────────────────────────
export const sectionPath = (s: Section) => `/library/${s.key}/${slug(s.title)}`;
export const gridPath = (s: Section) => `/all/${s.key}/${slug(s.title)}`;
export const infoPath = (it: Item) => `/info/${it.ratingKey}/${slug(it.title)}`;
export const browsePath = (it: Item) => `/browse/${it.ratingKey}/${slug(it.title)}`;
export const watchPath = (it: Item) =>
  `/watch/${it.ratingKey}/${slug(it.title || it.grandparentTitle)}`;

// Route an item to its natural destination by type. Episodes/tracks play,
// seasons drill to their episode list, everything else opens an info page.
export function itemPath(it: Item): string {
  if (it.type === "episode" || it.type === "track") return watchPath(it);
  if (it.type === "season") return browsePath(it);
  return infoPath(it);
}
