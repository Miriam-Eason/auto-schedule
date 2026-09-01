-- Phase 2: monthly schedules, department duty dates, and special-return derivation.

CREATE TABLE monthly_schedules (
    id TEXT PRIMARY KEY,
    semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
    year_month TEXT NOT NULL CHECK (
        length(year_month) = 7
        AND substr(year_month, 5, 1) = '-'
    ),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED')),
    generation_revision INTEGER NOT NULL DEFAULT 0 CHECK (generation_revision >= 0),
    input_fingerprint TEXT,
    confirmed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (semester_id, year_month),
    CHECK (
        (status = 'DRAFT' AND confirmed_at IS NULL)
        OR (status = 'CONFIRMED' AND confirmed_at IS NOT NULL)
    )
);

CREATE TABLE duty_dates (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL REFERENCES monthly_schedules(id) ON DELETE CASCADE,
    duty_date TEXT NOT NULL CHECK (
        length(duty_date) = 10
        AND substr(duty_date, 5, 1) = '-'
        AND substr(duty_date, 8, 1) = '-'
    ),
    department_mode TEXT NOT NULL CHECK (
        department_mode IN ('NONE', 'NORMAL', 'SPECIAL_MANUAL')
    ),
    is_special_return INTEGER CHECK (is_special_return IN (0, 1)),
    special_return_source TEXT NOT NULL CHECK (
        special_return_source IN ('AUTO', 'MANUAL', 'PENDING_CONFIRMATION')
    ),
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (schedule_id, duty_date),
    CHECK (
        (is_special_return IS NULL AND special_return_source = 'PENDING_CONFIRMATION')
        OR
        (is_special_return IN (0, 1) AND special_return_source IN ('AUTO', 'MANUAL'))
    )
);

CREATE INDEX idx_monthly_schedules_semester
    ON monthly_schedules (semester_id, year_month);
CREATE INDEX idx_duty_dates_schedule
    ON duty_dates (schedule_id, duty_date);
CREATE INDEX idx_duty_dates_date
    ON duty_dates (duty_date, department_mode);
