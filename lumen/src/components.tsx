// src/components.tsx
import { For, Show, createResource, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import {
  getMediaPart, directPlayUrl, reportProgress,
  getAllItems, getChildren,
  type Hub, type Item, type Section,
} from "./plex";
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
  onBrowseAll: (section: Section) => void;
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
        {/* Browse-all buttons for each section */}
        <For each={props.sections}>
          {(s) => (
            <Show when={activeSection() === s.key}>
              <button class="browse-all-btn" onClick={() => props.onBrowseAll(s)}>
                Browse all {s.title} →
              </button>
            </Show>
          )}
        </For>
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
  return (
    <section class="row">
      <h2 class="row-title">{props.hub.title}</h2>
      <div class="scroller">
        <For each={props.hub.Metadata}>
          {(it) => <Tile item={it} onPlay={props.onPlay} />}
        </For>
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

export function Player(props: { item: Item; onClose: () => void }) {
  let videoEl: HTMLVideoElement | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let reportTimer: ReturnType<typeof setInterval> | undefined;

  const [currentItem, setCurrentItem] = createSignal(props.item);
  const [playing, setPlaying] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [dur, setDur] = createSignal(0);
  const [controlsHidden, setControlsHidden] = createSignal(false);
  const [vol, setVol] = createSignal(1);

  // Load media URL reactively whenever currentItem changes
  const [mediaUrl] = createResource(currentItem, async (item) => {
    const part = await getMediaPart(item.ratingKey);
    return directPlayUrl(part.key);
  });

  // Load sibling episodes when playing an episode
  const [siblings] = createResource(
    () => {
      const it = currentItem();
      return it.type === "episode" && it.parentRatingKey ? it.parentRatingKey : null;
    },
    (parentKey) => getChildren(parentKey)
  );

  const currentIdx = () => (siblings() ?? []).findIndex((ep) => ep.ratingKey === currentItem().ratingKey);
  const prevEp     = () => { const i = currentIdx(); return i > 0 ? (siblings()!)[i - 1] : null; };
  const nextEp     = () => { const s = siblings() ?? []; const i = currentIdx(); return i >= 0 && i < s.length - 1 ? s[i + 1] : null; };

  onMount(() => { window.addEventListener("keydown", onKey); });
  onCleanup(() => {
    clearTimeout(hideTimer);
    clearInterval(reportTimer);
    window.removeEventListener("keydown", onKey);
    if (videoEl && isFinite(videoEl.duration)) {
      reportProgress(currentItem().ratingKey, videoEl.currentTime * 1000, videoEl.duration * 1000, "stopped");
    }
  });

  // Reset display state when item changes so seek bar and time clear immediately
  createEffect(() => {
    currentItem(); // track the signal
    setCurrentTime(0);
    setDur(0);
    setPlaying(false);
    clearInterval(reportTimer);
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape")      { e.preventDefault(); props.onClose(); return; }
    if (e.key === " ")           { e.preventDefault(); togglePlay(); return; }
    if (e.key === "ArrowRight" && videoEl) videoEl.currentTime = Math.min(videoEl.duration, videoEl.currentTime + 10);
    if (e.key === "ArrowLeft"  && videoEl) videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
    showControlsBriefly();
  }

  function showControlsBriefly() {
    setControlsHidden(false);
    clearTimeout(hideTimer);
    if (playing()) hideTimer = setTimeout(() => setControlsHidden(true), 3000);
  }

  function togglePlay() {
    if (!videoEl) return;
    videoEl.paused ? videoEl.play() : videoEl.pause();
  }

  function playItem(item: Item) {
    if (videoEl && isFinite(videoEl.duration)) {
      reportProgress(currentItem().ratingKey, videoEl.currentTime * 1000, videoEl.duration * 1000, "stopped");
    }
    clearInterval(reportTimer);
    setCurrentItem(item);
  }

  function onVideoPlay() {
    setPlaying(true);
    showControlsBriefly();
    clearInterval(reportTimer);
    reportTimer = setInterval(() => {
      if (videoEl) reportProgress(currentItem().ratingKey, videoEl.currentTime * 1000, videoEl.duration * 1000, "playing");
    }, 10000);
  }

  function onVideoPause() {
    setPlaying(false);
    clearInterval(reportTimer);
    setControlsHidden(false);
    if (videoEl) reportProgress(currentItem().ratingKey, videoEl.currentTime * 1000, videoEl.duration * 1000, "paused");
  }

  function onLoadedMetadata() {
    if (!videoEl) return;
    setDur(videoEl.duration);
    const offset = currentItem().viewOffset;
    if (offset && offset > 0) videoEl.currentTime = offset / 1000;
    videoEl.play().catch(() => {});
  }

  function onTimeUpdate() {
    if (videoEl) setCurrentTime(videoEl.currentTime);
  }

  return (
    <div
      class="player"
      classList={{ "controls-hidden": controlsHidden() }}
      onMouseMove={showControlsBriefly}
      onClick={togglePlay}
    >
      {/* Loading */}
      <Show when={mediaUrl.loading}>
        <div class="player-loading"><div class="pin-spinner" /></div>
      </Show>

      {/* Error */}
      <Show when={mediaUrl.error}>
        <div class="player-error">
          <p>Playback failed. This format may not be supported by your browser, or the item isn't available.</p>
          <button class="btn btn-ghost" onClick={(e) => { e.stopPropagation(); props.onClose(); }}>Close</button>
        </div>
      </Show>

      {/* Video — only mount when URL is ready and not switching episodes */}
      <Show when={!mediaUrl.loading && mediaUrl()}>
        {(url) => (
          <video
            ref={(el) => (videoEl = el)}
            src={url()}
            onPlay={onVideoPlay}
            onPause={onVideoPause}
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={onLoadedMetadata}
            onError={() => clearInterval(reportTimer)}
          />
        )}
      </Show>

      {/* Controls overlay */}
      <Show when={!mediaUrl.error}>
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
