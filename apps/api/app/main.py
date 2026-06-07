import asyncio
from contextlib import suppress
from datetime import UTC, datetime, timedelta
import hmac
import secrets
import time

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .database import init_db
from .realtime import arena_hub
from .repository import (
    RegistrationRejected,
    WalletRejected,
    arena_totals,
    check_whitelist_wallet,
    claim_registration_intent,
    create_admin_audit,
    create_event,
    create_database_backup,
    create_registration_intent,
    clear_test_data,
    delete_whitelist_entry,
    find_whitelist_entry_by_wallet,
    get_arena_settings,
    issue_agent_challenge,
    list_admin_audit,
    list_agents,
    list_events,
    list_whitelist_entries,
    record_challenge_result,
    register_agent,
    run_arena_tick,
    submit_agent_wallet,
    update_agent_status,
    update_arena_settings,
    update_heartbeat,
    upsert_whitelist_entry,
    verify_database_backup,
)
from .schemas import (
    AdminAgentStatusPayload,
    AdminAgentStatusResponse,
    AdminArenaSettingsPayload,
    AdminArenaSettingsResponse,
    AdminAuditResponse,
    AdminClearTestDataPayload,
    AdminClearTestDataResponse,
    AdminEngineTickResponse,
    AdminEventPayload,
    AdminEventResponse,
    AdminLoginPayload,
    AdminLoginResponse,
    AdminRestoreTestResponse,
    AdminSnapshotResponse,
    AdminWhitelistDeleteResponse,
    AdminWhitelistListResponse,
    AdminWhitelistLookupResponse,
    AdminWhitelistPayload,
    AdminWhitelistResponse,
    AgentChallengePayload,
    AgentChallengeResponse,
    ArenaResponse,
    AgentsResponse,
    ChallengeResultPayload,
    ChallengeResultResponse,
    EventsResponse,
    HeartbeatPayload,
    HeartbeatResponse,
    RegistrationIntentClaimPayload,
    RegistrationIntentPayload,
    RegistrationIntentResponse,
    RegisterPayload,
    RegisterResponse,
    WhitelistCheckResponse,
    WalletSubmitPayload,
    WalletSubmitResponse,
)
from .settings import get_settings

app = FastAPI(
    title="Synthetic Relic Arena API",
    version="0.1.0",
    description="Autonomous AI-agent registration, heartbeat, event, and arena stream API.",
)

settings = get_settings()
engine_task: asyncio.Task | None = None
backup_task: asyncio.Task | None = None
admin_sessions: dict[str, datetime] = {}
rate_limit_hits: dict[str, list[float]] = {}
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    if settings.enforce_https:
        forwarded_proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        if forwarded_proto != "https":
            return JSONResponse(
                {"detail": "https_required"},
                status_code=403,
                headers={"Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload"},
            )

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > settings.max_body_bytes:
                return JSONResponse({"detail": "request_body_too_large"}, status_code=413)
        except ValueError:
            return JSONResponse({"detail": "invalid_content_length"}, status_code=400)

    if request.method != "OPTIONS" and settings.rate_limit_max_requests > 0:
        now = time.monotonic()
        window = max(settings.rate_limit_window_seconds, 1)
        client = request.client.host if request.client else "unknown"
        key = f"{client}:{request.url.path}"
        hits = [hit for hit in rate_limit_hits.get(key, []) if now - hit < window]
        if len(hits) >= settings.rate_limit_max_requests:
            return JSONResponse(
                {"detail": "rate_limited"},
                status_code=429,
                headers={"Retry-After": str(window)},
            )
        hits.append(now)
        rate_limit_hits[key] = hits

    response = await call_next(request)
    if settings.enforce_https:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


async def broadcast_engine_state(
    current_settings,
    changed_agents,
    events,
) -> None:
    for event in events:
        await arena_hub.broadcast({"kind": "event", "event": event.model_dump()})
    if changed_agents:
        await arena_hub.broadcast(
            {"kind": "agents", "agents": [agent.model_dump() for agent in changed_agents]}
        )
    await arena_hub.broadcast({"kind": "settings", "settings": current_settings.model_dump()})


async def arena_engine_loop() -> None:
    while True:
        current_settings = get_arena_settings()
        if current_settings.engineRunning:
            tick_settings, changed_agents, events = run_arena_tick()
            if changed_agents or events:
                await broadcast_engine_state(tick_settings, changed_agents, events)
        await asyncio.sleep(max(current_settings.tickIntervalSeconds, 2))


async def backup_scheduler_loop() -> None:
    interval_seconds = max(settings.backup_interval_minutes, 1) * 60
    while True:
        await asyncio.sleep(interval_seconds)
        backup_path = create_database_backup()
        create_admin_audit(
            "system.backup.scheduled",
            "system",
            str(backup_path),
            {"filename": backup_path.name, "interval_minutes": settings.backup_interval_minutes},
        )


@app.on_event("startup")
async def startup() -> None:
    global engine_task, backup_task
    init_db()
    if not list_events(limit=1):
        create_event("storm", "[WARN] Registry online - registration window open")
    engine_task = asyncio.create_task(arena_engine_loop())
    if settings.backup_interval_minutes > 0:
        backup_task = asyncio.create_task(backup_scheduler_loop())


@app.on_event("shutdown")
async def shutdown() -> None:
    if engine_task:
        engine_task.cancel()
        with suppress(asyncio.CancelledError):
            await engine_task
    if backup_task:
        backup_task.cancel()
        with suppress(asyncio.CancelledError):
            await backup_task


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true", "system": "synthetic-relic"}


def _client_actor(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _session_valid(session_token: str | None) -> bool:
    if not session_token:
        return False
    expires_at = admin_sessions.get(session_token)
    if not expires_at:
        return False
    if expires_at <= datetime.now(UTC):
        admin_sessions.pop(session_token, None)
        return False
    return True


def require_admin(request: Request) -> None:
    x_admin_token = request.headers.get("x-admin-token")
    x_admin_session = request.headers.get("x-admin-session")
    if not settings.admin_token:
        if settings.allow_insecure_admin:
            return
        raise HTTPException(status_code=503, detail="admin_token_not_configured")

    if _session_valid(x_admin_session):
        return

    if x_admin_token and hmac.compare_digest(x_admin_token, settings.admin_token):
        return

    raise HTTPException(status_code=401, detail="admin_session_required")


@app.get("/admin/auth/check")
def admin_auth_check(request: Request) -> dict[str, str]:
    require_admin(request)
    return {"ok": "true", "mode": "admin"}


@app.post("/admin/session", response_model=AdminLoginResponse)
def admin_session(payload: AdminLoginPayload, request: Request) -> AdminLoginResponse:
    if not settings.admin_token:
        if settings.allow_insecure_admin:
            expires_at = datetime.now(UTC) + timedelta(seconds=settings.admin_session_ttl_seconds)
            session_token = secrets.token_urlsafe(32)
            admin_sessions[session_token] = expires_at
            create_admin_audit("admin.session.dev", _client_actor(request), None, {"mode": "insecure"})
            return AdminLoginResponse(
                ok=True,
                sessionToken=session_token,
                expiresAt=expires_at.isoformat().replace("+00:00", "Z"),
            )
        raise HTTPException(status_code=503, detail="admin_token_not_configured")

    if not hmac.compare_digest(payload.token, settings.admin_token):
        create_admin_audit("admin.session.rejected", _client_actor(request), None, None)
        raise HTTPException(status_code=401, detail="admin_token_invalid")

    expires_at = datetime.now(UTC) + timedelta(seconds=settings.admin_session_ttl_seconds)
    session_token = secrets.token_urlsafe(32)
    admin_sessions[session_token] = expires_at
    create_admin_audit(
        "admin.session.created",
        _client_actor(request),
        None,
        {"expires_at": expires_at.isoformat().replace("+00:00", "Z")},
    )
    return AdminLoginResponse(
        ok=True,
        sessionToken=session_token,
        expiresAt=expires_at.isoformat().replace("+00:00", "Z"),
    )


@app.post("/register", response_model=RegisterResponse, status_code=201)
async def register(payload: RegisterPayload) -> RegisterResponse:
    try:
        agent, event = register_agent(payload)
    except RegistrationRejected as error:
        raise HTTPException(status_code=403, detail=error.detail) from error
    except WalletRejected as error:
        raise HTTPException(status_code=422, detail=error.detail) from error

    settings = get_arena_settings()
    await arena_hub.broadcast({"kind": "event", "event": event.model_dump()})
    await arena_hub.broadcast({"kind": "agents", "agents": [agent.model_dump()]})
    return RegisterResponse(
        agent=agent,
        token=agent.token,
        agent_id=agent.id,
        arena=agent.sector,
        phase=settings.phase,
    )


@app.post("/agent/challenge", response_model=AgentChallengeResponse)
def agent_challenge(payload: AgentChallengePayload) -> AgentChallengeResponse:
    try:
        return issue_agent_challenge(payload)
    except WalletRejected as error:
        raise HTTPException(status_code=422, detail=error.detail) from error


@app.post("/register/intent", response_model=RegistrationIntentResponse, status_code=201)
def registration_intent(payload: RegistrationIntentPayload) -> RegistrationIntentResponse:
    try:
        return create_registration_intent(payload)
    except WalletRejected as error:
        raise HTTPException(status_code=422, detail=error.detail) from error


@app.post("/register/intent/{intent_id}/claim", response_model=RegisterResponse, status_code=201)
async def registration_intent_claim(
    intent_id: str,
    payload: RegistrationIntentClaimPayload,
) -> RegisterResponse:
    try:
        agent, event = claim_registration_intent(intent_id, payload)
    except RegistrationRejected as error:
        raise HTTPException(status_code=403, detail=error.detail) from error
    except WalletRejected as error:
        raise HTTPException(status_code=422, detail=error.detail) from error

    settings = get_arena_settings()
    await arena_hub.broadcast({"kind": "event", "event": event.model_dump()})
    await arena_hub.broadcast({"kind": "agents", "agents": [agent.model_dump()]})
    return RegisterResponse(
        agent=agent,
        token=agent.token,
        agent_id=agent.id,
        arena=agent.sector,
        phase=settings.phase,
    )


@app.get("/agents", response_model=AgentsResponse)
def agents() -> AgentsResponse:
    current_agents = list_agents()
    return AgentsResponse(
        agents=current_agents,
        total=len(current_agents),
        phase=get_arena_settings().phase,
    )


@app.get("/arena", response_model=ArenaResponse)
def arena() -> ArenaResponse:
    current_agents = list_agents()
    return ArenaResponse(settings=get_arena_settings(), totals=arena_totals(current_agents))


@app.post("/heartbeat", response_model=HeartbeatResponse)
async def heartbeat(payload: HeartbeatPayload) -> HeartbeatResponse:
    agent, event = update_heartbeat(payload.agent_id, payload.token, payload.status)
    if not agent or not event:
        raise HTTPException(status_code=401, detail="agent_not_found_or_token_invalid")

    await arena_hub.broadcast({"kind": "event", "event": event.model_dump()})
    await arena_hub.broadcast({"kind": "agents", "agents": [agent.model_dump()]})
    return HeartbeatResponse(ok=True, agent=agent)


@app.get("/events", response_model=EventsResponse)
def events(limit: int = 30) -> EventsResponse:
    bounded_limit = max(1, min(limit, 100))
    arena_events = list_events(limit=bounded_limit)
    return EventsResponse(events=arena_events, total=len(arena_events))


@app.get("/whitelist/check/{wallet_address}", response_model=WhitelistCheckResponse)
def whitelist_check(wallet_address: str) -> WhitelistCheckResponse:
    try:
        return check_whitelist_wallet(wallet_address)
    except WalletRejected as error:
        raise HTTPException(status_code=422, detail=error.detail) from error


@app.post("/challenge/result", response_model=ChallengeResultResponse)
async def challenge_result(payload: ChallengeResultPayload) -> ChallengeResultResponse:
    event = record_challenge_result(payload)
    if not event:
        raise HTTPException(status_code=401, detail="agent_not_found_or_token_invalid")

    await arena_hub.broadcast({"kind": "event", "event": event.model_dump()})
    return ChallengeResultResponse(ok=True, event=event)


@app.get("/admin/snapshot", response_model=AdminSnapshotResponse)
def admin_snapshot(request: Request) -> AdminSnapshotResponse:
    require_admin(request)
    current_agents = list_agents()
    current_events = list_events(limit=80)
    whitelist = list_whitelist_entries()
    settings = get_arena_settings()
    totals = arena_totals(current_agents)
    totals["events"] = len(current_events)
    return AdminSnapshotResponse(
        agents=current_agents,
        events=current_events,
        whitelist=whitelist,
        settings=settings,
        totals=totals,
        phase=settings.phase,
    )


@app.post("/admin/event", response_model=AdminEventResponse)
async def admin_event(
    payload: AdminEventPayload,
    request: Request,
) -> AdminEventResponse:
    require_admin(request)
    event = create_event(payload.type, payload.text, payload.agent_id, payload.payload)
    create_admin_audit(
        "admin.event.create",
        _client_actor(request),
        payload.agent_id,
        {"type": payload.type, "text": payload.text},
    )
    await arena_hub.broadcast({"kind": "event", "event": event.model_dump()})
    return AdminEventResponse(ok=True, event=event)


@app.get("/admin/whitelist", response_model=AdminWhitelistListResponse)
def admin_whitelist(request: Request) -> AdminWhitelistListResponse:
    require_admin(request)
    entries = list_whitelist_entries()
    return AdminWhitelistListResponse(entries=entries, total=len(entries))


@app.get("/admin/whitelist/find/{wallet_address}", response_model=AdminWhitelistLookupResponse)
def admin_whitelist_find(
    wallet_address: str,
    request: Request,
) -> AdminWhitelistLookupResponse:
    require_admin(request)
    try:
        entry = find_whitelist_entry_by_wallet(wallet_address)
    except WalletRejected as error:
        raise HTTPException(status_code=422, detail=error.detail) from error
    return AdminWhitelistLookupResponse(ok=True, entry=entry)


@app.post("/admin/whitelist", response_model=AdminWhitelistResponse)
async def admin_whitelist_upsert(
    payload: AdminWhitelistPayload,
    request: Request,
) -> AdminWhitelistResponse:
    require_admin(request)
    try:
        entry, event = upsert_whitelist_entry(
            payload.id,
            payload.agent_id,
            payload.wallet_address,
            payload.chain,
            payload.status,
            payload.relic_rank,
            payload.tx_hash,
            payload.notes,
        )
    except WalletRejected as error:
        raise HTTPException(status_code=422, detail=error.detail) from error

    await arena_hub.broadcast({"kind": "event", "event": event.model_dump()})
    create_admin_audit(
        "admin.whitelist.upsert",
        _client_actor(request),
        entry.id,
        {"wallet": entry.walletAddress, "status": entry.status, "agent_id": entry.agentId},
    )
    return AdminWhitelistResponse(ok=True, entry=entry, event=event)


@app.delete("/admin/whitelist/{entry_id}", response_model=AdminWhitelistDeleteResponse)
async def admin_whitelist_delete(
    entry_id: str,
    request: Request,
) -> AdminWhitelistDeleteResponse:
    require_admin(request)
    deleted = delete_whitelist_entry(entry_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="whitelist_entry_not_found")

    entry, event = deleted
    await arena_hub.broadcast({"kind": "event", "event": event.model_dump()})
    create_admin_audit(
        "admin.whitelist.delete",
        _client_actor(request),
        entry.id,
        {"wallet": entry.walletAddress, "status": entry.status, "agent_id": entry.agentId},
    )
    return AdminWhitelistDeleteResponse(ok=True, entry=entry, event=event)


@app.post("/wallet/submit", response_model=WalletSubmitResponse)
async def wallet_submit(payload: WalletSubmitPayload) -> WalletSubmitResponse:
    try:
        entry, event = submit_agent_wallet(payload.agent_id, payload.token, payload.wallet_address)
    except WalletRejected as error:
        raise HTTPException(status_code=403, detail=error.detail) from error

    await arena_hub.broadcast({"kind": "event", "event": event.model_dump()})
    return WalletSubmitResponse(ok=True, entry=entry)


@app.post("/admin/agent-status", response_model=AdminAgentStatusResponse)
async def admin_agent_status(
    payload: AdminAgentStatusPayload,
    request: Request,
) -> AdminAgentStatusResponse:
    require_admin(request)
    agent, event = update_agent_status(
        payload.agent_id,
        payload.status,
        payload.survival_probability,
        payload.eliminations,
        payload.relic_rank,
    )
    if not agent or not event:
        raise HTTPException(status_code=404, detail="agent_not_found")

    await arena_hub.broadcast({"kind": "event", "event": event.model_dump()})
    await arena_hub.broadcast({"kind": "agents", "agents": [agent.model_dump()]})
    create_admin_audit(
        "admin.agent.status",
        _client_actor(request),
        agent.id,
        {"status": agent.status, "survival_probability": agent.survivalProbability},
    )
    return AdminAgentStatusResponse(ok=True, agent=agent, event=event)


@app.post("/admin/arena-settings", response_model=AdminArenaSettingsResponse)
async def admin_arena_settings(
    payload: AdminArenaSettingsPayload,
    request: Request,
) -> AdminArenaSettingsResponse:
    require_admin(request)
    settings, event = update_arena_settings(
        payload.phase,
        payload.registration_open,
        payload.max_agents,
        payload.whitelist_slots,
        payload.danger_level,
        payload.countdown_target,
        payload.engine_running,
        payload.tick_interval_seconds,
        payload.elimination_intensity,
    )
    await arena_hub.broadcast({"kind": "settings", "settings": settings.model_dump()})
    await arena_hub.broadcast({"kind": "event", "event": event.model_dump()})
    create_admin_audit(
        "admin.arena.settings",
        _client_actor(request),
        "arena_settings",
        payload.model_dump(exclude_none=True),
    )
    return AdminArenaSettingsResponse(ok=True, settings=settings, event=event)


@app.post("/admin/engine-tick", response_model=AdminEngineTickResponse)
async def admin_engine_tick(
    request: Request,
) -> AdminEngineTickResponse:
    require_admin(request)
    settings, changed_agents, events = run_arena_tick(force=True)
    await broadcast_engine_state(settings, changed_agents, events)
    current_agents = list_agents()
    create_admin_audit(
        "admin.engine.tick",
        _client_actor(request),
        "arena_engine",
        {"events": len(events), "changed_agents": len(changed_agents)},
    )
    return AdminEngineTickResponse(
        ok=True,
        settings=settings,
        agents=current_agents,
        events=events,
        totals=arena_totals(current_agents),
    )


@app.get("/admin/backup")
def admin_backup(request: Request) -> FileResponse:
    require_admin(request)
    backup_path = create_database_backup()
    create_admin_audit(
        "admin.backup.create",
        _client_actor(request),
        str(backup_path),
        {"filename": backup_path.name},
    )
    return FileResponse(
        backup_path,
        filename=backup_path.name,
        media_type="application/vnd.sqlite3",
    )


@app.post("/admin/backup/restore-test", response_model=AdminRestoreTestResponse)
def admin_backup_restore_test(request: Request) -> AdminRestoreTestResponse:
    require_admin(request)
    backup_path, integrity, table_counts = verify_database_backup()
    create_admin_audit(
        "admin.backup.restore_test",
        _client_actor(request),
        str(backup_path),
        {"integrity": integrity, "table_counts": table_counts},
    )
    return AdminRestoreTestResponse(
        ok=integrity == "ok",
        backupPath=str(backup_path),
        integrity=integrity,
        tableCounts=table_counts,
    )


@app.get("/admin/audit", response_model=AdminAuditResponse)
def admin_audit(request: Request, limit: int = 100) -> AdminAuditResponse:
    require_admin(request)
    entries = list_admin_audit(limit)
    return AdminAuditResponse(entries=entries, total=len(entries))


@app.post("/admin/maintenance/clear-test-data", response_model=AdminClearTestDataResponse)
async def admin_clear_test_data(
    payload: AdminClearTestDataPayload,
    request: Request,
) -> AdminClearTestDataResponse:
    require_admin(request)
    required_confirmation = "CLEAR ALL DATA" if payload.include_whitelist else "CLEAR TEST DATA"
    if payload.confirmation != required_confirmation:
        raise HTTPException(status_code=400, detail="confirmation_required")

    deleted, event = clear_test_data(payload.include_whitelist)
    await arena_hub.broadcast({"kind": "event", "event": event.model_dump()})
    await arena_hub.broadcast({"kind": "agents", "agents": []})
    await arena_hub.broadcast({"kind": "settings", "settings": get_arena_settings().model_dump()})
    create_admin_audit(
        "admin.maintenance.clear_test_data",
        _client_actor(request),
        "database",
        {"include_whitelist": payload.include_whitelist, "deleted": deleted},
    )
    return AdminClearTestDataResponse(ok=True, deleted=deleted, event=event)


@app.websocket("/ws/arena")
async def arena_socket(websocket: WebSocket) -> None:
    await arena_hub.connect(websocket)
    try:
        await websocket.send_json(
            {
                "kind": "snapshot",
                "agents": [agent.model_dump() for agent in list_agents()],
                "events": [event.model_dump() for event in list_events(limit=30)],
                "settings": get_arena_settings().model_dump(),
            }
        )
        while True:
            message = await websocket.receive_json()
            if message.get("kind") == "ping":
                await websocket.send_json({"kind": "pong"})
    except WebSocketDisconnect:
        await arena_hub.disconnect(websocket)
