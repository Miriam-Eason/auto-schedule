use tauri::State;

use crate::db::{AppDb, DatabaseInfo, ProbeEvent};
use crate::error::AppError;

#[tauri::command]
pub fn get_database_info(db: State<AppDb>) -> Result<DatabaseInfo, AppError> {
    db.info()
}

#[tauri::command]
pub fn probe_insert(db: State<AppDb>, event: ProbeEvent) -> Result<ProbeEvent, AppError> {
    db.insert_probe(&event)?;
    Ok(event)
}

#[tauri::command]
pub fn probe_list(db: State<AppDb>) -> Result<Vec<ProbeEvent>, AppError> {
    db.list_probe()
}
