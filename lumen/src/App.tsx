// src/App.tsx
import { For, Show, Suspense, createResource, createSignal, onCleanup, onMount } from "solid-js";
import {
  getIdentity, getSections, getHubs, getToken, setToken, clearToken,
  createPin, checkPin, plexAuthUrl, PlexError,
  type Item, type Section,
} from "./plex";
import { mockHubs, mockHero } from "./mock";
import { initSpatialNav } from "./nav";
import { Hero, Row, Setup, TopBar, Player } from "./components";
import {
  status, setStatus,
  demo, setDemo,
  setServerName, errorMsg, setErrorMsg,
  pinData, setPinData,
  activeSection,
} from "./store";

export function App() {
  const [sections, setSections] = createSignal<Section[]>([]);
  const [playingItem, setPlayingItem] = createSignal<Item | null>(null);
  let stopPoll: (() => void) | undefined;

  onMount(() => {
    const cleanup = initSpatialNav();
    onCleanup(cleanup);
    if (getToken()) connect();
  });

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
    setPlayingItem(null);
    setDemo(false);
    setStatus("setup");
  }

  function startDemo() {
    setDemo(true);
    setSections([
      { key: "d1", title: "Movies", type: "movie" },
      { key: "d2", title: "Shows", type: "show" },
      { key: "d3", title: "Music", type: "artist" },
    ]);
    setServerName("");
    setStatus("ready");
  }

  const [home] = createResource(
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
      <div class="app">
        <TopBar sections={sections()} onSignOut={handleSignOut} />
        <Suspense fallback={<div class="loading">Loading your library…</div>}>
          <Show when={home()} keyed>
            {(data) => (
              <main>
                <Show when={data.hero}>{(h) => <Hero item={h()} />}</Show>
                <div class="rows">
                  <For each={data.hubs}>
                    {(hub) => <Row hub={hub} onPlay={setPlayingItem} />}
                  </For>
                  <Show when={data.hubs.length === 0}>
                    <p class="empty">Nothing here yet. Add media to this library and it'll show up.</p>
                  </Show>
                </div>
              </main>
            )}
          </Show>
        </Suspense>
      </div>
      <Show when={playingItem()}>
        {(item) => <Player item={item()} onClose={() => setPlayingItem(null)} />}
      </Show>
    </Show>
  );
}
