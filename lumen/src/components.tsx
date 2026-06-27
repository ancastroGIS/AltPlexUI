// src/components.tsx
import { For, Show, createSignal, createEffect } from "solid-js";
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
  onSignIn: (username: string, password: string) => void;
  onStartPin: () => void;
  onCancelPin: () => void;
  onDemo: () => void;
  error?: string;
  busy?: boolean;
  pinMode: boolean;
  pinCode?: string;
  pinAuthUrl?: string;
}) {
  const [mode, setMode] = createSignal<"login" | "token">("login");
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [token, setTokenInput] = createSignal("");
  let passEl: HTMLInputElement | undefined;

  // Auto-open the Plex auth popup whenever the PIN flow starts.
  createEffect(() => {
    if (props.pinMode && props.pinAuthUrl) {
      window.open(props.pinAuthUrl, "plexauth", "width=800,height=700,left=200,top=100");
    }
  });

  const submit = () =>
    mode() === "login"
      ? props.onSignIn(username(), password())
      : props.onConnect(token());

  const canSubmit = () =>
    !props.busy && (mode() === "login" ? !!username() && !!password() : !!token());

  return (
    <div class="setup">
      <div class="setup-card">
        <div class="wordmark big">
          <span class="mark" aria-hidden="true" />
          Lumen
        </div>

        {/* PIN waiting state — replaces the form entirely */}
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
              onClick={() =>
                props.pinAuthUrl &&
                window.open(props.pinAuthUrl, "plexauth", "width=800,height=700,left=200,top=100")
              }
            >
              Open sign-in window again
            </button>
            <button class="link" onClick={props.onCancelPin}>Cancel</button>
          </div>
        </Show>

        {/* Normal auth UI */}
        <Show when={!props.pinMode}>
          <div class="auth-tabs">
            <button
              class="auth-tab"
              classList={{ active: mode() === "login" }}
              onClick={() => setMode("login")}
            >
              Sign In
            </button>
            <button
              class="auth-tab"
              classList={{ active: mode() === "token" }}
              onClick={() => setMode("token")}
            >
              Token
            </button>
          </div>

          <Show when={mode() === "login"}>
            <input
              class="field"
              type="text"
              placeholder="Email or username"
              autocomplete="username"
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && passEl?.focus()}
            />
            <input
              ref={(el) => (passEl = el)}
              class="field"
              type="password"
              placeholder="Password"
              autocomplete="current-password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit() && submit()}
            />
          </Show>

          <Show when={mode() === "token"}>
            <input
              class="field"
              type="password"
              placeholder="Plex token"
              value={token()}
              onInput={(e) => setTokenInput(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit() && submit()}
            />
          </Show>

          <Show when={props.error}>
            <p class="field-error">{props.error}</p>
          </Show>

          <button
            class="btn btn-primary wide"
            disabled={!canSubmit()}
            onClick={submit}
          >
            {props.busy
              ? "Connecting…"
              : mode() === "login"
              ? "Sign In"
              : "Connect"}
          </button>

          <Show when={mode() === "login"}>
            <button class="link" style={{ "margin-top": "0.75rem" }} onClick={props.onStartPin}>
              Sign in with Plex instead ↗
            </button>
          </Show>

          <button class="link" onClick={props.onDemo}>
            Explore the demo instead
          </button>

          <Show when={mode() === "login"}>
            <p class="setup-hint">
              Your password is never stored — only the resulting session token is saved locally.
              If you have 2FA enabled, sign in with Plex above or use the Token tab.
            </p>
          </Show>

          <Show when={mode() === "token"}>
            <p class="setup-hint">
              Find your token in Plex Web: open any item → ⋯ → Get Info → View XML,
              then copy <code>X-Plex-Token</code> from the address bar.
            </p>
          </Show>
        </Show>
      </div>
    </div>
  );
}
