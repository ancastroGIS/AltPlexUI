// src/components.tsx
import { For, Match, Show, Switch, createResource, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import Hls from "hls.js";
import {
  buildHlsUrl, callTranscodeDecision, newSessionId, pingTranscodeSession, reportProgress,
  getAllItems, getChildren, getDetails, img,
  type Hub, type Item, type Section,
} from "./plex";
import {
  searchMovies, searchSeries, addMovie, addSeries, arrPoster,
  getRadarrProfiles, getRadarrRootFolders, getSonarrProfiles, getSonarrRootFolders,
  ensureRadarrTag, ensureSonarrTag,
  searchProwlarr, type ArrMovie, type ArrSeries, type ProwlarrRelease,
} from "./arr";
import {
  PRESETS, getDeviceProfile, saveDeviceProfile,
  parseRelease, streamCompat, scoreRelease, matchesTitle,
  type StreamCompat,
} from "./device";
import {
  checkInstantAvailability, isAvailable, type RdAvailability,
} from "./rd";
import { poster, backdrop, progress } from "./media";
import { activeSection, setActiveSection, serverName, demo } from "./store";

// ── Helpers ────────────────────────────────────────────────────────────────

function pad2(n: number | undefined): string {
  return n != null ? String(n).padStart(2, "0") : "";
}

export function tileLabel(it: Item): string {
  switch (it.type) {
    case "movie":
      return it.year ? `${it.title} – ${it.year}` : it.title;
    case "episode": {
      const show = it.grandparentTitle ?? it.title;
      const s = it.parentIndex != null ? `S${pad2(it.parentIndex)}` : "";
      const e = it.index != null ? `E${pad2(it.index)}` : "";
      const se = `${s}${e}`;
      return se ? `${show} – ${se}` : show;
    }
    case "album":
      return it.parentTitle ? `${it.parentTitle} – ${it.title}` : it.title;
    case "track":
      return it.grandparentTitle ? `${it.grandparentTitle} – ${it.title}` : it.title;
    default:
      return it.year ? `${it.title} – ${it.year}` : (it.grandparentTitle ?? it.title);
  }
}

function metaLine(it: Item): string {
  const bits: string[] = [];
  if (it.year) bits.push(String(it.year));
  if (it.contentRating) bits.push(it.contentRating);
  if (it.Genre?.length) bits.push(it.Genre.slice(0, 2).map((g) => g.tag).join(" / "));
  return bits.join("  ·  ");
}

export function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

// ── TopBar ─────────────────────────────────────────────────────────────────

export function TopBar(props: {
  sections: Section[];
  onSignOut: () => void;
  onDiscover: () => void;
}) {
  return (
    <header class="topbar">
      <div class="wordmark">
        <span class="mark" aria-hidden="true" />
        Lumen
      </div>
      <nav class="nav">
        <button
          class="nav-link"
          classList={{ active: activeSection() === "" }}
          onClick={() => setActiveSection("")}
        >
          Home
        </button>
        <For each={props.sections}>
          {(s) => (
            <button
              class="nav-link"
              classList={{ active: activeSection() === s.key }}
              onClick={() => setActiveSection(s.key)}
            >
              {s.title}
            </button>
          )}
        </For>
      </nav>
      <div class="topbar-right">
        <Show when={demo()}>
          <span class="badge">Demo</span>
        </Show>
        <Show when={serverName()}>
          <span class="server">{serverName()}</span>
        </Show>
        <button class="discover-trigger" onClick={props.onDiscover} title="Add media">
          + Add Media
        </button>
        <button class="sign-out" onClick={props.onSignOut}>Sign out</button>
      </div>
    </header>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────────

export function Hero(props: { item: Item; onPlay: (item: Item) => void }) {
  const it = props.item;
  return (
    <section class="hero">
      <div class="ambient" style={{ "background-image": `url("${backdrop(it)}")` }} />
      <div class="hero-art" style={{ "background-image": `url("${backdrop(it)}")` }} />
      <div class="hero-scrim" />
      <div class="hero-body">
        <p class="eyebrow">Featured</p>
        <h1 class="hero-title">{it.title}</h1>
        <p class="hero-meta">{metaLine(it)}</p>
        <div class="hero-actions">
          <button class="btn btn-primary" onClick={() => props.onPlay(it)}>▸ Play</button>
        </div>
      </div>
    </section>
  );
}

// ── Tile / Row ─────────────────────────────────────────────────────────────

export function Tile(props: { item: Item; onPlay: (item: Item) => void }) {
  const it = props.item;
  const wide = it.type === "episode" || !!it.viewOffset;
  const p = progress(it);
  return (
    <button class="tile" classList={{ wide }} onClick={() => props.onPlay(it)}>
      <div class="tile-art">
        <img
          src={wide ? backdrop(it, 480, 270) : poster(it)}
          alt={it.title}
          loading="lazy"
        />
        <Show when={p > 0}>
          <span class="progress">
            <span class="progress-fill" style={{ width: `${p * 100}%` }} />
          </span>
        </Show>
        <Show when={it.type === "show" || it.type === "artist" || it.type === "album"}>
          <span class="tile-type-badge">
            {it.type === "show" ? "Series" : it.type === "artist" ? "Artist" : "Album"}
          </span>
        </Show>
      </div>
      <span class="tile-title">{tileLabel(it)}</span>
    </button>
  );
}

export function Row(props: { hub: Hub; onPlay: (item: Item) => void }) {
  let scrollerEl!: HTMLDivElement;

  function scroll(dir: 1 | -1) {
    scrollerEl.scrollBy({ left: dir * (scrollerEl.clientWidth * 0.8), behavior: "smooth" });
  }

  return (
    <section class="row">
      <h2 class="row-title">{props.hub.title}</h2>
      <div class="row-track">
        <button class="row-arrow row-arrow--left" onClick={() => scroll(-1)}>‹</button>
        <div class="scroller" ref={(el) => (scrollerEl = el)}>
          <For each={props.hub.Metadata}>
            {(it) => <Tile item={it} onPlay={props.onPlay} />}
          </For>
        </div>
        <button class="row-arrow row-arrow--right" onClick={() => scroll(1)}>›</button>
      </div>
    </section>
  );
}

// ── LibraryGrid ────────────────────────────────────────────────────────────
// Full-library browsing overlay for a section.

export function LibraryGrid(props: {
  sectionKey: string;
  title: string;
  sectionType: string;
  onClose: () => void;
  onItemClick: (item: Item) => void;
}) {
  const [items] = createResource(() => props.sectionKey, getAllItems);

  return (
    <div class="overlay-screen">
      <div class="overlay-header">
        <button
          class="overlay-back"
          onClick={(e) => { e.stopPropagation(); props.onClose(); }}
        >
          ← Back
        </button>
        <h2 class="overlay-title">{props.title}</h2>
        <span class="overlay-count">
          <Show when={items()}>{(list) => `${list().length} items`}</Show>
        </span>
      </div>

      <div class="overlay-body">
        <Show when={items.loading}>
          <div class="overlay-loading"><div class="pin-spinner" /></div>
        </Show>
        <Show when={items.error}>
          <p class="overlay-error">Failed to load library.</p>
        </Show>
        <Show when={items()}>
          {(list) => (
            <div class="lib-grid">
              <For each={list()}>
                {(it) => <Tile item={it} onPlay={props.onItemClick} />}
              </For>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}

// ── DetailView ─────────────────────────────────────────────────────────────
// Drill-down view: show → seasons, season → episodes, artist → albums, album → tracks.

export function DetailView(props: {
  item: Item;
  onClose: () => void;
  onItemClick: (item: Item) => void;
}) {
  const [children] = createResource(() => props.item.ratingKey, getChildren);

  const header = () => {
    switch (props.item.type) {
      case "show":   return "Seasons";
      case "season": return `Season ${props.item.index ?? props.item.parentIndex ?? ""}`;
      case "artist": return "Albums";
      case "album":  return "Tracks";
      default:       return "Episodes";
    }
  };

  function childLabel(child: Item): string {
    if (child.type === "season") {
      const count = child.leafCount != null ? ` · ${child.leafCount} episodes` : "";
      return `Season ${child.index ?? child.parentIndex ?? "?"}${count}`;
    }
    if (child.type === "episode") {
      const epNum = child.index != null ? `E${pad2(child.index)} – ` : "";
      return `${epNum}${child.title}`;
    }
    if (child.type === "track") {
      const n = child.index != null ? `${child.index}. ` : "";
      const d = child.duration ? `  ${fmt(child.duration / 1000)}` : "";
      return `${n}${child.title}${d}`;
    }
    return tileLabel(child);
  }

  const useTileGrid = () =>
    !["season", "album"].includes(props.item.type);

  return (
    <div class="overlay-screen">
      {/* Backdrop art */}
      <Show when={props.item.art}>
        <div
          class="detail-backdrop"
          style={{ "background-image": `url("${backdrop(props.item)}")` }}
        />
      </Show>

      <div class="overlay-header detail-overlay-header">
        <button
          class="overlay-back"
          onClick={(e) => { e.stopPropagation(); props.onClose(); }}
        >
          ← Back
        </button>
        <div class="detail-meta">
          <h2 class="overlay-title">{props.item.title}</h2>
          <Show when={metaLine(props.item)}>
            <p class="detail-sub">{metaLine(props.item)}</p>
          </Show>
        </div>
      </div>

      <div class="overlay-body">
        <Show when={children.loading}>
          <div class="overlay-loading"><div class="pin-spinner" /></div>
        </Show>
        <Show when={children.error}>
          <p class="overlay-error">Couldn't load content.</p>
        </Show>
        <Show when={children()}>
          {(list) => (
            <>
              <h3 class="detail-section-label">{header()}</h3>
              <Show
                when={useTileGrid()}
                fallback={
                  /* Seasons and tracks render as a vertical list */
                  <ul class="detail-list">
                    <For each={list()}>
                      {(child) => (
                        <li>
                          <button
                            class="detail-list-row"
                            onClick={() => props.onItemClick(child)}
                          >
                            <Show when={child.thumb}>
                              <img
                                class="detail-list-thumb"
                                src={poster(child, 80, 120)}
                                alt={child.title}
                                loading="lazy"
                              />
                            </Show>
                            <span class="detail-list-label">{childLabel(child)}</span>
                            <span class="detail-list-chevron">›</span>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                }
              >
                <div class="lib-grid">
                  <For each={list()}>
                    {(child) => <Tile item={child} onPlay={props.onItemClick} />}
                  </For>
                </div>
              </Show>
            </>
          )}
        </Show>
      </div>
    </div>
  );
}

// ── Player ─────────────────────────────────────────────────────────────────
// Rewrite root-relative Plex paths (/video/...) to go through the /plex proxy.
// Plex HLS manifests often use paths like /video/:/transcode/... which would
// bypass nginx if requested directly from the browser origin.
function proxyUrl(url: string): string {
  if (url.startsWith("/") && !url.startsWith("/plex/")) return "/plex" + url;
  if (/^https?:\/\//.test(url)) {
    try {
      const u = new URL(url);
      if (/^\/(video|library|photo|hubs)\//.test(u.pathname)) return "/plex" + u.pathname + u.search;
    } catch { /* ignore */ }
  }
  return url;
}

export function Player(props: { item: Item; onClose: () => void }) {
  let videoEl!: HTMLVideoElement;
  let hls: Hls | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let reportTimer: ReturnType<typeof setInterval> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;

  const sessionId = newSessionId(); // stable for this player's lifetime
  const [currentItem, setCurrentItem] = createSignal(props.item);
  const [loading, setLoading] = createSignal(true);
  const [loadError, setLoadError] = createSignal("");
  const [playing, setPlaying] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [dur, setDur] = createSignal(0);
  const [controlsHidden, setControlsHidden] = createSignal(false);
  const [vol, setVol] = createSignal(1);

  // Load sibling episodes (for prev/next) when playing an episode
  const [siblings] = createResource(
    () => { const it = currentItem(); return it.type === "episode" && it.parentRatingKey ? it.parentRatingKey : null; },
    (parentKey) => getChildren(parentKey)
  );
  const currentIdx = () => (siblings() ?? []).findIndex((ep) => ep.ratingKey === currentItem().ratingKey);
  const prevEp = () => { const i = currentIdx(); return i > 0 ? (siblings()!)[i - 1] : null; };
  const nextEp = () => { const s = siblings() ?? []; const i = currentIdx(); return i >= 0 && i < s.length - 1 ? s[i + 1] : null; };

  onMount(() => {
    window.addEventListener("keydown", onKey);
    loadItem(currentItem());
  });

  onCleanup(() => {
    clearTimeout(hideTimer);
    clearInterval(reportTimer);
    clearInterval(pingTimer);
    window.removeEventListener("keydown", onKey);
    // Send stopped so Plex marks this session done and won't block the next start.
    if (isFinite(videoEl?.duration) && !videoEl.ended) {
      reportProgress(currentItem().ratingKey, videoEl.currentTime * 1000, videoEl.duration * 1000, "stopped", sessionId);
    }
    destroyHls();
  });

  function destroyHls() {
    if (hls) { hls.destroy(); hls = null; }
  }

  function loadItem(item: Item) {
    setLoading(true);
    setLoadError("");
    setCurrentTime(0);
    setDur(0);
    setPlaying(false);
    clearInterval(reportTimer);
    clearInterval(pingTimer);
    destroyHls();

    // Debug probe: fires a cheap request so nginx logs confirm loadItem ran.
    fetch(`/plex/?_lumen_debug=loadItem&rk=${item.ratingKey}&X-Plex-Token=${getToken()}`).catch(() => {});

    // Decision must come before start.m3u8 — it registers the session with Plex
    // and lets Plex validate transcode params. Without it, Plex rejects start.m3u8
    // with 400 on subsequent plays from the same client.
    callTranscodeDecision(item.ratingKey, sessionId)
      .then(() => {
        fetch(`/plex/?_lumen_debug=decision_ok&rk=${item.ratingKey}&X-Plex-Token=${getToken()}`).catch(() => {});
        startHls(item);
      })
      .catch((err: unknown) => {
        fetch(`/plex/?_lumen_debug=decision_fail&rk=${item.ratingKey}&err=${encodeURIComponent(String(err))}&X-Plex-Token=${getToken()}`).catch(() => {});
        setLoadError("Stream unavailable — your server may not support transcoding for this item.");
        setLoading(false);
      });
  }

  function startHls(item: Item) {
    const hlsUrl = buildHlsUrl(item.ratingKey, sessionId);

    if (Hls.isSupported()) {
      hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        // Rewrite any root-relative or absolute Plex server URLs so they
        // go through the /plex nginx proxy instead of hitting the server directly.
        fetchSetup: (context, initParams) => new Request(proxyUrl(context.url), initParams),
        xhrSetup: (xhr, url) => {
          const rewritten = proxyUrl(url);
          if (rewritten !== url) xhr.open("GET", rewritten, true);
        },
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        const offset = item.viewOffset;
        if (offset && offset > 0) videoEl.currentTime = offset / 1000;
        videoEl.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setLoadError("Stream unavailable — your server may not support transcoding for this item.");
          setLoading(false);
        }
      });
    } else if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari has native HLS support
      videoEl.src = hlsUrl;
      const onMeta = () => {
        setLoading(false);
        const offset = item.viewOffset;
        if (offset && offset > 0) videoEl.currentTime = offset / 1000;
        videoEl.play().catch(() => {});
        videoEl.removeEventListener("loadedmetadata", onMeta);
      };
      videoEl.addEventListener("loadedmetadata", onMeta);
    } else {
      setLoadError("HLS playback is not supported by this browser. Try Chrome, Firefox, or Safari.");
      setLoading(false);
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape")     { e.preventDefault(); props.onClose(); return; }
    if (e.key === " ")          { e.preventDefault(); togglePlay(); return; }
    if (e.key === "ArrowRight") videoEl.currentTime = Math.min(videoEl.duration, videoEl.currentTime + 10);
    if (e.key === "ArrowLeft")  videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
    showControlsBriefly();
  }

  function showControlsBriefly() {
    setControlsHidden(false);
    clearTimeout(hideTimer);
    if (playing()) hideTimer = setTimeout(() => setControlsHidden(true), 3000);
  }

  function togglePlay() {
    videoEl.paused ? videoEl.play() : videoEl.pause();
  }

  function playItem(item: Item) {
    if (isFinite(videoEl?.duration)) {
      reportProgress(currentItem().ratingKey, videoEl.currentTime * 1000, videoEl.duration * 1000, "stopped", sessionId);
    }
    setCurrentItem(item);
    loadItem(item);
  }

  function onVideoPlay() {
    setPlaying(true);
    showControlsBriefly();
    clearInterval(reportTimer);
    clearInterval(pingTimer);
    reportTimer = setInterval(() => {
      if (isFinite(videoEl?.duration)) {
        reportProgress(currentItem().ratingKey, videoEl.currentTime * 1000, videoEl.duration * 1000, "playing", sessionId);
      }
    }, 5000);
    pingTimer = setInterval(() => pingTranscodeSession(sessionId), 10000);
  }

  function onVideoPause() {
    setPlaying(false);
    clearInterval(reportTimer);
    clearInterval(pingTimer);
    setControlsHidden(false);
    // Skip the paused report when the video has ended — onVideoEnded handles it.
    if (isFinite(videoEl?.duration) && !videoEl.ended) {
      reportProgress(currentItem().ratingKey, videoEl.currentTime * 1000, videoEl.duration * 1000, "paused", sessionId);
    }
  }

  function onTimeUpdate() { setCurrentTime(videoEl.currentTime); }
  function onDurationChange() { if (isFinite(videoEl.duration)) setDur(videoEl.duration); }

  function onVideoEnded() {
    clearInterval(reportTimer);
    clearInterval(pingTimer);
    setPlaying(false);
    // Send stopped at full duration — Plex uses this to mark the item watched
    // and clear it from Continue Watching.
    if (isFinite(videoEl?.duration)) {
      reportProgress(currentItem().ratingKey, videoEl.duration * 1000, videoEl.duration * 1000, "stopped", sessionId);
    }
  }

  return (
    <div
      class="player"
      classList={{ "controls-hidden": controlsHidden() }}
      onMouseMove={showControlsBriefly}
      onClick={togglePlay}
    >
      {/* Video element always in DOM so hls.js can attach to it */}
      <video
        ref={(el) => (videoEl = el)}
        onPlay={onVideoPlay}
        onPause={onVideoPause}
        onEnded={onVideoEnded}
        onTimeUpdate={onTimeUpdate}
        onDurationChange={onDurationChange}
        onError={() => { setLoadError("Video error — see console for details."); setLoading(false); }}
      />

      {/* Loading spinner */}
      <Show when={loading()}>
        <div class="player-loading"><div class="pin-spinner" /></div>
      </Show>

      {/* Fatal error state */}
      <Show when={loadError()}>
        <div class="player-error">
          <p>{loadError()}</p>
          <button class="btn btn-ghost" onClick={(e) => { e.stopPropagation(); props.onClose(); }}>Close</button>
        </div>
      </Show>

      {/* Controls overlay */}
      <Show when={!loadError()}>
        <div class="player-ui" classList={{ hidden: controlsHidden() }}>

          {/* Top bar */}
          <div class="player-top" onClick={(e) => e.stopPropagation()}>
            <button
              class="player-close"
              onClick={(e) => { e.stopPropagation(); props.onClose(); }}
            >
              ✕
            </button>
            <span class="player-title">{tileLabel(currentItem())}</span>
          </div>

          {/* Bottom bar */}
          <div class="player-bottom" onClick={(e) => e.stopPropagation()}>
            {/* Prev / Next episode row */}
            <Show when={prevEp() || nextEp()}>
              <div class="player-episode-nav">
                <Show when={prevEp()}>
                  {(ep) => (
                    <button class="player-ep-btn" onClick={() => playItem(ep())}>
                      ‹ {ep().index != null ? `E${pad2(ep().index)}` : "Prev"}
                    </button>
                  )}
                </Show>
                <span class="player-ep-label">
                  {currentItem().type === "episode"
                    ? `S${pad2(currentItem().parentIndex)} E${pad2(currentItem().index)}`
                    : ""}
                </span>
                <Show when={nextEp()}>
                  {(ep) => (
                    <button class="player-ep-btn" onClick={() => playItem(ep())}>
                      {ep().index != null ? `E${pad2(ep().index)}` : "Next"} ›
                    </button>
                  )}
                </Show>
              </div>
            </Show>

            {/* Seek bar */}
            <input
              class="player-seek"
              type="range"
              min="0"
              max={dur() || 100}
              step="1"
              value={currentTime()}
              onInput={(e) => {
                if (videoEl) { videoEl.currentTime = Number(e.currentTarget.value); setCurrentTime(videoEl.currentTime); }
              }}
            />

            {/* Controls row */}
            <div class="player-row">
              <button class="player-btn" onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
                {playing() ? "❚❚" : "▶"}
              </button>
              <span class="player-time">{fmt(currentTime())} / {fmt(dur())}</span>
              <div class="player-spacer" />
              <input
                class="player-volume"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={vol()}
                onInput={(e) => {
                  const v = Number(e.currentTarget.value);
                  setVol(v);
                  if (videoEl) videoEl.volume = v;
                }}
              />
              <button class="player-btn" onClick={(e) => { e.stopPropagation(); videoEl?.requestFullscreen(); }}>⛶</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}

// ── InfoView ───────────────────────────────────────────────────────────────
// Top-level info page for a movie, show, artist, or album.
// Pulls rich metadata (synopsis, cast, crew, file tech info) from the Plex
// API and displays it while letting the user initiate playback or browsing.

const VIDEO_CODEC: Record<string, string> = {
  hevc: "H.265 (HEVC)", h264: "H.264 (AVC)", avc: "H.264 (AVC)",
  vp9: "VP9", av1: "AV1", mpeg4: "MPEG-4", mpeg2video: "MPEG-2",
};
const AUDIO_CODEC: Record<string, string> = {
  dca: "DTS", ac3: "Dolby Digital", eac3: "Dolby Digital+",
  truehd: "Dolby TrueHD", aac: "AAC", flac: "FLAC", mp3: "MP3", opus: "Opus",
};

function codecLabel(codec: string | undefined, map: Record<string, string>): string {
  if (!codec) return "—";
  return map[codec.toLowerCase()] ?? codec.toUpperCase();
}

function runtime(ms: number | undefined): string {
  if (!ms) return "";
  const mins = Math.floor(ms / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function ratingDisplay(score: number | undefined, image: string | undefined): string | null {
  if (score == null) return null;
  // Plex stores RT scores as 0-10 representing 0-100%.
  // IMDb scores are also 0-10 but represent the actual score.
  if (image?.includes("rottentomatoes") || image?.includes("metacritic")) {
    return `${(score * 10).toFixed(0)}%`;
  }
  // IMDb or unknown — show as decimal
  return score.toFixed(1);
}

function ratingSource(image: string | undefined): string {
  if (!image) return "★";
  if (image.includes("rottentomatoes")) return "RT";
  if (image.includes("imdb")) return "IMDb";
  if (image.includes("metacritic")) return "MC";
  return "★";
}

export function InfoView(props: {
  item: Item;
  onClose: () => void;
  onPlay: (item: Item) => void;
  onBrowseChildren: (item: Item) => void;
}) {
  const [details] = createResource(() => props.item.ratingKey, getDetails);

  // Merge fetched details over the base item — base item renders immediately
  // so there's no blank screen while loading.
  const it = () => details() ?? props.item;

  const isPlayable  = () => ["movie", "episode", "track"].includes(it().type);
  const isContainer = () => ["show", "artist", "album"].includes(it().type);

  const media = () => details()?.Media?.[0];

  const criticsRating  = () => ratingDisplay(it().rating, it().ratingImage);
  const audienceRating = () => ratingDisplay(it().audienceRating, it().audienceRatingImage);

  const browseLabel = () => {
    switch (it().type) {
      case "show":   return "Browse Seasons";
      case "artist": return "Browse Albums";
      case "album":  return "Browse Tracks";
      default:       return "Browse";
    }
  };

  return (
    <div class="info-view">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div
        class="info-hero"
        style={{ "background-image": it().art ? `url("${backdrop(it())}")` : undefined }}
      >
        <div class="info-hero-scrim" />

        <button
          class="info-close"
          onClick={(e) => { e.stopPropagation(); props.onClose(); }}
        >
          ✕
        </button>

        <div class="info-hero-content">
          <Show when={it().thumb}>
            <img
              class="info-poster"
              src={poster(it(), 220, 330)}
              alt={it().title}
            />
          </Show>

          <div class="info-meta">
            <h1 class="info-title">{it().title}</h1>
            <Show when={it().tagline}>
              <p class="info-tagline">{it().tagline}</p>
            </Show>

            {/* Year · rating · runtime · studio */}
            <div class="info-attr-row">
              <Show when={it().year}><span class="info-attr">{it().year}</span><span class="info-attr-sep">·</span></Show>
              <Show when={it().contentRating}><span class="info-attr info-attr-pill">{it().contentRating}</span><span class="info-attr-sep">·</span></Show>
              <Show when={it().duration}><span class="info-attr">{runtime(it().duration)}</span></Show>
              <Show when={it().leafCount}><span class="info-attr-sep">·</span><span class="info-attr">{it().leafCount} ep</span></Show>
              <Show when={it().studio}><span class="info-attr-sep">·</span><span class="info-attr info-attr-dim">{it().studio}</span></Show>
            </div>

            {/* Ratings */}
            <Show when={criticsRating() || audienceRating()}>
              <div class="info-rating-row">
                <Show when={criticsRating()}>
                  <span class="info-rating-chip">
                    <span class="info-rating-source">{ratingSource(it().ratingImage)}</span>
                    {criticsRating()}
                  </span>
                </Show>
                <Show when={audienceRating()}>
                  <span class="info-rating-chip info-rating-audience">
                    <span class="info-rating-source">Audience</span>
                    {audienceRating()}
                  </span>
                </Show>
              </div>
            </Show>

            {/* Genre tags */}
            <Show when={(it().Genre ?? []).length > 0}>
              <div class="info-genres">
                <For each={it().Genre}>{(g) => <span class="info-genre-tag">{g.tag}</span>}</For>
              </div>
            </Show>

            {/* Action buttons */}
            <div class="info-actions">
              <Show when={isPlayable()}>
                <button
                  class="btn btn-primary info-action-btn"
                  onClick={(e) => { e.stopPropagation(); props.onPlay(it()); }}
                >
                  ▶ Play
                </button>
              </Show>
              <Show when={isContainer()}>
                <button
                  class="btn btn-primary info-action-btn"
                  onClick={(e) => { e.stopPropagation(); props.onBrowseChildren(it()); }}
                >
                  {browseLabel()}
                </button>
              </Show>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body (scrollable) ────────────────────────────────────── */}
      <div class="info-body">
        <Show when={details.loading && !props.item.summary}>
          <div class="overlay-loading"><div class="pin-spinner" /></div>
        </Show>

        {/* Overview */}
        <Show when={it().summary}>
          <section class="info-section">
            <h2 class="info-section-label">Overview</h2>
            <p class="info-summary">{it().summary}</p>
          </section>
        </Show>

        {/* Cast */}
        <Show when={(details()?.Role ?? []).length > 0}>
          <section class="info-section">
            <h2 class="info-section-label">Cast</h2>
            <div class="info-cast">
              <For each={details()!.Role!.slice(0, 14)}>
                {(member) => (
                  <div class="info-cast-card">
                    <Show
                      when={member.thumb}
                      fallback={<div class="info-cast-avatar info-cast-placeholder">{member.tag[0]}</div>}
                    >
                      {(t) => (
                        <img
                          class="info-cast-avatar"
                          src={img(t(), 88, 88)}
                          alt={member.tag}
                          loading="lazy"
                        />
                      )}
                    </Show>
                    <span class="info-cast-name">{member.tag}</span>
                    <Show when={member.role}>
                      <span class="info-cast-role">{member.role}</span>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </section>
        </Show>

        {/* Crew */}
        <Show when={(details()?.Director ?? []).length > 0 || (details()?.Writer ?? []).length > 0}>
          <section class="info-section info-crew-section">
            <Show when={(details()?.Director ?? []).length > 0}>
              <div class="info-crew-block">
                <h2 class="info-section-label">Director</h2>
                <p class="info-crew-names">{details()?.Director?.map(d => d.tag).join(", ")}</p>
              </div>
            </Show>
            <Show when={(details()?.Writer ?? []).length > 0}>
              <div class="info-crew-block">
                <h2 class="info-section-label">Writer</h2>
                <p class="info-crew-names">{details()?.Writer?.slice(0, 4).map(w => w.tag).join(", ")}</p>
              </div>
            </Show>
          </section>
        </Show>

        {/* File tech info — only for playable media */}
        <Show when={isPlayable() && media()}>
          {(m) => (
            <section class="info-section">
              <h2 class="info-section-label">File Info</h2>
              <dl class="info-file-grid">
                <Show when={m().width && m().height}>
                  <div class="info-file-pair"><dt>Resolution</dt><dd>{m().width}×{m().height}</dd></div>
                </Show>
                <Show when={m().videoCodec}>
                  <div class="info-file-pair"><dt>Video</dt><dd>{codecLabel(m().videoCodec, VIDEO_CODEC)}</dd></div>
                </Show>
                <Show when={m().audioCodec}>
                  <div class="info-file-pair">
                    <dt>Audio</dt>
                    <dd>{codecLabel(m().audioCodec, AUDIO_CODEC)}{m().audioChannels ? ` · ${m().audioChannels}ch` : ""}</dd>
                  </div>
                </Show>
                <Show when={m().container}>
                  <div class="info-file-pair"><dt>Container</dt><dd>{m().container?.toUpperCase()}</dd></div>
                </Show>
                <Show when={m().videoFrameRate}>
                  <div class="info-file-pair"><dt>Frame Rate</dt><dd>{m().videoFrameRate}</dd></div>
                </Show>
                <Show when={m().bitrate}>
                  <div class="info-file-pair">
                    <dt>Bitrate</dt>
                    <dd>{((m().bitrate ?? 0) / 1000).toFixed(1)} Mbps</dd>
                  </div>
                </Show>
              </dl>
            </section>
          )}
        </Show>

        {/* Country */}
        <Show when={(details()?.Country ?? []).length > 0}>
          <section class="info-section">
            <h2 class="info-section-label">Country</h2>
            <p class="info-crew-names">{details()?.Country?.map(c => c.tag).join(", ")}</p>
          </section>
        </Show>
      </div>
    </div>
  );
}

// ── DiscoverView ───────────────────────────────────────────────────────────

export function DiscoverView(props: { onClose: () => void }) {
  const [query, setQuery] = createSignal("");
  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  const [tab, setTab] = createSignal<"movie" | "show">("movie");
  type AddMode = "down" | "sym";
  type AddStatus = "adding" | "added" | "error";
  const [addStates, setAddStates] = createSignal<Record<string, { mode: AddMode; status: AddStatus }>>({});

  // ── Device profile (persisted in localStorage) ─────────────────────────
  const [profileId, setProfileId] = createSignal(getDeviceProfile().id);
  const profile = () => PRESETS.find((p) => p.id === profileId()) ?? PRESETS[0];
  createEffect(() => saveDeviceProfile(profileId()));

  // Debounce search input by 400 ms
  createEffect(() => {
    const q = query();
    if (!q) { setDebouncedQuery(""); return; }
    const t = setTimeout(() => setDebouncedQuery(q), 400);
    onCleanup(() => clearTimeout(t));
  });

  // ── Radarr / Sonarr search ─────────────────────────────────────────────
  const [movieResults] = createResource(
    () => (tab() === "movie" ? debouncedQuery() : null) || null,
    searchMovies
  );
  const [showResults] = createResource(
    () => (tab() === "show" ? debouncedQuery() : null) || null,
    searchSeries
  );

  // Fetch arr config once on mount so the first "Add" click is instant
  const [radarrCfg] = createResource(() =>
    Promise.all([getRadarrProfiles(), getRadarrRootFolders()])
      .then(([profiles, folders]) => ({ profiles, folders }))
  );
  const [sonarrCfg] = createResource(() =>
    Promise.all([getSonarrProfiles(), getSonarrRootFolders()])
      .then(([profiles, folders]) => ({ profiles, folders }))
  );

  // ── Prowlarr release search (parallel to Radarr/Sonarr) ───────────────
  const [prowlarrReleases] = createResource(
    (): { q: string; categories: number[] } | null => {
      const q = debouncedQuery();
      const t = tab();
      return q ? { q, categories: t === "movie" ? [2000] : [5000] } : null;
    },
    ({ q, categories }) =>
      searchProwlarr(q, categories).catch((): ProwlarrRelease[] => [])
  );

  // ── RD instant-availability (fires when Prowlarr results arrive) ────────
  const [rdAvailability] = createResource(
    (): string | null => {
      const releases = prowlarrReleases();
      if (!releases?.length) return null;
      const hashes = releases.flatMap((r) => (r.infoHash ? [r.infoHash] : []));
      return hashes.length ? hashes.join(",") : null;
    },
    (hashKey) =>
      checkInstantAvailability(hashKey.split(",")).catch((): RdAvailability => ({}))
  );

  // ── Per-card streaming compatibility ────────────────────────────────────
  // Returns the best StreamCompat for a title/year based on currently
  // cached RD releases scored against the selected device profile.
  function getBestCompat(title: string, year: number): StreamCompat | null {
    const releases = prowlarrReleases();
    const avail = rdAvailability();
    if (!releases?.length || !avail) return null;

    const cached = releases.filter(
      (r) => r.infoHash && isAvailable(avail, r.infoHash) && matchesTitle(r.title, title, year)
    );
    if (!cached.length) return null;

    const prof = profile();
    const best = cached
      .map((r) => { const q = parseRelease(r.title); return { q, s: scoreRelease(q, prof) }; })
      .sort((a, b) => b.s - a.s)[0];

    return streamCompat(best.q, prof);
  }

  function StreamCompatBadge(bProps: { compat: StreamCompat }) {
    const [label, cls] =
      bProps.compat === "direct"
        ? ["▶ Direct", "rd-badge--direct"]
        : bProps.compat === "transcode-audio"
        ? ["▶ ~Audio", "rd-badge--audio"]
        : ["⚙ Transcode", "rd-badge--video"];
    return <span class={`rd-badge ${cls}`}>{label}</span>;
  }

  // "sym" → 1080p profile (RD/zurg symlink, instant); "down" → highest quality (4K torrent/usenet).
  function pickProfile(profiles: QualityProfile[], mode: AddMode): QualityProfile {
    if (mode === "down") {
      return (
        profiles.find((p) => /4k|ultra|2160|uhd/i.test(p.name)) ??
        profiles[profiles.length - 1]
      );
    }
    return (
      profiles.find((p) => /1080/i.test(p.name) && !/4k|ultra|2160|uhd/i.test(p.name)) ??
      profiles.find((p) => /hd|high/i.test(p.name)) ??
      profiles[0]
    );
  }

  async function handleAdd(item: ArrMovie | ArrSeries, type: "movie" | "show", mode: AddMode) {
    const key = type === "movie"
      ? `m-${(item as ArrMovie).tmdbId}`
      : `s-${(item as ArrSeries).tvdbId}`;
    setAddStates((p) => ({ ...p, [key]: { mode, status: "adding" } }));
    try {
      if (type === "movie") {
        const cfg = radarrCfg();
        if (!cfg?.profiles.length || !cfg?.folders.length)
          throw new Error("Radarr not configured");
        const tagId = await ensureRadarrTag(mode);
        await addMovie(item as ArrMovie, pickProfile(cfg.profiles, mode).id, cfg.folders[0].path, [tagId]);
      } else {
        const cfg = sonarrCfg();
        if (!cfg?.profiles.length || !cfg?.folders.length)
          throw new Error("Sonarr not configured");
        const tagId = await ensureSonarrTag(mode);
        await addSeries(item as ArrSeries, pickProfile(cfg.profiles, mode).id, cfg.folders[0].path, [tagId]);
      }
      setAddStates((p) => ({ ...p, [key]: { mode, status: "added" } }));
    } catch (err) {
      console.error(err);
      setAddStates((p) => ({ ...p, [key]: { mode, status: "error" } }));
    }
  }

  function CardAction(cProps: { item: ArrMovie | ArrSeries; type: "movie" | "show" }) {
    const key = () =>
      cProps.type === "movie"
        ? `m-${(cProps.item as ArrMovie).tmdbId}`
        : `s-${(cProps.item as ArrSeries).tvdbId}`;
    const st = () => addStates()[key()];
    const hasFile = () => (cProps.item as ArrMovie).hasFile;
    const inLib = () => cProps.item.id > 0 && hasFile();
    const monitored = () => cProps.item.id > 0 && !hasFile();
    return (
      <Switch>
        <Match when={inLib()}>
          <span class="disc-badge disc-badge--lib">In Library</span>
        </Match>
        <Match when={monitored()}>
          <span class="disc-badge disc-badge--mon">Monitored</span>
        </Match>
        <Match when={st()?.status === "adding"}>
          <span class="disc-badge disc-badge--adding">Adding…</span>
        </Match>
        <Match when={st()?.status === "added"}>
          <span class="disc-badge disc-badge--added">
            {st()!.mode === "sym" ? "⛓ Sym'd" : "⬇ Queued"}
          </span>
        </Match>
        <Match when={st()?.status === "error"}>
          <div class="disc-add-btns">
            <button class="disc-add-btn disc-add-btn--watch disc-add-btn--err"
              onClick={() => handleAdd(cProps.item, cProps.type, st()!.mode)}>
              Retry
            </button>
          </div>
        </Match>
        <Match when={true}>
          <div class="disc-add-btns">
            <button
              class="disc-add-btn disc-add-btn--watch"
              title="Symlink via Real-Debrid / zurg — 1080p, tagged 'sym'"
              onClick={() => handleAdd(cProps.item, cProps.type, "sym")}
            >
              ⛓ Sym
            </button>
            <button
              class="disc-add-btn disc-add-btn--dl"
              title="Download via torrent / usenet — best quality up to 4K, tagged 'down'"
              onClick={() => handleAdd(cProps.item, cProps.type, "down")}
            >
              ⬇ Down
            </button>
          </div>
        </Match>
      </Switch>
    );
  }

  function ResultGrid<T extends ArrMovie | ArrSeries>(gProps: {
    items: T[] | undefined;
    type: "movie" | "show";
    error: unknown;
    loading: boolean;
    service: string;
  }) {
    return (
      <>
        <Show when={gProps.loading}>
          <div class="loading">Searching…</div>
        </Show>
        <Show when={gProps.error && !gProps.loading}>
          <div class="discover-msg">
            {gProps.service} unavailable — add API key to .env and restart Lumen.
          </div>
        </Show>
        <Show when={gProps.items && !gProps.loading}>
          <Show when={gProps.items!.length === 0}>
            <div class="discover-msg">No results found.</div>
          </Show>
          <div class="discover-grid">
            <For each={gProps.items}>
              {(item) => {
                const posterUrl = arrPoster(item.images);
                const subtitle =
                  gProps.type === "show"
                    ? `${item.year}${(item as ArrSeries).status === "continuing" ? "  ·  Ongoing" : ""}`
                    : String(item.year || "");
                const compat = () => getBestCompat(item.title, item.year);
                return (
                  <div class="discover-card">
                    <div class="discover-poster">
                      <Show
                        when={posterUrl}
                        fallback={<div class="discover-poster-ph">{item.title[0]}</div>}
                      >
                        <img src={posterUrl} alt={item.title} loading="lazy" />
                      </Show>
                      {/* RD streaming compatibility badge — top-right corner */}
                      <Show when={compat()} keyed>
                        {(c) => <StreamCompatBadge compat={c} />}
                      </Show>
                      <div class="discover-card-action">
                        <CardAction item={item} type={gProps.type} />
                      </div>
                    </div>
                    <div class="discover-card-meta">
                      <p class="discover-card-title">{item.title}</p>
                      <p class="discover-card-year">{subtitle}</p>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </>
    );
  }

  return (
    <div class="discover-view">
      <div class="discover-header">
        <button class="discover-close" onClick={props.onClose} aria-label="Close">✕</button>
        <input
          class="discover-input"
          type="search"
          placeholder="Search movies and shows…"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          autofocus
        />
        <div class="discover-tabs">
          <button
            class="discover-tab"
            classList={{ active: tab() === "movie" }}
            onClick={() => setTab("movie")}
          >
            Movies
          </button>
          <button
            class="discover-tab"
            classList={{ active: tab() === "show" }}
            onClick={() => setTab("show")}
          >
            Shows
          </button>
        </div>
        {/* Device profile selector — controls stream-compat scoring */}
        <select
          class="device-select"
          value={profileId()}
          onChange={(e) => setProfileId(e.currentTarget.value)}
          title="Your playback device — affects RD streaming compatibility badges"
        >
          <For each={PRESETS}>{(p) => <option value={p.id}>{p.label}</option>}</For>
        </select>
        <Show when={rdAvailability.loading || prowlarrReleases.loading}>
          <span class="rd-checking">RD…</span>
        </Show>
      </div>

      <div class="discover-body">
        <Show when={!debouncedQuery()}>
          <div class="discover-msg discover-msg--empty">
            <p>Search for content to add to your library.</p>
            <p>Results come from Radarr (movies) and Sonarr (shows) via TMDB / TVDB.</p>
          </div>
        </Show>

        <Show when={tab() === "movie" && !!debouncedQuery()}>
          <ResultGrid
            items={movieResults()}
            type="movie"
            error={movieResults.error}
            loading={movieResults.loading}
            service="Radarr"
          />
        </Show>

        <Show when={tab() === "show" && !!debouncedQuery()}>
          <ResultGrid
            items={showResults()}
            type="show"
            error={showResults.error}
            loading={showResults.loading}
            service="Sonarr"
          />
        </Show>
      </div>
    </div>
  );
}

// ── Setup ──────────────────────────────────────────────────────────────────

export function Setup(props: {
  onConnect: (token: string) => void;
  onStartPin: () => void;
  onCancelPin: () => void;
  onDemo: () => void;
  error?: string;
  busy?: boolean;
  pinMode: boolean;
  pinCode?: string;
  pinAuthUrl?: string;
}) {
  const [showToken, setShowToken] = createSignal(false);
  const [token, setTokenInput] = createSignal("");

  createEffect(() => {
    if (props.pinMode && props.pinAuthUrl) {
      window.open(props.pinAuthUrl, "plexauth", "width=800,height=700,left=200,top=100");
    }
  });

  return (
    <div class="setup">
      <div class="setup-card">
        <div class="wordmark big">
          <span class="mark" aria-hidden="true" />
          Lumen
        </div>

        <Show when={props.pinMode}>
          <div class="pin-waiting">
            <div class="pin-spinner" />
            <p class="pin-message">
              Complete sign-in in the Plex window.<br />
              This page will update automatically.
            </p>
            <p class="pin-label">Auth code</p>
            <p class="pin-code">{props.pinCode}</p>
            <button
              class="btn btn-ghost wide"
              onClick={() => props.pinAuthUrl && window.open(props.pinAuthUrl, "plexauth", "width=800,height=700,left=200,top=100")}
            >
              Open sign-in window again
            </button>
            <button class="link" onClick={props.onCancelPin}>Cancel</button>
          </div>
        </Show>

        <Show when={!props.pinMode}>
          <button
            class="btn btn-primary wide"
            disabled={props.busy}
            onClick={props.onStartPin}
          >
            {props.busy ? "Connecting…" : "Sign in with Plex"}
          </button>

          <div class="auth-divider"><span>or</span></div>

          <Show
            when={showToken()}
            fallback={
              <button class="link" onClick={() => setShowToken(true)}>
                Use a Plex token instead
              </button>
            }
          >
            <input
              class="field"
              type="password"
              placeholder="Plex token"
              value={token()}
              onInput={(e) => setTokenInput(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && token() && !props.busy && props.onConnect(token())}
            />
            <button
              class="btn btn-ghost wide"
              disabled={!token() || props.busy}
              onClick={() => props.onConnect(token())}
            >
              {props.busy ? "Connecting…" : "Connect with token"}
            </button>
            <p class="setup-hint">
              Find your token in Plex Web: open any item → ⋯ → Get Info → View XML,
              then copy <code>X-Plex-Token</code> from the address bar.
            </p>
          </Show>

          <Show when={props.error}>
            <p class="field-error">{props.error}</p>
          </Show>

          <button class="link" onClick={props.onDemo}>
            Explore the demo instead
          </button>
        </Show>
      </div>
    </div>
  );
}
