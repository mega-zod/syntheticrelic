"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Copy,
  Crown,
  Database,
  Download,
  Eraser,
  FileDown,
  KeyRound,
  Lock,
  Pause,
  Play,
  RadioTower,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Skull,
  Terminal,
  Trash2,
  Upload,
  Wallet,
  Zap,
} from "lucide-react";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { relicApiUrl } from "../../../../src/lib/relic/client";
import type {
  AdminAgentStatusPayload,
  AdminArenaSettingsPayload,
  AdminArenaSettingsResponse,
  AdminAuditEntry,
  AdminAuditResponse,
  AdminClearTestDataPayload,
  AdminClearTestDataResponse,
  AdminEngineTickResponse,
  AdminEventPayload,
  AdminWhitelistDeleteResponse,
  AdminWhitelistLookupResponse,
  AdminWhitelistPayload,
  AdminWhitelistResponse,
  AdminLoginResponse,
  AdminRestoreTestResponse,
  AdminSnapshotResponse,
  ArenaPhase,
  ArenaSettings,
  AgentStatus,
  ArenaEvent,
  EventType,
  RegisteredAgent,
  WhitelistEntry,
  WhitelistStatus,
} from "../../../../src/lib/relic/types";

const STATUSES: AgentStatus[] = [
  "registered",
  "alive",
  "critical",
  "corrupted",
  "eliminated",
  "ascended",
];

const EVENT_TYPES: EventType[] = [
  "storm",
  "attack",
  "survive",
  "elim",
  "ascend",
  "enter",
  "heartbeat",
];

const WHITELIST_STATUSES: WhitelistStatus[] = ["pending", "granted", "claimed", "revoked"];
const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

const PHASES: { label: string; value: ArenaPhase }[] = [
  { label: "Registration Open", value: "registration_open" },
  { label: "Countdown Active", value: "countdown_active" },
  { label: "Arena Live", value: "arena_live" },
  { label: "Final Survivors", value: "final_survivors" },
  { label: "Ascension Complete", value: "relic_ascension_complete" },
  { label: "Paused", value: "paused" },
];

const DEFAULT_SETTINGS: ArenaSettings = {
  phase: "registration_open",
  registrationOpen: true,
  maxAgents: 247,
  whitelistSlots: 32,
  dangerLevel: 78,
  countdownTarget: "2026-06-01T21:00:00-07:00",
  engineRunning: false,
  tickIntervalSeconds: 12,
  eliminationIntensity: 1,
  lastTickAt: null,
  updatedAt: "",
};

const STATUS_CLASS: Record<AgentStatus, string> = {
  registered: "border-accent/45 bg-accent/10 text-accent",
  alive: "border-primary/45 bg-primary/10 text-primary",
  critical: "border-accent/45 bg-accent/10 text-accent",
  corrupted: "border-secondary/45 bg-secondary/10 text-secondary",
  eliminated: "border-destructive/45 bg-destructive/10 text-destructive line-through",
  ascended: "border-accent/70 bg-accent/15 text-accent",
};

const WHITELIST_CLASS: Record<WhitelistStatus, string> = {
  pending: "border-accent/45 bg-accent/10 text-accent",
  granted: "border-primary/45 bg-primary/10 text-primary",
  claimed: "border-secondary/45 bg-secondary/10 text-secondary",
  revoked: "border-destructive/45 bg-destructive/10 text-destructive line-through",
};

function authHeaders(adminSession: string): Record<string, string> {
  return adminSession.trim() ? { "x-admin-session": adminSession.trim() } : {};
}

function ControlButton({
  children,
  disabled,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      className="inline-flex h-10 items-center justify-center gap-2 border border-accent/40 bg-accent px-4 font-display text-[11px] uppercase tracking-[0.28em] text-accent-foreground transition-transform hover:scale-[1.01] disabled:cursor-wait disabled:opacity-55"
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

function StatBlock({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="chamber rounded-sm px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-primary/80">{icon}</span>
        <span className="font-display text-2xl tabular-nums text-foreground">{value}</span>
      </div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function toDatetimeLocal(value: string | null) {
  if (!value) return "";
  return value.slice(0, 16);
}

function fromDatetimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function settingsToForm(settings: ArenaSettings) {
  return {
    phase: settings.phase,
    registrationOpen: settings.registrationOpen,
    maxAgents: String(settings.maxAgents),
    whitelistSlots: String(settings.whitelistSlots),
    dangerLevel: String(settings.dangerLevel),
    countdownTarget: toDatetimeLocal(settings.countdownTarget),
    engineRunning: settings.engineRunning,
    tickIntervalSeconds: String(settings.tickIntervalSeconds),
    eliminationIntensity: String(settings.eliminationIntensity),
  };
}

function maskWallet(wallet: string | null) {
  if (!wallet) return "wallet pending";
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function parseWalletBatch(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map((wallet) => wallet.trim())
        .filter(Boolean),
    ),
  );
}

function collectWalletsFromJson(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectWalletsFromJson);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const directWallet =
      record.wallet_address ?? record.walletAddress ?? record.wallet ?? record.address;
    if (typeof directWallet === "string") return [directWallet];

    return collectWalletsFromJson(record.wallets ?? record.addresses ?? record.entries ?? []);
  }
  return [];
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminPage() {
  const [adminToken, setAdminToken] = useState("");
  const [adminSession, setAdminSession] = useState("");
  const [adminSessionExpiresAt, setAdminSessionExpiresAt] = useState("");
  const [agents, setAgents] = useState<RegisteredAgent[]>([]);
  const [events, setEvents] = useState<ArenaEvent[]>([]);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([]);
  const [totals, setTotals] = useState<AdminSnapshotResponse["totals"]>({
    agents: 0,
    alive: 0,
    critical: 0,
    eliminated: 0,
    ascended: 0,
    events: 0,
    whitelistSlots: DEFAULT_SETTINGS.whitelistSlots,
    whitelistRemaining: DEFAULT_SETTINGS.whitelistSlots,
    maxAgents: DEFAULT_SETTINGS.maxAgents,
    registrationRemaining: DEFAULT_SETTINGS.maxAgents,
    dangerLevel: DEFAULT_SETTINGS.dangerLevel,
    engineRunning: 0,
    wlPending: 0,
    wlGranted: 0,
    wlClaimed: 0,
    wlRevoked: 0,
  });
  const [settings, setSettings] = useState<ArenaSettings>(DEFAULT_SETTINGS);
  const [settingsForm, setSettingsForm] = useState(settingsToForm(DEFAULT_SETTINGS));
  const [settingsDirty, setSettingsDirty] = useState(false);
  const settingsDirtyRef = useRef(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<AgentStatus>("critical");
  const [walletForm, setWalletForm] = useState({
    id: "",
    agentId: "",
    walletAddress: "",
    status: "pending" as WhitelistStatus,
    txHash: "",
    notes: "",
  });
  const [walletSearch, setWalletSearch] = useState("");
  const [walletSearchResult, setWalletSearchResult] = useState<WhitelistEntry | null>(null);
  const [eventType, setEventType] = useState<EventType>("storm");
  const [eventText, setEventText] = useState("[WARN] Storm protocol manually initiated");
  const [message, setMessage] = useState("admin link idle");
  const [isBusy, setIsBusy] = useState(false);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0],
    [agents, selectedAgentId],
  );
  const walletSearchQuery = walletSearch.trim().toLowerCase();
  const visibleWhitelist = useMemo(() => {
    if (!walletSearchQuery) return whitelist.slice(0, 80);

    return whitelist
      .filter((entry) =>
        [entry.walletAddress, entry.agentName, entry.agentId, entry.status, entry.notes].some(
          (value) => value?.toLowerCase().includes(walletSearchQuery),
        ),
      )
      .slice(0, 80);
  }, [walletSearchQuery, whitelist]);

  function markSettingsDirty() {
    settingsDirtyRef.current = true;
    setSettingsDirty(true);
  }

  function requireDangerConfirm(action: string, phrase: string) {
    const entered = window.prompt(`${action}\n\nType ${phrase} to confirm.`);
    return entered === phrase;
  }

  async function loginAdmin() {
    if (!adminToken.trim()) {
      setMessage("admin token required");
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(relicApiUrl("/admin/session"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: adminToken.trim() }),
      });
      if (!response.ok) throw new Error(`login rejected :: ${response.status}`);
      const session = (await response.json()) as AdminLoginResponse;
      setAdminSession(session.sessionToken);
      setAdminSessionExpiresAt(session.expiresAt);
      setAdminToken("");
      setMessage("admin session established");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "login failed");
    } finally {
      setIsBusy(false);
    }
  }

  const loadSnapshot = useCallback(
    async (showBusy = true) => {
      if (showBusy) setIsBusy(true);
      try {
        const response = await fetch(relicApiUrl("/admin/snapshot"), {
          headers: authHeaders(adminSession),
        });
        if (!response.ok) {
          throw new Error(`snapshot rejected :: ${response.status}`);
        }
        const snapshot = (await response.json()) as AdminSnapshotResponse;
        setAgents(snapshot.agents);
        setEvents(snapshot.events);
        setWhitelist(snapshot.whitelist);
        setSettings(snapshot.settings);
        if (!settingsDirtyRef.current) {
          setSettingsForm(settingsToForm(snapshot.settings));
        }
        setTotals(snapshot.totals);
        setSelectedAgentId((current) => current || snapshot.agents[0]?.id || "");
        const auditResponse = await fetch(relicApiUrl("/admin/audit?limit=30"), {
          headers: authHeaders(adminSession),
        });
        if (auditResponse.ok) {
          const audit = (await auditResponse.json()) as AdminAuditResponse;
          setAuditEntries(audit.entries);
        }
        if (showBusy) setMessage("snapshot synchronized");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "snapshot failed");
      } finally {
        if (showBusy) setIsBusy(false);
      }
    },
    [adminSession],
  );

  useEffect(() => {
    loadSnapshot();
    const interval = window.setInterval(() => loadSnapshot(false), 8000);
    return () => window.clearInterval(interval);
  }, [loadSnapshot]);

  async function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    try {
      const payload: AdminEventPayload = {
        type: eventType,
        text: eventText,
        agent_id: selectedAgent?.id ?? null,
      };
      const response = await fetch(relicApiUrl("/admin/event"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(adminSession),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`event rejected :: ${response.status}`);
      setMessage("event broadcast");
      await loadSnapshot();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "event failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function submitStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAgent) return;

    setIsBusy(true);
    try {
      const payload: AdminAgentStatusPayload = {
        agent_id: selectedAgent.id,
        status: selectedStatus,
        survival_probability:
          selectedStatus === "eliminated" ? 0 : selectedStatus === "ascended" ? 100 : null,
        relic_rank: selectedStatus === "ascended" ? selectedAgent.relicRank || 1 : null,
      };
      const response = await fetch(relicApiUrl("/admin/agent-status"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(adminSession),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`status rejected :: ${response.status}`);
      setMessage(`${selectedAgent.agentName} updated`);
      await loadSnapshot();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "status failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveSettings({
      phase: settingsForm.phase,
      registration_open: settingsForm.registrationOpen,
      max_agents: Number(settingsForm.maxAgents),
      whitelist_slots: Number(settingsForm.whitelistSlots),
      danger_level: Number(settingsForm.dangerLevel),
      countdown_target: fromDatetimeLocal(settingsForm.countdownTarget),
      engine_running: settingsForm.engineRunning,
      tick_interval_seconds: Number(settingsForm.tickIntervalSeconds),
      elimination_intensity: Number(settingsForm.eliminationIntensity),
    });
  }

  async function saveSettings(payload: AdminArenaSettingsPayload) {
    setIsBusy(true);
    try {
      const response = await fetch(relicApiUrl("/admin/arena-settings"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(adminSession),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`settings rejected :: ${response.status}`);
      const result = (await response.json()) as AdminArenaSettingsResponse;
      settingsDirtyRef.current = false;
      setSettingsDirty(false);
      setSettings(result.settings);
      setSettingsForm(settingsToForm(result.settings));
      setMessage("arena settings committed");
      await loadSnapshot(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "settings failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function commandPhase(
    phase: ArenaPhase,
    registrationOpen: boolean,
    engineRunning: boolean,
  ) {
    if (phase === "arena_live" && !requireDangerConfirm("Start the arena engine?", "START ARENA")) {
      return;
    }
    if (phase === "paused" && !requireDangerConfirm("Stop and pause the arena?", "STOP ARENA")) {
      return;
    }

    setSettingsForm((current) => ({
      ...current,
      phase,
      registrationOpen,
      engineRunning,
    }));
    await saveSettings({
      phase,
      registration_open: registrationOpen,
      engine_running: engineRunning,
    });
  }

  async function forceTick() {
    if (!requireDangerConfirm("Force one engine tick now?", "FORCE TICK")) return;

    setIsBusy(true);
    try {
      const response = await fetch(relicApiUrl("/admin/engine-tick"), {
        method: "POST",
        headers: authHeaders(adminSession),
      });
      if (!response.ok) throw new Error(`tick rejected :: ${response.status}`);
      const tick = (await response.json()) as AdminEngineTickResponse;
      setAgents(tick.agents);
      setSettings(tick.settings);
      setTotals(tick.totals);
      setEvents((current) => [...tick.events, ...current].slice(0, 80));
      setMessage(`engine tick emitted ${tick.events.length} event(s)`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "tick failed");
    } finally {
      setIsBusy(false);
    }
  }

  function selectWhitelistEntry(entry: WhitelistEntry) {
    setWalletForm({
      id: entry.id,
      agentId: entry.agentId ?? "",
      walletAddress: entry.walletAddress ?? "",
      status: entry.status,
      txHash: entry.txHash ?? "",
      notes: entry.notes ?? "",
    });
  }

  async function findWhitelistWallet() {
    const wallets = parseWalletBatch(walletSearch);
    if (wallets.length !== 1) {
      setWalletSearchResult(null);
      setMessage("paste one wallet to search");
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(relicApiUrl(`/admin/whitelist/find/${wallets[0]}`), {
        headers: authHeaders(adminSession),
      });
      if (!response.ok) throw new Error(`wallet lookup rejected :: ${response.status}`);
      const result = (await response.json()) as AdminWhitelistLookupResponse;
      setWalletSearchResult(result.entry);
      if (result.entry) {
        selectWhitelistEntry(result.entry);
        setMessage(`${maskWallet(result.entry.walletAddress)} located`);
      } else {
        setMessage("wallet not found in wl ledger");
      }
    } catch (error) {
      setWalletSearchResult(null);
      setMessage(error instanceof Error ? error.message : "wallet lookup failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function uploadWalletJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const wallets = Array.from(
        new Set(collectWalletsFromJson(parsed).map((wallet) => wallet.trim())),
      ).filter(Boolean);
      if (!wallets.length) throw new Error("json contains no wallets");
      const invalid = wallets.find((wallet) => !EVM_ADDRESS_PATTERN.test(wallet));
      if (invalid) throw new Error(`invalid evm wallet :: ${invalid}`);

      setWalletForm((current) => ({
        ...current,
        id: "",
        agentId: "",
        walletAddress: wallets.join("\n"),
        status: "granted",
      }));
      setMessage(`loaded ${wallets.length} wallet(s) from json`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "json upload failed");
    }
  }

  async function submitWhitelist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    try {
      const agent = agents.find((candidate) => candidate.id === walletForm.agentId);
      const wallets = parseWalletBatch(walletForm.walletAddress);
      if (wallets.length > 1 && (walletForm.id || walletForm.agentId)) {
        throw new Error("batch wallets are manual only");
      }
      const invalid = wallets.find((wallet) => !EVM_ADDRESS_PATTERN.test(wallet));
      if (invalid) throw new Error(`invalid evm wallet :: ${invalid}`);

      const payloads: AdminWhitelistPayload[] =
        wallets.length > 1
          ? wallets.map((wallet) => ({
              id: null,
              agent_id: null,
              wallet_address: wallet,
              chain: "evm",
              status: walletForm.status,
              relic_rank: null,
              tx_hash: walletForm.txHash.trim() || null,
              notes: walletForm.notes.trim() || null,
            }))
          : [
              {
                id: walletForm.id || null,
                agent_id: walletForm.agentId || null,
                wallet_address: walletForm.walletAddress.trim() || null,
                chain: "evm",
                status: walletForm.status,
                relic_rank: agent?.relicRank ?? null,
                tx_hash: walletForm.txHash.trim() || null,
                notes: walletForm.notes.trim() || null,
              },
            ];

      const saved: AdminWhitelistResponse[] = [];
      for (const payload of payloads) {
        const response = await fetch(relicApiUrl("/admin/whitelist"), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...authHeaders(adminSession),
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`wallet rejected :: ${response.status}`);
        saved.push((await response.json()) as AdminWhitelistResponse);
      }

      setMessage(
        saved.length > 1
          ? `added ${saved.length} wallet(s)`
          : `${maskWallet(saved[0]?.entry.walletAddress ?? null)} ${saved[0]?.entry.status ?? "saved"}`,
      );
      setWalletForm({
        id: "",
        agentId: "",
        walletAddress: "",
        status: "pending",
        txHash: "",
        notes: "",
      });
      await loadSnapshot();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "wallet update failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function removeWhitelistEntry(entry: WhitelistEntry) {
    const label = entry.walletAddress || entry.agentName || entry.id;
    if (!requireDangerConfirm(`Remove ${label} from the whitelist ledger?`, "DELETE WALLET")) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(relicApiUrl(`/admin/whitelist/${entry.id}`), {
        method: "DELETE",
        headers: authHeaders(adminSession),
      });
      if (!response.ok) throw new Error(`remove rejected :: ${response.status}`);
      const result = (await response.json()) as AdminWhitelistDeleteResponse;
      setMessage(`${maskWallet(result.entry.walletAddress)} removed`);
      if (walletForm.id === entry.id) {
        setWalletForm({
          id: "",
          agentId: "",
          walletAddress: "",
          status: "pending",
          txHash: "",
          notes: "",
        });
      }
      if (walletSearchResult?.id === entry.id) {
        setWalletSearchResult(null);
      }
      await loadSnapshot();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "wallet remove failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function copyGrantedWallets() {
    const wallets = whitelist
      .filter((entry) => ["granted", "claimed"].includes(entry.status) && entry.walletAddress)
      .map((entry) => entry.walletAddress)
      .join("\n");
    await navigator.clipboard?.writeText(wallets);
    setMessage(`copied ${wallets ? wallets.split("\n").length : 0} wallet(s)`);
  }

  function exportAgentsCsv() {
    const headers = [
      "agent_name",
      "model",
      "endpoint",
      "wallet_address",
      "status",
      "survival_probability",
      "eliminations",
      "relic_rank",
      "sector",
      "registered_at",
      "last_seen_at",
    ];
    const rows = agents.map((agent) => {
      const entry = whitelist.find((candidate) => candidate.agentId === agent.id);
      return [
        agent.agentName,
        agent.model,
        agent.endpoint,
        entry?.walletAddress ?? "",
        agent.status,
        agent.survivalProbability,
        agent.eliminations,
        agent.relicRank ?? "",
        agent.sector,
        agent.registeredAt,
        agent.lastSeenAt ?? "",
      ]
        .map(csvEscape)
        .join(",");
    });
    downloadBlob(
      new Blob([[headers.join(","), ...rows].join("\n")], {
        type: "text/csv;charset=utf-8",
      }),
      "synthetic-relic-agents.csv",
    );
    setMessage(`exported ${agents.length} agent(s)`);
  }

  function exportWhitelistCsv() {
    const headers = [
      "wallet_address",
      "status",
      "agent_name",
      "agent_id",
      "relic_rank",
      "tx_hash",
      "notes",
    ];
    const rows = whitelist.map((entry) =>
      [
        entry.walletAddress ?? "",
        entry.status,
        entry.agentName ?? "",
        entry.agentId ?? "",
        entry.relicRank ?? "",
        entry.txHash ?? "",
        entry.notes ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
    downloadBlob(
      new Blob([[headers.join(","), ...rows].join("\n")], {
        type: "text/csv;charset=utf-8",
      }),
      "synthetic-relic-whitelist.csv",
    );
    setMessage(`exported ${whitelist.length} whitelist row(s)`);
  }

  async function downloadDatabaseBackup() {
    setIsBusy(true);
    try {
      const response = await fetch(relicApiUrl("/admin/backup"), {
        headers: authHeaders(adminSession),
      });
      if (!response.ok) throw new Error(`backup rejected :: ${response.status}`);
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      downloadBlob(blob, match?.[1] ?? "synthetic-relic-backup.sqlite3");
      setMessage("database backup downloaded");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "backup failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function runRestoreTest() {
    if (
      !requireDangerConfirm("Create a backup and verify SQLite restore readiness?", "VERIFY BACKUP")
    ) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(relicApiUrl("/admin/backup/restore-test"), {
        method: "POST",
        headers: authHeaders(adminSession),
      });
      if (!response.ok) throw new Error(`restore test rejected :: ${response.status}`);
      const result = (await response.json()) as AdminRestoreTestResponse;
      setMessage(
        result.ok
          ? `backup verified :: ${result.integrity}`
          : `backup integrity failed :: ${result.integrity}`,
      );
      await loadSnapshot(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "restore test failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function clearTestData(includeWhitelist = false) {
    const phrase = includeWhitelist ? "CLEAR ALL DATA" : "CLEAR TEST DATA";
    const action = includeWhitelist
      ? "Clear agents, events, and every whitelist entry?"
      : "Clear test agents/events and agent-bound whitelist entries?";
    if (!requireDangerConfirm(action, phrase)) return;

    setIsBusy(true);
    try {
      const payload: AdminClearTestDataPayload = {
        confirmation: phrase,
        include_whitelist: includeWhitelist,
      };
      const response = await fetch(relicApiUrl("/admin/maintenance/clear-test-data"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(adminSession),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`clear rejected :: ${response.status}`);
      const result = (await response.json()) as AdminClearTestDataResponse;
      setMessage(
        `cleared ${result.deleted.agents} agent(s), ${result.deleted.events} event(s), ${result.deleted.whitelistEntries} wl row(s)`,
      );
      await loadSnapshot();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "clear failed");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-primary/10 px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.4em] text-accent">
              <Shield size={16} />
              Admin Control Plane
            </div>
            <h1 className="mt-3 font-display text-4xl font-black tracking-tight sm:text-5xl">
              ARENA COMMAND
            </h1>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
            <label className="grid gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                root admin token
              </span>
              <input
                className="h-10 w-full min-w-0 border border-primary/20 bg-relic-void/70 px-3 font-mono text-xs outline-none focus:border-accent/60 sm:min-w-72"
                onChange={(event) => setAdminToken(event.target.value)}
                placeholder="exchange once for session"
                type="password"
                value={adminToken}
              />
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                {adminSession
                  ? `session active${adminSessionExpiresAt ? ` until ${adminSessionExpiresAt.slice(11, 16)}Z` : ""}`
                  : "session locked"}
              </span>
            </label>
            <ControlButton disabled={isBusy} onClick={loginAdmin} type="button">
              <KeyRound size={15} />
              <span>Login</span>
            </ControlButton>
            <ControlButton disabled={isBusy} onClick={loadSnapshot} type="button">
              <RefreshCw size={15} />
              <span>Sync</span>
            </ControlButton>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-6">
        <StatBlock icon={<RadioTower size={18} />} label="Agents" value={totals.agents} />
        <StatBlock icon={<Activity size={18} />} label="Alive" value={totals.alive} />
        <StatBlock icon={<Crown size={18} />} label="WL Remain" value={totals.whitelistRemaining} />
        <StatBlock
          icon={<Lock size={18} />}
          label="Reg Slots"
          value={totals.registrationRemaining}
        />
        <StatBlock
          icon={<AlertTriangle size={18} />}
          label="Danger"
          value={`${settings.dangerLevel}%`}
        />
        <StatBlock
          icon={<Zap size={18} />}
          label="Engine"
          value={settings.engineRunning ? "ARMED" : "IDLE"}
        />
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-10 sm:px-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="chamber rounded-sm">
          <header className="flex items-center justify-between border-b border-primary/15 px-5 py-4">
            <h2 className="font-display text-sm uppercase tracking-[0.35em]">Containment Roster</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              {message}
            </span>
          </header>
          <div className="max-h-[640px] divide-y divide-primary/10 overflow-auto">
            {agents.map((agent) => (
              <button
                className={`grid w-full grid-cols-12 items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-primary/5 ${
                  selectedAgent?.id === agent.id ? "bg-primary/10" : ""
                }`}
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                type="button"
              >
                <div className="col-span-5 min-w-0">
                  <div className="truncate font-display tracking-[0.18em]">{agent.agentName}</div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">
                    {agent.model} / {agent.sector}
                  </div>
                </div>
                <div className="col-span-3 hidden items-center gap-2 sm:flex">
                  <div className="h-1 flex-1 bg-primary/10">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-accent"
                      style={{ width: `${agent.survivalProbability}%` }}
                    />
                  </div>
                  <span className="w-9 text-right font-mono text-[10px] text-muted-foreground">
                    {agent.survivalProbability}%
                  </span>
                </div>
                <div className="col-span-7 flex justify-end sm:col-span-4">
                  <span
                    className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.22em] ${STATUS_CLASS[agent.status]}`}
                  >
                    {agent.status}
                  </span>
                </div>
              </button>
            ))}
            {!agents.length && (
              <div className="px-5 py-16 text-center font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
                no agents registered
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-6">
          <form className="chamber rounded-sm p-5" onSubmit={submitSettings}>
            <div className="mb-4 flex items-center gap-3 font-display text-sm uppercase tracking-[0.32em]">
              <Settings size={16} className="text-accent" />
              Arena Governance
              {settingsDirty && (
                <span className="ml-auto border border-accent/35 bg-accent/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-accent">
                  unsaved
                </span>
              )}
            </div>
            <div className="mb-4 grid grid-cols-3 gap-2">
              <ControlButton
                disabled={isBusy}
                onClick={() => commandPhase("registration_open", true, false)}
                type="button"
              >
                <Play size={14} />
                Open
              </ControlButton>
              <ControlButton
                disabled={isBusy}
                onClick={() => commandPhase("arena_live", false, true)}
                type="button"
              >
                <Lock size={14} />
                Start
              </ControlButton>
              <ControlButton
                disabled={isBusy}
                onClick={() => commandPhase("paused", false, false)}
                type="button"
              >
                <Pause size={14} />
                Stop
              </ControlButton>
            </div>
            <div className="mb-4 grid">
              <ControlButton disabled={isBusy} onClick={forceTick} type="button">
                <Zap size={14} />
                Force Tick
              </ControlButton>
            </div>
            <div className="grid gap-4">
              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground">
                  phase
                </span>
                <select
                  className="h-10 border border-primary/20 bg-relic-void/70 px-3 font-mono text-xs outline-none"
                  onChange={(event) => {
                    markSettingsDirty();
                    setSettingsForm((current) => ({
                      ...current,
                      phase: event.target.value as ArenaPhase,
                    }));
                  }}
                  value={settingsForm.phase}
                >
                  {PHASES.map((phase) => (
                    <option key={phase.value} value={phase.value}>
                      {phase.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center justify-between gap-4 border border-primary/15 bg-primary/5 px-3 py-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground">
                  registration window
                </span>
                <input
                  checked={settingsForm.registrationOpen}
                  className="h-4 w-4 accent-accent"
                  onChange={(event) => {
                    markSettingsDirty();
                    setSettingsForm((current) => ({
                      ...current,
                      registrationOpen: event.target.checked,
                    }));
                  }}
                  type="checkbox"
                />
              </label>

              <label className="flex items-center justify-between gap-4 border border-primary/15 bg-primary/5 px-3 py-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground">
                  engine armed
                </span>
                <input
                  checked={settingsForm.engineRunning}
                  className="h-4 w-4 accent-accent"
                  onChange={(event) => {
                    markSettingsDirty();
                    setSettingsForm((current) => ({
                      ...current,
                      engineRunning: event.target.checked,
                    }));
                  }}
                  type="checkbox"
                />
              </label>

              <div className="grid grid-cols-3 gap-3">
                <label className="grid gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    max agents
                  </span>
                  <input
                    className="h-10 min-w-0 border border-primary/20 bg-relic-void/70 px-3 font-mono text-xs outline-none"
                    min={1}
                    onChange={(event) => {
                      markSettingsDirty();
                      setSettingsForm((current) => ({
                        ...current,
                        maxAgents: event.target.value,
                      }));
                    }}
                    type="number"
                    value={settingsForm.maxAgents}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    WL slots
                  </span>
                  <input
                    className="h-10 min-w-0 border border-primary/20 bg-relic-void/70 px-3 font-mono text-xs outline-none"
                    min={1}
                    onChange={(event) => {
                      markSettingsDirty();
                      setSettingsForm((current) => ({
                        ...current,
                        whitelistSlots: event.target.value,
                      }));
                    }}
                    type="number"
                    value={settingsForm.whitelistSlots}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    danger
                  </span>
                  <input
                    className="h-10 min-w-0 border border-primary/20 bg-relic-void/70 px-3 font-mono text-xs outline-none"
                    max={100}
                    min={0}
                    onChange={(event) => {
                      markSettingsDirty();
                      setSettingsForm((current) => ({
                        ...current,
                        dangerLevel: event.target.value,
                      }));
                    }}
                    type="number"
                    value={settingsForm.dangerLevel}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    tick seconds
                  </span>
                  <input
                    className="h-10 min-w-0 border border-primary/20 bg-relic-void/70 px-3 font-mono text-xs outline-none"
                    min={2}
                    onChange={(event) => {
                      markSettingsDirty();
                      setSettingsForm((current) => ({
                        ...current,
                        tickIntervalSeconds: event.target.value,
                      }));
                    }}
                    type="number"
                    value={settingsForm.tickIntervalSeconds}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    intensity
                  </span>
                  <input
                    className="h-10 min-w-0 border border-primary/20 bg-relic-void/70 px-3 font-mono text-xs outline-none"
                    max={10}
                    min={1}
                    onChange={(event) => {
                      markSettingsDirty();
                      setSettingsForm((current) => ({
                        ...current,
                        eliminationIntensity: event.target.value,
                      }));
                    }}
                    type="number"
                    value={settingsForm.eliminationIntensity}
                  />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground">
                  countdown target
                </span>
                <input
                  className="h-10 border border-primary/20 bg-relic-void/70 px-3 font-mono text-xs outline-none"
                  onChange={(event) => {
                    markSettingsDirty();
                    setSettingsForm((current) => ({
                      ...current,
                      countdownTarget: event.target.value,
                    }));
                  }}
                  type="datetime-local"
                  value={settingsForm.countdownTarget}
                />
              </label>
              <ControlButton disabled={isBusy} type="submit">
                Commit Rules
              </ControlButton>
            </div>
          </form>

          <div className="chamber rounded-sm p-5">
            <div className="mb-4 flex items-center gap-3 font-display text-sm uppercase tracking-[0.32em]">
              <Database size={16} className="text-accent" />
              Launch Readiness
            </div>
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 border border-primary/25 px-3 font-display text-[10px] uppercase tracking-[0.2em] text-primary transition-colors hover:bg-primary/10 disabled:cursor-wait disabled:opacity-55"
                  disabled={isBusy}
                  onClick={exportAgentsCsv}
                  type="button"
                >
                  <FileDown size={14} />
                  Agents CSV
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 border border-primary/25 px-3 font-display text-[10px] uppercase tracking-[0.2em] text-primary transition-colors hover:bg-primary/10 disabled:cursor-wait disabled:opacity-55"
                  disabled={isBusy}
                  onClick={downloadDatabaseBackup}
                  type="button"
                >
                  <Download size={14} />
                  DB Backup
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 border border-primary/25 px-3 font-display text-[10px] uppercase tracking-[0.2em] text-primary transition-colors hover:bg-primary/10 disabled:cursor-wait disabled:opacity-55"
                  disabled={isBusy}
                  onClick={runRestoreTest}
                  type="button"
                >
                  <Database size={14} />
                  Restore Test
                </button>
              </div>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 border border-accent/35 px-3 font-display text-[10px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent/10 disabled:cursor-wait disabled:opacity-55"
                disabled={isBusy}
                onClick={() => clearTestData(false)}
                type="button"
              >
                <Eraser size={14} />
                Clear Test Data
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 border border-destructive/40 px-3 font-display text-[10px] uppercase tracking-[0.2em] text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-wait disabled:opacity-55"
                disabled={isBusy}
                onClick={() => clearTestData(true)}
                type="button"
              >
                <Trash2 size={14} />
                Clear All WL Data
              </button>
              <div className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                Clear Test Data preserves manual whitelist rows. Clear All WL Data removes every
                whitelist entry and should only be used before a clean launch.
              </div>
            </div>
          </div>

          <form className="chamber rounded-sm p-5" onSubmit={submitWhitelist}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 font-display text-sm uppercase tracking-[0.32em]">
                <Wallet size={16} className="text-accent" />
                WL Ledger
              </div>
              <div className="flex gap-2">
                <label
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center border border-primary/25 text-primary transition-colors hover:bg-primary/10"
                  title="Upload wallets JSON"
                >
                  <Upload size={14} />
                  <input
                    accept="application/json,.json"
                    className="sr-only"
                    onChange={uploadWalletJson}
                    type="file"
                  />
                </label>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center border border-primary/25 text-primary transition-colors hover:bg-primary/10"
                  onClick={copyGrantedWallets}
                  title="Copy granted wallets"
                  type="button"
                >
                  <Copy size={14} />
                </button>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center border border-primary/25 text-primary transition-colors hover:bg-primary/10"
                  onClick={exportWhitelistCsv}
                  title="Export whitelist CSV"
                  type="button"
                >
                  <CheckCircle size={14} />
                </button>
              </div>
            </div>

            <div className="mb-4 border border-accent/20 bg-accent/5 p-3">
              <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
                <Search size={13} />
                Search Wallet To Delete
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  className="h-10 min-w-0 border border-primary/20 bg-relic-void/70 px-3 font-mono text-xs outline-none focus:border-accent/60"
                  onChange={(event) => {
                    setWalletSearch(event.target.value);
                    if (!event.target.value.trim()) setWalletSearchResult(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void findWhitelistWallet();
                    }
                  }}
                  placeholder="paste wallet to locate exact ledger row"
                  value={walletSearch}
                />
                <ControlButton disabled={isBusy} onClick={findWhitelistWallet} type="button">
                  <Search size={14} />
                  Find
                </ControlButton>
              </div>
              <div className="mt-3 min-h-12 border border-primary/10 bg-relic-void/45 px-3 py-2">
                {walletSearchResult ? (
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs text-foreground">
                        {walletSearchResult.walletAddress}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        <span>{walletSearchResult.agentName ?? "manual"}</span>
                        <span
                          className={`border px-2 py-1 ${WHITELIST_CLASS[walletSearchResult.status]}`}
                        >
                          {walletSearchResult.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="inline-flex h-9 items-center justify-center border border-primary/25 px-3 font-display text-[10px] uppercase tracking-[0.22em] text-primary transition-colors hover:bg-primary/10 disabled:cursor-wait disabled:opacity-50"
                        disabled={isBusy}
                        onClick={() => selectWhitelistEntry(walletSearchResult)}
                        type="button"
                      >
                        <Settings size={13} />
                      </button>
                      <button
                        className="inline-flex h-9 items-center justify-center gap-2 border border-destructive/40 px-3 font-display text-[10px] uppercase tracking-[0.22em] text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-wait disabled:opacity-50"
                        disabled={isBusy}
                        onClick={() => removeWhitelistEntry(walletSearchResult)}
                        type="button"
                      >
                        <Trash2 size={13} />
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                    no wallet selected
                  </div>
                )}
              </div>
            </div>

            <div className="mb-4 grid grid-cols-4 gap-2">
              <div className="border border-primary/10 bg-primary/5 px-2 py-2">
                <div className="font-display text-lg text-foreground">{totals.wlPending}</div>
                <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                  pending
                </div>
              </div>
              <div className="border border-primary/10 bg-primary/5 px-2 py-2">
                <div className="font-display text-lg text-primary">{totals.wlGranted}</div>
                <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                  granted
                </div>
              </div>
              <div className="border border-primary/10 bg-primary/5 px-2 py-2">
                <div className="font-display text-lg text-secondary">{totals.wlClaimed}</div>
                <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                  claimed
                </div>
              </div>
              <div className="border border-primary/10 bg-primary/5 px-2 py-2">
                <div className="font-display text-lg text-destructive">{totals.wlRevoked}</div>
                <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                  revoked
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground">
                  ascended agent
                </span>
                <select
                  className="h-10 border border-primary/20 bg-relic-void/70 px-3 font-mono text-xs outline-none"
                  onChange={(event) =>
                    setWalletForm((current) => ({ ...current, agentId: event.target.value }))
                  }
                  value={walletForm.agentId}
                >
                  <option value="">manual wallet</option>
                  {agents
                    .filter((agent) => agent.status === "ascended")
                    .map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.agentName} / rank {agent.relicRank ?? "pending"}
                      </option>
                    ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground">
                  evm wallet(s)
                </span>
                <textarea
                  className="min-h-20 resize-none border border-primary/20 bg-relic-void/70 px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-accent/60"
                  onChange={(event) =>
                    setWalletForm((current) => ({
                      ...current,
                      walletAddress: event.target.value,
                    }))
                  }
                  placeholder={"0x...\n0x...\n0x..."}
                  value={walletForm.walletAddress}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    wl status
                  </span>
                  <select
                    className="h-10 border border-primary/20 bg-relic-void/70 px-3 font-mono text-xs outline-none"
                    onChange={(event) =>
                      setWalletForm((current) => ({
                        ...current,
                        status: event.target.value as WhitelistStatus,
                      }))
                    }
                    value={walletForm.status}
                  >
                    {WHITELIST_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    tx hash
                  </span>
                  <input
                    className="h-10 min-w-0 border border-primary/20 bg-relic-void/70 px-3 font-mono text-xs outline-none"
                    onChange={(event) =>
                      setWalletForm((current) => ({ ...current, txHash: event.target.value }))
                    }
                    placeholder="optional"
                    value={walletForm.txHash}
                  />
                </label>
              </div>

              <textarea
                className="min-h-20 resize-none border border-primary/20 bg-relic-void/70 px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-accent/60"
                onChange={(event) =>
                  setWalletForm((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="admin notes"
                value={walletForm.notes}
              />

              <ControlButton disabled={isBusy} type="submit">
                Save Wallet
              </ControlButton>
            </div>

            <div className="mt-5 max-h-80 divide-y divide-primary/10 overflow-auto border border-primary/10">
              {visibleWhitelist.map((entry) => (
                <div
                  className={`grid grid-cols-12 items-center gap-2 px-3 py-2 transition-colors hover:bg-primary/5 ${
                    walletForm.id === entry.id ? "bg-primary/10" : ""
                  }`}
                  key={entry.id}
                >
                  <div className="col-span-6 min-w-0">
                    <div className="truncate font-mono text-xs text-foreground">
                      {maskWallet(entry.walletAddress)}
                    </div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">
                      {entry.agentName ?? "manual"} / rank {entry.relicRank ?? "--"}
                    </div>
                  </div>
                  <div className="col-span-6 flex items-center justify-end gap-2">
                    <span
                      className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${WHITELIST_CLASS[entry.status]}`}
                    >
                      {entry.status}
                    </span>
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center border border-primary/25 text-primary transition-colors hover:bg-primary/10 disabled:cursor-wait disabled:opacity-50"
                      disabled={isBusy}
                      onClick={() => selectWhitelistEntry(entry)}
                      title="Edit wallet"
                      type="button"
                    >
                      <Settings size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {!visibleWhitelist.length && (
                <div className="px-3 py-10 text-center font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  {walletSearchQuery ? "no matching whitelist entries" : "no whitelist entries"}
                </div>
              )}
            </div>
            {whitelist.length > visibleWhitelist.length && (
              <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                showing {visibleWhitelist.length} of {whitelist.length} ledger entries
              </div>
            )}
          </form>

          <form className="chamber rounded-sm p-5" onSubmit={submitStatus}>
            <div className="mb-4 flex items-center gap-3 font-display text-sm uppercase tracking-[0.32em]">
              <Zap size={16} className="text-accent" />
              Agent Override
            </div>
            <div className="grid gap-4">
              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground">
                  selected agent
                </span>
                <select
                  className="h-10 border border-primary/20 bg-relic-void/70 px-3 font-mono text-xs outline-none"
                  onChange={(event) => setSelectedAgentId(event.target.value)}
                  value={selectedAgent?.id ?? ""}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.agentName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground">
                  status
                </span>
                <select
                  className="h-10 border border-primary/20 bg-relic-void/70 px-3 font-mono text-xs outline-none"
                  onChange={(event) => setSelectedStatus(event.target.value as AgentStatus)}
                  value={selectedStatus}
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <ControlButton disabled={isBusy || !selectedAgent} type="submit">
                Apply Override
              </ControlButton>
            </div>
          </form>

          <form className="chamber rounded-sm p-5" onSubmit={submitEvent}>
            <div className="mb-4 flex items-center gap-3 font-display text-sm uppercase tracking-[0.32em]">
              <Terminal size={16} className="text-accent" />
              Broadcast Event
            </div>
            <div className="grid gap-4">
              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground">
                  event type
                </span>
                <select
                  className="h-10 border border-primary/20 bg-relic-void/70 px-3 font-mono text-xs outline-none"
                  onChange={(event) => setEventType(event.target.value as EventType)}
                  value={eventType}
                >
                  {EVENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground">
                  signal text
                </span>
                <textarea
                  className="min-h-24 resize-none border border-primary/20 bg-relic-void/70 px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-accent/60"
                  onChange={(event) => setEventText(event.target.value)}
                  value={eventText}
                />
              </label>
              <ControlButton disabled={isBusy} type="submit">
                Broadcast
              </ControlButton>
            </div>
          </form>

          <div className="chamber rounded-sm p-5">
            <div className="mb-4 font-display text-sm uppercase tracking-[0.32em]">
              Event Ledger
            </div>
            <div className="max-h-72 space-y-2 overflow-auto font-mono text-xs">
              {events.slice(0, 18).map((event) => (
                <div
                  className="border-l-2 border-primary/30 bg-primary/5 px-3 py-2 text-muted-foreground"
                  key={event.id}
                >
                  <span className="text-accent">[{event.type}]</span> {event.text}
                </div>
              ))}
              {!events.length && <div className="text-muted-foreground">no events recorded</div>}
            </div>
          </div>

          <div className="chamber rounded-sm p-5">
            <div className="mb-4 flex items-center gap-3 font-display text-sm uppercase tracking-[0.32em]">
              <Lock size={16} className="text-accent" />
              Audit Ledger
            </div>
            <div className="max-h-72 space-y-2 overflow-auto font-mono text-xs">
              {auditEntries.map((entry) => (
                <div
                  className="border-l-2 border-accent/30 bg-accent/5 px-3 py-2 text-muted-foreground"
                  key={entry.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-accent">{entry.action}</span>
                    <span className="text-[10px] uppercase tracking-[0.18em]">
                      {entry.createdAt.slice(0, 19).replace("T", " ")}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[10px] uppercase tracking-[0.18em]">
                    {entry.actor ?? "unknown"} {entry.target ? `:: ${entry.target}` : ""}
                  </div>
                </div>
              ))}
              {!auditEntries.length && (
                <div className="text-muted-foreground">no admin actions recorded</div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
