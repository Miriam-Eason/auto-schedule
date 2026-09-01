-- Phase 0 baseline schema.
-- Business tables (teachers, semesters, schedules, …) are added in later phases.

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Development persistence probe only. Not a business ledger table.
CREATE TABLE IF NOT EXISTS probe_events (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_probe_events_created_at
    ON probe_events (created_at);
