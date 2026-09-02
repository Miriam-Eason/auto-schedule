use tauri::State;

use crate::db::{
    AdjustAssignmentRequest, AppDb, AssignmentView, BackupPreview, BackupRestoreResult,
    ConfirmMonthlyScheduleRequest, CreateMonthlyScheduleRequest, CreateSemesterRequest,
    DatabaseInfo, DutyDate, ImportResult, ImportTeachersRequest, MonthlyExclusionView,
    MonthlySchedule, ProbeEvent, SaveAutoAssignmentsRequest, SaveDutyDateRequest,
    SaveManualAssignmentRequest, SaveMonthlyExclusionRequest, SaveTeacherRequest,
    ScheduleAutomationContext, ScheduleExportData, ScheduleReview, Semester, SemesterTeacherView,
    Teacher, TeacherDutyStatistics,
};
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

#[tauri::command]
pub fn semester_list(db: State<AppDb>) -> Result<Vec<Semester>, AppError> {
    db.list_semesters()
}

#[tauri::command]
pub fn semester_create(
    db: State<AppDb>,
    request: CreateSemesterRequest,
) -> Result<Semester, AppError> {
    db.create_semester(&request)
}

#[tauri::command]
pub fn semester_set_status(
    db: State<AppDb>,
    id: String,
    status: String,
) -> Result<Semester, AppError> {
    db.set_semester_status(&id, &status)
}

#[tauri::command]
pub fn semester_get_selected(db: State<AppDb>) -> Result<Option<String>, AppError> {
    db.selected_semester_id()
}

#[tauri::command]
pub fn semester_select(db: State<AppDb>, id: String) -> Result<(), AppError> {
    db.select_semester(&id)
}

#[tauri::command]
pub fn teacher_list(db: State<AppDb>) -> Result<Vec<Teacher>, AppError> {
    db.list_teachers()
}

#[tauri::command]
pub fn semester_teacher_list(
    db: State<AppDb>,
    semester_id: String,
) -> Result<Vec<SemesterTeacherView>, AppError> {
    db.list_semester_teachers(&semester_id)
}

#[tauri::command]
pub fn teacher_save(
    db: State<AppDb>,
    request: SaveTeacherRequest,
) -> Result<SemesterTeacherView, AppError> {
    db.save_teacher(&request)
}

#[tauri::command]
pub fn teacher_set_active(db: State<AppDb>, id: String, active: bool) -> Result<Teacher, AppError> {
    db.set_teacher_active(&id, active)
}

#[tauri::command]
pub fn teacher_import_commit(
    db: State<AppDb>,
    request: ImportTeachersRequest,
) -> Result<ImportResult, AppError> {
    db.import_teachers(&request)
}

#[tauri::command]
pub fn monthly_schedule_list(
    db: State<AppDb>,
    semester_id: String,
) -> Result<Vec<MonthlySchedule>, AppError> {
    db.list_monthly_schedules(&semester_id)
}

#[tauri::command]
pub fn monthly_schedule_create(
    db: State<AppDb>,
    request: CreateMonthlyScheduleRequest,
) -> Result<MonthlySchedule, AppError> {
    db.create_monthly_schedule(&request)
}

#[tauri::command]
pub fn monthly_schedule_set_status(
    db: State<AppDb>,
    id: String,
    status: String,
) -> Result<MonthlySchedule, AppError> {
    db.set_monthly_schedule_status(&id, &status)
}

#[tauri::command]
pub fn schedule_review(db: State<AppDb>, schedule_id: String) -> Result<ScheduleReview, AppError> {
    db.review_schedule(&schedule_id)
}

#[tauri::command]
pub fn monthly_schedule_confirm(
    db: State<AppDb>,
    request: ConfirmMonthlyScheduleRequest,
) -> Result<MonthlySchedule, AppError> {
    db.confirm_monthly_schedule(&request)
}

#[tauri::command]
pub fn duty_date_list(db: State<AppDb>, schedule_id: String) -> Result<Vec<DutyDate>, AppError> {
    db.list_duty_dates(&schedule_id)
}

#[tauri::command]
pub fn duty_date_save(
    db: State<AppDb>,
    request: SaveDutyDateRequest,
) -> Result<Vec<DutyDate>, AppError> {
    db.save_duty_date(&request)
}

#[tauri::command]
pub fn duty_date_delete(
    db: State<AppDb>,
    schedule_id: String,
    duty_date: String,
) -> Result<Vec<DutyDate>, AppError> {
    db.delete_duty_date(&schedule_id, &duty_date)
}

#[tauri::command]
pub fn duty_date_set_special_return(
    db: State<AppDb>,
    schedule_id: String,
    duty_date: String,
    value: Option<bool>,
) -> Result<Vec<DutyDate>, AppError> {
    db.set_special_return(&schedule_id, &duty_date, value)
}

#[tauri::command]
pub fn assignment_list(
    db: State<AppDb>,
    schedule_id: String,
) -> Result<Vec<AssignmentView>, AppError> {
    db.list_assignments(&schedule_id)
}

#[tauri::command]
pub fn assignment_save_manual(
    db: State<AppDb>,
    request: SaveManualAssignmentRequest,
) -> Result<Vec<AssignmentView>, AppError> {
    db.save_manual_assignment(&request)
}

#[tauri::command]
pub fn assignment_adjust(
    db: State<AppDb>,
    request: AdjustAssignmentRequest,
) -> Result<Vec<AssignmentView>, AppError> {
    db.adjust_assignment(&request)
}

#[tauri::command]
pub fn assignment_delete(
    db: State<AppDb>,
    schedule_id: String,
    assignment_id: String,
) -> Result<Vec<AssignmentView>, AppError> {
    db.delete_assignment(&schedule_id, &assignment_id)
}

#[tauri::command]
pub fn monthly_exclusion_list(
    db: State<AppDb>,
    schedule_id: String,
) -> Result<Vec<MonthlyExclusionView>, AppError> {
    db.list_monthly_exclusions(&schedule_id)
}

#[tauri::command]
pub fn monthly_exclusion_save(
    db: State<AppDb>,
    request: SaveMonthlyExclusionRequest,
) -> Result<Vec<MonthlyExclusionView>, AppError> {
    db.save_monthly_exclusion(&request)
}

#[tauri::command]
pub fn monthly_exclusion_delete(
    db: State<AppDb>,
    schedule_id: String,
    teacher_id: String,
) -> Result<Vec<MonthlyExclusionView>, AppError> {
    db.delete_monthly_exclusion(&schedule_id, &teacher_id)
}

#[tauri::command]
pub fn schedule_statistics(
    db: State<AppDb>,
    schedule_id: String,
) -> Result<Vec<TeacherDutyStatistics>, AppError> {
    db.schedule_statistics(&schedule_id)
}

#[tauri::command]
pub fn schedule_automation_context(
    db: State<AppDb>,
    schedule_id: String,
) -> Result<ScheduleAutomationContext, AppError> {
    db.schedule_automation_context(&schedule_id)
}

#[tauri::command]
pub fn assignment_save_auto(
    db: State<AppDb>,
    request: SaveAutoAssignmentsRequest,
) -> Result<Vec<AssignmentView>, AppError> {
    db.save_auto_assignments(&request)
}

#[tauri::command]
pub fn schedule_export_data(
    db: State<AppDb>,
    schedule_id: String,
) -> Result<ScheduleExportData, AppError> {
    db.schedule_export_data(&schedule_id)
}

#[tauri::command]
pub fn write_export_file(
    db: State<AppDb>,
    path: String,
    bytes: Vec<u8>,
) -> Result<String, AppError> {
    db.write_export_file(&path, &bytes)
}

#[tauri::command]
pub fn backup_create(db: State<AppDb>, path: String) -> Result<BackupPreview, AppError> {
    db.create_backup(&path)
}

#[tauri::command]
pub fn backup_inspect(db: State<AppDb>, path: String) -> Result<BackupPreview, AppError> {
    db.inspect_backup(&path)
}

#[tauri::command]
pub fn backup_restore(
    db: State<AppDb>,
    path: String,
    expected_restore_token: String,
) -> Result<BackupRestoreResult, AppError> {
    db.restore_backup(&path, &expected_restore_token)
}
