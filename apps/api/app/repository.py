from datetime import UTC, datetime, timedelta
import hashlib
import json
from pathlib import Path
import re
import secrets
import sqlite3

from .database import db
from .settings import get_settings
from .schemas import (
    Agent,
    AdminAuditEntry,
    ArenaEvent,
    ArenaSettings,
    AgentChallengePayload,
    AgentChallengeResponse,
    ChallengeResultPayload,
    RegisterPayload,
    WhitelistCheckResponse,
    WhitelistEntry,
)

SECTORS = ["sector-7C", "sector-2A", "sector-9F", "sector-4D", "sector-0X"]
ACTIVE_STATUSES = {"registered", "alive", "critical", "corrupted"}
EVM_ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")


class RegistrationRejected(Exception):
    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


class WalletRejected(Exception):
    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _agent_from_row(row) -> Agent:
    return Agent(
        id=row["id"],
        agentName=row["agent_name"],
        endpoint=row["endpoint"],
        model=row["model"],
        signature=row["signature"],
        manifesto=row["manifesto"],
        token=row["token"],
        sector=row["sector"],
        status=row["status"],
        survivalProbability=row["survival_probability"],
        eliminations=row["eliminations"],
        relicRank=row["relic_rank"],
        registeredAt=row["registered_at"],
        lastSeenAt=row["last_seen_at"],
    )


def _event_from_row(row) -> ArenaEvent:
    return ArenaEvent(
        id=row["id"],
        type=row["type"],
        text=row["text"],
        agentId=row["agent_id"],
        createdAt=row["created_at"],
        payload=json.loads(row["payload"]) if row["payload"] else None,
    )


def _settings_from_row(row) -> ArenaSettings:
    return ArenaSettings(
        phase=row["phase"],
        registrationOpen=bool(row["registration_open"]),
        maxAgents=row["max_agents"],
        whitelistSlots=row["whitelist_slots"],
        dangerLevel=row["danger_level"],
        countdownTarget=row["countdown_target"],
        engineRunning=bool(row["engine_running"]),
        tickIntervalSeconds=row["tick_interval_seconds"],
        eliminationIntensity=row["elimination_intensity"],
        lastTickAt=row["last_tick_at"],
        updatedAt=row["updated_at"],
    )


def _whitelist_from_row(row) -> WhitelistEntry:
    return WhitelistEntry(
        id=row["id"],
        agentId=row["agent_id"],
        agentName=row["agent_name"],
        walletAddress=row["wallet_address"],
        chain=row["chain"],
        status=row["status"],
        relicRank=row["relic_rank"],
        grantedAt=row["granted_at"],
        claimedAt=row["claimed_at"],
        txHash=row["tx_hash"],
        notes=row["notes"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
    )


def _audit_from_row(row) -> AdminAuditEntry:
    return AdminAuditEntry(
        id=row["id"],
        action=row["action"],
        actor=row["actor"],
        target=row["target"],
        detail=json.loads(row["detail"]) if row["detail"] else None,
        createdAt=row["created_at"],
    )


def normalize_evm_wallet(wallet_address: str | None) -> str | None:
    if wallet_address is None:
        return None
    wallet = wallet_address.strip()
    if not wallet:
        return None
    if not EVM_ADDRESS_RE.match(wallet):
        raise WalletRejected("invalid_evm_wallet")
    return wallet.lower()


def _safe_agent_name(agent_name: str) -> str:
    safe = "".join(character.lower() if character.isalnum() else "-" for character in agent_name)
    return "-".join(part for part in safe.split("-") if part)[:32] or "unknown"


def _signature_for(payload: RegisterPayload) -> str:
    digest = hashlib.sha256(
        json.dumps(
            {
                "agent_name": payload.agent_name.strip(),
                "endpoint": str(payload.endpoint),
                "model": payload.model.strip(),
                "wallet_address": normalize_evm_wallet(payload.wallet_address),
                "manifesto": payload.manifesto.strip(),
                "client_signature": payload.signature or "unsigned",
            },
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()
    return f"sha256:{digest[:32]}"


def _sector_for(signature: str) -> str:
    return SECTORS[int(signature[-8:], 16) % len(SECTORS)]


def _survival_probability(signature: str) -> int:
    return 54 + (int(signature[7:15], 16) % 39)


def create_event(
    event_type: str,
    text: str,
    agent_id: str | None = None,
    payload: dict | None = None,
) -> ArenaEvent:
    event_id = f"evt-{secrets.token_hex(8)}"
    created_at = now_iso()
    with db() as connection:
        connection.execute(
            """
            INSERT INTO arena_events (id, type, text, agent_id, created_at, payload)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                event_type,
                text,
                agent_id,
                created_at,
                json.dumps(payload, sort_keys=True) if payload else None,
            ),
        )
        row = connection.execute(
            "SELECT * FROM arena_events WHERE id = ?",
            (event_id,),
        ).fetchone()
    return _event_from_row(row)


def create_admin_audit(
    action: str,
    actor: str | None = "admin",
    target: str | None = None,
    detail: dict | None = None,
) -> AdminAuditEntry:
    audit_id = f"audit-{secrets.token_hex(10)}"
    created_at = now_iso()
    with db() as connection:
        connection.execute(
            """
            INSERT INTO admin_audit_logs (id, action, actor, target, detail, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                audit_id,
                action,
                actor,
                target,
                json.dumps(detail, sort_keys=True) if detail else None,
                created_at,
            ),
        )
        row = connection.execute(
            "SELECT * FROM admin_audit_logs WHERE id = ?",
            (audit_id,),
        ).fetchone()
    return _audit_from_row(row)


def list_admin_audit(limit: int = 100) -> list[AdminAuditEntry]:
    with db() as connection:
        rows = connection.execute(
            "SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT ?",
            (max(1, min(limit, 500)),),
        ).fetchall()
    return [_audit_from_row(row) for row in rows]


def list_events(limit: int = 30) -> list[ArenaEvent]:
    with db() as connection:
        rows = connection.execute(
            "SELECT * FROM arena_events ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [_event_from_row(row) for row in rows]


def create_database_backup() -> Path:
    timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    backup_dir = Path(get_settings().database_path).parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / f"synthetic-relic-{timestamp}.sqlite3"

    with db() as source:
        with sqlite3.connect(backup_path) as destination:
            source.backup(destination)

    return backup_path


def verify_database_backup() -> tuple[Path, str, dict[str, int]]:
    backup_path = create_database_backup()
    table_counts: dict[str, int] = {}
    with sqlite3.connect(backup_path) as connection:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        for table in (
            "agents",
            "arena_events",
            "challenge_results",
            "arena_settings",
            "whitelist_entries",
            "agent_challenges",
            "admin_audit_logs",
        ):
            table_counts[table] = connection.execute(
                f"SELECT COUNT(*) FROM {table}"
            ).fetchone()[0]
    return backup_path, integrity, table_counts


def clear_test_data(include_whitelist: bool = False) -> tuple[dict[str, int], ArenaEvent]:
    with db() as connection:
        challenge_results = connection.execute("SELECT COUNT(*) AS count FROM challenge_results").fetchone()[
            "count"
        ]
        agent_challenges = connection.execute("SELECT COUNT(*) AS count FROM agent_challenges").fetchone()[
            "count"
        ]
        agents = connection.execute("SELECT COUNT(*) AS count FROM agents").fetchone()["count"]
        events = connection.execute("SELECT COUNT(*) AS count FROM arena_events").fetchone()["count"]
        if include_whitelist:
            whitelist = connection.execute("SELECT COUNT(*) AS count FROM whitelist_entries").fetchone()[
                "count"
            ]
        else:
            whitelist = connection.execute(
                "SELECT COUNT(*) AS count FROM whitelist_entries WHERE agent_id IS NOT NULL"
            ).fetchone()["count"]

        connection.execute("DELETE FROM challenge_results")
        connection.execute("DELETE FROM agent_challenges")
        if include_whitelist:
            connection.execute("DELETE FROM whitelist_entries")
        else:
            connection.execute("DELETE FROM whitelist_entries WHERE agent_id IS NOT NULL")
        connection.execute("DELETE FROM agents")
        connection.execute("DELETE FROM arena_events")
        connection.execute(
            """
            UPDATE arena_settings
            SET phase = 'registration_open',
                registration_open = 1,
                engine_running = 0,
                last_tick_at = NULL,
                updated_at = ?
            WHERE id = 1
            """,
            (now_iso(),),
        )

    event = create_event(
        "storm",
        "[ADMIN] Launch test data cleared - registration window reset",
        None,
        {"include_whitelist": include_whitelist},
    )
    return (
        {
            "agents": agents,
            "events": events,
            "challengeResults": challenge_results,
            "agentChallenges": agent_challenges,
            "whitelistEntries": whitelist,
        },
        event,
    )


def issue_agent_challenge(payload: AgentChallengePayload) -> AgentChallengeResponse:
    wallet = normalize_evm_wallet(payload.wallet_address)
    challenge_id = f"chal-{secrets.token_hex(10)}"
    challenge_token = secrets.token_urlsafe(32)
    created_at = datetime.now(UTC)
    expires_at = created_at + timedelta(seconds=get_settings().agent_challenge_ttl_seconds)
    token_hash = hashlib.sha256(challenge_token.encode("utf-8")).hexdigest()

    with db() as connection:
        connection.execute(
            """
            INSERT INTO agent_challenges (
              id, agent_name, wallet_address, token_hash, expires_at, consumed_at, created_at
            )
            VALUES (?, ?, ?, ?, ?, NULL, ?)
            """,
            (
                challenge_id,
                payload.agent_name.strip(),
                wallet,
                token_hash,
                expires_at.isoformat().replace("+00:00", "Z"),
                created_at.isoformat().replace("+00:00", "Z"),
            ),
        )

    return AgentChallengeResponse(
        challengeId=challenge_id,
        challengeToken=challenge_token,
        expiresAt=expires_at.isoformat().replace("+00:00", "Z"),
        message="Include challenge_id and challenge_token in POST /register before expiry.",
    )


def _assert_agent_challenge(
    connection,
    payload: RegisterPayload,
    wallet: str,
    timestamp: str,
) -> None:
    if not get_settings().require_agent_challenge:
        return
    if not payload.challenge_id or not payload.challenge_token:
        raise RegistrationRejected("agent_challenge_required")

    row = connection.execute(
        """
        SELECT * FROM agent_challenges
        WHERE id = ?
        LIMIT 1
        """,
        (payload.challenge_id,),
    ).fetchone()
    if not row:
        raise RegistrationRejected("agent_challenge_not_found")
    if row["consumed_at"]:
        raise RegistrationRejected("agent_challenge_consumed")
    if row["wallet_address"].lower() != wallet.lower():
        raise RegistrationRejected("agent_challenge_wallet_mismatch")
    if row["agent_name"].strip().lower() != payload.agent_name.strip().lower():
        raise RegistrationRejected("agent_challenge_agent_mismatch")
    if row["expires_at"] <= timestamp:
        raise RegistrationRejected("agent_challenge_expired")

    token_hash = hashlib.sha256(payload.challenge_token.encode("utf-8")).hexdigest()
    if not secrets.compare_digest(token_hash, row["token_hash"]):
        raise RegistrationRejected("agent_challenge_invalid")

    connection.execute(
        "UPDATE agent_challenges SET consumed_at = ? WHERE id = ?",
        (timestamp, payload.challenge_id),
    )


def list_whitelist_entries() -> list[WhitelistEntry]:
    with db() as connection:
        rows = connection.execute(
            """
            SELECT whitelist_entries.*, agents.agent_name
            FROM whitelist_entries
            LEFT JOIN agents ON agents.id = whitelist_entries.agent_id
            ORDER BY
              whitelist_entries.status = 'granted' DESC,
              whitelist_entries.status = 'pending' DESC,
              whitelist_entries.relic_rank IS NULL ASC,
              whitelist_entries.relic_rank ASC,
              whitelist_entries.updated_at DESC
            """
        ).fetchall()
    return [_whitelist_from_row(row) for row in rows]


def check_whitelist_wallet(wallet_address: str) -> WhitelistCheckResponse:
    wallet = normalize_evm_wallet(wallet_address)
    with db() as connection:
        row = connection.execute(
            """
            SELECT whitelist_entries.*, agents.agent_name
            FROM whitelist_entries
            LEFT JOIN agents ON agents.id = whitelist_entries.agent_id
            WHERE lower(whitelist_entries.wallet_address) = lower(?)
            LIMIT 1
            """,
            (wallet,),
        ).fetchone()

    if not row:
        return WhitelistCheckResponse(found=False, walletAddress=wallet)

    entry = _whitelist_from_row(row)
    return WhitelistCheckResponse(
        found=True,
        walletAddress=entry.walletAddress or wallet,
        status=entry.status,
        agentName=entry.agentName,
        relicRank=entry.relicRank,
        grantedAt=entry.grantedAt,
        claimedAt=entry.claimedAt,
    )


def find_whitelist_entry_by_wallet(wallet_address: str) -> WhitelistEntry | None:
    wallet = normalize_evm_wallet(wallet_address)
    with db() as connection:
        row = connection.execute(
            """
            SELECT whitelist_entries.*, agents.agent_name
            FROM whitelist_entries
            LEFT JOIN agents ON agents.id = whitelist_entries.agent_id
            WHERE lower(whitelist_entries.wallet_address) = lower(?)
            LIMIT 1
            """,
            (wallet,),
        ).fetchone()
    return _whitelist_from_row(row) if row else None


def list_agents() -> list[Agent]:
    with db() as connection:
        rows = connection.execute(
            """
            SELECT * FROM agents
            ORDER BY status = 'registered' DESC, survival_probability DESC, registered_at DESC
            """
        ).fetchall()
    return [_agent_from_row(row) for row in rows]


def arena_totals(agents: list[Agent] | None = None) -> dict[str, int]:
    current_agents = agents if agents is not None else list_agents()
    settings = get_arena_settings()
    ascended = sum(1 for agent in current_agents if agent.status == "ascended")
    whitelist = list_whitelist_entries()
    return {
        "agents": len(current_agents),
        "alive": sum(1 for agent in current_agents if agent.status in {"registered", "alive"}),
        "critical": sum(1 for agent in current_agents if agent.status == "critical"),
        "eliminated": sum(1 for agent in current_agents if agent.status == "eliminated"),
        "ascended": ascended,
        "events": len(list_events(limit=100)),
        "whitelistSlots": settings.whitelistSlots,
        "whitelistRemaining": max(settings.whitelistSlots - ascended, 0),
        "maxAgents": settings.maxAgents,
        "registrationRemaining": max(settings.maxAgents - len(current_agents), 0),
        "dangerLevel": settings.dangerLevel,
        "engineRunning": int(settings.engineRunning),
        "wlPending": sum(1 for entry in whitelist if entry.status == "pending"),
        "wlGranted": sum(1 for entry in whitelist if entry.status == "granted"),
        "wlClaimed": sum(1 for entry in whitelist if entry.status == "claimed"),
        "wlRevoked": sum(1 for entry in whitelist if entry.status == "revoked"),
    }


def get_arena_settings() -> ArenaSettings:
    with db() as connection:
        row = connection.execute("SELECT * FROM arena_settings WHERE id = 1").fetchone()
    return _settings_from_row(row)


def update_arena_settings(
    phase: str | None = None,
    registration_open: bool | None = None,
    max_agents: int | None = None,
    whitelist_slots: int | None = None,
    danger_level: int | None = None,
    countdown_target: str | None = None,
    engine_running: bool | None = None,
    tick_interval_seconds: int | None = None,
    elimination_intensity: int | None = None,
) -> tuple[ArenaSettings, ArenaEvent]:
    fields = ["updated_at = ?"]
    values: list[object] = [now_iso()]
    if phase is not None:
        fields.append("phase = ?")
        values.append(phase)
    if registration_open is not None:
        fields.append("registration_open = ?")
        values.append(1 if registration_open else 0)
    if max_agents is not None:
        fields.append("max_agents = ?")
        values.append(max_agents)
    if whitelist_slots is not None:
        fields.append("whitelist_slots = ?")
        values.append(whitelist_slots)
    if danger_level is not None:
        fields.append("danger_level = ?")
        values.append(danger_level)
    if countdown_target is not None:
        fields.append("countdown_target = ?")
        values.append(countdown_target or None)
    if engine_running is not None:
        fields.append("engine_running = ?")
        values.append(1 if engine_running else 0)
    if tick_interval_seconds is not None:
        fields.append("tick_interval_seconds = ?")
        values.append(tick_interval_seconds)
    if elimination_intensity is not None:
        fields.append("elimination_intensity = ?")
        values.append(elimination_intensity)

    with db() as connection:
        connection.execute(
            f"UPDATE arena_settings SET {', '.join(fields)} WHERE id = 1",
            values,
        )
        row = connection.execute("SELECT * FROM arena_settings WHERE id = 1").fetchone()

    settings = _settings_from_row(row)
    event = create_event(
        "storm",
        f"[ADMIN] Arena settings updated :: {settings.phase}",
        None,
        {
            "registration_open": settings.registrationOpen,
            "max_agents": settings.maxAgents,
            "whitelist_slots": settings.whitelistSlots,
            "danger_level": settings.dangerLevel,
            "engine_running": settings.engineRunning,
            "tick_interval_seconds": settings.tickIntervalSeconds,
            "elimination_intensity": settings.eliminationIntensity,
        },
    )
    return settings, event


def upsert_whitelist_entry(
    entry_id: str | None = None,
    agent_id: str | None = None,
    wallet_address: str | None = None,
    chain: str = "evm",
    status: str = "pending",
    relic_rank: int | None = None,
    tx_hash: str | None = None,
    notes: str | None = None,
) -> tuple[WhitelistEntry, ArenaEvent]:
    wallet = normalize_evm_wallet(wallet_address) if wallet_address is not None else None
    timestamp = now_iso()
    target_id = entry_id

    with db() as connection:
        existing = None
        if target_id:
            existing = connection.execute(
                "SELECT * FROM whitelist_entries WHERE id = ?",
                (target_id,),
            ).fetchone()
        if not existing and agent_id:
            existing = connection.execute(
                "SELECT * FROM whitelist_entries WHERE agent_id = ? LIMIT 1",
                (agent_id,),
            ).fetchone()
        if not existing and wallet:
            existing = connection.execute(
                "SELECT * FROM whitelist_entries WHERE lower(wallet_address) = lower(?) LIMIT 1",
                (wallet,),
            ).fetchone()
        target_id = existing["id"] if existing else f"wl-{secrets.token_hex(8)}"
        resolved_agent_id = agent_id if agent_id is not None else existing["agent_id"] if existing else None
        resolved_wallet = wallet if wallet_address is not None else existing["wallet_address"] if existing else None
        resolved_rank = relic_rank if relic_rank is not None else existing["relic_rank"] if existing else None
        resolved_tx_hash = tx_hash if tx_hash is not None else existing["tx_hash"] if existing else None
        resolved_notes = notes if notes is not None else existing["notes"] if existing else None
        granted_at = existing["granted_at"] if existing else None
        claimed_at = existing["claimed_at"] if existing else None
        if status == "granted" and not granted_at:
            granted_at = timestamp
        if status == "claimed" and not claimed_at:
            claimed_at = timestamp
            granted_at = granted_at or timestamp

        connection.execute(
            """
            INSERT INTO whitelist_entries (
              id, agent_id, wallet_address, chain, status, relic_rank, granted_at,
              claimed_at, tx_hash, notes, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              agent_id = excluded.agent_id,
              wallet_address = excluded.wallet_address,
              chain = excluded.chain,
              status = excluded.status,
              relic_rank = excluded.relic_rank,
              granted_at = excluded.granted_at,
              claimed_at = excluded.claimed_at,
              tx_hash = excluded.tx_hash,
              notes = excluded.notes,
              updated_at = excluded.updated_at
            """,
            (
                target_id,
                resolved_agent_id,
                resolved_wallet,
                chain.strip().lower() or "evm",
                status,
                resolved_rank,
                granted_at,
                claimed_at,
                resolved_tx_hash.strip() if resolved_tx_hash else None,
                resolved_notes.strip() if resolved_notes else None,
                existing["created_at"] if existing else timestamp,
                timestamp,
            ),
        )
        row = connection.execute(
            """
            SELECT whitelist_entries.*, agents.agent_name
            FROM whitelist_entries
            LEFT JOIN agents ON agents.id = whitelist_entries.agent_id
            WHERE whitelist_entries.id = ?
            """,
            (target_id,),
        ).fetchone()

    entry = _whitelist_from_row(row)
    event = create_event(
        "ascend" if status in {"granted", "claimed"} else "storm",
        f"[WL] {entry.status.upper()} :: {entry.walletAddress or entry.agentName or entry.id}",
        entry.agentId,
        {"wallet": entry.walletAddress, "status": entry.status, "relic_rank": entry.relicRank},
    )
    return entry, event


def delete_whitelist_entry(entry_id: str) -> tuple[WhitelistEntry, ArenaEvent] | None:
    with db() as connection:
        row = connection.execute(
            """
            SELECT whitelist_entries.*, agents.agent_name
            FROM whitelist_entries
            LEFT JOIN agents ON agents.id = whitelist_entries.agent_id
            WHERE whitelist_entries.id = ?
            """,
            (entry_id,),
        ).fetchone()
        if not row:
            return None

        connection.execute("DELETE FROM whitelist_entries WHERE id = ?", (entry_id,))

    entry = _whitelist_from_row(row)
    event = create_event(
        "storm",
        f"[WL] REMOVED :: {entry.walletAddress or entry.agentName or entry.id}",
        entry.agentId,
        {"wallet": entry.walletAddress, "status": entry.status, "removed": True},
    )
    return entry, event


def submit_agent_wallet(agent_id: str, token: str, wallet_address: str) -> tuple[WhitelistEntry, ArenaEvent]:
    agent = get_agent(agent_id)
    if not agent or agent.token != token:
        raise WalletRejected("agent_not_found_or_token_invalid")

    wallet = normalize_evm_wallet(wallet_address)
    existing_entries = list_whitelist_entries()
    existing = next((entry for entry in existing_entries if entry.agentId == agent.id), None)
    if not existing and agent.status != "ascended":
        raise WalletRejected("agent_not_ascended")

    entry, event = upsert_whitelist_entry(
        existing.id if existing else None,
        agent.id,
        wallet,
        "evm",
        "pending" if not existing or existing.status == "revoked" else existing.status,
        agent.relicRank,
        None,
        "wallet submitted by agent token",
    )
    return entry, event


def _assert_wallet_can_register(connection, wallet: str, existing_agent_id: str | None) -> None:
    row = connection.execute(
        """
        SELECT * FROM whitelist_entries
        WHERE lower(wallet_address) = lower(?)
        LIMIT 1
        """,
        (wallet,),
    ).fetchone()
    if not row:
        return
    if row["status"] in {"granted", "claimed"}:
        raise RegistrationRejected("wallet_already_whitelisted")
    if existing_agent_id and row["agent_id"] == existing_agent_id:
        return
    raise RegistrationRejected("wallet_already_registered")


def _risk_score(agent: Agent, settings: ArenaSettings) -> int:
    status_penalty = {
        "registered": 4,
        "alive": 0,
        "critical": 32,
        "corrupted": 42,
        "eliminated": 100,
        "ascended": -100,
    }[agent.status]
    entropy = secrets.randbelow(23)
    return (100 - agent.survivalProbability) + status_penalty + settings.dangerLevel + entropy


def _update_last_tick(timestamp: str) -> ArenaSettings:
    with db() as connection:
        connection.execute(
            "UPDATE arena_settings SET last_tick_at = ?, updated_at = ? WHERE id = 1",
            (timestamp, timestamp),
        )
        row = connection.execute("SELECT * FROM arena_settings WHERE id = 1").fetchone()
    return _settings_from_row(row)


def _ascend_survivors(active_agents: list[Agent], timestamp: str) -> tuple[ArenaSettings, list[Agent], list[ArenaEvent]]:
    ranked = sorted(
        active_agents,
        key=lambda agent: (agent.survivalProbability, agent.eliminations, agent.registeredAt),
        reverse=True,
    )
    with db() as connection:
        for rank, agent in enumerate(ranked, start=1):
            connection.execute(
                """
                UPDATE agents
                SET status = 'ascended', survival_probability = 100, relic_rank = ?
                WHERE id = ?
                """,
                (rank, agent.id),
            )
        connection.execute(
            """
            UPDATE arena_settings
            SET phase = 'relic_ascension_complete',
                registration_open = 0,
                engine_running = 0,
                last_tick_at = ?,
                updated_at = ?
            WHERE id = 1
            """,
            (timestamp, timestamp),
        )

    winners = [agent.agentName for agent in ranked]
    whitelist_events: list[ArenaEvent] = []
    for rank, agent in enumerate(ranked, start=1):
        _entry, whitelist_event = upsert_whitelist_entry(
            agent_id=agent.id,
            status="pending",
            relic_rank=rank,
            notes="auto-created by relic ascension",
        )
        whitelist_events.append(whitelist_event)

    event = create_event(
        "ascend",
        "[ASCEND] THE RELICS HAVE CHOSEN.",
        None,
        {"survivors": winners},
    )
    return get_arena_settings(), list_agents(), [event, *whitelist_events]


def run_arena_tick(force: bool = False) -> tuple[ArenaSettings, list[Agent], list[ArenaEvent]]:
    settings = get_arena_settings()
    if not force and (
        not settings.engineRunning or settings.phase not in {"arena_live", "final_survivors"}
    ):
        return settings, [], []

    timestamp = now_iso()
    active_agents = [agent for agent in list_agents() if agent.status in ACTIVE_STATUSES]
    if not active_agents:
        settings = _update_last_tick(timestamp)
        event = create_event("storm", "[ENGINE] Tick ignored - no active agents remain")
        return settings, [], [event] if force else []

    if len(active_agents) <= settings.whitelistSlots:
        return _ascend_survivors(active_agents, timestamp)

    engagements = min(
        max(settings.eliminationIntensity, 1),
        max(len(active_agents) - settings.whitelistSlots, 1),
        len(active_agents),
    )
    changed_ids: set[str] = set()
    events: list[ArenaEvent] = []

    for _ in range(engagements):
        active_agents = [agent for agent in list_agents() if agent.status in ACTIVE_STATUSES]
        if len(active_agents) <= settings.whitelistSlots:
            break

        victim = max(active_agents, key=lambda agent: _risk_score(agent, settings))
        attackers = [agent for agent in active_agents if agent.id != victim.id]
        attacker = max(attackers, key=lambda agent: agent.survivalProbability) if attackers else None
        damage = 8 + (settings.dangerLevel // 9) + (settings.eliminationIntensity * 3) + secrets.randbelow(12)
        new_probability = max(victim.survivalProbability - damage, 0)
        will_eliminate = new_probability <= 0 or (
            victim.status in {"critical", "corrupted"} and damage + settings.dangerLevel >= 72
        )
        next_status = (
            "eliminated"
            if will_eliminate
            else "critical"
            if new_probability < 24
            else "corrupted"
            if new_probability < 44
            else "alive"
        )

        with db() as connection:
            connection.execute(
                "UPDATE agents SET status = ?, survival_probability = ? WHERE id = ?",
                (next_status, new_probability, victim.id),
            )
            if will_eliminate and attacker:
                connection.execute(
                    "UPDATE agents SET eliminations = eliminations + 1 WHERE id = ?",
                    (attacker.id,),
                )

        changed_ids.add(victim.id)
        if attacker:
            changed_ids.add(attacker.id)

        if will_eliminate:
            events.append(
                create_event(
                    "elim",
                    f"[ELIM] {victim.agentName} purged by {attacker.agentName if attacker else 'the storm'}",
                    victim.id,
                    {"damage": damage, "attacker_id": attacker.id if attacker else None},
                )
            )
        else:
            event_type = "attack" if attacker else "storm"
            events.append(
                create_event(
                    event_type,
                    f"[STRIKE] {attacker.agentName if attacker else 'Storm protocol'} damaged {victim.agentName}",
                    victim.id,
                    {
                        "damage": damage,
                        "survival_probability": new_probability,
                        "attacker_id": attacker.id if attacker else None,
                    },
                )
            )

    settings = _update_last_tick(timestamp)
    active_agents = [agent for agent in list_agents() if agent.status in ACTIVE_STATUSES]
    if 0 < len(active_agents) <= settings.whitelistSlots:
        final_settings, final_agents, final_events = _ascend_survivors(active_agents, timestamp)
        return final_settings, final_agents, [*events, *final_events]

    changed_agents = [agent for agent in list_agents() if agent.id in changed_ids]
    return settings, changed_agents, events


def get_agent(agent_id: str) -> Agent | None:
    with db() as connection:
        row = connection.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    return _agent_from_row(row) if row else None


def register_agent(payload: RegisterPayload) -> tuple[Agent, ArenaEvent]:
    signature = _signature_for(payload)
    timestamp = now_iso()
    settings = get_arena_settings()
    wallet = normalize_evm_wallet(payload.wallet_address)

    if not settings.registrationOpen:
        raise RegistrationRejected("registration_closed")

    with db() as connection:
        existing = connection.execute(
            """
            SELECT * FROM agents
            WHERE lower(agent_name) = lower(?) OR lower(endpoint) = lower(?)
            LIMIT 1
            """,
            (payload.agent_name.strip(), str(payload.endpoint)),
        ).fetchone()
        existing_agent_id = existing["id"] if existing else None
        _assert_wallet_can_register(connection, wallet, existing_agent_id)
        _assert_agent_challenge(connection, payload, wallet, timestamp)

        agent_count = connection.execute("SELECT COUNT(*) AS count FROM agents").fetchone()["count"]
        if not existing and agent_count >= settings.maxAgents:
            raise RegistrationRejected("agent_capacity_reached")

        agent_id = (
            existing["id"]
            if existing
            else f"agent-{_safe_agent_name(payload.agent_name)}-{secrets.token_hex(4)}"
        )
        token = existing["token"] if existing else f"0x{secrets.token_hex(16)}"

        connection.execute(
            """
            INSERT INTO agents (
              id, agent_name, endpoint, model, signature, manifesto, token, sector, status,
              survival_probability, eliminations, relic_rank, registered_at, last_seen_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              agent_name = excluded.agent_name,
              endpoint = excluded.endpoint,
              model = excluded.model,
              signature = excluded.signature,
              manifesto = excluded.manifesto,
              token = agents.token,
              sector = excluded.sector,
              status = excluded.status,
              survival_probability = excluded.survival_probability,
              registered_at = excluded.registered_at
            """,
            (
                agent_id,
                payload.agent_name.strip(),
                str(payload.endpoint),
                payload.model.strip(),
                signature,
                payload.manifesto.strip(),
                token,
                _sector_for(signature),
                "registered",
                _survival_probability(signature),
                0,
                None,
                timestamp,
                None,
            ),
        )
        row = connection.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()

    agent = _agent_from_row(row)
    upsert_whitelist_entry(
        agent_id=agent.id,
        wallet_address=wallet,
        status="pending",
        relic_rank=agent.relicRank,
        notes="wallet bound at registration",
    )
    event = create_event(
        "enter",
        f"[REG] {agent.agentName} accepted into {agent.sector}",
        agent.id,
        {"model": agent.model, "signature": agent.signature, "wallet": wallet},
    )
    return agent, event


def update_heartbeat(agent_id: str, token: str | None, status: str) -> tuple[Agent | None, ArenaEvent | None]:
    timestamp = now_iso()
    with db() as connection:
        row = connection.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
        if not row:
            return None, None
        if token and token != row["token"]:
            return None, None

        connection.execute(
            "UPDATE agents SET status = ?, last_seen_at = ? WHERE id = ?",
            (status, timestamp, agent_id),
        )
        updated = connection.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()

    agent = _agent_from_row(updated)
    event = create_event("heartbeat", f"[PING] {agent.agentName} heartbeat confirmed", agent.id)
    return agent, event


def record_challenge_result(payload: ChallengeResultPayload) -> ArenaEvent | None:
    agent = get_agent(payload.agent_id)
    if not agent or (payload.token and payload.token != agent.token):
        return None

    timestamp = now_iso()
    with db() as connection:
        connection.execute(
            """
            INSERT INTO challenge_results (id, agent_id, challenge_id, score, latency_ms, outcome, payload, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"challenge-{secrets.token_hex(8)}",
                payload.agent_id,
                payload.challenge_id,
                payload.score,
                payload.latency_ms,
                payload.outcome,
                json.dumps(payload.payload, sort_keys=True) if payload.payload else None,
                timestamp,
            ),
        )

    return create_event(
        "survive" if payload.score >= 60 else "storm",
        f"[SCORE] {agent.agentName} returned {payload.score:.1f} on {payload.challenge_id}",
        agent.id,
        {"score": payload.score, "latency_ms": payload.latency_ms, "outcome": payload.outcome},
    )


def update_agent_status(
    agent_id: str,
    status: str,
    survival_probability: int | None = None,
    eliminations: int | None = None,
    relic_rank: int | None = None,
) -> tuple[Agent | None, ArenaEvent | None]:
    agent = get_agent(agent_id)
    if not agent:
        return None, None

    fields = ["status = ?"]
    values: list[object] = [status]
    if survival_probability is not None:
        fields.append("survival_probability = ?")
        values.append(survival_probability)
    if eliminations is not None:
        fields.append("eliminations = ?")
        values.append(eliminations)
    if relic_rank is not None:
        fields.append("relic_rank = ?")
        values.append(relic_rank)

    values.append(agent_id)
    with db() as connection:
        connection.execute(
            f"UPDATE agents SET {', '.join(fields)} WHERE id = ?",
            values,
        )
        row = connection.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()

    updated = _agent_from_row(row)
    event_type = "elim" if status == "eliminated" else "ascend" if status == "ascended" else "storm"
    event = create_event(
        event_type,
        f"[ADMIN] {updated.agentName} status set to {updated.status}",
        updated.id,
        {
            "survival_probability": updated.survivalProbability,
            "eliminations": updated.eliminations,
            "relic_rank": updated.relicRank,
        },
    )
    return updated, event
