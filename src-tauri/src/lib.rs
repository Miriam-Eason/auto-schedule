mod commands;
mod db;
mod error;

use std::fs;

use tauri::Manager;

use db::AppDb;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&app_dir)?;
            let db_path = app_dir.join("duty-roster.db");
            let db = AppDb::open(&db_path)?;
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_database_info,
            commands::probe_insert,
            commands::probe_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
