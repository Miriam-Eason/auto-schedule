export const SCHEDULE_ENGINE_INPUT_VERSION = "1" as const;
export const SCHEDULE_ENGINE_OUTPUT_VERSION = "1" as const;
export const SCHEDULE_RULE_VERSION = "1.1" as const;

export type EngineFloorGroup = "LOWER" | "UPPER";
export type EngineScheduleStatus = "DRAFT" | "CONFIRMED";
export type EngineDepartmentMode = "NONE" | "NORMAL" | "SPECIAL_MANUAL";
export type EngineAssignmentSource = "MANUAL" | "AUTO";
export type GenerationMode = "FILL_VACANCIES" | "REGENERATE_AUTO";
export type EngineSeverity = "INFO" | "WARNING" | "ERROR";

export interface ScheduleEngineTeacher {
  teacherId: string;
  semesterTeacherId: string;
  displayName: string;
  active: boolean;
  participates: boolean;
  floorGroup: EngineFloorGroup;
  initialFairnessCount: number;
}

export interface ScheduleEngineDutyDate {
  dutyDateId: string;
  dutyDate: string;
  departmentMode: EngineDepartmentMode;
  isSpecialReturn: boolean | null;
}

export interface ScheduleEngineExistingAssignment {
  assignmentId: string;
  dutyDateId: string;
  dutyDate: string;
  teacherId: string;
  source: EngineAssignmentSource;
  occupiesDepartmentSlot: boolean;
  slotFloor: EngineFloorGroup | null;
  isSpecialReturn: boolean;
}

export interface ScheduleEngineHistoryDuty {
  teacherId: string;
  dutyDate: string;
  isSpecialReturn: boolean;
}

export interface ScheduleEngineInputV1 {
  inputVersion: typeof SCHEDULE_ENGINE_INPUT_VERSION;
  scheduleId: string;
  semesterId: string;
  yearMonth: string;
  status: EngineScheduleStatus;
  generationMode: GenerationMode;
  teachers: ScheduleEngineTeacher[];
  dutyDates: ScheduleEngineDutyDate[];
  existingAssignments: ScheduleEngineExistingAssignment[];
  history: ScheduleEngineHistoryDuty[];
  excludedTeacherIds: string[];
}

export interface ScheduleSlot {
  slotId: string;
  dutyDateId: string;
  dutyDate: string;
  slotFloor: EngineFloorGroup;
  isSpecialReturn: boolean;
}

export interface AssignmentExplanation {
  ruleVersion: typeof SCHEDULE_RULE_VERSION;
  monthlyRound: number;
  monthCountBefore: number;
  specialReturnCountBefore?: number;
  actualSemesterCountBefore: number;
  initialFairnessCount: number;
  effectiveSemesterCountBefore: number;
  floorMatch: boolean;
  floorToleranceApplied: boolean;
  floorReason: "HOME_WITHIN_TOLERANCE" | "CROSS_FLOOR_ADVANTAGE" | "NO_HOME_CANDIDATE";
  lastDutyDate?: string;
  gapDays?: number;
  relaxedConstraints: string[];
  stableTieBreakKey: string;
}

export interface GeneratedAssignment {
  assignmentKey: string;
  dutyDateId: string;
  dutyDate: string;
  teacherId: string;
  semesterTeacherId: string;
  slotFloor: EngineFloorGroup;
  source: "AUTO";
  occupiesDepartmentSlot: true;
  explanation: AssignmentExplanation;
}

export interface ScheduleIssue {
  code:
    | "ADJACENT_DUTY"
    | "CONFIRMED_SCHEDULE_READ_ONLY"
    | "CROSS_FLOOR"
    | "DUPLICATE_DUTY_DATE"
    | "EXCLUDED_MANUAL_ASSIGNMENT"
    | "INACTIVE_ASSIGNEE"
    | "INVALID_INPUT"
    | "MONTH_MULTIPLE_DUTIES"
    | "NO_ELIGIBLE_CANDIDATE"
    | "PENDING_SPECIAL_RETURN"
    | "SPECIAL_RETURN_IMBALANCE";
  severity: EngineSeverity;
  message: string;
  scheduleId: string;
  dutyDate?: string;
  teacherId?: string;
  slotFloor?: EngineFloorGroup;
  suggestedAction?: string;
}

export interface FloorCandidateCapacity {
  floorGroup: EngineFloorGroup;
  eligibleTeachers: number;
  teachersWithoutMonthlyDuty: number;
  remainingHomeSlots: number;
}

export interface FeasibilityResult {
  totalSlots: number;
  filledSlots: number;
  remainingSlots: number;
  excludedTeachers: number;
  eligibleTeachers: number;
  teachersWithoutMonthlyDuty: number;
  estimatedHighestRound: number | null;
  floorCapacity: FloorCandidateCapacity[];
  capacityExplanation: string;
  blockingIssues: ScheduleIssue[];
}

export interface TeacherScheduleStatistics {
  teacherId: string;
  monthActualCount: number;
  semesterActualCount: number;
  effectiveSemesterCount: number;
  specialReturnCount: number;
  dutyDates: string[];
}

export interface ScheduleEngineResultV1 {
  outputVersion: typeof SCHEDULE_ENGINE_OUTPUT_VERSION;
  ruleVersion: typeof SCHEDULE_RULE_VERSION;
  inputFingerprint: string;
  feasibility: FeasibilityResult;
  preservedAssignments: ScheduleEngineExistingAssignment[];
  generatedAssignments: GeneratedAssignment[];
  vacancies: ScheduleSlot[];
  issues: ScheduleIssue[];
  statistics: TeacherScheduleStatistics[];
}
