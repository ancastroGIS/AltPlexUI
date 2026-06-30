// src/App.tsx
import { For, Match, Show, Suspense, Switch, createResource, createSignal, onCleanup, onMount } from "solid-js";
import {
  getIdentity, getSections, getHubs, getToken, setToken, clearToken,
  createPin, checkPin, plexAuthUrl, PlexError,
  type Hub, type Item, type Section,
} from "./plex";
import { mockHubs, mockHero } from "./mock";
import { initSpatialNav } from "./nav";
import { Hero, Row, Setup, TopBar, Player, LibraryGrid, DetailView, InfoView, DiscoverView } from "./components";
import {
  status, setStatus,
  demo, setDemo,
  setServerName, errorMsg, setErrorMsg,
  pinData, setPinData,
  activeSection,
} from "./store";

// ── Navigation layer types ─────────────────────────────────────────────────

type PlayerLayer   = { kind: "player";   item: Item };
type LibraryLayer  = { kind: "library";  sectionKey: string; title: string; sectionType: string };
type DetailLayer   = { kind: "detail";   item: Item };
type InfoLayer     = { kind: "info";     item: Item };
type DiscoverLayer = { kind: "discover" };
type NavLayer = PlayerLayer | LibraryLayer | DetailLayer | InfoLayer | DiscoverLayer;

// ── App ────────────────────────────────────────────────────────────────────

export function App() {
  const [sections, setSections] = createSignal<Section[]>([]);
  const [navStack, setNavStack] = createSignal<NavLayer[]>([]);
  let stopPoll: (() => void) | undefined;

  // Typed accessors for the top navigation layer
  const topLayer    = () => { const s = navStack(); return s[s.length - 1] ?? null; };
  const playerLayer   = (): PlayerLayer   | null => { const l = topLayer(); return l?.kind === "player"   ? l : null; };
  const libraryLayer  = (): LibraryLayer  | null => { const l = topLayer(); return l?.kind === "library"  ? l : null; };
  const detailLayer   = (): DetailLayer   | null => { const l = topLayer(); return l?.kind === "detail"   ? l : null; };
  const infoLayer     = (): InfoLayer     | null => { const l = topLayer(); return l?.kind === "info"     ? l : null; };
  const discoverLayer = (): DiscoverLayer | null => { const l = topLayer(); return l?.kind === "discover" ? l : null; };

  onMount(() => {
    // Seed the history so the first back button pops our layers, not the browser tab
    history.replaceState({ lumenDepth: 0 }, "");
    window.addEventListener("popstate", handlePop);

    const cleanup = initSpatialNav();
    onCleanup(() => {
      window.removeEventListener("popstate", handlePop);
      cleanup();
    });

    if (getToken()) connect();
  });

  function handlePop(e: PopStateEvent) {
    const depth = (e.state as { lumenDepth?: number })?.lumenDepth ?? 0;
    setNavStack((prev) => prev.slice(0, depth));
  }

  function pushLayer(layer: NavLayer) {
    setNavStack((prev) => {
      const next = [...prev, layer];
      history.pushState({ lumenDepth: next.length }, "");
      return next;
    });
  }

  // X buttons and programmatic close call this — it goes back in history,
  // which fires popstate, which calls setNavStack to pop the layer.
  function goBack() {
    history.back();
  }

  // Route an item click.
  // Episodes and tracks play immediately. Seasons drill to episode list.
  // Everything else (movie, show, artist, album) opens the info page first.
  function handleItemClick(item: Item) {
    if (item.type === "episode" || item.type === "track") {
      pushLayer({ kind: "player", item });
    } else if (item.type === "season") {
      pushLayer({ kind: "detail", item });
    } else {
      pushLayer({ kind: "info", item });
    }
  }

  function openLibrary(section: Section) {
    pushLayer({ kind: "library", sectionKey: section.key, title: section.title, sectionType: section.type });
  }

  // ── Server connection ────────────────────────────────────────────────────

  async function connect() {
    setStatus("connecting");
    setErrorMsg("");
    try {
      const [name, secs] = await Promise.all([getIdentity(), getSections()]);
      setSections(secs);
      setServerName(name);
      setDemo(false);
      setStatus("ready");
    } catch {
      setErrorMsg("Couldn't reach your server. Check the address and token, then try again.");
      setStatus("error");
    }
  }

  async function startPinFlow() {
    setStatus("connecting");
    setErrorMsg("");
    try {
      const pin = await createPin();
      const authUrl = plexAuthUrl(pin.code);
      setPinData({ id: pin.id, code: pin.code, authUrl });
      setStatus("pin");
      beginPolling(pin.id);
    } catch (e: unknown) {
      const msg = e instanceof PlexError ? e.message : "Failed to start Plex sign-in. Please try again.";
      setErrorMsg(msg);
      setStatus("error");
    }
  }

  function beginPolling(pinId: number) {
    stopPoll?.();
    let stopped = false;
    const deadline = Date.now() + 5 * 60 * 1000;

    async function tick() {
      if (stopped) return;
      if (Date.now() > deadline) {
        setPinData(null);
        setErrorMsg("Sign-in timed out. Please try again.");
        setStatus("error");
        return;
      }
      try {
        const token = await checkPin(pinId);
        if (token) {
          setToken(token);
          setPinData(null);
          await connect();
          return;
        }
      } catch { /* ignore transient poll errors */ }
      if (!stopped) setTimeout(tick, 2000);
    }

    stopPoll = () => { stopped = true; };
    setTimeout(tick, 2000);
  }

  function cancelPin() {
    stopPoll?.();
    stopPoll = undefined;
    setPinData(null);
    setErrorMsg("");
    setStatus("setup");
  }

  function handleSignOut() {
    stopPoll?.();
    stopPoll = undefined;
    clearToken();
    setSections([]);
    setServerName("");
    setErrorMsg("");
    setPinData(null);
    setNavStack([]);
    setDemo(false);
    setStatus("setup");
    // Reset history depth so back button doesn't re-open closed layers
    history.replaceState({ lumenDepth: 0 }, "");
  }

  function startDemo() {
    setDemo(true);
    setSections([
      { key: "d1", title: "Movies", type: "movie" },
      { key: "d2", title: "Shows",  type: "show"  },
      { key: "d3", title: "Music",  type: "artist" },
    ]);
    setServerName("");
    setStatus("ready");
  }

  // ── Data loading ─────────────────────────────────────────────────────────

  const [home, { refetch: refetchHome }] = createResource(
    () => (status() === "ready" ? { demo: demo(), section: activeSection() } : null),
    async (src): Promise<{ hero?: Item; hubs: typeof mockHubs }> => {
      if (src.demo) return { hero: mockHero, hubs: mockHubs };
      const hubs = await getHubs(src.section || undefined);
      let hero: Item | undefined = hubs[0]?.Metadata?.[0];
      for (const h of hubs) {
        const withArt = (h.Metadata || []).find((it) => it.art);
        if (withArt) { hero = withArt; break; }
      }
      return { hero, hubs };
    }
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Show
      when={status() === "ready"}
      fallback={
        <Setup
          onConnect={(t) => { setToken(t); connect(); }}
          onStartPin={startPinFlow}
          onCancelPin={cancelPin}
          onDemo={startDemo}
          error={status() === "error" ? errorMsg() : undefined}
          busy={status() === "connecting"}
          pinMode={status() === "pin"}
          pinCode={pinData()?.code}
          pinAuthUrl={pinData()?.authUrl}
        />
      }
    >
      {/* ── Base view (always mounted, overlays appear on top) ─────────── */}
      <div class="app">
        <TopBar
          sections={sections()}
          onSignOut={handleSignOut}
          onDiscover={() => pushLayer({ kind: "discover" })}
        />
        <Suspense fallback={<div class="loading">Loading your library…</div>}>
          <Show when={home()} keyed>
            {(data) => {
              // Split the continue-watching hub into TV episodes vs movies
              const cwHub: Hub | undefined = data.hubs.find(
                (h) => h.hubIdentifier?.includes("continue") || h.title?.toLowerCase().includes("continue watching")
              );
              const cwShows: Hub | null = cwHub
                ? (() => {
                    const items = (cwHub.Metadata ?? []).filter((it) => it.type === "episode");
                    return items.length ? { ...cwHub, title: "Continue Watching — Shows", Metadata: items } : null;
                  })()
                : null;
              const cwMovies: Hub | null = cwHub
                ? (() => {
                    const items = (cwHub.Metadata ?? []).filter((it) => it.type === "movie");
                    return items.length ? { ...cwHub, title: "Continue Watching — Movies", Metadata: items } : null;
                  })()
                : null;
              const restHubs = data.hubs.filter((h) => h !== cwHub);

              return (
                <main>
                  <Show when={data.hero}>
                    {(h) => <Hero item={h()} onPlay={handleItemClick} />}
                  </Show>
                  <div class="rows">
                    <Show
                      when={!activeSection()}
                      fallback={
                        /* ── Section view: browse-all shortcut + hubs ── */
                        <>
                          <Show when={sections().find((s) => s.key === activeSection())} keyed>
                            {(sec) => (
                              <div class="section-browse-bar">
                                <button class="browse-all-btn" onClick={() => openLibrary(sec)}>
                                  Browse All {sec.title} →
                                </button>
                              </div>
                            )}
                          </Show>
                          <For each={data.hubs}>
                            {(hub) => <Row hub={hub} onPlay={handleItemClick} />}
                          </For>
                        </>
                      }
                    >
                      {/* ── Home view: split CW + library buttons + rest ── */}
                      <>
                        <Show when={cwShows} keyed>
                          {(hub) => <Row hub={hub} onPlay={handleItemClick} />}
                        </Show>
                        <Show when={cwMovies} keyed>
                          {(hub) => <Row hub={hub} onPlay={handleItemClick} />}
                        </Show>
                        <Show when={sections().find((s) => s.type === "show") || sections().find((s) => s.type === "movie")}>
                          <div class="library-shortcuts">
                            <Show when={sections().find((s) => s.type === "show")} keyed>
                              {(sec) => (
                                <button class="library-shortcut-btn" onClick={() => openLibrary(sec)}>
                                  Go To Full TV Show Library →
                                </button>
                              )}
                            </Show>
                            <Show when={sections().find((s) => s.type === "movie")} keyed>
                              {(sec) => (
                                <button class="library-shortcut-btn" onClick={() => openLibrary(sec)}>
                                  Go To Full Movie Library →
                                </button>
                              )}
                            </Show>
                          </div>
                        </Show>
                        <For each={restHubs}>
                          {(hub) => <Row hub={hub} onPlay={handleItemClick} />}
                        </For>
                        <Show when={data.hubs.length === 0}>
                          <p class="empty">Nothing here yet.</p>
                        </Show>
                      </>
                    </Show>
                  </div>
                </main>
              );
            }}
          </Show>
        </Suspense>
      </div>

      {/* ── Overlay layers (only the topmost renders) ─────────────────── */}
      <Switch>
        <Match when={discoverLayer()}>
          <DiscoverView onClose={goBack} />
        </Match>
        <Match when={libraryLayer()}>
          {(l) => (
            <LibraryGrid
              sectionKey={l().sectionKey}
              title={l().title}
              sectionType={l().sectionType}
              onClose={goBack}
              onItemClick={handleItemClick}
            />
          )}
        </Match>
        <Match when={infoLayer()}>
          {(l) => (
            <InfoView
              item={l().item}
              onClose={goBack}
              onPlay={(item) => pushLayer({ kind: "player", item })}
              onBrowseChildren={(item) => pushLayer({ kind: "detail", item })}
            />
          )}
        </Match>
        <Match when={detailLayer()}>
          {(l) => (
            <DetailView
              item={l().item}
              onClose={goBack}
              onItemClick={handleItemClick}
            />
          )}
        </Match>
        <Match when={playerLayer()}>
          {(l) => (
            <Player
              item={l().item}
              onClose={() => { goBack(); refetchHome(); }}
            />
          )}
        </Match>
      </Switch>
    </Show>
  );
}
