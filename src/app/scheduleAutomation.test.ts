import { describe, expect, it } from "vitest";

import type { ScheduleAutomationContext } from "../repositories/types";
import { buildSaveAutoAssignmentsRequest, buildScheduleEngineInput } from "./scheduleAutomation";

const context: ScheduleAutomationContext = {
  snapshotToken: "snapshot-1",
  schedule: {
    id: "m1",
    semesterId: "s1",
    yearMonth: "2026-09",
    status: "DRAFT",
    generationRevision: 0,
    inputFingerprint: null,
    confirmedAt: null,
    createdAt: "now",
    updatedAt: "now",
  },
  teachers: [
    {
      id: "st1",
      semesterId: "s1",
      teacherId: "t1",
      name: "甲老师",
      active: true,
      note: null,
      floorGroup: "LOWER",
      isMajorDuty: false,
      participates: true,
      initialFairnessCount: 2,
      displayNameSnapshot: "甲老师",
      actualSemesterCount: 1,
      effectiveSemesterCount: 3,
    },
  ],
  dutyDates: [
    {
      id: "d1",
      scheduleId: "m1",
      dutyDate: "2026-09-02",
      departmentMode: "NORMAL",
      isSpecialReturn: true,
      specialReturnSource: "AUTO",
      note: null,
      createdAt: "now",
      updatedAt: "now",
    },
  ],
  assignments: [],
  history: [{ teacherId: "t1", dutyDate: "2026-08-20", isSpecialReturn: false }],
  excludedTeacherIds: [],
};

describe("schedule automation application boundary", () => {
  it("converts repository records to the versioned pure engine DTO", () => {
    const input = buildScheduleEngineInput(context, "FILL_VACANCIES");
    expect(input).toMatchObject({
      inputVersion: "1",
      scheduleId: "m1",
      semesterId: "s1",
      generationMode: "FILL_VACANCIES",
      teachers: [{ teacherId: "t1", semesterTeacherId: "st1", initialFairnessCount: 2 }],
      dutyDates: [{ dutyDateId: "d1", isSpecialReturn: true }],
      history: [{ dutyDate: "2026-08-20" }],
    });
  });

  it("serializes explanations and carries the optimistic snapshot token", () => {
    const request = buildSaveAutoAssignmentsRequest(
      context,
      "REGENERATE_AUTO",
      "fingerprint",
      [
        {
          assignmentKey: "auto:d1:LOWER",
          dutyDateId: "d1",
          dutyDate: "2026-09-02",
          teacherId: "t1",
          semesterTeacherId: "st1",
          slotFloor: "LOWER",
          source: "AUTO",
          occupiesDepartmentSlot: true,
          explanation: {
            ruleVersion: "1.1",
            monthlyRound: 1,
            monthCountBefore: 0,
            specialReturnCountBefore: 0,
            actualSemesterCountBefore: 1,
            initialFairnessCount: 2,
            effectiveSemesterCountBefore: 3,
            floorMatch: true,
            floorToleranceApplied: false,
            floorReason: "HOME_WITHIN_TOLERANCE",
            lastDutyDate: "2026-08-20",
            gapDays: 13,
            relaxedConstraints: [],
            stableTieBreakKey: "stable",
          },
        },
      ],
      () => "auto-id",
    );
    expect(request.expectedSnapshotToken).toBe("snapshot-1");
    expect(request.assignments[0].id).toBe("auto-id");
    expect(JSON.parse(request.assignments[0].explanationJson)).toMatchObject({
      monthlyRound: 1,
      effectiveSemesterCountBefore: 3,
    });
  });
});
