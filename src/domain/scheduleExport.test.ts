import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type {
  Assignment,
  DutyDate,
  ScheduleExportData,
  TeacherDutyStatistics,
} from "../repositories/types";
import { buildScheduleExportWorkbook, suggestedScheduleExportName } from "./scheduleExport";

const now = "2026-09-02T00:00:00.000Z";

function dutyDate(
  id: string,
  date: string,
  departmentMode: DutyDate["departmentMode"],
  isSpecialReturn = false,
): DutyDate {
  return {
    id,
    scheduleId: "schedule-1",
    dutyDate: date,
    departmentMode,
    isSpecialReturn,
    specialReturnSource: "MANUAL",
    note: null,
    createdAt: now,
    updatedAt: now,
  };
}

function assignment(
  id: string,
  dutyDateId: string,
  date: string,
  teacherName: string,
  dutyType: Assignment["dutyType"],
  slotFloor: Assignment["slotFloor"],
): Assignment {
  return {
    id,
    scheduleId: "schedule-1",
    dutyDateId,
    dutyDate: date,
    departmentMode: slotFloor ? "NORMAL" : "SPECIAL_MANUAL",
    teacherId: `teacher-${id}`,
    semesterTeacherId: `member-${id}`,
    teacherName,
    teacherFloor: slotFloor ?? "LOWER",
    dutyType,
    source: "MANUAL",
    locked: true,
    occupiesDepartmentSlot: slotFloor !== null,
    slotFloor,
    explanationJson: null,
    note: id === "a3" ? "携带材料" : null,
    isSpecialReturn: date === "2026-09-07",
    createdAt: now,
    updatedAt: now,
  };
}

const statistics: TeacherDutyStatistics[] = [
  {
    semesterTeacherId: "member-a1",
    teacherId: "teacher-a1",
    teacherName: "甲老师",
    floorGroup: "LOWER",
    initialFairnessCount: 2,
    monthActualCount: 1,
    semesterActualCount: 3,
    effectiveSemesterCount: 5,
    specialReturnCount: 1,
    dutyDates: ["2026-09-01", "2026-09-07", "2026-09-20"],
  },
];

function exportData(status: "DRAFT" | "CONFIRMED" = "CONFIRMED"): ScheduleExportData {
  return {
    semesterName: "2026 秋季学期",
    schedule: {
      id: "schedule-1",
      semesterId: "semester-1",
      yearMonth: "2026-09",
      status,
      generationRevision: 1,
      inputFingerprint: "fingerprint",
      confirmedAt: status === "CONFIRMED" ? now : null,
      createdAt: now,
      updatedAt: now,
    },
    dutyDates: [
      dutyDate("d1", "2026-09-01", "NORMAL"),
      dutyDate("d2", "2026-09-07", "SPECIAL_MANUAL", true),
      dutyDate("d3", "2026-09-10", "NONE"),
    ],
    assignments: [
      assignment("a1", "d1", "2026-09-01", "甲老师", "NORMAL_DUTY", "LOWER"),
      assignment("a2", "d1", "2026-09-01", "乙老师", "BIG_DUTY", "UPPER"),
      assignment("a3", "d2", "2026-09-07", "丙老师", "HEAD_TEACHER_GROUP", null),
      assignment("a4", "d2", "2026-09-07", "丁老师", "TERM_SPECIAL", null),
      {
        ...assignment("a5", "d3", "2026-09-10", "戊老师", "BIG_DUTY", null),
        departmentMode: "NONE",
      },
    ],
    statistics,
  };
}

describe("schedule Excel export", () => {
  it("generates the Chinese filename preview", () => {
    expect(suggestedScheduleExportName("2026-09")).toBe("财会金融系晚自习值班表（2026年9月）.xlsx");
  });

  it("rejects draft schedules before workbook authoring", async () => {
    await expect(
      buildScheduleExportWorkbook(exportData("DRAFT"), new Uint8Array()),
    ).rejects.toThrow("已确认");
  });

  it("preserves the template language and exports normal, concentrated and external duties", async () => {
    const templatePath = fileURLToPath(
      new URL("../../reference/排班导出模版.xlsx", import.meta.url),
    );
    const template = new Uint8Array(await fs.readFile(templatePath));
    const bytes = await buildScheduleExportWorkbook(exportData(), template);
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["晚自习", "值班统计"]);
    const roster = workbook.getWorksheet("晚自习")!;
    expect(roster.getCell("A1").text).toContain("2026年9月晚自习值班表");
    expect(roster.getRow(2).values).toEqual([
      undefined,
      "日期",
      "星期",
      "7#1～3楼 值班老师",
      "7#4～5楼 值班老师",
      "任务标签",
      "备注",
    ]);
    expect(roster.getCell("B3").text).toBe("星期二");
    expect(roster.getCell("C3").text).toBe("甲老师");
    expect(roster.getCell("D3").text).toBe("乙老师");
    expect(roster.getCell("E4").text).toContain("丙老师（班主任集中值班）");
    expect(roster.getCell("E4").text).toContain("丁老师（开学/期末）");
    expect(roster.getCell("F4").text).toContain("特殊返校日");
    expect(roster.getCell("F4").text).toContain("丙老师：携带材料");
    expect(roster.getCell("E5").text).toContain("校级/外部任务");

    const stats = workbook.getWorksheet("值班统计")!;
    expect(stats.getRow(2).values).toContain("学期实际次数");
    expect(stats.getRow(2).values).toContain("公平口径次数");
    expect(stats.getCell("D3").value).toBe(3);
    expect(stats.getCell("F3").value).toBe(5);
  });
});
