-- Phase 1: semester, teacher master data, and semester snapshots.

CREATE TABLE semesters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
    start_date TEXT NOT NULL CHECK (
        length(start_date) = 10
        AND substr(start_date, 5, 1) = '-'
        AND substr(start_date, 8, 1) = '-'
    ),
    end_date TEXT NOT NULL CHECK (
        length(end_date) = 10
        AND substr(end_date, 5, 1) = '-'
        AND substr(end_date, 8, 1) = '-'
        AND end_date >= start_date
    ),
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CLOSED')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE teachers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE semester_teachers (
    id TEXT PRIMARY KEY,
    semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
    floor_group TEXT NOT NULL CHECK (floor_group IN ('LOWER', 'UPPER')),
    is_major_duty INTEGER NOT NULL DEFAULT 0 CHECK (is_major_duty IN (0, 1)),
    participates INTEGER NOT NULL DEFAULT 1 CHECK (participates IN (0, 1)),
    initial_fairness_count INTEGER NOT NULL DEFAULT 0 CHECK (initial_fairness_count >= 0),
    display_name_snapshot TEXT NOT NULL CHECK (length(trim(display_name_snapshot)) > 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (semester_id, teacher_id)
);

CREATE INDEX idx_semesters_dates ON semesters (start_date, end_date);
CREATE INDEX idx_teachers_name ON teachers (name);
CREATE INDEX idx_semester_teachers_semester ON semester_teachers (semester_id);
CREATE INDEX idx_semester_teachers_teacher ON semester_teachers (teacher_id);
