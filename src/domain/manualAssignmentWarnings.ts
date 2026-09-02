import type { FloorGroup } from "../repositories/types";

export interface ManualAssignmentWarningInput {
  isExcluded: boolean;
  monthActualCount: number;
  dutyDates: string[];
  dutyDate: string;
  homeFloor: FloorGroup;
  slotFloor: FloorGroup;
  occupiesDepartmentSlot: boolean;
}

function dayDistance(left: string, right: string): number {
  const toDay = (value: string) =>
    Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8)));
  return Math.abs((toDay(left) - toDay(right)) / 86_400_000);
}

export function manualAssignmentWarnings(input: ManualAssignmentWarningInput): string[] {
  const warnings: string[] = [];
  if (input.isExcluded) warnings.push("该教师已被本月排除（人工安排仍允许）");
  if (input.monthActualCount > 0)
    warnings.push(`该教师本月已有 ${input.monthActualCount} 个值班人日`);
  if (input.dutyDates.some((date) => dayDistance(date, input.dutyDate) === 1))
    warnings.push("该教师相邻自然日已有值班");
  if (input.occupiesDepartmentSlot && input.slotFloor !== input.homeFloor)
    warnings.push("本次为明确跨楼层占岗");
  return warnings;
}
