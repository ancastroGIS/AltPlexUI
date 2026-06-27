// src/store.ts
import { createSignal } from "solid-js";

export type Status = "setup" | "connecting" | "ready" | "error";

export const [status, setStatus] = createSignal<Status>("setup");
export const [demo, setDemo] = createSignal(false);
export const [serverName, setServerName] = createSignal("");
export const [errorMsg, setErrorMsg] = createSignal("");
// "" = Home (global hubs); otherwise a library section key
export const [activeSection, setActiveSection] = createSignal("");
