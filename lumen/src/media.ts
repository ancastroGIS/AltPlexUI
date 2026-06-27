// src/media.ts
import { img, type Item } from "./plex";
import { demo } from "./store";

// Deterministic pleasant gradient from a string — used for demo posters so the
// app renders fully offline with no server and no external image requests.
function gradient(seed: string, w: number, h: number): string {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = n % 360;
  const c1 = `hsl(${hue} 45% 22%)`;
  const c2 = `hsl(${(hue + 40) % 360} 38% 12%)`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/>
    </linearGradient></defs>
    <rect width='100%' height='100%' fill='url(#g)'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function poster(it: Item, w = 220, h = 330): string {
  if (demo()) return gradient(it.title, w, h);
  return img(it.thumb, w, h);
}

export function backdrop(it: Item, w = 1600, h = 900): string {
  if (demo()) return gradient(it.title + "bg", w, h);
  return img(it.art || it.thumb, w, h);
}

export function progress(it: Item): number {
  if (!it.duration || !it.viewOffset) return 0;
  return Math.min(1, it.viewOffset / it.duration);
}
