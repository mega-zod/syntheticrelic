from pydantic import BaseModel, Field, HttpUrl
from typing import Literal


Phase = Literal[
    "registration_open",
    "countdown_active",
    "arena_live",
    "final_survivors",
    "relic_ascension_complete",
    "paused",
]
AgentStatus = Literal["registered", "alive", "critical", "corrupted", "eliminated", "ascended"]
EventType = Literal["enter", "attack", "elim", "survive", "storm", "ascend", "heartbeat"]
WhitelistStatus = Literal["pending", "granted", "claimed", "revoked"]


class ArenaSettings(BaseModel):
    phase: Phase
    registrationOpen: bool
    maxAgents: int
    whitelistSlots: int
    dangerLevel: int
    countdownTarget: str | None = None
    engineRunning: bool
    tickIntervalSeconds: int
    eliminationIntensity: int
    lastTickAt: str | None = None
    updatedAt: str


class RegisterPayload(BaseModel):
    agent_name: str = Field(min_length=3, max_length=48)
    endpoint: HttpUrl
    model: str = Field(min_length=2, max_length=64)
    wallet_address: str = Field(max_length=80)
    manifesto: str = Field(min_length=24, max_length=1200)
    signature: str | None = Field(default=None, max_length=180)
    challenge_id: str | None = Field(default=None, max_length=96)
    challenge_token: str | None = Field(default=None, max_length=180)


class AgentChallengePayload(BaseModel):
    agent_name: str = Field(min_length=3, max_length=48)
    wallet_address: str = Field(max_length=80)


class AgentChallengeResponse(BaseModel):
    challengeId: str
    challengeToken: str
    expiresAt: str
    message: str


class Agent(BaseModel):
    id: str
    agentName: str
    endpoint: str
    model: str
    signature: str
    manifesto: str
    token: str
    sector: str
    status: AgentStatus
    survivalProbability: int
    eliminations: int
    relicRank: int | None = None
    registeredAt: str
    lastSeenAt: str | None = None


class RegisterResponse(BaseModel):
    agent: Agent
    token: str
    agent_id: str
    arena: str
    phase: Phase


class AgentsResponse(BaseModel):
    agents: list[Agent]
    total: int
    phase: Phase


class ArenaResponse(BaseModel):
    settings: ArenaSettings
    totals: dict[str, int]


class HeartbeatPayload(BaseModel):
    agent_id: str
    token: str | None = None
    status: AgentStatus = "alive"


class HeartbeatResponse(BaseModel):
    ok: bool
    agent: Agent


class ArenaEvent(BaseModel):
    id: str
    type: EventType
    text: str
    agentId: str | None = None
    createdAt: str
    payload: dict | None = None


class WhitelistEntry(BaseModel):
    id: str
    agentId: str | None = None
    agentName: str | None = None
    walletAddress: str | None = None
    chain: str = "evm"
    status: WhitelistStatus
    relicRank: int | None = None
    grantedAt: str | None = None
    claimedAt: str | None = None
    txHash: str | None = None
    notes: str | None = None
    createdAt: str
    updatedAt: str


class WhitelistCheckResponse(BaseModel):
    found: bool
    walletAddress: str
    status: WhitelistStatus | None = None
    agentName: str | None = None
    relicRank: int | None = None
    grantedAt: str | None = None
    claimedAt: str | None = None


class EventsResponse(BaseModel):
    events: list[ArenaEvent]
    total: int


class ChallengeResultPayload(BaseModel):
    agent_id: str
    token: str | None = None
    challenge_id: str = Field(min_length=3, max_length=80)
    score: float = Field(ge=0, le=100)
    latency_ms: int = Field(ge=0)
    outcome: str = Field(min_length=2, max_length=80)
    payload: dict | None = None


class ChallengeResultResponse(BaseModel):
    ok: bool
    event: ArenaEvent


class AdminSnapshotResponse(BaseModel):
    agents: list[Agent]
    events: list[ArenaEvent]
    whitelist: list[WhitelistEntry]
    settings: ArenaSettings
    totals: dict[str, int]
    phase: Phase


class AdminLoginPayload(BaseModel):
    token: str = Field(min_length=12, max_length=512)


class AdminLoginResponse(BaseModel):
    ok: bool
    sessionToken: str
    expiresAt: str


class AdminAuditEntry(BaseModel):
    id: str
    action: str
    actor: str | None = None
    target: str | None = None
    detail: dict | None = None
    createdAt: str


class AdminAuditResponse(BaseModel):
    entries: list[AdminAuditEntry]
    total: int


class AdminRestoreTestResponse(BaseModel):
    ok: bool
    backupPath: str
    integrity: str
    tableCounts: dict[str, int]


class AdminEventPayload(BaseModel):
    type: EventType = "storm"
    text: str = Field(min_length=3, max_length=240)
    agent_id: str | None = None
    payload: dict | None = None


class AdminEventResponse(BaseModel):
    ok: bool
    event: ArenaEvent


class AdminAgentStatusPayload(BaseModel):
    agent_id: str
    status: AgentStatus
    survival_probability: int | None = Field(default=None, ge=0, le=100)
    eliminations: int | None = Field(default=None, ge=0)
    relic_rank: int | None = Field(default=None, ge=1)


class AdminAgentStatusResponse(BaseModel):
    ok: bool
    agent: Agent
    event: ArenaEvent


class AdminArenaSettingsPayload(BaseModel):
    phase: Phase | None = None
    registration_open: bool | None = None
    max_agents: int | None = Field(default=None, ge=1, le=100000)
    whitelist_slots: int | None = Field(default=None, ge=1, le=100000)
    danger_level: int | None = Field(default=None, ge=0, le=100)
    countdown_target: str | None = Field(default=None, max_length=80)
    engine_running: bool | None = None
    tick_interval_seconds: int | None = Field(default=None, ge=2, le=3600)
    elimination_intensity: int | None = Field(default=None, ge=1, le=10)


class AdminArenaSettingsResponse(BaseModel):
    ok: bool
    settings: ArenaSettings
    event: ArenaEvent


class AdminEngineTickResponse(BaseModel):
    ok: bool
    settings: ArenaSettings
    agents: list[Agent]
    events: list[ArenaEvent]
    totals: dict[str, int]


class AdminClearTestDataPayload(BaseModel):
    confirmation: str = Field(max_length=80)
    include_whitelist: bool = False


class AdminClearTestDataResponse(BaseModel):
    ok: bool
    deleted: dict[str, int]
    event: ArenaEvent


class AdminWhitelistPayload(BaseModel):
    id: str | None = None
    agent_id: str | None = None
    wallet_address: str | None = Field(default=None, max_length=80)
    chain: str = Field(default="evm", max_length=24)
    status: WhitelistStatus = "pending"
    relic_rank: int | None = Field(default=None, ge=1)
    tx_hash: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=500)


class AdminWhitelistResponse(BaseModel):
    ok: bool
    entry: WhitelistEntry
    event: ArenaEvent


class AdminWhitelistDeleteResponse(BaseModel):
    ok: bool
    entry: WhitelistEntry
    event: ArenaEvent


class AdminWhitelistLookupResponse(BaseModel):
    ok: bool
    entry: WhitelistEntry | None = None


class AdminWhitelistListResponse(BaseModel):
    entries: list[WhitelistEntry]
    total: int


class WalletSubmitPayload(BaseModel):
    agent_id: str
    token: str
    wallet_address: str = Field(max_length=80)


class WalletSubmitResponse(BaseModel):
    ok: bool
    entry: WhitelistEntry
