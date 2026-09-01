import { describe, expect, it } from "vitest";

import {
  buildTeacherImportPreview,
  type TeacherImportMapping,
  type WorkbookGrid,
} from "./teacherImport";

const mapping: TeacherImportMapping = {
  lowerSheet: "lower",
  lowerColumn: 1,
  upperSheet: "upper",
  upperColumn: 1,
  majorSheet: "major",
  majorColumn: 1,
};

function workbook(lower: string[][], upper: string[][], major: string[][]): WorkbookGrid {
  return {
    sheets: [
      { name: "lower", rows: lower, maxColumn: 1 },
      { name: "upper", rows: upper, maxColumn: 1 },
      { name: "major", rows: major, maxColumn: 1 },
    ],
  };
}

describe("teacher import preview", () => {
  it("merges major-duty names into their floor instead of creating a third group", () => {
    const preview = buildTeacherImportPreview(
      workbook([["甲"], ["乙"]], [["丙"]], [["乙"], [""]]),
      mapping,
      [],
      [],
    );
    expect(preview.errors).toEqual([]);
    expect(preview.rows).toEqual([
      expect.objectContaining({ name: "甲", floorGroup: "LOWER", isMajorDuty: false }),
      expect.objectContaining({ name: "乙", floorGroup: "LOWER", isMajorDuty: true }),
      expect.objectContaining({ name: "丙", floorGroup: "UPPER", isMajorDuty: false }),
    ]);
  });

  it.each([
    ["same-sheet duplicate", workbook([["甲"], ["甲"]], [["乙"]], []), "DUPLICATE_NAME"],
    ["cross-floor duplicate", workbook([["甲"]], [["甲"]], []), "CROSS_FLOOR_DUPLICATE"],
    ["major teacher without floor", workbook([["甲"]], [["乙"]], [["丙"]]), "MAJOR_WITHOUT_FLOOR"],
    ["empty interior name", workbook([["甲"], [""], ["乙"]], [["丙"]], []), "EMPTY_NAME"],
  ])("reports %s", (_label, grid, code) => {
    const preview = buildTeacherImportPreview(grid as WorkbookGrid, mapping, [], []);
    expect(preview.errors.some((error) => error.code === code)).toBe(true);
  });

  it("blocks ambiguous matching when master data contains duplicate names", () => {
    const now = "2026-09-02T00:00:00Z";
    const preview = buildTeacherImportPreview(
      workbook([["同名"]], [], []),
      mapping,
      [
        { id: "t1", name: "同名", active: true, note: null, createdAt: now, updatedAt: now },
        { id: "t2", name: " 同 名 ", active: true, note: null, createdAt: now, updatedAt: now },
      ],
      [],
    );
    expect(preview.errors.some((error) => error.code === "AMBIGUOUS_EXISTING_TEACHER")).toBe(true);
  });
});
