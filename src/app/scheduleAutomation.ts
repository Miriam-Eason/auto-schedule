import {
  SCHEDULE_ENGINE_INPUT_VERSION,
  type GeneratedAssignment,
  type GenerationMode,
  type ScheduleEngineInputV1,
} from "../domain/scheduling";
import type { SaveAutoAssignmentsRequest, ScheduleAutomationContext } from "../repositories/types";

export function buildScheduleEngineInput(
  context: ScheduleAutomationContext,
  generationMode: GenerationMode,
): ScheduleEngineInputV1 {
  return {
    inputVersion: SCHEDULE_ENGINE_INPUT_VERSION,
    scheduleId: context.schedule.id,
    semesterId: context.schedule.semesterId,
    yearMonth: context.schedule.yearMonth,
    status: context.schedule.status,
    generationMode,
    teachers: context.teachers.map((teacher) => ({
      teacherId: teacher.teacherId,
      semesterTeacherId: teacher.id,
      displayName: teacher.displayNameSnapshot,
      active: teacher.active,
      participates: teacher.participates,
      floorGroup: teacher.floorGroup,
      initialFairnessCount: teacher.initialFairnessCount,
    })),
    dutyDates: context.dutyDates.map((date) => ({
      dutyDateId: date.id,
      dutyDate: date.dutyDate,
      departmentMode: date.departmentMode,
      isSpecialReturn: date.isSpecialReturn,
    })),
    existingAssignments: context.assignments.map((assignment) => ({
      assignmentId: assignment.id,
      dutyDateId: assignment.dutyDateId,
      dutyDate: assignment.dutyDate,
      teacherId: assignment.teacherId,
      source: assignment.source,
      occupiesDepartmentSlot: assignment.occupiesDepartmentSlot,
      slotFloor: assignment.slotFloor,
      isSpecialReturn: assignment.isSpecialReturn === true,
    })),
    history: context.history.map((duty) => ({ ...duty })),
    excludedTeacherIds: [...context.excludedTeacherIds],
  };
}

export function buildSaveAutoAssignmentsRequest(
  context: ScheduleAutomationContext,
  generationMode: GenerationMode,
  inputFingerprint: string,
  assignments: GeneratedAssignment[],
  createId: () => string = () => crypto.randomUUID(),
): SaveAutoAssignmentsRequest {
  return {
    scheduleId: context.schedule.id,
    generationMode,
    expectedSnapshotToken: context.snapshotToken,
    inputFingerprint,
    assignments: assignments.map((assignment) => ({
      id: createId(),
      dutyDateId: assignment.dutyDateId,
      teacherId: assignment.teacherId,
      semesterTeacherId: assignment.semesterTeacherId,
      slotFloor: assignment.slotFloor,
      explanationJson: JSON.stringify(assignment.explanation),
    })),
  };
}
