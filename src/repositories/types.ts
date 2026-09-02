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
export type ScheduleStatus = "DRAFT" | "CONFIRMED";
export type DepartmentMode = "NONE" | "NORMAL" | "SPECIAL_MANUAL";
export type SpecialReturnSource = "AUTO" | "MANUAL" | "PENDING_CONFIRMATION";
export type DutyType =
  "NORMAL_DUTY" | "BIG_DUTY" | "HEAD_TEACHER_GROUP" | "TERM_SPECIAL" | "LEADER" | "OTHER";

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

export interface MonthlySchedule {
  id: string;
  semesterId: string;
  yearMonth: string;
  status: ScheduleStatus;
  generationRevision: number;
  inputFingerprint: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DutyDate {
  id: string;
  scheduleId: string;
  dutyDate: string;
  departmentMode: DepartmentMode;
  isSpecialReturn: boolean | null;
  specialReturnSource: SpecialReturnSource;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMonthlyScheduleRequest {
  id: string;
  semesterId: string;
  yearMonth: string;
}

export interface SaveDutyDateRequest {
  id: string;
  scheduleId: string;
  dutyDate: string;
  departmentMode: DepartmentMode;
}

export interface Assignment {
  id: string;
  scheduleId: string;
  dutyDateId: string;
  dutyDate: string;
  departmentMode: DepartmentMode;
  teacherId: string;
  semesterTeacherId: string;
  teacherName: string;
  teacherFloor: FloorGroup;
  dutyType: DutyType;
  source: "MANUAL" | "AUTO";
  locked: boolean;
  occupiesDepartmentSlot: boolean;
  slotFloor: FloorGroup | null;
  explanationJson: string | null;
  note: string | null;
  isSpecialReturn: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleHistoryDuty {
  teacherId: string;
  dutyDate: string;
  isSpecialReturn: boolean;
}

export interface ScheduleAutomationContext {
  snapshotToken: string;
  schedule: MonthlySchedule;
  teachers: SemesterTeacher[];
  dutyDates: DutyDate[];
  assignments: Assignment[];
  history: ScheduleHistoryDuty[];
  excludedTeacherIds: string[];
}

export interface GeneratedAutoAssignmentRequest {
  id: string;
  dutyDateId: string;
  teacherId: string;
  semesterTeacherId: string;
  slotFloor: FloorGroup;
  explanationJson: string;
}

export interface SaveAutoAssignmentsRequest {
  scheduleId: string;
  generationMode: "FILL_VACANCIES" | "REGENERATE_AUTO";
  expectedSnapshotToken: string;
  inputFingerprint: string;
  assignments: GeneratedAutoAssignmentRequest[];
}

export interface SaveManualAssignmentRequest {
  id: string;
  dutyDateId: string;
  scheduleId: string;
  dutyDate: string;
  teacherId: string;
  semesterTeacherId: string;
  dutyType: DutyType;
  slotFloor: FloorGroup | null;
  note: string | null;
}

export interface AdjustAssignmentRequest extends SaveManualAssignmentRequest {
  assignmentId: string;
}

export type ScheduleReviewSeverity = "INFO" | "WARNING" | "ERROR";

export interface ScheduleReviewIssue {
  code: string;
  severity: ScheduleReviewSeverity;
  message: string;
  scheduleId: string;
  dutyDate: string | null;
  teacherId: string | null;
  slotFloor: FloorGroup | null;
  suggestedAction: string | null;
}

export interface ScheduleReview {
  issues: ScheduleReviewIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  canConfirm: boolean;
}

export interface ConfirmMonthlyScheduleRequest {
  scheduleId: string;
  acknowledgeWarnings: boolean;
}

export interface MonthlyExclusion {
  id: string;
  scheduleId: string;
  teacherId: string;
  teacherName: string;
  reason: string | null;
  createdAt: string;
}

export interface SaveMonthlyExclusionRequest {
  id: string;
  scheduleId: string;
  teacherId: string;
  reason: string | null;
}

export interface TeacherDutyStatistics {
  semesterTeacherId: string;
  teacherId: string;
  teacherName: string;
  floorGroup: FloorGroup;
  initialFairnessCount: number;
  monthActualCount: number;
  semesterActualCount: number;
  effectiveSemesterCount: number;
  specialReturnCount: number;
  dutyDates: string[];
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
  listMonthlySchedules(semesterId: string): Promise<MonthlySchedule[]>;
  createMonthlySchedule(request: CreateMonthlyScheduleRequest): Promise<MonthlySchedule>;
  setMonthlyScheduleStatus(id: string, status: ScheduleStatus): Promise<MonthlySchedule>;
  reviewSchedule(scheduleId: string): Promise<ScheduleReview>;
  confirmMonthlySchedule(request: ConfirmMonthlyScheduleRequest): Promise<MonthlySchedule>;
  listDutyDates(scheduleId: string): Promise<DutyDate[]>;
  saveDutyDate(request: SaveDutyDateRequest): Promise<DutyDate[]>;
  deleteDutyDate(scheduleId: string, dutyDate: string): Promise<DutyDate[]>;
  setSpecialReturn(
    scheduleId: string,
    dutyDate: string,
    value: boolean | null,
  ): Promise<DutyDate[]>;
  listAssignments(scheduleId: string): Promise<Assignment[]>;
  saveManualAssignment(request: SaveManualAssignmentRequest): Promise<Assignment[]>;
  adjustAssignment(request: AdjustAssignmentRequest): Promise<Assignment[]>;
  deleteAssignment(scheduleId: string, assignmentId: string): Promise<Assignment[]>;
  listMonthlyExclusions(scheduleId: string): Promise<MonthlyExclusion[]>;
  saveMonthlyExclusion(request: SaveMonthlyExclusionRequest): Promise<MonthlyExclusion[]>;
  deleteMonthlyExclusion(scheduleId: string, teacherId: string): Promise<MonthlyExclusion[]>;
  getScheduleStatistics(scheduleId: string): Promise<TeacherDutyStatistics[]>;
  getScheduleAutomationContext(scheduleId: string): Promise<ScheduleAutomationContext>;
  saveAutoAssignments(request: SaveAutoAssignmentsRequest): Promise<Assignment[]>;
}
