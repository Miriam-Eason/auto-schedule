-- Phase 3: manual assignments, monthly exclusions, and the unified duty ledger.

CREATE TABLE assignments (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL REFERENCES monthly_schedules(id) ON DELETE CASCADE,
    duty_date_id TEXT NOT NULL REFERENCES duty_dates(id) ON DELETE CASCADE,
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
    semester_teacher_id TEXT NOT NULL REFERENCES semester_teachers(id) ON DELETE RESTRICT,
    duty_type TEXT NOT NULL CHECK (
        duty_type IN (
            'NORMAL_DUTY', 'BIG_DUTY', 'HEAD_TEACHER_GROUP',
            'TERM_SPECIAL', 'LEADER', 'OTHER'
        )
    ),
    source TEXT NOT NULL CHECK (source IN ('MANUAL', 'AUTO')),
    locked INTEGER NOT NULL CHECK (locked IN (0, 1)),
    occupies_department_slot INTEGER NOT NULL CHECK (occupies_department_slot IN (0, 1)),
    slot_floor TEXT CHECK (slot_floor IN ('LOWER', 'UPPER')),
    explanation_json TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (duty_date_id, teacher_id),
    CHECK (
        (occupies_department_slot = 1 AND slot_floor IS NOT NULL)
        OR (occupies_department_slot = 0 AND slot_floor IS NULL)
    ),
    CHECK (
        (source = 'MANUAL' AND locked = 1)
        OR (source = 'AUTO' AND locked = 0)
    )
);

CREATE UNIQUE INDEX idx_assignments_department_slot
    ON assignments (duty_date_id, slot_floor)
    WHERE occupies_department_slot = 1;
CREATE INDEX idx_assignments_schedule
    ON assignments (schedule_id, duty_date_id, teacher_id);
CREATE INDEX idx_assignments_teacher
    ON assignments (teacher_id, duty_date_id);

CREATE TABLE monthly_exclusions (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL REFERENCES monthly_schedules(id) ON DELETE CASCADE,
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
    reason TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (schedule_id, teacher_id)
);

CREATE INDEX idx_monthly_exclusions_schedule
    ON monthly_exclusions (schedule_id, teacher_id);

-- Cross-table invariants cannot be expressed as ordinary SQLite CHECK constraints.
CREATE TRIGGER assignments_validate_insert
BEFORE INSERT ON assignments
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1
        FROM duty_dates dd
        JOIN monthly_schedules ms ON ms.id = dd.schedule_id
        JOIN semester_teachers st ON st.semester_id = ms.semester_id
        WHERE dd.id = NEW.duty_date_id
          AND dd.schedule_id = NEW.schedule_id
          AND st.id = NEW.semester_teacher_id
          AND st.teacher_id = NEW.teacher_id
    ) THEN RAISE(ABORT, 'assignment schedule, date, and semester teacher must match') END;

    SELECT CASE WHEN NEW.occupies_department_slot = 1 AND NOT EXISTS (
        SELECT 1 FROM duty_dates
        WHERE id = NEW.duty_date_id AND department_mode = 'NORMAL'
    ) THEN RAISE(ABORT, 'only normal department dates have floor slots') END;
END;

CREATE TRIGGER monthly_exclusions_validate_insert
BEFORE INSERT ON monthly_exclusions
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1
        FROM monthly_schedules ms
        JOIN semester_teachers st ON st.semester_id = ms.semester_id
        WHERE ms.id = NEW.schedule_id AND st.teacher_id = NEW.teacher_id
    ) THEN RAISE(ABORT, 'excluded teacher must belong to the schedule semester') END;
END;
