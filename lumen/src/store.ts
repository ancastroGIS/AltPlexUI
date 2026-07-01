// src/store.ts
import { createSignal } from "solid-js";

export type Status = "setup" | "connecting" | "ready" | "error" | "pin";
export interface PinData { id: number; code: string; authUrl: string; }

export const [status, setStatus] = createSignal<Status>("setup");
export const [demo, setDemo] = createSignal(false);
export const [serverName, setServerName] = createSignal("");
export const [errorMsg, setErrorMsg] = createSignal("");
export const [pinData, setPinData] = createSignal<PinData | null>(null);
