// src/components.tsx
import { For, Show, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import { getMediaPart, directPlayUrl, reportProgress, type Hub, type Item, type Section } from "./plex";
import { poster, backdrop, progress } from "./media";
import {
  activeSection,
  setActiveSection,
  serverName,
  demo,
} from "./store";

function pad2(n: number | undefined): string {
  return n != null ? String(n).padStart(2, "0") : "";
}

function tileLabel(it: Item): string {
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

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

/* ─── TopBar ─────────────────────────────────────────────────────────────── */

export function TopBar(props: { sections: Section[]; onSignOut: () => void }) {
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
        <button class="sign-out" onClick={props.onSignOut}>Sign out</button>
      </div>
    </header>
  );
}

/* ─── Hero ───────────────────────────────────────────────────────────────── */

export function Hero(props: { item: Item }) {
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
          <button class="btn btn-primary">▸ Play</button>
          <button class="btn btn-ghost">More info</button>
        </div>
      </div>
    </section>
  );
}

/* ─── Tile / Row ─────────────────────────────────────────────────────────── */

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

/* ─── Player ─────────────────────────────────────────────────────────────── */

export function Player(props: { item: Item; onClose: () => void }) {
  let videoEl: HTMLVideoElement | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let reportTimer: ReturnType<typeof setInterval> | undefined;

  const [src, setSrc] = createSignal("");
  const [loadError, setLoadError] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [playing, setPlaying] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [dur, setDur] = createSignal(0);
  const [controlsHidden, setControlsHidden] = createSignal(false);
  const [vol, setVol] = createSignal(1);

  onMount(async () => {
    window.addEventListener("keydown", onKey);
    try {
      const part = await getMediaPart(props.item.ratingKey);
      setSrc(directPlayUrl(part.key));
    } catch {
      setLoadError("Couldn't load this item for playback.");
    } finally {
      setLoading(false);
    }
  });

  onCleanup(() => {
    clearTimeout(hideTimer);
    clearInterval(reportTimer);
    window.removeEventListener("keydown", onKey);
    if (videoEl && isFinite(videoEl.duration)) {
      reportProgress(props.item.ratingKey, videoEl.currentTime * 1000, videoEl.duration * 1000, "stopped");
    }
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") { props.onClose(); return; }
    if (e.key === " ") { e.preventDefault(); togglePlay(); return; }
    if (e.key === "ArrowRight" && videoEl) videoEl.currentTime = Math.min(videoEl.duration, videoEl.currentTime + 10);
    if (e.key === "ArrowLeft" && videoEl) videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
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

  function onVideoPlay() {
    setPlaying(true);
    showControlsBriefly();
    clearInterval(reportTimer);
    reportTimer = setInterval(() => {
      if (videoEl) reportProgress(props.item.ratingKey, videoEl.currentTime * 1000, videoEl.duration * 1000, "playing");
    }, 10000);
  }

  function onVideoPause() {
    setPlaying(false);
    clearInterval(reportTimer);
    setControlsHidden(false);
    if (videoEl) reportProgress(props.item.ratingKey, videoEl.currentTime * 1000, videoEl.duration * 1000, "paused");
  }

  function onLoadedMetadata() {
    if (!videoEl) return;
    setDur(videoEl.duration);
    if (props.item.viewOffset) videoEl.currentTime = props.item.viewOffset / 1000;
    videoEl.play().catch(() => {});
  }

  function onTimeUpdate() {
    if (videoEl) setCurrentTime(videoEl.currentTime);
  }

  function onVideoError() {
    setLoadError("Playback failed — this format may not be supported by your browser. Try Chrome or enable server-side transcoding.");
    setLoading(false);
  }

  return (
    <div
      class="player"
      classList={{ "controls-hidden": controlsHidden() }}
      onMouseMove={showControlsBriefly}
      onClick={togglePlay}
    >
      {/* Loading */}
      <Show when={loading()}>
        <div class="player-loading"><div class="pin-spinner" /></div>
      </Show>

      {/* Error */}
      <Show when={loadError()}>
        <div class="player-error">
          <p>{loadError()}</p>
          <button class="btn btn-ghost" onClick={(e) => { e.stopPropagation(); props.onClose(); }}>Close</button>
        </div>
      </Show>

      {/* Video */}
      <Show when={src()}>
        <video
          ref={(el) => (videoEl = el)}
          src={src()}
          onPlay={onVideoPlay}
          onPause={onVideoPause}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          onError={onVideoError}
        />
      </Show>

      {/* Controls overlay — pointer-events: none on container, auto on top/bottom bars */}
      <Show when={!loadError()}>
        <div class="player-ui" classList={{ hidden: controlsHidden() }}>
          <div class="player-top" onClick={(e) => e.stopPropagation()}>
            <button class="player-close" onClick={props.onClose}>✕</button>
            <span class="player-title">{tileLabel(props.item)}</span>
          </div>

          <div class="player-bottom" onClick={(e) => e.stopPropagation()}>
            <input
              class="player-seek"
              type="range"
              min="0"
              max={dur() || 100}
              step="1"
              value={currentTime()}
              onInput={(e) => { if (videoEl) { videoEl.currentTime = Number(e.currentTarget.value); setCurrentTime(videoEl.currentTime); } }}
            />
            <div class="player-row">
              <button class="player-btn" onClick={togglePlay}>
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
              <button class="player-btn" onClick={() => videoEl?.requestFullscreen()}>⛶</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}

/* ─── Setup ──────────────────────────────────────────────────────────────── */

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

        {/* PIN waiting state */}
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

        {/* Normal auth */}
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
