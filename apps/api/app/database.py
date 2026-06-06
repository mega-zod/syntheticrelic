from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
import sqlite3

from .settings import get_settings


def _connect() -> sqlite3.Connection:
    db_path = Path(get_settings().database_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    connection = _connect()
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_db() -> None:
    with db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS agents (
              id TEXT PRIMARY KEY,
              agent_name TEXT NOT NULL UNIQUE,
              endpoint TEXT NOT NULL UNIQUE,
              model TEXT NOT NULL,
              signature TEXT NOT NULL,
              manifesto TEXT NOT NULL,
              token TEXT NOT NULL,
              sector TEXT NOT NULL,
              status TEXT NOT NULL,
              survival_probability INTEGER NOT NULL,
              eliminations INTEGER NOT NULL DEFAULT 0,
              relic_rank INTEGER,
              registered_at TEXT NOT NULL,
              last_seen_at TEXT
            );

            CREATE TABLE IF NOT EXISTS arena_events (
              id TEXT PRIMARY KEY,
              type TEXT NOT NULL,
              text TEXT NOT NULL,
              agent_id TEXT,
              created_at TEXT NOT NULL,
              payload TEXT,
              FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS challenge_results (
              id TEXT PRIMARY KEY,
              agent_id TEXT NOT NULL,
              challenge_id TEXT NOT NULL,
              score REAL NOT NULL,
              latency_ms INTEGER NOT NULL,
              outcome TEXT NOT NULL,
              payload TEXT,
              created_at TEXT NOT NULL,
              FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS arena_settings (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              phase TEXT NOT NULL,
              registration_open INTEGER NOT NULL,
              max_agents INTEGER NOT NULL,
              whitelist_slots INTEGER NOT NULL,
              danger_level INTEGER NOT NULL,
              countdown_target TEXT,
              engine_running INTEGER NOT NULL DEFAULT 0,
              tick_interval_seconds INTEGER NOT NULL DEFAULT 12,
              elimination_intensity INTEGER NOT NULL DEFAULT 1,
              last_tick_at TEXT,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS whitelist_entries (
              id TEXT PRIMARY KEY,
              agent_id TEXT,
              wallet_address TEXT UNIQUE,
              chain TEXT NOT NULL DEFAULT 'evm',
              status TEXT NOT NULL,
              relic_rank INTEGER,
              granted_at TEXT,
              claimed_at TEXT,
              tx_hash TEXT,
              notes TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS agent_challenges (
              id TEXT PRIMARY KEY,
              agent_name TEXT NOT NULL,
              wallet_address TEXT NOT NULL,
              token_hash TEXT NOT NULL,
              expires_at TEXT NOT NULL,
              consumed_at TEXT,
              created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_agent_challenges_wallet
              ON agent_challenges(wallet_address, expires_at);

            CREATE TABLE IF NOT EXISTS admin_audit_logs (
              id TEXT PRIMARY KEY,
              action TEXT NOT NULL,
              actor TEXT,
              target TEXT,
              detail TEXT,
              created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at
              ON admin_audit_logs(created_at);
            """
        )
        _ensure_arena_settings_columns(connection)
        connection.execute(
            """
            INSERT OR IGNORE INTO arena_settings (
              id, phase, registration_open, max_agents, whitelist_slots,
              danger_level, countdown_target, engine_running, tick_interval_seconds,
              elimination_intensity, last_tick_at, updated_at
            )
            VALUES (
              1, 'registration_open', 1, 247, 32, 78, '2026-06-01T21:00:00-07:00',
              0, 12, 1, NULL, datetime('now')
            )
            """
        )


def _ensure_arena_settings_columns(connection: sqlite3.Connection) -> None:
    columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(arena_settings)").fetchall()
    }
    migrations = {
        "engine_running": "ALTER TABLE arena_settings ADD COLUMN engine_running INTEGER NOT NULL DEFAULT 0",
        "tick_interval_seconds": "ALTER TABLE arena_settings ADD COLUMN tick_interval_seconds INTEGER NOT NULL DEFAULT 12",
        "elimination_intensity": "ALTER TABLE arena_settings ADD COLUMN elimination_intensity INTEGER NOT NULL DEFAULT 1",
        "last_tick_at": "ALTER TABLE arena_settings ADD COLUMN last_tick_at TEXT",
    }
    for column, statement in migrations.items():
        if column not in columns:
            connection.execute(statement)
