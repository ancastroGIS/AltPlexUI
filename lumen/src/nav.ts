// src/nav.ts
// Roving focus between .tile elements using arrow keys. Chooses the nearest
// tile in the pressed direction by a distance + off-axis penalty score.
export function initSpatialNav() {
  const DIRS: Record<string, [number, number]> = {
    ArrowRight: [1, 0],
    ArrowLeft: [-1, 0],
    ArrowDown: [0, 1],
    ArrowUp: [0, -1],
  };

  function onKey(e: KeyboardEvent) {
    const d = DIRS[e.key];
    if (!d) return;
    const cur = document.activeElement as HTMLElement | null;
    if (!cur || !cur.classList.contains("tile")) return;

    const tiles = Array.from(document.querySelectorAll<HTMLElement>(".tile"));
    const cr = cur.getBoundingClientRect();
    const cx = cr.left + cr.width / 2;
    const cy = cr.top + cr.height / 2;

    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const t of tiles) {
      if (t === cur) continue;
      const r = t.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx;
      const dy = r.top + r.height / 2 - cy;
      const along = dx * d[0] + dy * d[1]; // distance in travel direction
      if (along <= 2) continue; // must be ahead
      const off = Math.abs(dx * d[1] - dy * d[0]); // perpendicular drift
      const score = along + off * 3;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }

    if (best) {
      e.preventDefault();
      best.focus();
      best.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  }

  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
