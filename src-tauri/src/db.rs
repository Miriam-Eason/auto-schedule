use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

const LATEST_SCHEMA_VERSION: i32 = 1;

struct Migration {
    version: i32,
    name: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    name: "init",
    sql: include_str!("../migrations/001_init.sql"),
}];

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

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, AppError> {
        self.conn
            .lock()
            .map_err(|error| AppError::Database(format!("database lock poisoned: {error}")))
    }
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
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
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
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
        assert_eq!(current_version(&conn).unwrap(), latest_schema_version());
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
}
