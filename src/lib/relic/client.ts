import type { ArenaSocketMessage } from "./types";

type RelicImportMeta = ImportMeta & {
  env?: Record<string, string | undefined>;
};

type RelicGlobal = typeof globalThis & {
  __RELIC_CONFIG__?: {
    apiUrl?: string;
    wsUrl?: string;
  };
};

const env = (import.meta as RelicImportMeta).env ?? {};

function getRuntimeConfig() {
  return (globalThis as RelicGlobal).__RELIC_CONFIG__ ?? {};
}

function getApiBase() {
  return (env.VITE_RELIC_API_URL ?? getRuntimeConfig().apiUrl ?? "/api").replace(/\/$/, "");
}

function getWsBase() {
  return env.VITE_RELIC_WS_URL ?? getRuntimeConfig().wsUrl;
}

export function relicApiUrl(path: string) {
  const apiBase = getApiBase();
  return `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

export function relicWebSocketUrl() {
  const apiBase = getApiBase();
  const wsBase = getWsBase();
  if (wsBase) return wsBase;
  if (apiBase === "/api") return null;

  const url = new URL(apiBase);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/arena";
  url.search = "";
  return url.toString();
}

export function parseArenaSocketMessage(value: string): ArenaSocketMessage | null {
  try {
    return JSON.parse(value) as ArenaSocketMessage;
  } catch {
    return null;
  }
}
