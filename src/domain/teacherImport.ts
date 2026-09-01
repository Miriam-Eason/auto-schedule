import type { FloorGroup, SemesterTeacher, Teacher } from "../repositories/types";

export interface WorkbookSheet {
  name: string;
  rows: string[][];
  maxColumn: number;
}

export interface WorkbookGrid {
  sheets: WorkbookSheet[];
}

export interface TeacherImportMapping {
  lowerSheet: string;
  lowerColumn: number;
  upperSheet: string;
  upperColumn: number;
  majorSheet: string;
  majorColumn: number;
}

export type ImportErrorCode =
  | "MAPPING"
  | "EMPTY_NAME"
  | "DUPLICATE_NAME"
  | "CROSS_FLOOR_DUPLICATE"
  | "MAJOR_WITHOUT_FLOOR"
  | "AMBIGUOUS_EXISTING_TEACHER";

export interface TeacherImportError {
  code: ImportErrorCode;
  message: string;
  sheet?: string;
  row?: number;
}

export interface TeacherImportPreviewRow {
  name: string;
  floorGroup: FloorGroup;
  isMajorDuty: boolean;
  matchedTeacherId: string | null;
  initialFairnessCount: number;
}

export interface TeacherImportPreview {
  rows: TeacherImportPreviewRow[];
  errors: TeacherImportError[];
  createdCount: number;
  matchedCount: number;
}

interface NameCell {
  name: string;
  normalized: string;
  row: number;
  sheet: string;
}

export function normalizeTeacherName(value: string): string {
  return value.trim().replace(/\s+/gu, "").toLocaleLowerCase("zh-CN");
}

export async function readTeacherWorkbook(file: File): Promise<WorkbookGrid> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const bytes = new Uint8Array(await file.arrayBuffer());
  await workbook.xlsx.load(bytes as never);
  return {
    sheets: workbook.worksheets.map((worksheet) => {
      const rows: string[][] = [];
      for (let rowNumber = 1; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const values: string[] = [];
        for (let column = 1; column <= worksheet.actualColumnCount; column += 1) {
          values.push(row.getCell(column).text.trim());
        }
        rows.push(values);
      }
      return {
        name: worksheet.name,
        rows,
        maxColumn: Math.max(worksheet.actualColumnCount, 1),
      };
    }),
  };
}

export function suggestTeacherImportMapping(workbook: WorkbookGrid): TeacherImportMapping {
  const names = workbook.sheets.map((sheet) => sheet.name);
  const lower = names.find((name) => /1\s*[-–—至]\s*3楼/u.test(name)) ?? names[0] ?? "";
  const upper = names.find((name) => /4\s*[-–—至]\s*5楼/u.test(name)) ?? names[1] ?? names[0] ?? "";
  const major = names.find((name) => /大值班/u.test(name)) ?? names[2] ?? names[0] ?? "";
  return {
    lowerSheet: lower,
    lowerColumn: 1,
    upperSheet: upper,
    upperColumn: 1,
    majorSheet: major,
    majorColumn: 1,
  };
}

export function buildTeacherImportPreview(
  workbook: WorkbookGrid,
  mapping: TeacherImportMapping,
  teachers: Teacher[],
  semesterTeachers: SemesterTeacher[],
): TeacherImportPreview {
  const errors: TeacherImportError[] = [];
  const lower = extractNames(workbook, mapping.lowerSheet, mapping.lowerColumn, errors);
  const upper = extractNames(workbook, mapping.upperSheet, mapping.upperColumn, errors);
  const major = extractNames(workbook, mapping.majorSheet, mapping.majorColumn, errors);

  flagDuplicates(lower, errors);
  flagDuplicates(upper, errors);
  flagDuplicates(major, errors);

  const lowerNames = new Set(lower.map((cell) => cell.normalized));
  const upperNames = new Set(upper.map((cell) => cell.normalized));
  for (const cell of lower) {
    if (upperNames.has(cell.normalized)) {
      errors.push({
        code: "CROSS_FLOOR_DUPLICATE",
        message: `“${cell.name}”同时出现在两个楼层 Sheet，必须先确定唯一楼层。`,
        sheet: cell.sheet,
        row: cell.row,
      });
    }
  }

  const allFloorNames = new Set([...lowerNames, ...upperNames]);
  const majorNames = new Set(major.map((cell) => cell.normalized));
  for (const cell of major) {
    if (!allFloorNames.has(cell.normalized)) {
      errors.push({
        code: "MAJOR_WITHOUT_FLOOR",
        message: `大值班教师“${cell.name}”没有楼层归属，请先加入一个楼层 Sheet。`,
        sheet: cell.sheet,
        row: cell.row,
      });
    }
  }

  const existingByName = new Map<string, Teacher[]>();
  for (const teacher of teachers) {
    const key = normalizeTeacherName(teacher.name);
    existingByName.set(key, [...(existingByName.get(key) ?? []), teacher]);
  }
  const memberByTeacher = new Map(semesterTeachers.map((member) => [member.teacherId, member]));
  const uniqueFloorCells = new Map<string, { cell: NameCell; floorGroup: FloorGroup }>();
  for (const cell of lower) {
    if (!uniqueFloorCells.has(cell.normalized)) {
      uniqueFloorCells.set(cell.normalized, { cell, floorGroup: "LOWER" });
    }
  }
  for (const cell of upper) {
    if (!uniqueFloorCells.has(cell.normalized)) {
      uniqueFloorCells.set(cell.normalized, { cell, floorGroup: "UPPER" });
    }
  }

  const rows: TeacherImportPreviewRow[] = [];
  for (const [normalized, { cell, floorGroup }] of uniqueFloorCells) {
    const matches = existingByName.get(normalized) ?? [];
    if (matches.length > 1) {
      errors.push({
        code: "AMBIGUOUS_EXISTING_TEACHER",
        message: `系统中有 ${matches.length} 位同名“${cell.name}”，无法自动匹配，请先人工处理。`,
        sheet: cell.sheet,
        row: cell.row,
      });
    }
    const match = matches.length === 1 ? matches[0] : undefined;
    const existingMember = match ? memberByTeacher.get(match.id) : undefined;
    rows.push({
      name: cell.name,
      floorGroup,
      isMajorDuty: majorNames.has(normalized),
      matchedTeacherId: match?.id ?? null,
      initialFairnessCount: existingMember?.initialFairnessCount ?? 0,
    });
  }

  return {
    rows,
    errors: deduplicateErrors(errors),
    createdCount: rows.filter((row) => row.matchedTeacherId === null).length,
    matchedCount: rows.filter((row) => row.matchedTeacherId !== null).length,
  };
}

function extractNames(
  workbook: WorkbookGrid,
  sheetName: string,
  column: number,
  errors: TeacherImportError[],
): NameCell[] {
  const sheet = workbook.sheets.find((candidate) => candidate.name === sheetName);
  if (!sheet || !Number.isInteger(column) || column < 1 || column > sheet.maxColumn) {
    errors.push({
      code: "MAPPING",
      message: `无法读取 Sheet“${sheetName || "（未选择）"}”第 ${column} 列。`,
      sheet: sheetName,
    });
    return [];
  }
  const values = sheet.rows.map((row) => row[column - 1]?.trim() ?? "");
  let lastNonEmpty = values.length - 1;
  while (lastNonEmpty >= 0 && !values[lastNonEmpty]) lastNonEmpty -= 1;
  const result: NameCell[] = [];
  for (let index = 0; index <= lastNonEmpty; index += 1) {
    const name = values[index];
    if (!name) {
      errors.push({
        code: "EMPTY_NAME",
        message: `Sheet“${sheet.name}”第 ${index + 1} 行姓名为空。`,
        sheet: sheet.name,
        row: index + 1,
      });
      continue;
    }
    result.push({
      name,
      normalized: normalizeTeacherName(name),
      row: index + 1,
      sheet: sheet.name,
    });
  }
  return result;
}

function flagDuplicates(cells: NameCell[], errors: TeacherImportError[]): void {
  const counts = new Map<string, number>();
  for (const cell of cells) counts.set(cell.normalized, (counts.get(cell.normalized) ?? 0) + 1);
  for (const cell of cells) {
    if ((counts.get(cell.normalized) ?? 0) > 1) {
      errors.push({
        code: "DUPLICATE_NAME",
        message: `Sheet“${cell.sheet}”中的“${cell.name}”重复。`,
        sheet: cell.sheet,
        row: cell.row,
      });
    }
  }
}

function deduplicateErrors(errors: TeacherImportError[]): TeacherImportError[] {
  const seen = new Set<string>();
  return errors.filter((error) => {
    const key = `${error.code}|${error.sheet ?? ""}|${error.row ?? ""}|${error.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
