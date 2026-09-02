import { describe, expect, it } from "vitest";

import { analyzeScheduleFeasibility, generateSchedule } from "./engine";
import type {
  EngineFloorGroup,
  ScheduleEngineExistingAssignment,
  ScheduleEngineInputV1,
  ScheduleEngineTeacher,
} from "./types";

function teacher(
  id: string,
  floorGroup: EngineFloorGroup,
  overrides: Partial<ScheduleEngineTeacher> = {},
): ScheduleEngineTeacher {
  return {
    teacherId: id,
    semesterTeacherId: `st-${id}`,
    displayName: `教师${id}`,
    active: true,
    participates: true,
    floorGroup,
    initialFairnessCount: 0,
    ...overrides,
  };
}

function assignment(
  id: string,
  date: string,
  teacherId: string,
  slotFloor: EngineFloorGroup | null,
  overrides: Partial<ScheduleEngineExistingAssignment> = {},
): ScheduleEngineExistingAssignment {
  return {
    assignmentId: id,
    dutyDateId: `date-${date}`,
    dutyDate: date,
    teacherId,
    source: "MANUAL",
    occupiesDepartmentSlot: slotFloor !== null,
    slotFloor,
    isSpecialReturn: false,
    ...overrides,
  };
}

function input(overrides: Partial<ScheduleEngineInputV1> = {}): ScheduleEngineInputV1 {
  return {
    inputVersion: "1",
    scheduleId: "schedule-2026-09",
    semesterId: "semester-2026-fall",
    yearMonth: "2026-09",
    status: "DRAFT",
    generationMode: "REGENERATE_AUTO",
    teachers: [teacher("l1", "LOWER"), teacher("u1", "UPPER")],
    dutyDates: [
      {
        dutyDateId: "date-2026-09-10",
        dutyDate: "2026-09-10",
        departmentMode: "NORMAL",
        isSpecialReturn: false,
      },
    ],
    existingAssignments: [],
    history: [],
    excludedTeacherIds: [],
    ...overrides,
  };
}

function normalDates(count: number, startDay = 1) {
  return Array.from({ length: count }, (_, index) => {
    const date = `2026-09-${String(startDay + index).padStart(2, "0")}`;
    return {
      dutyDateId: `date-${date}`,
      dutyDate: date,
      departmentMode: "NORMAL" as const,
      isSpecialReturn: false,
    };
  });
}

describe("Phase 4 R025-R037 and R046-R050 business-rule matrix", () => {
  it("BR-T01 assigns 44 vacant slots to 44 teachers without entering round two", () => {
    const teachers = Array.from({ length: 44 }, (_, index) =>
      teacher(`t${String(index).padStart(2, "0")}`, index < 22 ? "LOWER" : "UPPER"),
    );

    const result = generateSchedule(input({ teachers, dutyDates: normalDates(22) }));

    expect(result.vacancies).toEqual([]);
    expect(result.generatedAssignments).toHaveLength(44);
    expect(new Set(result.generatedAssignments.map((value) => value.teacherId))).toHaveLength(44);
    expect(result.generatedAssignments.every((value) => value.explanation.monthlyRound === 1)).toBe(
      true,
    );
    expect(result.feasibility.estimatedHighestRound).toBe(1);
  });

  it("BR-T02 counts off-calendar major duty before using the formal second round", () => {
    const result = generateSchedule(
      input({
        teachers: [teacher("l1", "LOWER"), teacher("u1", "UPPER"), teacher("l2", "LOWER")],
        dutyDates: normalDates(2, 10),
        existingAssignments: [assignment("big", "2026-09-02", "l1", null)],
      }),
    );

    expect(result.vacancies).toEqual([]);
    expect(result.generatedAssignments.some((value) => value.explanation.monthlyRound === 2)).toBe(
      true,
    );
    expect(result.issues.some((value) => value.code === "MONTH_MULTIPLE_DUTIES")).toBe(true);
  });

  it("BR-T03 preserves a major-duty occupied floor and fills only the other floor", () => {
    const fixed = assignment("big", "2026-09-10", "l1", "LOWER");
    const result = generateSchedule(input({ existingAssignments: [fixed] }));

    expect(result.preservedAssignments).toEqual([fixed]);
    expect(result.generatedAssignments).toHaveLength(1);
    expect(result.generatedAssignments[0].slotFloor).toBe("UPPER");
  });

  it("BR-T04 accepts the Phase 2 cross-month conclusion that April 1 is not special", () => {
    const result = generateSchedule(
      input({
        scheduleId: "schedule-2026-04",
        yearMonth: "2026-04",
        dutyDates: [
          {
            dutyDateId: "apr-1",
            dutyDate: "2026-04-01",
            departmentMode: "NORMAL",
            isSpecialReturn: false,
          },
        ],
        history: [{ teacherId: "l1", dutyDate: "2026-03-31", isSpecialReturn: true }],
      }),
    );

    expect(result.generatedAssignments).toHaveLength(2);
    expect(
      result.generatedAssignments.every(
        (value) => value.explanation.specialReturnCountBefore === undefined,
      ),
    ).toBe(true);
  });

  it("BR-T05 blocks generation when a month-opening special-return decision is pending", () => {
    const result = generateSchedule(
      input({
        dutyDates: [
          {
            dutyDateId: "sep-1",
            dutyDate: "2026-09-01",
            departmentMode: "NORMAL",
            isSpecialReturn: null,
          },
        ],
      }),
    );

    expect(result.generatedAssignments).toEqual([]);
    expect(result.vacancies).toHaveLength(2);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "PENDING_SPECIAL_RETURN", severity: "ERROR" }),
    );
  });

  it("BR-T06 keeps the minimum special-return layer inside the monthly minimum layer", () => {
    const result = generateSchedule(
      input({
        teachers: [
          teacher("l0", "LOWER"),
          teacher("u0", "UPPER"),
          teacher("l1", "LOWER"),
          teacher("u2", "UPPER"),
        ],
        dutyDates: [
          {
            dutyDateId: "special",
            dutyDate: "2026-09-10",
            departmentMode: "NORMAL",
            isSpecialReturn: true,
          },
        ],
        history: [
          { teacherId: "l1", dutyDate: "2026-08-01", isSpecialReturn: true },
          { teacherId: "u2", dutyDate: "2026-07-01", isSpecialReturn: true },
          { teacherId: "u2", dutyDate: "2026-08-01", isSpecialReturn: true },
        ],
      }),
    );

    expect(new Set(result.generatedAssignments.map((value) => value.teacherId))).toEqual(
      new Set(["l0", "u0"]),
    );
    expect(
      result.generatedAssignments.every(
        (value) => value.explanation.specialReturnCountBefore === 0,
      ),
    ).toBe(true);
  });

  it("BR-T07 retains the home floor when home minimum 4 is within global minimum 3 plus one", () => {
    const result = generateSchedule(
      input({
        teachers: [
          teacher("home", "LOWER", { initialFairnessCount: 4 }),
          teacher("away", "UPPER", { initialFairnessCount: 3 }),
          teacher("upper-fixed", "UPPER"),
        ],
        existingAssignments: [assignment("upper", "2026-09-10", "upper-fixed", "UPPER")],
      }),
    );

    expect(result.generatedAssignments[0].teacherId).toBe("home");
    expect(result.generatedAssignments[0].explanation.floorReason).toBe("HOME_WITHIN_TOLERANCE");
  });

  it("BR-T08 permits and explains cross-floor assignment when home minimum 6 trails global 3", () => {
    const result = generateSchedule(
      input({
        teachers: [
          teacher("home", "LOWER", { initialFairnessCount: 6 }),
          teacher("away", "UPPER", { initialFairnessCount: 3 }),
          teacher("upper-fixed", "UPPER"),
        ],
        existingAssignments: [assignment("upper", "2026-09-10", "upper-fixed", "UPPER")],
      }),
    );

    expect(result.generatedAssignments[0].teacherId).toBe("away");
    expect(result.generatedAssignments[0].explanation.floorReason).toBe("CROSS_FLOOR_ADVANTAGE");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "CROSS_FLOOR", severity: "INFO", teacherId: "away" }),
    );
  });

  it("BR-T09 relaxes adjacency for the only candidate and emits a locatable warning", () => {
    const result = generateSchedule(
      input({
        teachers: [teacher("only", "LOWER"), teacher("excluded", "UPPER")],
        dutyDates: normalDates(2, 10),
        existingAssignments: [
          assignment("upper-10", "2026-09-10", "excluded", "UPPER"),
          assignment("upper-11", "2026-09-11", "excluded", "UPPER"),
        ],
        excludedTeacherIds: ["excluded"],
      }),
    );

    expect(result.vacancies).toEqual([]);
    expect(result.generatedAssignments).toHaveLength(2);
    expect(result.generatedAssignments[1].explanation.relaxedConstraints).toContain(
      "ADJACENT_DUTY",
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "ADJACENT_DUTY",
        severity: "WARNING",
        dutyDate: "2026-09-11",
        teacherId: "only",
      }),
    );
  });

  it("BR-T10 excludes teachers from auto selection while retaining a warned manual override", () => {
    const manual = assignment("manual", "2026-09-10", "l1", "LOWER");
    const result = generateSchedule(
      input({ existingAssignments: [manual], excludedTeacherIds: ["l1"] }),
    );

    expect(result.preservedAssignments).toEqual([manual]);
    expect(result.generatedAssignments.map((value) => value.teacherId)).not.toContain("l1");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "EXCLUDED_MANUAL_ASSIGNMENT", teacherId: "l1" }),
    );
  });

  it("BR-T11 fill-vacancies mode never changes existing auto or manual records", () => {
    const existingAuto = assignment("auto-existing", "2026-09-10", "l1", "LOWER", {
      source: "AUTO",
    });
    const manual = assignment("manual", "2026-09-11", "u1", "UPPER");
    const result = generateSchedule(
      input({
        generationMode: "FILL_VACANCIES",
        dutyDates: normalDates(2, 10),
        existingAssignments: [manual, existingAuto],
        teachers: [
          teacher("l1", "LOWER"),
          teacher("u1", "UPPER"),
          teacher("l2", "LOWER"),
          teacher("u2", "UPPER"),
        ],
      }),
    );

    expect(result.preservedAssignments).toEqual([existingAuto, manual]);
    expect(result.generatedAssignments.map((value) => value.assignmentKey)).not.toContain(
      "auto:date-2026-09-10:LOWER",
    );
  });

  it("BR-T12 reproduces byte-equivalent normalized results 100 times", () => {
    const value = input({
      teachers: [
        teacher("l1", "LOWER"),
        teacher("l2", "LOWER"),
        teacher("u1", "UPPER"),
        teacher("u2", "UPPER"),
      ],
      dutyDates: normalDates(3, 10),
    });
    const expected = JSON.stringify(generateSchedule(value));

    for (let iteration = 0; iteration < 100; iteration += 1) {
      expect(JSON.stringify(generateSchedule(value))).toBe(expected);
    }
  });

  it("BR-T13 keeps initial fairness separate from actual human-day counts", () => {
    const result = generateSchedule(
      input({
        teachers: [
          teacher("baseline", "LOWER", { initialFairnessCount: 3 }),
          teacher("u1", "UPPER"),
        ],
        existingAssignments: [assignment("fixed", "2026-09-10", "baseline", "LOWER")],
      }),
    );
    const stats = result.statistics.find((value) => value.teacherId === "baseline");

    expect(stats).toEqual(
      expect.objectContaining({
        monthActualCount: 1,
        semesterActualCount: 1,
        effectiveSemesterCount: 4,
        dutyDates: ["2026-09-10"],
      }),
    );
  });

  it("BR-T14 creates no normal slots on a concentrated manual-duty date and counts N people", () => {
    const result = generateSchedule(
      input({
        teachers: [teacher("t1", "LOWER"), teacher("t2", "UPPER"), teacher("t3", "LOWER")],
        dutyDates: [
          {
            dutyDateId: "group",
            dutyDate: "2026-09-10",
            departmentMode: "SPECIAL_MANUAL",
            isSpecialReturn: true,
          },
        ],
        existingAssignments: [
          assignment("a1", "2026-09-10", "t1", null, {
            dutyDateId: "group",
            isSpecialReturn: true,
          }),
          assignment("a2", "2026-09-10", "t2", null, {
            dutyDateId: "group",
            isSpecialReturn: true,
          }),
          assignment("a3", "2026-09-10", "t3", null, {
            dutyDateId: "group",
            isSpecialReturn: true,
          }),
        ],
      }),
    );

    expect(result.feasibility.totalSlots).toBe(0);
    expect(result.generatedAssignments).toEqual([]);
    expect(result.statistics.every((value) => value.monthActualCount === 1)).toBe(true);
  });

  it("BR-T15 retains vacancies and a blocking error when no teacher can fill them", () => {
    const result = generateSchedule(
      input({
        teachers: [teacher("inactive", "LOWER", { active: false })],
      }),
    );

    expect(result.generatedAssignments).toEqual([]);
    expect(result.vacancies).toHaveLength(2);
    expect(result.issues.filter((value) => value.code === "NO_ELIGIBLE_CANDIDATE")).toHaveLength(2);
    expect(result.feasibility.blockingIssues).not.toEqual([]);
  });
});

describe("Phase 4 deterministic ordering, feasibility, and boundary behavior", () => {
  it("R036 processes a later special-return vacancy before an earlier ordinary vacancy", () => {
    const result = generateSchedule(
      input({
        teachers: [teacher("only", "LOWER"), teacher("fixed", "UPPER")],
        dutyDates: [
          ...normalDates(1, 10),
          {
            dutyDateId: "special-20",
            dutyDate: "2026-09-20",
            departmentMode: "NORMAL",
            isSpecialReturn: true,
          },
        ],
        existingAssignments: [
          assignment("upper-10", "2026-09-10", "fixed", "UPPER"),
          assignment("upper-20", "2026-09-20", "fixed", "UPPER", {
            dutyDateId: "special-20",
            isSpecialReturn: true,
          }),
        ],
        excludedTeacherIds: ["fixed"],
      }),
    );
    const special = result.generatedAssignments.find(
      (generated) => generated.dutyDate === "2026-09-20",
    );
    const ordinary = result.generatedAssignments.find(
      (generated) => generated.dutyDate === "2026-09-10",
    );

    expect(special?.explanation.monthlyRound).toBe(1);
    expect(ordinary?.explanation.monthlyRound).toBe(2);
  });

  it("normalizes all input arrays so shuffled input has the same fingerprint and result", () => {
    const canonical = input({
      teachers: [teacher("l1", "LOWER"), teacher("l2", "LOWER"), teacher("u1", "UPPER")],
      dutyDates: normalDates(2, 10),
      history: [
        { teacherId: "l1", dutyDate: "2026-08-01", isSpecialReturn: false },
        { teacherId: "u1", dutyDate: "2026-08-02", isSpecialReturn: false },
      ],
      excludedTeacherIds: ["nobody", "nobody"],
    });
    const shuffled: ScheduleEngineInputV1 = {
      ...canonical,
      teachers: [...canonical.teachers].reverse(),
      dutyDates: [...canonical.dutyDates].reverse(),
      history: [...canonical.history].reverse(),
      excludedTeacherIds: [...canonical.excludedTeacherIds].reverse(),
    };

    expect(generateSchedule(shuffled)).toEqual(generateSchedule(canonical));
  });

  it("uses a third round when fixed monthly duties exhaust lower rounds", () => {
    const result = generateSchedule(
      input({
        teachers: [teacher("l1", "LOWER"), teacher("u1", "UPPER")],
        dutyDates: normalDates(2, 10),
        existingAssignments: [assignment("fixed", "2026-09-01", "l1", null)],
      }),
    );

    expect(result.generatedAssignments.some((value) => value.explanation.monthlyRound === 3)).toBe(
      true,
    );
  });

  it("crosses floors when every home-floor teacher is excluded", () => {
    const result = generateSchedule(
      input({
        teachers: [teacher("home", "LOWER"), teacher("away1", "UPPER"), teacher("away2", "UPPER")],
        existingAssignments: [assignment("upper", "2026-09-10", "away2", "UPPER")],
        excludedTeacherIds: ["home"],
      }),
    );

    expect(result.generatedAssignments[0].teacherId).toBe("away1");
    expect(result.generatedAssignments[0].explanation.floorReason).toBe("NO_HOME_CANDIDATE");
  });

  it("regeneration removes old auto records from the working set but never removes manual records", () => {
    const manual = assignment("manual", "2026-09-10", "l1", "LOWER");
    const oldAuto = assignment("old-auto", "2026-09-10", "u1", "UPPER", { source: "AUTO" });
    const result = generateSchedule(
      input({
        teachers: [teacher("l1", "LOWER"), teacher("u1", "UPPER"), teacher("u2", "UPPER")],
        existingAssignments: [manual, oldAuto],
      }),
    );

    expect(result.preservedAssignments).toEqual([manual]);
    expect(result.generatedAssignments).toHaveLength(1);
    expect(result.generatedAssignments[0].assignmentKey).toBe("auto:date-2026-09-10:UPPER");
  });

  it("regeneration ignores prior auto output in the semantic fingerprint and reproduces it", () => {
    const first = generateSchedule(
      input({
        teachers: [
          teacher("l1", "LOWER"),
          teacher("l2", "LOWER"),
          teacher("u1", "UPPER"),
          teacher("u2", "UPPER"),
        ],
        dutyDates: normalDates(2, 10),
      }),
    );
    const priorAuto: ScheduleEngineExistingAssignment[] = first.generatedAssignments.map(
      (generated) => ({
        assignmentId: generated.assignmentKey,
        dutyDateId: generated.dutyDateId,
        dutyDate: generated.dutyDate,
        teacherId: generated.teacherId,
        source: "AUTO",
        occupiesDepartmentSlot: true,
        slotFloor: generated.slotFloor,
        isSpecialReturn: false,
      }),
    );
    const regenerated = generateSchedule(
      input({
        teachers: [
          teacher("l1", "LOWER"),
          teacher("l2", "LOWER"),
          teacher("u1", "UPPER"),
          teacher("u2", "UPPER"),
        ],
        dutyDates: normalDates(2, 10),
        existingAssignments: priorAuto,
      }),
    );

    expect(regenerated.inputFingerprint).toBe(first.inputFingerprint);
    expect(regenerated.generatedAssignments).toEqual(first.generatedAssignments);
  });

  it("uses prior-month records for interval sorting and adjacency checks", () => {
    const result = generateSchedule(
      input({
        yearMonth: "2026-10",
        scheduleId: "schedule-2026-10",
        teachers: [teacher("recent", "LOWER"), teacher("older", "LOWER"), teacher("u1", "UPPER")],
        dutyDates: [
          {
            dutyDateId: "oct-1",
            dutyDate: "2026-10-01",
            departmentMode: "NORMAL",
            isSpecialReturn: false,
          },
        ],
        history: [
          { teacherId: "recent", dutyDate: "2026-09-30", isSpecialReturn: false },
          { teacherId: "older", dutyDate: "2026-09-01", isSpecialReturn: false },
        ],
      }),
    );
    const lower = result.generatedAssignments.find((value) => value.slotFloor === "LOWER");

    expect(lower?.teacherId).toBe("older");
    expect(lower?.explanation.lastDutyDate).toBe("2026-09-01");
    expect(lower?.explanation.gapDays).toBe(30);
  });

  it("reports feasibility totals, floor capacity, and the estimated round lower bound", () => {
    const value = input({
      teachers: [teacher("l1", "LOWER"), teacher("u1", "UPPER"), teacher("x", "LOWER")],
      dutyDates: normalDates(2, 10),
      existingAssignments: [assignment("lower", "2026-09-10", "l1", "LOWER")],
      excludedTeacherIds: ["x"],
    });

    expect(analyzeScheduleFeasibility(value)).toEqual(
      expect.objectContaining({
        totalSlots: 4,
        filledSlots: 1,
        remainingSlots: 3,
        excludedTeachers: 1,
        eligibleTeachers: 2,
        teachersWithoutMonthlyDuty: 1,
        estimatedHighestRound: 2,
      }),
    );
    expect(analyzeScheduleFeasibility(value).floorCapacity).toEqual([
      {
        floorGroup: "LOWER",
        eligibleTeachers: 1,
        teachersWithoutMonthlyDuty: 0,
        remainingHomeSlots: 1,
      },
      {
        floorGroup: "UPPER",
        eligibleTeachers: 1,
        teachersWithoutMonthlyDuty: 1,
        remainingHomeSlots: 2,
      },
    ]);
    expect(analyzeScheduleFeasibility(value).capacityExplanation).toContain("容量下界");
  });

  it("returns confirmed schedules unchanged with a read-only blocking error", () => {
    const fixed = assignment("manual", "2026-09-10", "l1", "LOWER");
    const result = generateSchedule(input({ status: "CONFIRMED", existingAssignments: [fixed] }));

    expect(result.preservedAssignments).toEqual([fixed]);
    expect(result.generatedAssignments).toEqual([]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "CONFIRMED_SCHEDULE_READ_ONLY", severity: "ERROR" }),
    );
  });

  it("deduplicates person-day ledger entries and flags duplicate current records", () => {
    const duplicate = assignment("duplicate", "2026-09-10", "l1", null);
    const result = generateSchedule(
      input({
        existingAssignments: [assignment("first", "2026-09-10", "l1", null), duplicate],
      }),
    );

    expect(result.statistics.find((value) => value.teacherId === "l1")?.monthActualCount).toBe(1);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_DUTY_DATE", severity: "ERROR" }),
    );
  });

  it("provides every required explanation field for every generated assignment", () => {
    const result = generateSchedule(input());

    for (const generated of result.generatedAssignments) {
      expect(generated.explanation).toEqual(
        expect.objectContaining({
          ruleVersion: "1.1",
          monthlyRound: expect.any(Number),
          monthCountBefore: expect.any(Number),
          actualSemesterCountBefore: expect.any(Number),
          initialFairnessCount: expect.any(Number),
          effectiveSemesterCountBefore: expect.any(Number),
          floorMatch: expect.any(Boolean),
          floorToleranceApplied: expect.any(Boolean),
          floorReason: expect.any(String),
          relaxedConstraints: expect.any(Array),
          stableTieBreakKey: expect.stringMatching(/^[0-9a-f]{16}$/),
        }),
      );
    }
  });
});
