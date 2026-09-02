import type { Assignment, DutyDate, DutyType, ScheduleExportData } from "../repositories/types";

const weekdayLabels = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

const dutyTypeLabels: Record<DutyType, string> = {
  NORMAL_DUTY: "普通值班",
  BIG_DUTY: "大值班",
  HEAD_TEACHER_GROUP: "班主任集中值班",
  TERM_SPECIAL: "开学/期末",
  LEADER: "领导安排",
  OTHER: "其他任务",
};

export function suggestedScheduleExportName(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  return `财会金融系晚自习值班表（${year}年${Number(month)}月）.xlsx`;
}

export async function loadScheduleExportTemplate(): Promise<Uint8Array> {
  const templateUrl = new URL("../../reference/排班导出模版.xlsx", import.meta.url);
  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error(`无法读取排班导出模板（HTTP ${response.status}）`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function buildScheduleExportWorkbook(
  data: ScheduleExportData,
  templateBytes: Uint8Array,
): Promise<Uint8Array> {
  if (data.schedule.status !== "CONFIRMED") {
    throw new Error("只有已确认月份可以导出 Excel。请先完成检查与确认。");
  }
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBytes as never);
  const templateSheet = workbook.getWorksheet("晚自习") ?? workbook.worksheets[0];
  if (!templateSheet) throw new Error("导出模板中缺少工作表。");

  const titleStyle = cloneStyle(templateSheet.getCell("B1").style);
  const headerStyle = cloneStyle(templateSheet.getCell("B2").style);
  const dateStyle = cloneStyle(templateSheet.getCell("A4").style);
  const bodyStyle = cloneStyle(templateSheet.getCell("B4").style);
  const templatePageSetup = { ...templateSheet.pageSetup };
  workbook.removeWorksheet(templateSheet.id);
  const sheet = workbook.addWorksheet("晚自习");
  sheet.mergeCells("A1:F1");
  sheet.getCell("A1").value =
    `${data.semesterName} · ${formatChineseMonth(data.schedule.yearMonth)}晚自习值班表`;
  sheet.getCell("A1").style = cloneStyle(titleStyle);
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(2).values = [
    "日期",
    "星期",
    "7#1～3楼 值班老师",
    "7#4～5楼 值班老师",
    "任务标签",
    "备注",
  ];
  for (let column = 1; column <= 6; column += 1) {
    sheet.getRow(2).getCell(column).style = cloneStyle(headerStyle);
    sheet.getRow(2).getCell(column).alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
  }
  [14, 11, 25, 25, 38, 40].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  const assignmentsByDate = groupAssignments(data.assignments);
  const sortedDates = [...data.dutyDates].sort((a, b) => a.dutyDate.localeCompare(b.dutyDate));
  sortedDates.forEach((dutyDate, index) => {
    const row = sheet.getRow(index + 3);
    const assignments = assignmentsByDate.get(dutyDate.dutyDate) ?? [];
    const [year, month, day] = dutyDate.dutyDate.split("-").map(Number);
    const dateValue = new Date(Date.UTC(year, month - 1, day));
    row.values = [
      dateValue,
      weekdayLabels[dateValue.getUTCDay()],
      slotNames(assignments, "LOWER"),
      slotNames(assignments, "UPPER"),
      formatTaskLabels(dutyDate, assignments),
      formatNotes(dutyDate, assignments),
    ];
    row.height = Math.max(
      28,
      20 + Math.max(taskLineCount(row.getCell(5).text), taskLineCount(row.getCell(6).text)) * 12,
    );
    for (let column = 1; column <= 6; column += 1) {
      const cell = row.getCell(column);
      cell.style = cloneStyle(column === 1 ? dateStyle : bodyStyle);
      cell.alignment = {
        horizontal: column <= 4 ? "center" : "left",
        vertical: "middle",
        wrapText: true,
      };
      cell.font = { ...cell.font, name: "宋体", size: 12 };
    }
    row.getCell(1).numFmt = "yyyy-mm-dd";
    if (dutyDate.isSpecialReturn) row.getCell(1).font = { ...row.getCell(1).font, bold: true };
  });
  sheet.name = "晚自习";
  sheet.views = [{ state: "frozen", ySplit: 2, showGridLines: false }];
  sheet.pageSetup = {
    ...templatePageSetup,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "1:2",
  };
  sheet.autoFilter = { from: "A2", to: `F${Math.max(sortedDates.length + 2, 2)}` };

  const existingStatistics = workbook.getWorksheet("值班统计");
  if (existingStatistics) workbook.removeWorksheet(existingStatistics.id);
  const statistics = workbook.addWorksheet("值班统计", {
    views: [{ state: "frozen", ySplit: 2, showGridLines: false }],
  });
  statistics.mergeCells("A1:H1");
  statistics.getCell("A1").value =
    `${data.semesterName} · ${formatChineseMonth(data.schedule.yearMonth)}值班统计`;
  statistics.getCell("A1").style = cloneStyle(titleStyle);
  statistics.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  statistics.getRow(2).values = [
    "教师",
    "楼层",
    "本月实际次数",
    "学期实际次数",
    "初始公平次数",
    "公平口径次数",
    "特殊返校次数",
    "学期值班日期",
  ];
  for (let column = 1; column <= 8; column += 1) {
    statistics.getRow(2).getCell(column).style = cloneStyle(headerStyle);
  }
  data.statistics.forEach((item, index) => {
    const row = statistics.getRow(index + 3);
    row.values = [
      item.teacherName,
      item.floorGroup === "LOWER" ? "1–3楼" : "4–5楼",
      item.monthActualCount,
      item.semesterActualCount,
      item.initialFairnessCount,
      item.effectiveSemesterCount,
      item.specialReturnCount,
      item.dutyDates.join("、"),
    ];
    row.height = 24;
    row.eachCell((cell, column) => {
      cell.style = cloneStyle(bodyStyle);
      cell.font = { ...cell.font, name: "宋体", size: 11 };
      cell.alignment = {
        horizontal: column >= 3 && column <= 7 ? "right" : "left",
        vertical: "middle",
        wrapText: column === 8,
      };
      if (column >= 3 && column <= 7) cell.numFmt = "0";
    });
  });
  [16, 12, 15, 15, 15, 15, 15, 42].forEach((width, index) => {
    statistics.getColumn(index + 1).width = width;
  });
  statistics.autoFilter = {
    from: "A2",
    to: `H${Math.max(data.statistics.length + 2, 2)}`,
  };
  statistics.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "1:2",
  };

  const output = await workbook.xlsx.writeBuffer();
  return new Uint8Array(output as ArrayBuffer);
}

function groupAssignments(assignments: Assignment[]): Map<string, Assignment[]> {
  const grouped = new Map<string, Assignment[]>();
  for (const assignment of [...assignments].sort((a, b) =>
    `${a.dutyDate}:${a.slotFloor ?? ""}:${a.teacherName}:${a.id}`.localeCompare(
      `${b.dutyDate}:${b.slotFloor ?? ""}:${b.teacherName}:${b.id}`,
    ),
  )) {
    grouped.set(assignment.dutyDate, [...(grouped.get(assignment.dutyDate) ?? []), assignment]);
  }
  return grouped;
}

function slotNames(assignments: Assignment[], floor: "LOWER" | "UPPER"): string {
  const names = assignments
    .filter((assignment) => assignment.occupiesDepartmentSlot && assignment.slotFloor === floor)
    .map((assignment) => assignment.teacherName)
    .join("、");
  return names || "—";
}

function formatTaskLabels(dutyDate: DutyDate, assignments: Assignment[]): string {
  const prefix =
    dutyDate.departmentMode === "SPECIAL_MANUAL"
      ? "集中值班"
      : dutyDate.departmentMode === "NONE"
        ? "校级/外部任务"
        : "普通双岗位";
  if (assignments.length === 0) return prefix;
  return `${prefix}\n${assignments
    .map((assignment) => `${assignment.teacherName}（${dutyTypeLabels[assignment.dutyType]}）`)
    .join("、")}`;
}

function formatNotes(dutyDate: DutyDate, assignments: Assignment[]): string {
  const notes: string[] = [];
  if (dutyDate.isSpecialReturn) notes.push("特殊返校日");
  if (dutyDate.note?.trim()) notes.push(dutyDate.note.trim());
  for (const assignment of assignments) {
    if (assignment.note?.trim()) notes.push(`${assignment.teacherName}：${assignment.note.trim()}`);
  }
  return notes.join("\n");
}

function formatChineseMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  return `${year}年${Number(month)}月`;
}

function taskLineCount(value: string): number {
  return Math.max(1, value.split("\n").length);
}

function cloneStyle<T>(style: T): T {
  return structuredClone(style);
}
