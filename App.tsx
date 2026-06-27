// src/App.tsx
import { For, Show, Suspense, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { getIdentity, getSections, getHubs, getToken, setToken, type Item, type Section } from "./plex";
import { mockHubs, mockHero } from "./mock";
import { initSpatialNav } from "./nav";
import { Hero, Row, Setup, TopBar } from "./components";
import {
  status, setStatus,
  demo, setDemo,
  setServerName, errorMsg, setErrorMsg,
  activeSection,
} from "./store";

export function App() {
  const [sections, setSections] = createSignal<Section[]>([]);

  onMount(() => {
    const cleanup = initSpatialNav();
    onCleanup(cleanup);
    if (getToken()) connect();
  });

  async function connect() {
    setStatus("connecting");
    setErrorMsg("");
    try {
      const [, secs] = await Promise.all([getIdentity(), getSections()]);
      setSections(secs);
      setServerName("Plex");
      setDemo(false);
      setStatus("ready");
    } catch {
      setErrorMsg("Couldn't reach your server. Check the address and token, then try again.");
      setStatus("error");
    }
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
          onDemo={startDemo}
          error={status() === "error" ? errorMsg() : undefined}
          busy={status() === "connecting"}
        />
      }
    >
      <div class="app">
        <TopBar sections={sections()} />
        <Suspense fallback={<div class="loading">Loading your library…</div>}>
          <Show when={home()} keyed>
            {(data) => (
              <main>
                <Show when={data.hero}>{(h) => <Hero item={h()} />}</Show>
                <div class="rows">
                  <For each={data.hubs}>{(hub) => <Row hub={hub} />}</For>
                  <Show when={data.hubs.length === 0}>
                    <p class="empty">Nothing here yet. Add media to this library and it’ll show up.</p>
                  </Show>
                </div>
              </main>
            )}
          </Show>
        </Suspense>
      </div>
    </Show>
  );
}
