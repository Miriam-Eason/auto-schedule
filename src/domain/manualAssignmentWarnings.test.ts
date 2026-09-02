import { describe, expect, it } from "vitest";

import { manualAssignmentWarnings } from "./manualAssignmentWarnings";

const base = {
  isExcluded: false,
  monthActualCount: 0,
  dutyDates: [] as string[],
  dutyDate: "2026-09-10",
  homeFloor: "LOWER" as const,
  slotFloor: "LOWER" as const,
  occupiesDepartmentSlot: true,
};

describe("manualAssignmentWarnings", () => {
  it("returns no warning for an ordinary first assignment", () => {
    expect(manualAssignmentWarnings(base)).toEqual([]);
  });

  it("explains exclusion and an existing monthly duty without blocking", () => {
    expect(manualAssignmentWarnings({ ...base, isExcluded: true, monthActualCount: 2 })).toEqual([
      "该教师已被本月排除（人工安排仍允许）",
      "该教师本月已有 2 个值班人日",
    ]);
  });

  it("detects adjacent natural dates across month boundaries", () => {
    expect(
      manualAssignmentWarnings({
        ...base,
        dutyDate: "2026-10-01",
        dutyDates: ["2026-09-30"],
      }),
    ).toContain("该教师相邻自然日已有值班");
  });

  it("warns only when an occupied slot explicitly crosses floors", () => {
    expect(manualAssignmentWarnings({ ...base, slotFloor: "UPPER" })).toContain(
      "本次为明确跨楼层占岗",
    );
    expect(
      manualAssignmentWarnings({
        ...base,
        slotFloor: "UPPER",
        occupiesDepartmentSlot: false,
      }),
    ).not.toContain("本次为明确跨楼层占岗");
  });
});
