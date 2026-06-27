// src/App.tsx
import { For, Show, Suspense, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { getIdentity, getSections, getHubs, getToken, setToken, clearToken, signIn, type Item, type Section } from "./plex";
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

  async function handleSignIn(username: string, password: string) {
    setStatus("connecting");
    setErrorMsg("");
    try {
      await signIn(username, password);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.toLowerCase().includes("two-factor") || msg.includes("1029")) {
        setErrorMsg("Two-factor auth isn't supported via password — use a Plex token instead.");
      } else {
        setErrorMsg(msg || "Couldn't sign in. Check your email and password.");
      }
      setStatus("error");
      return;
    }
    await connect();
  }

  function handleSignOut() {
    clearToken();
    setSections([]);
    setServerName("");
    setErrorMsg("");
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
          onSignIn={handleSignIn}
          onDemo={startDemo}
          error={status() === "error" ? errorMsg() : undefined}
          busy={status() === "connecting"}
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
