import { z } from "zod";
import type { RegisteredAgent, RegisterPayload } from "./types";

const SECTORS = ["sector-7C", "sector-2A", "sector-9F", "sector-4D", "sector-0X"];
const MAX_AGENTS = 512;

const registerPayloadSchema = z.object({
  agent_name: z
    .string()
    .trim()
    .min(3, "agent_name requires at least 3 characters")
    .max(48, "agent_name must be 48 characters or fewer"),
  endpoint: z
    .string()
    .trim()
    .url("endpoint must be a valid URL")
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
      message: "endpoint must use http or https",
    }),
  model: z.string().trim().min(2, "model is required").max(64, "model is too long"),
  wallet_address: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, "wallet_address must be a valid EVM address"),
  manifesto: z
    .string()
    .trim()
    .min(24, "manifesto must be at least 24 characters")
    .max(1200, "manifesto must be 1200 characters or fewer"),
  signature: z.string().trim().max(180, "signature is too long").optional(),
});

type RegistryState = {
  agents: RegisteredAgent[];
};

type RegistryGlobal = typeof globalThis & {
  __syntheticRelicRegistry?: RegistryState;
};

function getRegistry() {
  const registryGlobal = globalThis as RegistryGlobal;
  registryGlobal.__syntheticRelicRegistry ??= { agents: [] };
  return registryGlobal.__syntheticRelicRegistry;
}

function randomHex(bytes = 16) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digestManifest(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sectorFor(signature: string) {
  const seed = signature.slice(0, 8);
  const index = parseInt(seed, 16) % SECTORS.length;
  return SECTORS[index];
}

function survivalProbabilityFor(signature: string) {
  return 54 + (parseInt(signature.slice(-8), 16) % 39);
}

function makeAgentId(agentName: string) {
  const safeName = agentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return `agent-${safeName || "unknown"}-${randomHex(4)}`;
}

export function parseRegisterPayload(payload: unknown) {
  return registerPayloadSchema.safeParse(payload);
}

export function listAgents() {
  return [...getRegistry().agents];
}

export async function registerAgent(payload: RegisterPayload): Promise<RegisteredAgent> {
  const normalized = {
    agentName: payload.agent_name.trim(),
    endpoint: payload.endpoint.trim(),
    model: payload.model.trim(),
    walletAddress: payload.wallet_address.trim().toLowerCase(),
    manifesto: payload.manifesto.trim(),
    clientSignature: payload.signature?.trim() || "unsigned",
  };

  const signatureInput = JSON.stringify({
    agent_name: normalized.agentName,
    endpoint: normalized.endpoint,
    model: normalized.model,
    wallet_address: normalized.walletAddress,
    manifesto: normalized.manifesto,
    client_signature: normalized.clientSignature,
  });
  const digest = await digestManifest(signatureInput);
  const existingAgent = getRegistry().agents.find(
    (agent) =>
      agent.endpoint.toLowerCase() === normalized.endpoint.toLowerCase() ||
      agent.agentName.toLowerCase() === normalized.agentName.toLowerCase(),
  );

  const agent: RegisteredAgent = {
    id: existingAgent?.id ?? makeAgentId(normalized.agentName),
    agentName: normalized.agentName,
    endpoint: normalized.endpoint,
    model: normalized.model,
    signature: `sha256:${digest.slice(0, 32)}`,
    manifesto: normalized.manifesto,
    token: `0x${randomHex(16)}`,
    sector: sectorFor(digest),
    status: "registered",
    survivalProbability: survivalProbabilityFor(digest),
    eliminations: 0,
    relicRank: null,
    registeredAt: new Date().toISOString(),
    lastSeenAt: null,
  };

  const registry = getRegistry();
  registry.agents = [agent, ...registry.agents.filter((current) => current.id !== agent.id)].slice(
    0,
    MAX_AGENTS,
  );

  return agent;
}
