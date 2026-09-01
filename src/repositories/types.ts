export type AppErrorCode = "DATABASE" | "INVALID" | "IO" | "UNKNOWN";

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

export interface ProbeEvent {
  id: string;
  message: string;
  createdAt: string;
}

export interface DatabaseInfo {
  path: string;
  schemaVersion: number;
  appVersion: string;
  integrityOk: boolean;
}

export interface ProbeRepository {
  getDatabaseInfo(): Promise<DatabaseInfo>;
  insert(event: ProbeEvent): Promise<ProbeEvent>;
  list(): Promise<ProbeEvent[]>;
}

export type FloorGroup = "LOWER" | "UPPER";
export type SemesterStatus = "ACTIVE" | "CLOSED";

export interface Semester {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: SemesterStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Teacher {
  id: string;
  name: string;
  active: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SemesterTeacher {
  id: string;
  semesterId: string;
  teacherId: string;
  name: string;
  active: boolean;
  note: string | null;
  floorGroup: FloorGroup;
  isMajorDuty: boolean;
  participates: boolean;
  initialFairnessCount: number;
  displayNameSnapshot: string;
  actualSemesterCount: number;
  effectiveSemesterCount: number;
}

export interface CreateSemesterRequest {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface SaveTeacherRequest {
  teacherId: string;
  semesterTeacherId: string;
  semesterId: string;
  name: string;
  note: string | null;
  floorGroup: FloorGroup;
  isMajorDuty: boolean;
  participates: boolean;
  initialFairnessCount: number;
}

export interface ImportTeacherRow {
  teacherId: string | null;
  newTeacherId: string;
  semesterTeacherId: string;
  name: string;
  floorGroup: FloorGroup;
  isMajorDuty: boolean;
  initialFairnessCount: number;
}

export interface ImportTeachersRequest {
  semesterId: string;
  rows: ImportTeacherRow[];
}

export interface ImportResult {
  createdTeachers: number;
  matchedTeachers: number;
  semesterMembers: number;
}

export interface RosterRepository {
  listSemesters(): Promise<Semester[]>;
  createSemester(request: CreateSemesterRequest): Promise<Semester>;
  setSemesterStatus(id: string, status: SemesterStatus): Promise<Semester>;
  getSelectedSemesterId(): Promise<string | null>;
  selectSemester(id: string): Promise<void>;
  listTeachers(): Promise<Teacher[]>;
  listSemesterTeachers(semesterId: string): Promise<SemesterTeacher[]>;
  saveTeacher(request: SaveTeacherRequest): Promise<SemesterTeacher>;
  setTeacherActive(id: string, active: boolean): Promise<Teacher>;
  importTeachers(request: ImportTeachersRequest): Promise<ImportResult>;
}
