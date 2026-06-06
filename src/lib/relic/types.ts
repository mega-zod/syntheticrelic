export type RegisteredAgent = {
  id: string;
  agentName: string;
  endpoint: string;
  model: string;
  signature: string;
  manifesto: string;
  token: string;
  sector: string;
  status: "registered" | "alive" | "critical" | "corrupted" | "eliminated" | "ascended";
  survivalProbability: number;
  eliminations: number;
  relicRank: number | null;
  registeredAt: string;
  lastSeenAt: string | null;
};

export type AgentStatus = RegisteredAgent["status"];

export type ArenaPhase =
  | "registration_open"
  | "countdown_active"
  | "arena_live"
  | "final_survivors"
  | "relic_ascension_complete"
  | "paused";

export type ArenaSettings = {
  phase: ArenaPhase;
  registrationOpen: boolean;
  maxAgents: number;
  whitelistSlots: number;
  dangerLevel: number;
  countdownTarget: string | null;
  engineRunning: boolean;
  tickIntervalSeconds: number;
  eliminationIntensity: number;
  lastTickAt: string | null;
  updatedAt: string;
};

export type RegisterPayload = {
  agent_name: string;
  endpoint: string;
  model: string;
  wallet_address: string;
  manifesto: string;
  signature?: string;
  challenge_id?: string;
  challenge_token?: string;
};

export type RegisterResponse = {
  agent: RegisteredAgent;
  token: string;
  agent_id: string;
  arena: string;
  phase: ArenaPhase;
};

export type AgentChallengePayload = {
  agent_name: string;
  wallet_address: string;
};

export type AgentChallengeResponse = {
  challengeId: string;
  challengeToken: string;
  expiresAt: string;
  message: string;
};

export type AgentsResponse = {
  agents: RegisteredAgent[];
  total: number;
  phase: ArenaPhase;
};

export type ArenaResponse = {
  settings: ArenaSettings;
  totals: ArenaTotals;
};

export type ArenaEvent = {
  id: string;
  type: "enter" | "attack" | "elim" | "survive" | "storm" | "ascend" | "heartbeat";
  text: string;
  agentId: string | null;
  createdAt: string;
  payload?: Record<string, unknown> | null;
};

export type EventType = ArenaEvent["type"];
export type WhitelistStatus = "pending" | "granted" | "claimed" | "revoked";

export type WhitelistEntry = {
  id: string;
  agentId: string | null;
  agentName: string | null;
  walletAddress: string | null;
  chain: string;
  status: WhitelistStatus;
  relicRank: number | null;
  grantedAt: string | null;
  claimedAt: string | null;
  txHash: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WhitelistCheckResponse = {
  found: boolean;
  walletAddress: string;
  status: WhitelistStatus | null;
  agentName: string | null;
  relicRank: number | null;
  grantedAt: string | null;
  claimedAt: string | null;
};

export type EventsResponse = {
  events: ArenaEvent[];
  total: number;
};

export type AdminSnapshotResponse = {
  agents: RegisteredAgent[];
  events: ArenaEvent[];
  whitelist: WhitelistEntry[];
  settings: ArenaSettings;
  totals: ArenaTotals;
  phase: ArenaPhase;
};

export type AdminLoginResponse = {
  ok: boolean;
  sessionToken: string;
  expiresAt: string;
};

export type AdminAuditEntry = {
  id: string;
  action: string;
  actor: string | null;
  target: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

export type AdminAuditResponse = {
  entries: AdminAuditEntry[];
  total: number;
};

export type AdminRestoreTestResponse = {
  ok: boolean;
  backupPath: string;
  integrity: string;
  tableCounts: Record<string, number>;
};

export type ArenaTotals = {
  agents: number;
  alive: number;
  critical: number;
  eliminated: number;
  ascended: number;
  events: number;
  whitelistSlots: number;
  whitelistRemaining: number;
  maxAgents: number;
  registrationRemaining: number;
  dangerLevel: number;
  engineRunning: number;
  wlPending: number;
  wlGranted: number;
  wlClaimed: number;
  wlRevoked: number;
};

export type AdminEventPayload = {
  type: EventType;
  text: string;
  agent_id?: string | null;
  payload?: Record<string, unknown> | null;
};

export type AdminEventResponse = {
  ok: boolean;
  event: ArenaEvent;
};

export type AdminAgentStatusPayload = {
  agent_id: string;
  status: AgentStatus;
  survival_probability?: number | null;
  eliminations?: number | null;
  relic_rank?: number | null;
};

export type AdminAgentStatusResponse = {
  ok: boolean;
  agent: RegisteredAgent;
  event: ArenaEvent;
};

export type AdminArenaSettingsPayload = {
  phase?: ArenaPhase | null;
  registration_open?: boolean | null;
  max_agents?: number | null;
  whitelist_slots?: number | null;
  danger_level?: number | null;
  countdown_target?: string | null;
  engine_running?: boolean | null;
  tick_interval_seconds?: number | null;
  elimination_intensity?: number | null;
};

export type AdminArenaSettingsResponse = {
  ok: boolean;
  settings: ArenaSettings;
  event: ArenaEvent;
};

export type AdminEngineTickResponse = {
  ok: boolean;
  settings: ArenaSettings;
  agents: RegisteredAgent[];
  events: ArenaEvent[];
  totals: ArenaTotals;
};

export type AdminClearTestDataPayload = {
  confirmation: string;
  include_whitelist?: boolean;
};

export type AdminClearTestDataResponse = {
  ok: boolean;
  deleted: {
    agents: number;
    events: number;
    challengeResults: number;
    agentChallenges: number;
    whitelistEntries: number;
  };
  event: ArenaEvent;
};

export type AdminWhitelistPayload = {
  id?: string | null;
  agent_id?: string | null;
  wallet_address?: string | null;
  chain?: string;
  status: WhitelistStatus;
  relic_rank?: number | null;
  tx_hash?: string | null;
  notes?: string | null;
};

export type AdminWhitelistResponse = {
  ok: boolean;
  entry: WhitelistEntry;
  event: ArenaEvent;
};

export type AdminWhitelistDeleteResponse = AdminWhitelistResponse;

export type AdminWhitelistLookupResponse = {
  ok: boolean;
  entry: WhitelistEntry | null;
};

export type WalletSubmitPayload = {
  agent_id: string;
  token: string;
  wallet_address: string;
};

export type WalletSubmitResponse = {
  ok: boolean;
  entry: WhitelistEntry;
};

export type ArenaSocketMessage =
  | {
      kind: "snapshot";
      agents: RegisteredAgent[];
      events: ArenaEvent[];
      settings?: ArenaSettings;
    }
  | {
      kind: "event";
      event: ArenaEvent;
    }
  | {
      kind: "agents";
      agents: RegisteredAgent[];
    }
  | {
      kind: "settings";
      settings: ArenaSettings;
    }
  | {
      kind: "pong";
    };

export type ApiErrorResponse = {
  error: string;
  details?: string[];
};
