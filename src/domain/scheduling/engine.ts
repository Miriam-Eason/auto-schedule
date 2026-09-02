import {
  SCHEDULE_ENGINE_INPUT_VERSION,
  SCHEDULE_ENGINE_OUTPUT_VERSION,
  SCHEDULE_RULE_VERSION,
  type EngineFloorGroup,
  type FeasibilityResult,
  type GeneratedAssignment,
  type ScheduleEngineExistingAssignment,
  type ScheduleEngineHistoryDuty,
  type ScheduleEngineInputV1,
  type ScheduleEngineResultV1,
  type ScheduleEngineTeacher,
  type ScheduleIssue,
  type ScheduleSlot,
  type TeacherScheduleStatistics,
} from "./types";

const DAY_MS = 86_400_000;
const FLOORS: EngineFloorGroup[] = ["LOWER", "UPPER"];

interface NormalizedInput extends ScheduleEngineInputV1 {
  teachers: ScheduleEngineTeacher[];
  existingAssignments: ScheduleEngineExistingAssignment[];
  history: ScheduleEngineHistoryDuty[];
  excludedTeacherIds: string[];
}

interface LedgerEntry {
  date: string;
  isSpecialReturn: boolean;
}

class DutyLedger {
  private readonly entries = new Map<string, Map<string, LedgerEntry>>();

  add(teacherId: string, date: string, isSpecialReturn: boolean): void {
    const teacherEntries = this.entries.get(teacherId) ?? new Map<string, LedgerEntry>();
    const existing = teacherEntries.get(date);
    teacherEntries.set(date, {
      date,
      isSpecialReturn: existing?.isSpecialReturn === true || isSpecialReturn,
    });
    this.entries.set(teacherId, teacherEntries);
  }

  hasDutyOn(teacherId: string, date: string): boolean {
    return this.entries.get(teacherId)?.has(date) ?? false;
  }

  hasAdjacentDuty(teacherId: string, date: string): boolean {
    const target = dateOrdinal(date);
    return [...(this.entries.get(teacherId)?.values() ?? [])].some(
      (entry) => Math.abs(dateOrdinal(entry.date) - target) === 1,
    );
  }

  monthCount(teacherId: string, yearMonth: string): number {
    return [...(this.entries.get(teacherId)?.values() ?? [])].filter((entry) =>
      entry.date.startsWith(`${yearMonth}-`),
    ).length;
  }

  semesterCount(teacherId: string): number {
    return this.entries.get(teacherId)?.size ?? 0;
  }

  specialReturnCount(teacherId: string): number {
    return [...(this.entries.get(teacherId)?.values() ?? [])].filter(
      (entry) => entry.isSpecialReturn,
    ).length;
  }

  lastDutyBefore(teacherId: string, date: string): string | undefined {
    const earlierDates = [...(this.entries.get(teacherId)?.keys() ?? [])]
      .filter((entryDate) => entryDate < date)
      .sort();
    return earlierDates[earlierDates.length - 1];
  }

  dates(teacherId: string): string[] {
    return [...(this.entries.get(teacherId)?.keys() ?? [])].sort();
  }
}

function dateOrdinal(value: string): number {
  return (
    Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) /
    DAY_MS
  );
}

function gapDays(earlier: string, later: string): number {
  return dateOrdinal(later) - dateOrdinal(earlier);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function normalizedInput(input: ScheduleEngineInputV1): NormalizedInput {
  return {
    ...input,
    teachers: [...input.teachers].sort((left, right) =>
      compareText(left.teacherId, right.teacherId),
    ),
    dutyDates: [...input.dutyDates].sort(
      (left, right) =>
        compareText(left.dutyDate, right.dutyDate) ||
        compareText(left.dutyDateId, right.dutyDateId),
    ),
    existingAssignments: [...input.existingAssignments].sort(
      (left, right) =>
        compareText(left.dutyDate, right.dutyDate) ||
        compareText(left.assignmentId, right.assignmentId),
    ),
    history: [...input.history].sort(
      (left, right) =>
        compareText(left.dutyDate, right.dutyDate) || compareText(left.teacherId, right.teacherId),
    ),
    excludedTeacherIds: [...new Set(input.excludedTeacherIds)].sort(compareText),
  };
}

function inputFingerprint(input: NormalizedInput): string {
  const semanticInput =
    input.generationMode === "REGENERATE_AUTO"
      ? {
          ...input,
          existingAssignments: input.existingAssignments.filter(
            (assignment) => assignment.source === "MANUAL",
          ),
        }
      : input;
  return `fnv1a64:${fnv1a64(JSON.stringify(semanticInput))}`;
}

function preservedAssignments(input: NormalizedInput): ScheduleEngineExistingAssignment[] {
  if (input.generationMode === "FILL_VACANCIES") return input.existingAssignments;
  return input.existingAssignments.filter((assignment) => assignment.source === "MANUAL");
}

function buildLedger(
  input: NormalizedInput,
  preserved: ScheduleEngineExistingAssignment[],
): DutyLedger {
  const ledger = new DutyLedger();
  for (const duty of input.history) {
    ledger.add(duty.teacherId, duty.dutyDate, duty.isSpecialReturn);
  }
  for (const assignment of preserved) {
    ledger.add(assignment.teacherId, assignment.dutyDate, assignment.isSpecialReturn);
  }
  return ledger;
}

function baseEligibleTeachers(
  input: NormalizedInput,
  excluded: ReadonlySet<string>,
): ScheduleEngineTeacher[] {
  // R025: only active, participating, non-excluded semester teachers enter the auto pool.
  return input.teachers.filter(
    (teacher) => teacher.active && teacher.participates && !excluded.has(teacher.teacherId),
  );
}

function buildVacancies(
  input: NormalizedInput,
  preserved: ScheduleEngineExistingAssignment[],
): ScheduleSlot[] {
  const occupied = new Set(
    preserved
      .filter((assignment) => assignment.occupiesDepartmentSlot && assignment.slotFloor)
      .map((assignment) => `${assignment.dutyDateId}:${assignment.slotFloor}`),
  );
  return input.dutyDates.flatMap((dutyDate) => {
    if (dutyDate.departmentMode !== "NORMAL") return [];
    return FLOORS.filter((floor) => !occupied.has(`${dutyDate.dutyDateId}:${floor}`)).map(
      (floor): ScheduleSlot => ({
        slotId: `${dutyDate.dutyDateId}:${floor}`,
        dutyDateId: dutyDate.dutyDateId,
        dutyDate: dutyDate.dutyDate,
        slotFloor: floor,
        isSpecialReturn: dutyDate.isSpecialReturn === true,
      }),
    );
  });
}

function qualifiedForSlot(
  teachers: ScheduleEngineTeacher[],
  ledger: DutyLedger,
  slot: ScheduleSlot,
): ScheduleEngineTeacher[] {
  return teachers.filter((teacher) => !ledger.hasDutyOn(teacher.teacherId, slot.dutyDate));
}

function estimateHighestRound(
  teachers: ScheduleEngineTeacher[],
  ledger: DutyLedger,
  yearMonth: string,
  remainingSlots: number,
): number | null {
  if (remainingSlots === 0) return 0;
  if (teachers.length === 0) return null;
  const counts = teachers.map((teacher) => ledger.monthCount(teacher.teacherId, yearMonth));
  let highestRound = 0;
  for (let index = 0; index < remainingSlots; index += 1) {
    counts.sort((left, right) => left - right);
    highestRound = Math.max(highestRound, counts[0] + 1);
    counts[0] += 1;
  }
  return highestRound;
}

function issue(input: NormalizedInput, value: Omit<ScheduleIssue, "scheduleId">): ScheduleIssue {
  return { ...value, scheduleId: input.scheduleId };
}

function inspectInput(
  input: NormalizedInput,
  preserved: ScheduleEngineExistingAssignment[],
): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];
  if (input.inputVersion !== SCHEDULE_ENGINE_INPUT_VERSION) {
    issues.push(
      issue(input, {
        code: "INVALID_INPUT",
        severity: "ERROR",
        message: `不支持的排班引擎输入版本：${String(input.inputVersion)}`,
        suggestedAction: "使用版本 1 的输入 DTO",
      }),
    );
  }
  if (input.status === "CONFIRMED") {
    issues.push(
      issue(input, {
        code: "CONFIRMED_SCHEDULE_READ_ONLY",
        severity: "ERROR",
        message: "已确认月份不能自动排班",
        suggestedAction: "先撤回为草稿",
      }),
    );
  }
  for (const dutyDate of input.dutyDates) {
    if (dutyDate.departmentMode === "NORMAL" && dutyDate.isSpecialReturn === null) {
      issues.push(
        issue(input, {
          code: "PENDING_SPECIAL_RETURN",
          severity: "ERROR",
          message: `${dutyDate.dutyDate} 的特殊返校状态尚待确认`,
          dutyDate: dutyDate.dutyDate,
          suggestedAction: "确认该日期是否为特殊返校日后再生成",
        }),
      );
    }
  }

  const teachers = new Map(input.teachers.map((teacher) => [teacher.teacherId, teacher]));
  const excluded = new Set(input.excludedTeacherIds);
  const seenPersonDates = new Set<string>();
  for (const assignment of preserved) {
    const personDate = `${assignment.teacherId}:${assignment.dutyDate}`;
    if (seenPersonDates.has(personDate)) {
      issues.push(
        issue(input, {
          code: "DUPLICATE_DUTY_DATE",
          severity: "ERROR",
          message: `${assignment.dutyDate} 存在同一教师重复值班记录`,
          dutyDate: assignment.dutyDate,
          teacherId: assignment.teacherId,
          suggestedAction: "合并同一教师同一日期的业务标签",
        }),
      );
    }
    seenPersonDates.add(personDate);
    const teacher = teachers.get(assignment.teacherId);
    if (
      (!teacher?.active || !teacher.participates) &&
      assignment.dutyDate.startsWith(input.yearMonth)
    ) {
      issues.push(
        issue(input, {
          code: "INACTIVE_ASSIGNEE",
          severity: "ERROR",
          message: `${assignment.dutyDate} 的安排使用了非活动或非本学期参与教师`,
          dutyDate: assignment.dutyDate,
          teacherId: assignment.teacherId,
          suggestedAction: "核对教师状态或更换人员",
        }),
      );
    }
    if (
      assignment.source === "MANUAL" &&
      excluded.has(assignment.teacherId) &&
      assignment.dutyDate.startsWith(input.yearMonth)
    ) {
      issues.push(
        issue(input, {
          code: "EXCLUDED_MANUAL_ASSIGNMENT",
          severity: "WARNING",
          message: `${assignment.dutyDate} 人工安排了本月排除教师`,
          dutyDate: assignment.dutyDate,
          teacherId: assignment.teacherId,
          suggestedAction: "确认本次人工突破排除是有意操作",
        }),
      );
    }
  }
  return issues;
}

function buildFeasibility(
  input: NormalizedInput,
  ledger: DutyLedger,
  vacancies: ScheduleSlot[],
  inputIssues: ScheduleIssue[],
): FeasibilityResult {
  // R026/R050: this is a capacity lower bound, not a promise about the generated result.
  const excluded = new Set(input.excludedTeacherIds);
  const eligible = baseEligibleTeachers(input, excluded);
  const totalSlots = input.dutyDates.filter((date) => date.departmentMode === "NORMAL").length * 2;
  const filledSlots = totalSlots - vacancies.length;
  const estimatedHighestRound = estimateHighestRound(
    eligible,
    ledger,
    input.yearMonth,
    vacancies.length,
  );
  const floorCapacity = FLOORS.map((floorGroup) => {
    const floorTeachers = eligible.filter((teacher) => teacher.floorGroup === floorGroup);
    return {
      floorGroup,
      eligibleTeachers: floorTeachers.length,
      teachersWithoutMonthlyDuty: floorTeachers.filter(
        (teacher) => ledger.monthCount(teacher.teacherId, input.yearMonth) === 0,
      ).length,
      remainingHomeSlots: vacancies.filter((slot) => slot.slotFloor === floorGroup).length,
    };
  });
  const structuralBlockers = vacancies.flatMap((slot) => {
    if (qualifiedForSlot(eligible, ledger, slot).length > 0) return [];
    return [
      issue(input, {
        code: "NO_ELIGIBLE_CANDIDATE",
        severity: "ERROR",
        message: `${slot.dutyDate} ${slot.slotFloor} 岗位没有合格候选人`,
        dutyDate: slot.dutyDate,
        slotFloor: slot.slotFloor,
        suggestedAction: "调整排除、教师参与状态或人工安排该岗位",
      }),
    ];
  });
  const capacityExplanation =
    vacancies.length === 0
      ? "普通岗位已全部填满，无需进入自动排班轮次。"
      : estimatedHighestRound === null
        ? `剩余 ${vacancies.length} 个岗位，但当前没有合格自动候选人。`
        : `剩余 ${vacancies.length} 个岗位；按 ${eligible.length} 名合格教师及当前月度负担估算，至少使用到第 ${estimatedHighestRound} 轮。该结果是容量下界，楼层与相邻日约束可能使实际轮次更高。`;
  return {
    totalSlots,
    filledSlots,
    remainingSlots: vacancies.length,
    excludedTeachers: input.teachers.filter((teacher) => excluded.has(teacher.teacherId)).length,
    eligibleTeachers: eligible.length,
    teachersWithoutMonthlyDuty: eligible.filter(
      (teacher) => ledger.monthCount(teacher.teacherId, input.yearMonth) === 0,
    ).length,
    estimatedHighestRound,
    floorCapacity,
    capacityExplanation,
    blockingIssues: [...inputIssues, ...structuralBlockers].filter(
      (candidate) => candidate.severity === "ERROR",
    ),
  };
}

function sortVacancies(
  vacancies: ScheduleSlot[],
  eligible: ScheduleEngineTeacher[],
  ledger: DutyLedger,
): ScheduleSlot[] {
  // R036: special return, then scarcity, then business date and floor.
  const scarcity = (slot: ScheduleSlot) => qualifiedForSlot(eligible, ledger, slot).length;
  return [...vacancies].sort(
    (left, right) =>
      Number(right.isSpecialReturn) - Number(left.isSpecialReturn) ||
      scarcity(left) - scarcity(right) ||
      compareText(left.dutyDate, right.dutyDate) ||
      FLOORS.indexOf(left.slotFloor) - FLOORS.indexOf(right.slotFloor) ||
      compareText(left.slotId, right.slotId),
  );
}

function keepMinimum<T>(values: T[], score: (value: T) => number): T[] {
  const minimum = Math.min(...values.map(score));
  return values.filter((value) => score(value) === minimum);
}

function stableKey(
  input: NormalizedInput,
  fingerprint: string,
  teacherId: string,
  slotId: string,
): string {
  // R034: no random source is allowed in the final tie break.
  return fnv1a64(`${input.semesterId}|${input.yearMonth}|${fingerprint}|${teacherId}|${slotId}`);
}

function generateForSlot(
  input: NormalizedInput,
  slot: ScheduleSlot,
  eligible: ScheduleEngineTeacher[],
  ledger: DutyLedger,
  fingerprint: string,
): { assignment?: GeneratedAssignment; issues: ScheduleIssue[] } {
  let candidates = qualifiedForSlot(eligible, ledger, slot);
  if (candidates.length === 0) {
    return {
      issues: [
        issue(input, {
          code: "NO_ELIGIBLE_CANDIDATE",
          severity: "ERROR",
          message: `${slot.dutyDate} ${slot.slotFloor} 岗位没有合格候选人`,
          dutyDate: slot.dutyDate,
          slotFloor: slot.slotFloor,
          suggestedAction: "调整排除、教师参与状态或人工安排该岗位",
        }),
      ],
    };
  }

  // R027-R033: apply each priority layer in rule order; later criteria cannot undo earlier ones.
  candidates = keepMinimum(candidates, (teacher) =>
    ledger.monthCount(teacher.teacherId, input.yearMonth),
  );
  if (slot.isSpecialReturn) {
    candidates = keepMinimum(candidates, (teacher) => ledger.specialReturnCount(teacher.teacherId));
  }

  const nonAdjacent = candidates.filter(
    (teacher) => !ledger.hasAdjacentDuty(teacher.teacherId, slot.dutyDate),
  );
  const relaxedAdjacent = nonAdjacent.length === 0;
  if (!relaxedAdjacent) candidates = nonAdjacent;

  const globalMin = Math.min(
    ...candidates.map(
      (teacher) => teacher.initialFairnessCount + ledger.semesterCount(teacher.teacherId),
    ),
  );
  const homeCandidates = candidates.filter((teacher) => teacher.floorGroup === slot.slotFloor);
  const homeMin =
    homeCandidates.length === 0
      ? Number.POSITIVE_INFINITY
      : Math.min(
          ...homeCandidates.map(
            (teacher) => teacher.initialFairnessCount + ledger.semesterCount(teacher.teacherId),
          ),
        );
  const useHome = homeCandidates.length > 0 && homeMin <= globalMin + 1;
  const floorReason = useHome
    ? "HOME_WITHIN_TOLERANCE"
    : homeCandidates.length === 0
      ? "NO_HOME_CANDIDATE"
      : "CROSS_FLOOR_ADVANTAGE";
  if (useHome) candidates = homeCandidates;

  candidates.sort((left, right) => {
    const leftEffective = left.initialFairnessCount + ledger.semesterCount(left.teacherId);
    const rightEffective = right.initialFairnessCount + ledger.semesterCount(right.teacherId);
    if (leftEffective !== rightEffective) return leftEffective - rightEffective;
    const leftLast = ledger.lastDutyBefore(left.teacherId, slot.dutyDate);
    const rightLast = ledger.lastDutyBefore(right.teacherId, slot.dutyDate);
    const leftGap = leftLast ? gapDays(leftLast, slot.dutyDate) : Number.POSITIVE_INFINITY;
    const rightGap = rightLast ? gapDays(rightLast, slot.dutyDate) : Number.POSITIVE_INFINITY;
    if (leftGap !== rightGap) return rightGap - leftGap;
    return compareText(
      stableKey(input, fingerprint, left.teacherId, slot.slotId),
      stableKey(input, fingerprint, right.teacherId, slot.slotId),
    );
  });

  const selected = candidates[0];
  const monthCountBefore = ledger.monthCount(selected.teacherId, input.yearMonth);
  const actualSemesterCountBefore = ledger.semesterCount(selected.teacherId);
  const specialReturnCountBefore = ledger.specialReturnCount(selected.teacherId);
  const lastDutyDate = ledger.lastDutyBefore(selected.teacherId, slot.dutyDate);
  const floorMatch = selected.floorGroup === slot.slotFloor;
  const tieBreakKey = stableKey(input, fingerprint, selected.teacherId, slot.slotId);
  const assignment: GeneratedAssignment = {
    assignmentKey: `auto:${slot.slotId}`,
    dutyDateId: slot.dutyDateId,
    dutyDate: slot.dutyDate,
    teacherId: selected.teacherId,
    semesterTeacherId: selected.semesterTeacherId,
    slotFloor: slot.slotFloor,
    source: "AUTO",
    occupiesDepartmentSlot: true,
    explanation: {
      ruleVersion: SCHEDULE_RULE_VERSION,
      monthlyRound: monthCountBefore + 1,
      monthCountBefore,
      ...(slot.isSpecialReturn ? { specialReturnCountBefore } : {}),
      actualSemesterCountBefore,
      initialFairnessCount: selected.initialFairnessCount,
      effectiveSemesterCountBefore: selected.initialFairnessCount + actualSemesterCountBefore,
      floorMatch,
      floorToleranceApplied: !floorMatch,
      floorReason,
      ...(lastDutyDate ? { lastDutyDate, gapDays: gapDays(lastDutyDate, slot.dutyDate) } : {}),
      relaxedConstraints: relaxedAdjacent ? ["ADJACENT_DUTY"] : [],
      stableTieBreakKey: tieBreakKey,
    },
  };
  const issues: ScheduleIssue[] = [];
  if (relaxedAdjacent) {
    issues.push(
      issue(input, {
        code: "ADJACENT_DUTY",
        severity: "WARNING",
        message: `${selected.displayName} 在 ${slot.dutyDate} 的安排放宽了相邻日回避`,
        dutyDate: slot.dutyDate,
        teacherId: selected.teacherId,
        slotFloor: slot.slotFloor,
        suggestedAction: "确认连续值班可接受，或人工更换人员",
      }),
    );
  }
  if (!floorMatch) {
    issues.push(
      issue(input, {
        code: "CROSS_FLOOR",
        severity: "INFO",
        message: `${selected.displayName} 跨楼层填充 ${slot.slotFloor} 岗位（${floorReason}）`,
        dutyDate: slot.dutyDate,
        teacherId: selected.teacherId,
        slotFloor: slot.slotFloor,
      }),
    );
  }
  if (monthCountBefore > 0) {
    issues.push(
      issue(input, {
        code: "MONTH_MULTIPLE_DUTIES",
        severity: "WARNING",
        message: `${selected.displayName} 本月进入第 ${monthCountBefore + 1} 轮`,
        dutyDate: slot.dutyDate,
        teacherId: selected.teacherId,
        slotFloor: slot.slotFloor,
        suggestedAction: "核对容量与固定任务；第二轮及以后在容量不足时允许",
      }),
    );
  }
  return { assignment, issues };
}

function statistics(input: NormalizedInput, ledger: DutyLedger): TeacherScheduleStatistics[] {
  return input.teachers.map((teacher) => {
    const semesterActualCount = ledger.semesterCount(teacher.teacherId);
    return {
      teacherId: teacher.teacherId,
      monthActualCount: ledger.monthCount(teacher.teacherId, input.yearMonth),
      semesterActualCount,
      effectiveSemesterCount: teacher.initialFairnessCount + semesterActualCount,
      specialReturnCount: ledger.specialReturnCount(teacher.teacherId),
      dutyDates: ledger.dates(teacher.teacherId),
    };
  });
}

function specialReturnImbalanceIssue(
  input: NormalizedInput,
  eligible: ScheduleEngineTeacher[],
  ledger: DutyLedger,
): ScheduleIssue[] {
  if (eligible.length < 2) return [];
  const counts = eligible.map((teacher) => ledger.specialReturnCount(teacher.teacherId));
  if (Math.max(...counts) - Math.min(...counts) <= 1) return [];
  return [
    issue(input, {
      code: "SPECIAL_RETURN_IMBALANCE",
      severity: "WARNING",
      message: "学期特殊返校次数差超过 1；固定任务或更高优先级约束可能导致该差异",
      suggestedAction: "检查固定任务与特殊返校安排",
    }),
  ];
}

export function analyzeScheduleFeasibility(inputValue: ScheduleEngineInputV1): FeasibilityResult {
  const input = normalizedInput(inputValue);
  const preserved = preservedAssignments(input);
  const ledger = buildLedger(input, preserved);
  const vacancies = buildVacancies(input, preserved);
  const inputIssues = inspectInput(input, preserved);
  return buildFeasibility(input, ledger, vacancies, inputIssues);
}

export function generateSchedule(inputValue: ScheduleEngineInputV1): ScheduleEngineResultV1 {
  const input = normalizedInput(inputValue);
  const fingerprint = inputFingerprint(input);
  const preserved = preservedAssignments(input);
  const ledger = buildLedger(input, preserved);
  const initialVacancies = buildVacancies(input, preserved);
  const inputIssues = inspectInput(input, preserved);
  const feasibility = buildFeasibility(input, ledger, initialVacancies, inputIssues);
  const hasBlockingInput = inputIssues.some((candidate) => candidate.severity === "ERROR");
  const eligible = baseEligibleTeachers(input, new Set(input.excludedTeacherIds));
  const generatedAssignments: GeneratedAssignment[] = [];
  const vacancies: ScheduleSlot[] = [];
  const issues = [...inputIssues];

  if (hasBlockingInput) {
    vacancies.push(...initialVacancies);
  } else {
    for (const slot of sortVacancies(initialVacancies, eligible, ledger)) {
      const generated = generateForSlot(input, slot, eligible, ledger, fingerprint);
      issues.push(...generated.issues);
      if (!generated.assignment) {
        vacancies.push(slot);
        continue;
      }
      generatedAssignments.push(generated.assignment);
      ledger.add(
        generated.assignment.teacherId,
        generated.assignment.dutyDate,
        slot.isSpecialReturn,
      );
    }
    issues.push(...specialReturnImbalanceIssue(input, eligible, ledger));
  }

  return {
    outputVersion: SCHEDULE_ENGINE_OUTPUT_VERSION,
    ruleVersion: SCHEDULE_RULE_VERSION,
    inputFingerprint: fingerprint,
    feasibility,
    preservedAssignments: preserved,
    generatedAssignments: generatedAssignments.sort(
      (left, right) =>
        compareText(left.dutyDate, right.dutyDate) ||
        FLOORS.indexOf(left.slotFloor) - FLOORS.indexOf(right.slotFloor),
    ),
    vacancies: vacancies.sort(
      (left, right) =>
        compareText(left.dutyDate, right.dutyDate) ||
        FLOORS.indexOf(left.slotFloor) - FLOORS.indexOf(right.slotFloor),
    ),
    issues,
    statistics: statistics(input, ledger),
  };
}
