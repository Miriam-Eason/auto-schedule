import { invoke } from "@tauri-apps/api/core";

import {
  AppError,
  type CreateSemesterRequest,
  type CreateMonthlyScheduleRequest,
  type DatabaseInfo,
  type DutyDate,
  type ImportResult,
  type ImportTeachersRequest,
  type ProbeEvent,
  type ProbeRepository,
  type RosterRepository,
  type MonthlySchedule,
  type SaveDutyDateRequest,
  type SaveTeacherRequest,
  type ScheduleStatus,
  type Semester,
  type SemesterStatus,
  type SemesterTeacher,
  type Teacher,
} from "./types";

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("database error:")) {
    return new AppError("DATABASE", message);
  }
  if (message.startsWith("io error:")) {
    return new AppError("IO", message);
  }
  return new AppError("INVALID", message);
}

export class SqliteProbeRepository implements ProbeRepository {
  async getDatabaseInfo(): Promise<DatabaseInfo> {
    try {
      return await invoke<DatabaseInfo>("get_database_info");
    } catch (error) {
      throw toAppError(error);
    }
  }

  async insert(event: ProbeEvent): Promise<ProbeEvent> {
    try {
      return await invoke<ProbeEvent>("probe_insert", { event });
    } catch (error) {
      throw toAppError(error);
    }
  }

  async list(): Promise<ProbeEvent[]> {
    try {
      return await invoke<ProbeEvent[]>("probe_list");
    } catch (error) {
      throw toAppError(error);
    }
  }
}

async function invokeRoster<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toAppError(error);
  }
}

export class SqliteRosterRepository implements RosterRepository {
  listSemesters(): Promise<Semester[]> {
    return invokeRoster("semester_list");
  }

  createSemester(request: CreateSemesterRequest): Promise<Semester> {
    return invokeRoster("semester_create", { request });
  }

  setSemesterStatus(id: string, status: SemesterStatus): Promise<Semester> {
    return invokeRoster("semester_set_status", { id, status });
  }

  getSelectedSemesterId(): Promise<string | null> {
    return invokeRoster("semester_get_selected");
  }

  selectSemester(id: string): Promise<void> {
    return invokeRoster("semester_select", { id });
  }

  listTeachers(): Promise<Teacher[]> {
    return invokeRoster("teacher_list");
  }

  listSemesterTeachers(semesterId: string): Promise<SemesterTeacher[]> {
    return invokeRoster("semester_teacher_list", { semesterId });
  }

  saveTeacher(request: SaveTeacherRequest): Promise<SemesterTeacher> {
    return invokeRoster("teacher_save", { request });
  }

  setTeacherActive(id: string, active: boolean): Promise<Teacher> {
    return invokeRoster("teacher_set_active", { id, active });
  }

  importTeachers(request: ImportTeachersRequest): Promise<ImportResult> {
    return invokeRoster("teacher_import_commit", { request });
  }

  listMonthlySchedules(semesterId: string): Promise<MonthlySchedule[]> {
    return invokeRoster("monthly_schedule_list", { semesterId });
  }

  createMonthlySchedule(request: CreateMonthlyScheduleRequest): Promise<MonthlySchedule> {
    return invokeRoster("monthly_schedule_create", { request });
  }

  setMonthlyScheduleStatus(id: string, status: ScheduleStatus): Promise<MonthlySchedule> {
    return invokeRoster("monthly_schedule_set_status", { id, status });
  }

  listDutyDates(scheduleId: string): Promise<DutyDate[]> {
    return invokeRoster("duty_date_list", { scheduleId });
  }

  saveDutyDate(request: SaveDutyDateRequest): Promise<DutyDate[]> {
    return invokeRoster("duty_date_save", { request });
  }

  deleteDutyDate(scheduleId: string, dutyDate: string): Promise<DutyDate[]> {
    return invokeRoster("duty_date_delete", { scheduleId, dutyDate });
  }

  setSpecialReturn(
    scheduleId: string,
    dutyDate: string,
    value: boolean | null,
  ): Promise<DutyDate[]> {
    return invokeRoster("duty_date_set_special_return", { scheduleId, dutyDate, value });
  }
}
