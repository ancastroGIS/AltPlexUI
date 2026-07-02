// src/App.tsx
import { For, Show, Suspense, createResource, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Router, Route, useNavigate, useParams, useLocation, A } from "@solidjs/router";
import {
  getIdentity, getSections, getHubs, getDetails, getToken, setToken, clearToken,
  createPin, checkPin, plexAuthUrl, PlexError,
  type Hub, type Item, type Section,
} from "./plex";
import { mockHubs, mockHero } from "./mock";
import { initSpatialNav } from "./nav";
import { Hero, Row, Setup, TopBar, Drawer, Player, LibraryGrid, DetailView, InfoView, DiscoverView } from "./components";
import { itemPath, watchPath, browsePath, gridPath } from "./routes";
import {
  status, setStatus,
  demo, setDemo,
  setServerName, errorMsg, setErrorMsg,
  pinData, setPinData,
} from "./store";

// Pick a hero image for a set of hubs: first item that has backdrop art, else
// just the first item available.
function pickHero(hubs: Hub[]): Item | undefined {
  for (const h of hubs) {
    const withArt = (h.Metadata || []).find((it) => it.art);
    if (withArt) return withArt;
  }
  return hubs[0]?.Metadata?.[0];
}

// ── App ────────────────────────────────────────────────────────────────────

export function App() {
  const [sections, setSections] = createSignal<Section[]>([]);
  let stopPoll: (() => void) | undefined;

  onMount(() => {
    const cleanup = initSpatialNav();
    onCleanup(cleanup);
    if (getToken()) connect();
  });

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
    setDemo(false);
    setStatus("setup");
    // Drop any deep route so re-login starts at home.
    window.history.replaceState({}, "", "/");
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
  // Global home hubs. Stays mounted in App scope so it survives route changes
  // and can be refetched after playback to refresh Continue Watching.

  const [home, { refetch: refetchHome }] = createResource(
    () => (status() === "ready" ? { demo: demo() } : null),
    async (src): Promise<{ hero?: Item; hubs: typeof mockHubs }> => {
      if (src.demo) return { hero: mockHero, hubs: mockHubs };
      const hubs = await getHubs();
      return { hero: pickHero(hubs), hubs };
    }
  );

  // ── Route components (close over App state) ──────────────────────────────

  // Chrome layout for browsy pages: top bar + drawer + the matched child page.
  function Shell(props: { children?: JSX.Element }) {
    const [drawerOpen, setDrawerOpen] = createSignal(false);
    return (
      <div class="app">
        <TopBar onMenu={() => setDrawerOpen(true)} />
        <Drawer
          open={drawerOpen()}
          sections={sections()}
          onClose={() => setDrawerOpen(false)}
          onSignOut={handleSignOut}
        />
        <Suspense fallback={<div class="loading">Loading your library…</div>}>
          {props.children}
        </Suspense>
      </div>
    );
  }

  // Resolve the Item for a detail/playback route: use the object passed via
  // navigation state for instant in-app nav, else fetch it by ratingKey so a
  // cold deep-link (refresh / shared URL) still works.
  function useResolvedItem() {
    const params = useParams();
    const loc = useLocation();
    const stateItem = () => (loc.state as { item?: Item } | null)?.item;
    const [fetched] = createResource(
      () => (stateItem() ? null : params.ratingKey),
      (rk) => getDetails(rk)
    );
    return () => stateItem() ?? fetched();
  }

  function HomeRoute() {
    const navigate = useNavigate();
    const onPlay = (item: Item) => navigate(itemPath(item), { state: { item } });
    return (
      <Show when={home()} keyed>
        {(data) => {
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
                {(h) => <Hero item={h()} onPlay={onPlay} />}
              </Show>
              <div class="rows">
                <Show when={cwShows} keyed>
                  {(hub) => <Row hub={hub} onPlay={onPlay} />}
                </Show>
                <Show when={cwMovies} keyed>
                  {(hub) => <Row hub={hub} onPlay={onPlay} />}
                </Show>
                <Show when={sections().find((s) => s.type === "show") || sections().find((s) => s.type === "movie")}>
                  <div class="library-shortcuts">
                    <Show when={sections().find((s) => s.type === "show")} keyed>
                      {(sec) => (
                        <A class="library-shortcut-btn" href={gridPath(sec)}>
                          Go To Full TV Show Library →
                        </A>
                      )}
                    </Show>
                    <Show when={sections().find((s) => s.type === "movie")} keyed>
                      {(sec) => (
                        <A class="library-shortcut-btn" href={gridPath(sec)}>
                          Go To Full Movie Library →
                        </A>
                      )}
                    </Show>
                  </div>
                </Show>
                <For each={restHubs}>
                  {(hub) => <Row hub={hub} onPlay={onPlay} />}
                </For>
                <Show when={data.hubs.length === 0}>
                  <p class="empty">Nothing here yet.</p>
                </Show>
              </div>
            </main>
          );
        }}
      </Show>
    );
  }

  function SectionRoute() {
    const params = useParams();
    const navigate = useNavigate();
    const onPlay = (item: Item) => navigate(itemPath(item), { state: { item } });
    const [data] = createResource(
      () => params.key,
      async (key) => {
        const hubs = await getHubs(key);
        return { hubs, hero: pickHero(hubs), sec: sections().find((s) => s.key === key) };
      }
    );
    return (
      <Show when={data()} keyed>
        {(d) => (
          <main>
            <Show when={d.hero}>
              {(h) => <Hero item={h()} onPlay={onPlay} />}
            </Show>
            <div class="rows">
              <Show when={d.sec} keyed>
                {(sec) => (
                  <div class="section-browse-bar">
                    <A class="browse-all-btn" href={gridPath(sec)}>
                      Browse All {sec.title} →
                    </A>
                  </div>
                )}
              </Show>
              <For each={d.hubs}>
                {(hub) => <Row hub={hub} onPlay={onPlay} />}
              </For>
              <Show when={d.hubs.length === 0}>
                <p class="empty">Nothing here yet.</p>
              </Show>
            </div>
          </main>
        )}
      </Show>
    );
  }

  // Standalone full-screen pages (no top bar) ─────────────────────────────────

  function GridRoute() {
    const params = useParams();
    const navigate = useNavigate();
    const sec = () => sections().find((s) => s.key === params.key);
    return (
      <Show when={sec()} keyed fallback={<div class="loading">Loading…</div>}>
        {(s) => (
          <LibraryGrid
            sectionKey={s.key}
            title={s.title}
            sectionType={s.type}
            onClose={() => navigate(-1)}
            onItemClick={(item) => navigate(itemPath(item), { state: { item } })}
          />
        )}
      </Show>
    );
  }

  function InfoRoute() {
    const navigate = useNavigate();
    const item = useResolvedItem();
    return (
      <Show when={item()} keyed fallback={<div class="loading">Loading…</div>}>
        {(it) => (
          <InfoView
            item={it}
            onClose={() => navigate(-1)}
            onPlay={(x) => navigate(watchPath(x), { state: { item: x } })}
            onBrowseChildren={(x) => navigate(browsePath(x), { state: { item: x } })}
          />
        )}
      </Show>
    );
  }

  function BrowseRoute() {
    const navigate = useNavigate();
    const item = useResolvedItem();
    return (
      <Show when={item()} keyed fallback={<div class="loading">Loading…</div>}>
        {(it) => (
          <DetailView
            item={it}
            onClose={() => navigate(-1)}
            onItemClick={(x) => navigate(itemPath(x), { state: { item: x } })}
          />
        )}
      </Show>
    );
  }

  function WatchRoute() {
    const navigate = useNavigate();
    const item = useResolvedItem();
    return (
      <Show when={item()} keyed fallback={<div class="loading">Loading…</div>}>
        {(it) => (
          <Player
            item={it}
            onClose={() => { navigate(-1); refetchHome(); }}
          />
        )}
      </Show>
    );
  }

  function DiscoverRoute() {
    const navigate = useNavigate();
    return <DiscoverView onClose={() => navigate(-1)} />;
  }

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
      <Router>
        <Route path="/" component={Shell}>
          <Route path="/" component={HomeRoute} />
          <Route path="/library/:key/:slug?" component={SectionRoute} />
        </Route>
        <Route path="/all/:key/:slug?" component={GridRoute} />
        <Route path="/info/:ratingKey/:slug?" component={InfoRoute} />
        <Route path="/browse/:ratingKey/:slug?" component={BrowseRoute} />
        <Route path="/watch/:ratingKey/:slug?" component={WatchRoute} />
        <Route path="/discover" component={DiscoverRoute} />
      </Router>
    </Show>
  );
}
