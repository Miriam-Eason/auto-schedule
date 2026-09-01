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
            commands::semester_list,
            commands::semester_create,
            commands::semester_set_status,
            commands::semester_get_selected,
            commands::semester_select,
            commands::teacher_list,
            commands::semester_teacher_list,
            commands::teacher_save,
            commands::teacher_set_active,
            commands::teacher_import_commit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
