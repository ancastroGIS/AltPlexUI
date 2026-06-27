// src/components.tsx
import { For, Show, createSignal } from "solid-js";
import type { Hub, Item, Section } from "./plex";
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

export function TopBar(props: { sections: Section[] }) {
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
      </div>
    </header>
  );
}

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

export function Tile(props: { item: Item }) {
  const it = props.item;
  const wide = it.type === "episode" || !!it.viewOffset;
  const p = progress(it);
  return (
    <button class="tile" classList={{ wide }}>
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

export function Row(props: { hub: Hub }) {
  return (
    <section class="row">
      <h2 class="row-title">{props.hub.title}</h2>
      <div class="scroller">
        <For each={props.hub.Metadata}>{(it) => <Tile item={it} />}</For>
      </div>
    </section>
  );
}

export function Setup(props: {
  onConnect: (token: string) => void;
  onDemo: () => void;
  error?: string;
  busy?: boolean;
}) {
  const [token, setTokenInput] = createSignal("");
  return (
    <div class="setup">
      <div class="setup-card">
        <div class="wordmark big">
          <span class="mark" aria-hidden="true" />
          Lumen
        </div>
        <p class="setup-lead">Connect to your Plex server to begin.</p>
        <input
          class="field"
          type="password"
          placeholder="Plex token"
          value={token()}
          onInput={(e) => setTokenInput(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && props.onConnect(token())}
        />
        <Show when={props.error}>
          <p class="field-error">{props.error}</p>
        </Show>
        <button
          class="btn btn-primary wide"
          disabled={props.busy || !token()}
          onClick={() => props.onConnect(token())}
        >
          {props.busy ? "Connecting…" : "Connect"}
        </button>
        <button class="link" onClick={props.onDemo}>
          Explore the demo instead
        </button>
        <p class="setup-hint">
          Find your token in Plex Web: open any item → ⋯ → Get Info → View XML,
          then copy <code>X-Plex-Token</code> from the address bar.
        </p>
      </div>
    </div>
  );
}
