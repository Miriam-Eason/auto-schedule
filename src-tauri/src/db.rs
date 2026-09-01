use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use rusqlite::{Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

const LATEST_SCHEMA_VERSION: i32 = 3;

struct Migration {
    version: i32,
    name: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "init",
        sql: include_str!("../migrations/001_init.sql"),
    },
    Migration {
        version: 2,
        name: "teachers_semesters",
        sql: include_str!("../migrations/002_teachers_semesters.sql"),
    },
    Migration {
        version: 3,
        name: "monthly_schedules",
        sql: include_str!("../migrations/003_monthly_schedules.sql"),
    },
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProbeEvent {
    pub id: String,
    pub message: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub path: String,
    pub schema_version: i32,
    pub app_version: String,
    pub integrity_ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Semester {
    pub id: String,
    pub name: String,
    pub start_date: String,
    pub end_date: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Teacher {
    pub id: String,
    pub name: String,
    pub active: bool,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SemesterTeacherView {
    pub id: String,
    pub semester_id: String,
    pub teacher_id: String,
    pub name: String,
    pub active: bool,
    pub note: Option<String>,
    pub floor_group: String,
    pub is_major_duty: bool,
    pub participates: bool,
    pub initial_fairness_count: i32,
    pub display_name_snapshot: String,
    pub actual_semester_count: i32,
    pub effective_semester_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSemesterRequest {
    pub id: String,
    pub name: String,
    pub start_date: String,
    pub end_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTeacherRequest {
    pub teacher_id: String,
    pub semester_teacher_id: String,
    pub semester_id: String,
    pub name: String,
    pub note: Option<String>,
    pub floor_group: String,
    pub is_major_duty: bool,
    pub participates: bool,
    pub initial_fairness_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportTeacherRow {
    pub teacher_id: Option<String>,
    pub new_teacher_id: String,
    pub semester_teacher_id: String,
    pub name: String,
    pub floor_group: String,
    pub is_major_duty: bool,
    pub initial_fairness_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportTeachersRequest {
    pub semester_id: String,
    pub rows: Vec<ImportTeacherRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub created_teachers: i32,
    pub matched_teachers: i32,
    pub semester_members: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MonthlySchedule {
    pub id: String,
    pub semester_id: String,
    pub year_month: String,
    pub status: String,
    pub generation_revision: i32,
    pub input_fingerprint: Option<String>,
    pub confirmed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DutyDate {
    pub id: String,
    pub schedule_id: String,
    pub duty_date: String,
    pub department_mode: String,
    pub is_special_return: Option<bool>,
    pub special_return_source: String,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMonthlyScheduleRequest {
    pub id: String,
    pub semester_id: String,
    pub year_month: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDutyDateRequest {
    pub id: String,
    pub schedule_id: String,
    pub duty_date: String,
    pub department_mode: String,
}

pub struct AppDb {
    conn: Mutex<Connection>,
    path: PathBuf,
}

impl AppDb {
    pub fn open(path: &Path) -> Result<Self, AppError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(path)?;
        conn.busy_timeout(Duration::from_millis(5_000))?;
        conn.pragma_update(None, "foreign_keys", true)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;

        let db = Self {
            conn: Mutex::new(conn),
            path: path.to_path_buf(),
        };
        db.migrate()?;

        let version = db.schema_version()?;
        if version != latest_schema_version() {
            return Err(AppError::Database(format!(
                "schema version {version} is not latest {}",
                latest_schema_version()
            )));
        }

        if !db.integrity_ok()? {
            return Err(AppError::Database(
                "SQLite integrity_check failed".to_string(),
            ));
        }

        Ok(db)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn schema_version(&self) -> Result<i32, AppError> {
        let conn = self.lock()?;
        current_version(&conn)
    }

    pub fn integrity_ok(&self) -> Result<bool, AppError> {
        let conn = self.lock()?;
        let result: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
        Ok(result.eq_ignore_ascii_case("ok"))
    }

    pub fn info(&self) -> Result<DatabaseInfo, AppError> {
        Ok(DatabaseInfo {
            path: self.path().to_string_lossy().into_owned(),
            schema_version: self.schema_version()?,
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            integrity_ok: self.integrity_ok()?,
        })
    }

    pub fn migrate(&self) -> Result<(), AppError> {
        let conn = self.lock()?;
        migrate_conn(&conn)
    }

    pub fn insert_probe(&self, event: &ProbeEvent) -> Result<(), AppError> {
        if event.id.trim().is_empty() {
            return Err(AppError::Invalid("probe id is required".into()));
        }
        if event.message.trim().is_empty() {
            return Err(AppError::Invalid("probe message is required".into()));
        }
        if event.created_at.trim().is_empty() {
            return Err(AppError::Invalid("probe createdAt is required".into()));
        }

        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO probe_events (id, message, created_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![event.id, event.message, event.created_at],
        )?;
        Ok(())
    }

    pub fn list_probe(&self) -> Result<Vec<ProbeEvent>, AppError> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, message, created_at
             FROM probe_events
             ORDER BY created_at DESC, id DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ProbeEvent {
                id: row.get(0)?,
                message: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?;

        let mut events = Vec::new();
        for row in rows {
            events.push(row?);
        }
        Ok(events)
    }

    pub fn list_semesters(&self) -> Result<Vec<Semester>, AppError> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, start_date, end_date, status, created_at, updated_at
             FROM semesters ORDER BY start_date DESC, id ASC",
        )?;
        let rows = stmt.query_map([], semester_from_row)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn create_semester(&self, request: &CreateSemesterRequest) -> Result<Semester, AppError> {
        validate_id(&request.id, "semester id")?;
        let name = required_text(&request.name, "semester name")?;
        validate_date_range(&request.start_date, &request.end_date)?;

        let conn = self.lock()?;
        reject_active_semester_overlap(&conn, None, &request.start_date, &request.end_date)?;
        conn.execute(
            "INSERT INTO semesters
             (id, name, start_date, end_date, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'ACTIVE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            rusqlite::params![request.id, name, request.start_date, request.end_date],
        )?;
        query_semester(&conn, &request.id)
    }

    pub fn set_semester_status(&self, id: &str, status: &str) -> Result<Semester, AppError> {
        if status != "ACTIVE" && status != "CLOSED" {
            return Err(AppError::Invalid(
                "semester status must be ACTIVE or CLOSED".into(),
            ));
        }
        let conn = self.lock()?;
        let semester = query_semester(&conn, id)?;
        if status == "ACTIVE" {
            reject_active_semester_overlap(
                &conn,
                Some(id),
                &semester.start_date,
                &semester.end_date,
            )?;
        }
        conn.execute(
            "UPDATE semesters SET status = ?2,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
            rusqlite::params![id, status],
        )?;
        query_semester(&conn, id)
    }

    pub fn selected_semester_id(&self) -> Result<Option<String>, AppError> {
        let conn = self.lock()?;
        Ok(conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = 'selected_semester_id'",
                [],
                |row| row.get(0),
            )
            .optional()?)
    }

    pub fn select_semester(&self, id: &str) -> Result<(), AppError> {
        let conn = self.lock()?;
        query_semester(&conn, id)?;
        conn.execute(
            "INSERT INTO app_settings (key, value, updated_at)
             VALUES ('selected_semester_id', ?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            [id],
        )?;
        Ok(())
    }

    pub fn list_teachers(&self) -> Result<Vec<Teacher>, AppError> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, active, note, created_at, updated_at
             FROM teachers ORDER BY name COLLATE NOCASE ASC, id ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Teacher {
                id: row.get(0)?,
                name: row.get(1)?,
                active: row.get(2)?,
                note: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn list_semester_teachers(
        &self,
        semester_id: &str,
    ) -> Result<Vec<SemesterTeacherView>, AppError> {
        let conn = self.lock()?;
        query_semester(&conn, semester_id)?;
        let mut stmt = conn.prepare(
            "SELECT st.id, st.semester_id, st.teacher_id, t.name, t.active, t.note,
                    st.floor_group, st.is_major_duty, st.participates,
                    st.initial_fairness_count, st.display_name_snapshot
             FROM semester_teachers st
             JOIN teachers t ON t.id = st.teacher_id
             WHERE st.semester_id = ?1
             ORDER BY t.name COLLATE NOCASE ASC, t.id ASC",
        )?;
        let rows = stmt.query_map([semester_id], semester_teacher_from_row)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn save_teacher(
        &self,
        request: &SaveTeacherRequest,
    ) -> Result<SemesterTeacherView, AppError> {
        validate_teacher_request(request)?;
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        require_editable_semester(&tx, &request.semester_id)?;
        let existing: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM teachers WHERE id = ?1)",
            [&request.teacher_id],
            |row| row.get(0),
        )?;
        let name = request.name.trim();
        let note = clean_optional(&request.note);
        if existing {
            tx.execute(
                "UPDATE teachers SET name = ?2, note = ?3,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
                rusqlite::params![request.teacher_id, name, note],
            )?;
        } else {
            tx.execute(
                "INSERT INTO teachers (id, name, active, note, created_at, updated_at)
                 VALUES (?1, ?2, 1, ?3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
                rusqlite::params![request.teacher_id, name, note],
            )?;
        }
        upsert_semester_teacher(
            &tx,
            &request.semester_teacher_id,
            &request.semester_id,
            &request.teacher_id,
            name,
            &request.floor_group,
            request.is_major_duty,
            request.participates,
            request.initial_fairness_count,
        )?;
        tx.commit()?;
        drop(conn);
        self.get_semester_teacher(&request.semester_id, &request.teacher_id)
    }

    pub fn set_teacher_active(&self, id: &str, active: bool) -> Result<Teacher, AppError> {
        let conn = self.lock()?;
        let changed = conn.execute(
            "UPDATE teachers SET active = ?2,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
            rusqlite::params![id, active],
        )?;
        if changed == 0 {
            return Err(AppError::Invalid("teacher not found".into()));
        }
        query_teacher(&conn, id)
    }

    pub fn import_teachers(
        &self,
        request: &ImportTeachersRequest,
    ) -> Result<ImportResult, AppError> {
        if request.rows.is_empty() {
            return Err(AppError::Invalid("import has no teacher rows".into()));
        }
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        require_editable_semester(&tx, &request.semester_id)?;
        let mut names = std::collections::HashSet::new();
        let mut created = 0;
        let mut matched = 0;
        for row in &request.rows {
            validate_import_row(row)?;
            let normalized = normalize_name(&row.name);
            if !names.insert(normalized) {
                return Err(AppError::Invalid(format!(
                    "duplicate import name: {}",
                    row.name.trim()
                )));
            }
            let teacher_id = if let Some(id) = &row.teacher_id {
                let existing = query_teacher(&tx, id)?;
                if normalize_name(&existing.name) != normalize_name(&row.name) {
                    return Err(AppError::Invalid(format!(
                        "matched teacher name changed: {}",
                        row.name.trim()
                    )));
                }
                matched += 1;
                id.as_str()
            } else {
                validate_id(&row.new_teacher_id, "new teacher id")?;
                tx.execute(
                    "INSERT INTO teachers (id, name, active, note, created_at, updated_at)
                     VALUES (?1, ?2, 1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                             strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
                    rusqlite::params![row.new_teacher_id, row.name.trim()],
                )?;
                created += 1;
                row.new_teacher_id.as_str()
            };
            upsert_semester_teacher(
                &tx,
                &row.semester_teacher_id,
                &request.semester_id,
                teacher_id,
                row.name.trim(),
                &row.floor_group,
                row.is_major_duty,
                true,
                row.initial_fairness_count,
            )?;
        }
        tx.commit()?;
        Ok(ImportResult {
            created_teachers: created,
            matched_teachers: matched,
            semester_members: request.rows.len() as i32,
        })
    }

    pub fn list_monthly_schedules(
        &self,
        semester_id: &str,
    ) -> Result<Vec<MonthlySchedule>, AppError> {
        let conn = self.lock()?;
        query_semester(&conn, semester_id)?;
        let mut stmt = conn.prepare(
            "SELECT id, semester_id, year_month, status, generation_revision,
                    input_fingerprint, confirmed_at, created_at, updated_at
             FROM monthly_schedules WHERE semester_id = ?1
             ORDER BY year_month ASC, id ASC",
        )?;
        let rows = stmt.query_map([semester_id], monthly_schedule_from_row)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn create_monthly_schedule(
        &self,
        request: &CreateMonthlyScheduleRequest,
    ) -> Result<MonthlySchedule, AppError> {
        validate_id(&request.id, "monthly schedule id")?;
        validate_year_month(&request.year_month)?;
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        let semester = query_semester(&tx, &request.semester_id)?;
        require_editable_semester(&tx, &request.semester_id)?;
        if !month_overlaps_range(
            &request.year_month,
            &semester.start_date,
            &semester.end_date,
        ) {
            return Err(AppError::Invalid(
                "schedule month must overlap the semester date range".into(),
            ));
        }
        tx.execute(
            "INSERT INTO monthly_schedules
             (id, semester_id, year_month, status, generation_revision, input_fingerprint,
              confirmed_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'DRAFT', 0, NULL, NULL,
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            rusqlite::params![request.id, request.semester_id, request.year_month],
        )?;
        recompute_automatic_special_returns(&tx)?;
        tx.commit()?;
        query_monthly_schedule(&conn, &request.id)
    }

    pub fn list_duty_dates(&self, schedule_id: &str) -> Result<Vec<DutyDate>, AppError> {
        let conn = self.lock()?;
        query_monthly_schedule(&conn, schedule_id)?;
        list_duty_dates_conn(&conn, schedule_id)
    }

    pub fn save_duty_date(&self, request: &SaveDutyDateRequest) -> Result<Vec<DutyDate>, AppError> {
        validate_id(&request.id, "duty date id")?;
        if request.department_mode != "NORMAL" && request.department_mode != "SPECIAL_MANUAL" {
            return Err(AppError::Invalid(
                "department mode must be NORMAL or SPECIAL_MANUAL".into(),
            ));
        }
        if !is_valid_business_date(&request.duty_date) {
            return Err(AppError::Invalid(
                "duty date must be a valid YYYY-MM-DD date".into(),
            ));
        }
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        let schedule = require_editable_schedule(&tx, &request.schedule_id)?;
        let semester = query_semester(&tx, &schedule.semester_id)?;
        if !request.duty_date.starts_with(&schedule.year_month)
            || request.duty_date.as_str() < semester.start_date.as_str()
            || request.duty_date.as_str() > semester.end_date.as_str()
        {
            return Err(AppError::Invalid(
                "duty date must belong to the schedule month and semester".into(),
            ));
        }
        tx.execute(
            "INSERT INTO duty_dates
             (id, schedule_id, duty_date, department_mode, is_special_return,
              special_return_source, note, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, NULL, 'PENDING_CONFIRMATION', NULL,
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             ON CONFLICT(schedule_id, duty_date) DO UPDATE SET
               department_mode = excluded.department_mode,
               updated_at = excluded.updated_at",
            rusqlite::params![
                request.id,
                request.schedule_id,
                request.duty_date,
                request.department_mode
            ],
        )?;
        recompute_automatic_special_returns(&tx)?;
        tx.commit()?;
        list_duty_dates_conn(&conn, &request.schedule_id)
    }

    pub fn delete_duty_date(
        &self,
        schedule_id: &str,
        duty_date: &str,
    ) -> Result<Vec<DutyDate>, AppError> {
        if !is_valid_business_date(duty_date) {
            return Err(AppError::Invalid("invalid duty date".into()));
        }
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        require_editable_schedule(&tx, schedule_id)?;
        let changed = tx.execute(
            "DELETE FROM duty_dates WHERE schedule_id = ?1 AND duty_date = ?2",
            rusqlite::params![schedule_id, duty_date],
        )?;
        if changed == 0 {
            return Err(AppError::Invalid("duty date not found".into()));
        }
        recompute_automatic_special_returns(&tx)?;
        tx.commit()?;
        list_duty_dates_conn(&conn, schedule_id)
    }

    pub fn set_special_return(
        &self,
        schedule_id: &str,
        duty_date: &str,
        value: Option<bool>,
    ) -> Result<Vec<DutyDate>, AppError> {
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        require_editable_schedule(&tx, schedule_id)?;
        let changed = match value {
            Some(value) => tx.execute(
                "UPDATE duty_dates SET is_special_return = ?3,
                 special_return_source = 'MANUAL',
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE schedule_id = ?1 AND duty_date = ?2 AND department_mode <> 'NONE'",
                rusqlite::params![schedule_id, duty_date, value],
            )?,
            None => tx.execute(
                "UPDATE duty_dates SET is_special_return = NULL,
                 special_return_source = 'PENDING_CONFIRMATION',
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE schedule_id = ?1 AND duty_date = ?2 AND department_mode <> 'NONE'",
                rusqlite::params![schedule_id, duty_date],
            )?,
        };
        if changed == 0 {
            return Err(AppError::Invalid("department duty date not found".into()));
        }
        recompute_automatic_special_returns(&tx)?;
        tx.commit()?;
        list_duty_dates_conn(&conn, schedule_id)
    }

    pub fn set_monthly_schedule_status(
        &self,
        id: &str,
        status: &str,
    ) -> Result<MonthlySchedule, AppError> {
        if status != "DRAFT" && status != "CONFIRMED" {
            return Err(AppError::Invalid(
                "schedule status must be DRAFT or CONFIRMED".into(),
            ));
        }
        let conn = self.lock()?;
        let schedule = query_monthly_schedule(&conn, id)?;
        require_editable_semester(&conn, &schedule.semester_id)?;
        if status == "CONFIRMED" {
            let pending: i32 = conn.query_row(
                "SELECT COUNT(*) FROM duty_dates
                 WHERE schedule_id = ?1 AND special_return_source = 'PENDING_CONFIRMATION'",
                [id],
                |row| row.get(0),
            )?;
            if pending > 0 {
                return Err(AppError::Invalid(
                    "resolve pending special-return dates before confirming the month".into(),
                ));
            }
        }
        conn.execute(
            "UPDATE monthly_schedules SET status = ?2,
             confirmed_at = CASE WHEN ?2 = 'CONFIRMED'
                 THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
            rusqlite::params![id, status],
        )?;
        query_monthly_schedule(&conn, id)
    }

    fn get_semester_teacher(
        &self,
        semester_id: &str,
        teacher_id: &str,
    ) -> Result<SemesterTeacherView, AppError> {
        let conn = self.lock()?;
        conn.query_row(
            "SELECT st.id, st.semester_id, st.teacher_id, t.name, t.active, t.note,
                    st.floor_group, st.is_major_duty, st.participates,
                    st.initial_fairness_count, st.display_name_snapshot
             FROM semester_teachers st JOIN teachers t ON t.id = st.teacher_id
             WHERE st.semester_id = ?1 AND st.teacher_id = ?2",
            rusqlite::params![semester_id, teacher_id],
            semester_teacher_from_row,
        )
        .map_err(Into::into)
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, AppError> {
        self.conn
            .lock()
            .map_err(|error| AppError::Database(format!("database lock poisoned: {error}")))
    }
}

fn semester_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Semester> {
    Ok(Semester {
        id: row.get(0)?,
        name: row.get(1)?,
        start_date: row.get(2)?,
        end_date: row.get(3)?,
        status: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn semester_teacher_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SemesterTeacherView> {
    let initial_fairness_count: i32 = row.get(9)?;
    Ok(SemesterTeacherView {
        id: row.get(0)?,
        semester_id: row.get(1)?,
        teacher_id: row.get(2)?,
        name: row.get(3)?,
        active: row.get(4)?,
        note: row.get(5)?,
        floor_group: row.get(6)?,
        is_major_duty: row.get(7)?,
        participates: row.get(8)?,
        initial_fairness_count,
        display_name_snapshot: row.get(10)?,
        actual_semester_count: 0,
        effective_semester_count: initial_fairness_count,
    })
}

fn query_semester(conn: &Connection, id: &str) -> Result<Semester, AppError> {
    conn.query_row(
        "SELECT id, name, start_date, end_date, status, created_at, updated_at
         FROM semesters WHERE id = ?1",
        [id],
        semester_from_row,
    )
    .optional()?
    .ok_or_else(|| AppError::Invalid("semester not found".into()))
}

fn query_teacher(conn: &Connection, id: &str) -> Result<Teacher, AppError> {
    conn.query_row(
        "SELECT id, name, active, note, created_at, updated_at FROM teachers WHERE id = ?1",
        [id],
        |row| {
            Ok(Teacher {
                id: row.get(0)?,
                name: row.get(1)?,
                active: row.get(2)?,
                note: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| AppError::Invalid("teacher not found".into()))
}

fn monthly_schedule_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<MonthlySchedule> {
    Ok(MonthlySchedule {
        id: row.get(0)?,
        semester_id: row.get(1)?,
        year_month: row.get(2)?,
        status: row.get(3)?,
        generation_revision: row.get(4)?,
        input_fingerprint: row.get(5)?,
        confirmed_at: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn duty_date_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DutyDate> {
    Ok(DutyDate {
        id: row.get(0)?,
        schedule_id: row.get(1)?,
        duty_date: row.get(2)?,
        department_mode: row.get(3)?,
        is_special_return: row.get(4)?,
        special_return_source: row.get(5)?,
        note: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn query_monthly_schedule(conn: &Connection, id: &str) -> Result<MonthlySchedule, AppError> {
    conn.query_row(
        "SELECT id, semester_id, year_month, status, generation_revision,
                input_fingerprint, confirmed_at, created_at, updated_at
         FROM monthly_schedules WHERE id = ?1",
        [id],
        monthly_schedule_from_row,
    )
    .optional()?
    .ok_or_else(|| AppError::Invalid("monthly schedule not found".into()))
}

fn list_duty_dates_conn(conn: &Connection, schedule_id: &str) -> Result<Vec<DutyDate>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, schedule_id, duty_date, department_mode, is_special_return,
                special_return_source, note, created_at, updated_at
         FROM duty_dates WHERE schedule_id = ?1 ORDER BY duty_date ASC, id ASC",
    )?;
    let rows = stmt.query_map([schedule_id], duty_date_from_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn require_editable_schedule(conn: &Connection, id: &str) -> Result<MonthlySchedule, AppError> {
    let schedule = query_monthly_schedule(conn, id)?;
    require_editable_semester(conn, &schedule.semester_id)?;
    if schedule.status != "DRAFT" {
        return Err(AppError::Invalid(
            "confirmed month is read-only; return it to draft before editing".into(),
        ));
    }
    Ok(schedule)
}

fn recompute_automatic_special_returns(conn: &Connection) -> Result<(), AppError> {
    let candidates = {
        let mut stmt = conn.prepare(
            "SELECT dd.id, dd.duty_date, ms.semester_id, s.start_date
             FROM duty_dates dd
             JOIN monthly_schedules ms ON ms.id = dd.schedule_id
             JOIN semesters s ON s.id = ms.semester_id
             WHERE dd.department_mode <> 'NONE'
               AND dd.special_return_source <> 'MANUAL'
               AND ms.status = 'DRAFT'
             ORDER BY dd.duty_date ASC, dd.id ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        rows.collect::<Result<Vec<_>, _>>()?
    };

    for (id, duty_date, semester_id, semester_start) in candidates {
        let previous = previous_business_date(&duty_date)?;
        let previous_is_duty: bool = conn.query_row(
            "SELECT EXISTS(
                SELECT 1 FROM duty_dates dd
                JOIN monthly_schedules ms ON ms.id = dd.schedule_id
                WHERE ms.semester_id = ?1 AND dd.duty_date = ?2
                  AND dd.department_mode <> 'NONE'
             )",
            rusqlite::params![&semester_id, &previous],
            |row| row.get(0),
        )?;
        let history_known = if previous < semester_start {
            true
        } else {
            let previous_month = &previous[0..7];
            conn.query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM monthly_schedules
                    WHERE semester_id = ?1 AND year_month = ?2
                 )",
                rusqlite::params![&semester_id, previous_month],
                |row| row.get::<_, bool>(0),
            )?
        };

        if previous_is_duty {
            conn.execute(
                "UPDATE duty_dates SET is_special_return = 0,
                 special_return_source = 'AUTO',
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
                [&id],
            )?;
        } else if history_known {
            conn.execute(
                "UPDATE duty_dates SET is_special_return = 1,
                 special_return_source = 'AUTO',
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
                [&id],
            )?;
        } else {
            conn.execute(
                "UPDATE duty_dates SET is_special_return = NULL,
                 special_return_source = 'PENDING_CONFIRMATION',
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
                [&id],
            )?;
        }
    }
    Ok(())
}

fn required_text<'a>(value: &'a str, label: &str) -> Result<&'a str, AppError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::Invalid(format!("{label} is required")));
    }
    Ok(value)
}

fn validate_id(value: &str, label: &str) -> Result<(), AppError> {
    required_text(value, label).map(|_| ())
}

fn clean_optional(value: &Option<String>) -> Option<&str> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn normalize_name(value: &str) -> String {
    value.split_whitespace().collect::<String>().to_lowercase()
}

fn validate_floor(floor: &str) -> Result<(), AppError> {
    if floor != "LOWER" && floor != "UPPER" {
        return Err(AppError::Invalid(
            "floor group must be LOWER or UPPER".into(),
        ));
    }
    Ok(())
}

fn validate_teacher_request(request: &SaveTeacherRequest) -> Result<(), AppError> {
    validate_id(&request.teacher_id, "teacher id")?;
    validate_id(&request.semester_teacher_id, "semester teacher id")?;
    validate_id(&request.semester_id, "semester id")?;
    required_text(&request.name, "teacher name")?;
    validate_floor(&request.floor_group)?;
    if request.initial_fairness_count < 0 {
        return Err(AppError::Invalid(
            "initial fairness count must be non-negative".into(),
        ));
    }
    Ok(())
}

fn validate_import_row(row: &ImportTeacherRow) -> Result<(), AppError> {
    validate_id(&row.semester_teacher_id, "semester teacher id")?;
    required_text(&row.name, "teacher name")?;
    validate_floor(&row.floor_group)?;
    if row.initial_fairness_count < 0 {
        return Err(AppError::Invalid(
            "initial fairness count must be non-negative".into(),
        ));
    }
    if let Some(id) = &row.teacher_id {
        validate_id(id, "matched teacher id")?;
    }
    Ok(())
}

fn validate_date_range(start: &str, end: &str) -> Result<(), AppError> {
    if !is_valid_business_date(start) || !is_valid_business_date(end) {
        return Err(AppError::Invalid(
            "semester dates must be valid YYYY-MM-DD dates".into(),
        ));
    }
    if end < start {
        return Err(AppError::Invalid(
            "semester end date cannot be before start date".into(),
        ));
    }
    Ok(())
}

fn validate_year_month(value: &str) -> Result<(), AppError> {
    if value.len() != 7 || value.as_bytes()[4] != b'-' {
        return Err(AppError::Invalid("schedule month must use YYYY-MM".into()));
    }
    let candidate = format!("{value}-01");
    if !is_valid_business_date(&candidate) {
        return Err(AppError::Invalid(
            "schedule month must use a valid YYYY-MM".into(),
        ));
    }
    Ok(())
}

fn month_overlaps_range(year_month: &str, start: &str, end: &str) -> bool {
    let month_start = format!("{year_month}-01");
    let year = year_month[0..4].parse::<i32>().expect("validated year");
    let month = year_month[5..7].parse::<u32>().expect("validated month");
    let month_end = format!("{year_month}-{:02}", days_in_month(year, month));
    month_start.as_str() <= end && month_end.as_str() >= start
}

fn previous_business_date(value: &str) -> Result<String, AppError> {
    if !is_valid_business_date(value) {
        return Err(AppError::Invalid("invalid business date".into()));
    }
    let mut year = value[0..4].parse::<i32>().expect("validated year");
    let mut month = value[5..7].parse::<u32>().expect("validated month");
    let day = value[8..10].parse::<u32>().expect("validated day");
    if day > 1 {
        return Ok(format!("{year:04}-{month:02}-{:02}", day - 1));
    }
    if month == 1 {
        year -= 1;
        month = 12;
    } else {
        month -= 1;
    }
    Ok(format!(
        "{year:04}-{month:02}-{:02}",
        days_in_month(year, month)
    ))
}

fn days_in_month(year: i32, month: u32) -> u32 {
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => 0,
    }
}

fn is_valid_business_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    if bytes
        .iter()
        .enumerate()
        .any(|(index, byte)| index != 4 && index != 7 && !byte.is_ascii_digit())
    {
        return false;
    }
    let Ok(year) = value[0..4].parse::<i32>() else {
        return false;
    };
    let Ok(month) = value[5..7].parse::<u32>() else {
        return false;
    };
    let Ok(day) = value[8..10].parse::<u32>() else {
        return false;
    };
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let max_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    day >= 1 && day <= max_day
}

fn reject_active_semester_overlap(
    conn: &Connection,
    excluded_id: Option<&str>,
    start: &str,
    end: &str,
) -> Result<(), AppError> {
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM semesters
         WHERE status = 'ACTIVE' AND (?1 IS NULL OR id <> ?1)
           AND start_date <= ?3 AND end_date >= ?2",
        rusqlite::params![excluded_id, start, end],
        |row| row.get(0),
    )?;
    if count > 0 {
        return Err(AppError::Invalid(
            "semester date range overlaps an active semester".into(),
        ));
    }
    Ok(())
}

fn require_editable_semester(conn: &Connection, id: &str) -> Result<(), AppError> {
    let semester = query_semester(conn, id)?;
    if semester.status != "ACTIVE" {
        return Err(AppError::Invalid(
            "closed semester is read-only; reopen it before editing".into(),
        ));
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn upsert_semester_teacher(
    tx: &Transaction<'_>,
    id: &str,
    semester_id: &str,
    teacher_id: &str,
    display_name: &str,
    floor_group: &str,
    is_major_duty: bool,
    participates: bool,
    initial_fairness_count: i32,
) -> Result<(), AppError> {
    validate_id(id, "semester teacher id")?;
    validate_floor(floor_group)?;
    if initial_fairness_count < 0 {
        return Err(AppError::Invalid(
            "initial fairness count must be non-negative".into(),
        ));
    }
    tx.execute(
        "INSERT INTO semester_teachers
         (id, semester_id, teacher_id, floor_group, is_major_duty, participates,
          initial_fairness_count, display_name_snapshot, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(semester_id, teacher_id) DO UPDATE SET
           floor_group = excluded.floor_group,
           is_major_duty = excluded.is_major_duty,
           participates = excluded.participates,
           initial_fairness_count = excluded.initial_fairness_count,
           display_name_snapshot = excluded.display_name_snapshot,
           updated_at = excluded.updated_at",
        rusqlite::params![
            id,
            semester_id,
            teacher_id,
            floor_group,
            is_major_duty,
            participates,
            initial_fairness_count,
            display_name,
        ],
    )?;
    Ok(())
}

fn migrate_conn(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            applied_at TEXT NOT NULL
        );",
    )?;

    let mut current = current_version(conn)?;
    for migration in MIGRATIONS {
        if migration.version <= current {
            continue;
        }
        if migration.version != current + 1 {
            return Err(AppError::Database(format!(
                "migration gap: current {current}, next {}",
                migration.version
            )));
        }

        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(migration.sql)?;
        tx.execute(
            "INSERT INTO schema_migrations (version, name, applied_at)
             VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            rusqlite::params![migration.version, migration.name],
        )?;
        tx.commit()?;
        current = migration.version;
    }

    Ok(())
}

fn current_version(conn: &Connection) -> Result<i32, AppError> {
    let version: i32 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;
    Ok(version)
}

pub const fn latest_schema_version() -> i32 {
    LATEST_SCHEMA_VERSION
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn temp_db() -> (TempDir, AppDb) {
        let dir = TempDir::new().expect("temp dir");
        let path = dir.path().join("duty-roster.db");
        let db = AppDb::open(&path).expect("open db");
        (dir, db)
    }

    fn sample_event(id: &str, message: &str) -> ProbeEvent {
        ProbeEvent {
            id: id.to_string(),
            message: message.to_string(),
            created_at: "2026-09-02T04:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn empty_database_migrates_to_latest() {
        let (_dir, db) = temp_db();
        assert_eq!(db.schema_version().unwrap(), latest_schema_version());
        assert!(db.integrity_ok().unwrap());

        let conn = db.lock().unwrap();
        let foreign_keys: i32 = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        assert_eq!(foreign_keys, 1);

        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn migrate_is_idempotent() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("duty-roster.db");
        let db = AppDb::open(&path).unwrap();
        db.migrate().unwrap();
        db.migrate().unwrap();

        let conn = db.lock().unwrap();
        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 3);
        assert_eq!(current_version(&conn).unwrap(), latest_schema_version());
    }

    #[test]
    fn existing_version_one_database_migrates_without_losing_probe_data() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("duty-roster.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(
                "CREATE TABLE schema_migrations (
                    version INTEGER PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    applied_at TEXT NOT NULL
                );",
            )
            .unwrap();
            conn.execute_batch(MIGRATIONS[0].sql).unwrap();
            conn.execute(
                "INSERT INTO schema_migrations (version, name, applied_at)
                 VALUES (1, 'init', '2026-09-02T00:00:00Z')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO probe_events (id, message, created_at)
                 VALUES ('legacy', 'keep-me', '2026-09-02T00:00:00Z')",
                [],
            )
            .unwrap();
        }

        let db = AppDb::open(&path).unwrap();
        assert_eq!(db.schema_version().unwrap(), 3);
        assert_eq!(db.list_probe().unwrap()[0].message, "keep-me");
        let conn = db.lock().unwrap();
        let teacher_table: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'teachers'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(teacher_table, 1);
    }

    #[test]
    fn probe_row_survives_reopen() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("duty-roster.db");
        let event = sample_event("probe-1", "restart-check");

        {
            let db = AppDb::open(&path).unwrap();
            db.insert_probe(&event).unwrap();
            assert_eq!(db.list_probe().unwrap(), vec![event.clone()]);
        }

        {
            let db = AppDb::open(&path).unwrap();
            assert_eq!(db.schema_version().unwrap(), latest_schema_version());
            assert_eq!(db.list_probe().unwrap(), vec![event]);
        }
    }

    #[test]
    fn rejects_empty_probe_message() {
        let (_dir, db) = temp_db();
        let error = db
            .insert_probe(&sample_event("probe-2", "   "))
            .unwrap_err();
        match error {
            AppError::Invalid(message) => assert!(message.contains("message")),
            other => panic!("unexpected error: {other}"),
        }
    }

    fn semester_request(id: &str, name: &str, start: &str, end: &str) -> CreateSemesterRequest {
        CreateSemesterRequest {
            id: id.into(),
            name: name.into(),
            start_date: start.into(),
            end_date: end.into(),
        }
    }

    fn teacher_request(
        teacher_id: &str,
        member_id: &str,
        semester_id: &str,
        name: &str,
    ) -> SaveTeacherRequest {
        SaveTeacherRequest {
            teacher_id: teacher_id.into(),
            semester_teacher_id: member_id.into(),
            semester_id: semester_id.into(),
            name: name.into(),
            note: None,
            floor_group: "LOWER".into(),
            is_major_duty: false,
            participates: true,
            initial_fairness_count: 0,
        }
    }

    fn schedule_request(
        id: &str,
        semester_id: &str,
        year_month: &str,
    ) -> CreateMonthlyScheduleRequest {
        CreateMonthlyScheduleRequest {
            id: id.into(),
            semester_id: semester_id.into(),
            year_month: year_month.into(),
        }
    }

    fn duty_date_request(
        id: &str,
        schedule_id: &str,
        duty_date: &str,
        department_mode: &str,
    ) -> SaveDutyDateRequest {
        SaveDutyDateRequest {
            id: id.into(),
            schedule_id: schedule_id.into(),
            duty_date: duty_date.into(),
            department_mode: department_mode.into(),
        }
    }

    #[test]
    fn semester_dates_and_active_overlap_are_enforced() {
        let (_dir, db) = temp_db();
        db.create_semester(&semester_request(
            "s1",
            "2026 spring",
            "2026-02-01",
            "2026-07-31",
        ))
        .unwrap();

        let overlap = db.create_semester(&semester_request(
            "s2",
            "overlap",
            "2026-07-01",
            "2026-09-01",
        ));
        assert!(matches!(overlap, Err(AppError::Invalid(_))));

        db.set_semester_status("s1", "CLOSED").unwrap();
        db.create_semester(&semester_request(
            "s2",
            "2026 autumn",
            "2026-07-01",
            "2027-01-31",
        ))
        .unwrap();
        let reopen = db.set_semester_status("s1", "ACTIVE");
        assert!(matches!(reopen, Err(AppError::Invalid(_))));

        let invalid = db.create_semester(&semester_request(
            "s3",
            "invalid",
            "2027-02-30",
            "2027-03-01",
        ));
        assert!(matches!(invalid, Err(AppError::Invalid(_))));
    }

    #[test]
    fn teacher_snapshot_and_fairness_baseline_are_preserved() {
        let (_dir, db) = temp_db();
        db.create_semester(&semester_request("s1", "first", "2026-01-01", "2026-06-30"))
            .unwrap();
        let mut first = teacher_request("t1", "st1", "s1", "Original Name");
        first.initial_fairness_count = 3;
        let saved = db.save_teacher(&first).unwrap();
        assert_eq!(saved.actual_semester_count, 0);
        assert_eq!(saved.effective_semester_count, 3);

        db.set_semester_status("s1", "CLOSED").unwrap();
        db.create_semester(&semester_request(
            "s2",
            "second",
            "2026-07-01",
            "2026-12-31",
        ))
        .unwrap();
        let mut second = teacher_request("t1", "st2", "s2", "Current Name");
        second.floor_group = "UPPER".into();
        db.save_teacher(&second).unwrap();

        let historical = db.list_semester_teachers("s1").unwrap();
        assert_eq!(historical[0].display_name_snapshot, "Original Name");
        assert_eq!(historical[0].floor_group, "LOWER");
        assert_eq!(historical[0].initial_fairness_count, 3);
        assert_eq!(db.list_teachers().unwrap()[0].name, "Current Name");
    }

    #[test]
    fn teacher_can_be_deactivated_and_restored_without_deleting_snapshot() {
        let (_dir, db) = temp_db();
        db.create_semester(&semester_request(
            "s1",
            "semester",
            "2026-01-01",
            "2026-06-30",
        ))
        .unwrap();
        db.save_teacher(&teacher_request("t1", "st1", "s1", "Teacher"))
            .unwrap();
        assert!(!db.set_teacher_active("t1", false).unwrap().active);
        let member = db.list_semester_teachers("s1").unwrap().remove(0);
        assert!(!member.active);
        assert_eq!(member.display_name_snapshot, "Teacher");
        assert!(db.set_teacher_active("t1", true).unwrap().active);
    }

    #[test]
    fn failed_import_rolls_back_every_row() {
        let (_dir, db) = temp_db();
        db.create_semester(&semester_request(
            "s1",
            "semester",
            "2026-01-01",
            "2026-06-30",
        ))
        .unwrap();
        let request = ImportTeachersRequest {
            semester_id: "s1".into(),
            rows: vec![
                ImportTeacherRow {
                    teacher_id: None,
                    new_teacher_id: "new-1".into(),
                    semester_teacher_id: "st-1".into(),
                    name: "First".into(),
                    floor_group: "LOWER".into(),
                    is_major_duty: false,
                    initial_fairness_count: 0,
                },
                ImportTeacherRow {
                    teacher_id: Some("missing".into()),
                    new_teacher_id: "unused".into(),
                    semester_teacher_id: "st-2".into(),
                    name: "Second".into(),
                    floor_group: "UPPER".into(),
                    is_major_duty: true,
                    initial_fairness_count: 0,
                },
            ],
        };
        assert!(db.import_teachers(&request).is_err());
        assert!(db.list_teachers().unwrap().is_empty());
        assert!(db.list_semester_teachers("s1").unwrap().is_empty());
    }

    #[test]
    fn monthly_schedule_must_overlap_semester_and_confirmed_month_is_read_only() {
        let (_dir, db) = temp_db();
        db.create_semester(&semester_request(
            "s1",
            "semester",
            "2026-09-03",
            "2027-01-15",
        ))
        .unwrap();
        assert!(db
            .create_monthly_schedule(&schedule_request("m0", "s1", "2026-08"))
            .is_err());
        let schedule = db
            .create_monthly_schedule(&schedule_request("m1", "s1", "2026-09"))
            .unwrap();
        assert_eq!(schedule.status, "DRAFT");
        db.save_duty_date(&duty_date_request("d1", "m1", "2026-09-03", "NORMAL"))
            .unwrap();
        let confirmed = db.set_monthly_schedule_status("m1", "CONFIRMED").unwrap();
        assert!(confirmed.confirmed_at.is_some());
        assert!(db
            .save_duty_date(&duty_date_request("d2", "m1", "2026-09-04", "NORMAL",))
            .is_err());
        db.set_monthly_schedule_status("m1", "DRAFT").unwrap();
        assert!(db
            .save_duty_date(&duty_date_request("d2", "m1", "2026-09-04", "NORMAL",))
            .is_ok());
    }

    #[test]
    fn consecutive_days_and_cross_month_history_follow_r009_to_r011() {
        let (_dir, db) = temp_db();
        db.create_semester(&semester_request(
            "s1",
            "semester",
            "2026-03-01",
            "2026-07-31",
        ))
        .unwrap();
        db.create_monthly_schedule(&schedule_request("march", "s1", "2026-03"))
            .unwrap();
        db.create_monthly_schedule(&schedule_request("april", "s1", "2026-04"))
            .unwrap();

        let april = db
            .save_duty_date(&duty_date_request("apr-1", "april", "2026-04-01", "NORMAL"))
            .unwrap();
        assert_eq!(april[0].is_special_return, Some(true));

        db.save_duty_date(&duty_date_request(
            "mar-31",
            "march",
            "2026-03-31",
            "NORMAL",
        ))
        .unwrap();
        let april = db.list_duty_dates("april").unwrap();
        assert_eq!(april[0].is_special_return, Some(false));
        assert_eq!(april[0].special_return_source, "AUTO");

        db.delete_duty_date("march", "2026-03-31").unwrap();
        assert_eq!(
            db.list_duty_dates("april").unwrap()[0].is_special_return,
            Some(true)
        );

        db.save_duty_date(&duty_date_request("apr-2", "april", "2026-04-02", "NORMAL"))
            .unwrap();
        let dates = db.list_duty_dates("april").unwrap();
        assert_eq!(dates[0].is_special_return, Some(true));
        assert_eq!(dates[1].is_special_return, Some(false));
    }

    #[test]
    fn missing_previous_month_is_pending_until_manually_resolved_or_history_exists() {
        let (_dir, db) = temp_db();
        db.create_semester(&semester_request(
            "s1",
            "semester",
            "2026-08-01",
            "2027-01-31",
        ))
        .unwrap();
        db.create_monthly_schedule(&schedule_request("sep", "s1", "2026-09"))
            .unwrap();
        let dates = db
            .save_duty_date(&duty_date_request(
                "sep-1",
                "sep",
                "2026-09-01",
                "SPECIAL_MANUAL",
            ))
            .unwrap();
        assert_eq!(dates[0].is_special_return, None);
        assert_eq!(dates[0].special_return_source, "PENDING_CONFIRMATION");
        assert!(db.set_monthly_schedule_status("sep", "CONFIRMED").is_err());

        let manual = db
            .set_special_return("sep", "2026-09-01", Some(false))
            .unwrap();
        assert_eq!(manual[0].is_special_return, Some(false));
        assert_eq!(manual[0].special_return_source, "MANUAL");
        assert_eq!(manual[0].department_mode, "SPECIAL_MANUAL");

        let pending = db.set_special_return("sep", "2026-09-01", None).unwrap();
        assert_eq!(pending[0].is_special_return, None);
        db.create_monthly_schedule(&schedule_request("aug", "s1", "2026-08"))
            .unwrap();
        let derived = db.list_duty_dates("sep").unwrap();
        assert_eq!(derived[0].is_special_return, Some(true));
        assert_eq!(derived[0].special_return_source, "AUTO");
    }

    #[test]
    fn manual_special_return_override_survives_neighbor_changes_r013_r014() {
        let (_dir, db) = temp_db();
        db.create_semester(&semester_request(
            "s1",
            "semester",
            "2026-09-01",
            "2026-12-31",
        ))
        .unwrap();
        db.create_monthly_schedule(&schedule_request("sep", "s1", "2026-09"))
            .unwrap();
        db.save_duty_date(&duty_date_request("d10", "sep", "2026-09-10", "NORMAL"))
            .unwrap();
        db.save_duty_date(&duty_date_request(
            "d11",
            "sep",
            "2026-09-11",
            "SPECIAL_MANUAL",
        ))
        .unwrap();
        db.set_special_return("sep", "2026-09-11", Some(true))
            .unwrap();
        db.delete_duty_date("sep", "2026-09-10").unwrap();
        let date = db.list_duty_dates("sep").unwrap().remove(0);
        assert_eq!(date.department_mode, "SPECIAL_MANUAL");
        assert_eq!(date.is_special_return, Some(true));
        assert_eq!(date.special_return_source, "MANUAL");
    }
}
