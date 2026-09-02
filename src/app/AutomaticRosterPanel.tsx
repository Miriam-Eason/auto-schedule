import { useCallback, useEffect, useMemo, useState } from "react";

import {
  analyzeScheduleFeasibility,
  generateSchedule,
  type AssignmentExplanation,
  type FeasibilityResult,
  type GenerationMode,
  type ScheduleEngineResultV1,
  type ScheduleIssue,
} from "../domain/scheduling";
import type {
  Assignment,
  RosterRepository,
  ScheduleAutomationContext,
} from "../repositories/types";
import { buildSaveAutoAssignmentsRequest, buildScheduleEngineInput } from "./scheduleAutomation";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function floorLabel(value: "LOWER" | "UPPER"): string {
  return value === "LOWER" ? "1–3 楼" : "4–5 楼";
}

function parseExplanation(assignment: Assignment): AssignmentExplanation | null {
  if (!assignment.explanationJson) return null;
  try {
    return JSON.parse(assignment.explanationJson) as AssignmentExplanation;
  } catch {
    return null;
  }
}

function explanationText(explanation: AssignmentExplanation): string {
  const parts = [
    `第 ${explanation.monthlyRound} 轮（落位前本月 ${explanation.monthCountBefore} 次）`,
    `学期实际 ${explanation.actualSemesterCountBefore} 次，公平口径 ${explanation.effectiveSemesterCountBefore} 次`,
    explanation.floorMatch ? "优先使用本楼层教师" : "因公平差或本楼层无候选而跨楼层",
    explanation.lastDutyDate
      ? `上次值班 ${explanation.lastDutyDate}，间隔 ${explanation.gapDays ?? "—"} 天`
      : "此前没有值班记录",
  ];
  if (explanation.specialReturnCountBefore !== undefined) {
    parts.push(`落位前特殊返校 ${explanation.specialReturnCountBefore} 次`);
  }
  if (explanation.relaxedConstraints.includes("ADJACENT_DUTY")) {
    parts.push("因无其他候选，已放宽相邻日回避");
  }
  return parts.join("；");
}

const inputBlockingCodes = new Set<ScheduleIssue["code"]>([
  "CONFIRMED_SCHEDULE_READ_ONLY",
  "DUPLICATE_DUTY_DATE",
  "INACTIVE_ASSIGNEE",
  "INVALID_INPUT",
  "PENDING_SPECIAL_RETURN",
]);

export function AutomaticRosterPanel({
  scheduleId,
  editable,
  repository,
  refreshVersion,
  onSaved,
  onLocateDate,
}: {
  scheduleId: string;
  editable: boolean;
  repository: RosterRepository;
  refreshVersion: number;
  onSaved: () => Promise<void>;
  onLocateDate: (dutyDate: string) => void;
}) {
  const [context, setContext] = useState<ScheduleAutomationContext | null>(null);
  const [feasibility, setFeasibility] = useState<FeasibilityResult | null>(null);
  const [lastResult, setLastResult] = useState<ScheduleEngineResultV1 | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<ScheduleIssue | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await repository.getScheduleAutomationContext(scheduleId);
    setContext(next);
    setFeasibility(analyzeScheduleFeasibility(buildScheduleEngineInput(next, "FILL_VACANCIES")));
  }, [repository, scheduleId]);

  useEffect(() => {
    setBusy(true);
    load()
      .catch((error: unknown) => setNotice(errorMessage(error)))
      .finally(() => setBusy(false));
  }, [load, refreshVersion]);

  const autoAssignments = useMemo(
    () => context?.assignments.filter((assignment) => assignment.source === "AUTO") ?? [],
    [context],
  );
  const issues = lastResult?.issues ?? feasibility?.blockingIssues ?? [];
  const selectedAssignment =
    autoAssignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null;

  async function runGeneration(mode: GenerationMode) {
    if (mode === "REGENERATE_AUTO") {
      const count = autoAssignments.length;
      if (
        !window.confirm(
          `重新自动排班将删除并重建当前 ${count} 条自动记录；全部人工固定任务会原样保留。继续吗？`,
        )
      )
        return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const fresh = await repository.getScheduleAutomationContext(scheduleId);
      const input = buildScheduleEngineInput(fresh, mode);
      const nextFeasibility = analyzeScheduleFeasibility(input);
      const result = generateSchedule(input);
      setContext(fresh);
      setFeasibility(nextFeasibility);
      setLastResult(result);
      if (result.issues.some((issue) => inputBlockingCodes.has(issue.code))) {
        setNotice("当前输入存在阻断项，结果仅供检查，未写入数据库。请先处理问题后重试。");
        return;
      }
      await repository.saveAutoAssignments(
        buildSaveAutoAssignmentsRequest(
          fresh,
          mode,
          result.inputFingerprint,
          result.generatedAssignments,
        ),
      );
      await onSaved();
      await load();
      setNotice(
        result.vacancies.length > 0
          ? `已保存 ${result.generatedAssignments.length} 条自动安排，仍有 ${result.vacancies.length} 个岗位空缺。`
          : `已保存 ${result.generatedAssignments.length} 条自动安排，普通岗位已填满。`,
      );
    } catch (error) {
      setNotice(errorMessage(error));
      await load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  function locate(issue: ScheduleIssue) {
    setSelectedIssue(issue);
    if (issue.dutyDate) onLocateDate(issue.dutyDate);
  }

  return (
    <section className="automation-panel" aria-labelledby="automation-heading">
      <div className="section-heading compact-heading">
        <div>
          <h3 id="automation-heading">4 自动排班与解释</h3>
          <p>先看容量下界，再补齐空缺；重新生成只替换自动记录。</p>
        </div>
        <button className="secondary" disabled={busy} type="button" onClick={() => void load()}>
          刷新可行性
        </button>
      </div>

      {notice ? (
        <div className="inline-notice" role="status">
          {notice}
        </div>
      ) : null}

      {feasibility ? (
        <>
          <div className="feasibility-grid">
            <div>
              <span>总岗位</span>
              <strong>{feasibility.totalSlots}</strong>
            </div>
            <div>
              <span>已填 / 剩余</span>
              <strong>
                {feasibility.filledSlots} / {feasibility.remainingSlots}
              </strong>
            </div>
            <div>
              <span>合格候选</span>
              <strong>{feasibility.eligibleTeachers}</strong>
            </div>
            <div>
              <span>本月排除</span>
              <strong>{feasibility.excludedTeachers}</strong>
            </div>
            <div>
              <span>尚未值班</span>
              <strong>{feasibility.teachersWithoutMonthlyDuty}</strong>
            </div>
            <div>
              <span>预计最高轮次</span>
              <strong>{feasibility.estimatedHighestRound ?? "无法估算"}</strong>
            </div>
          </div>
          <p className="capacity-explanation">{feasibility.capacityExplanation}</p>
          <div className="floor-capacity">
            {feasibility.floorCapacity.map((floor) => (
              <span key={floor.floorGroup}>
                {floorLabel(floor.floorGroup)}：{floor.eligibleTeachers} 人候选，
                {floor.teachersWithoutMonthlyDuty} 人尚未值班，剩余 {floor.remainingHomeSlots} 岗
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="empty-row">正在读取可行性数据…</p>
      )}

      <div className="automation-actions">
        <button
          disabled={!editable || busy || !context}
          type="button"
          onClick={() => void runGeneration("FILL_VACANCIES")}
        >
          {autoAssignments.length === 0 ? "生成自动排班" : "补齐空缺"}
        </button>
        <button
          className="danger"
          disabled={!editable || busy || !context || autoAssignments.length === 0}
          type="button"
          onClick={() => void runGeneration("REGENERATE_AUTO")}
        >
          重新自动排班
        </button>
      </div>

      <div className="automation-detail-grid">
        <div>
          <h4>问题与提示</h4>
          <ul className="issue-list">
            {issues.length === 0 ? (
              <li className="empty-row">当前没有引擎问题。</li>
            ) : (
              issues.map((issue, index) => (
                <li
                  className={`issue-${issue.severity.toLowerCase()}`}
                  key={`${issue.code}-${index}`}
                >
                  <button type="button" onClick={() => locate(issue)}>
                    <span>
                      {issue.severity} · {issue.code}
                    </span>
                    <strong>{issue.message}</strong>
                  </button>
                </li>
              ))
            )}
          </ul>
          {selectedIssue ? (
            <p className="located-detail">
              已定位：{selectedIssue.dutyDate ?? "全月"}
              {selectedIssue.teacherId ? ` · 教师 ${selectedIssue.teacherId}` : ""}
              {selectedIssue.suggestedAction ? `。建议：${selectedIssue.suggestedAction}` : ""}
            </p>
          ) : null}
        </div>
        <div>
          <h4>自动安排解释</h4>
          <ul className="explanation-list">
            {autoAssignments.length === 0 ? (
              <li className="empty-row">尚无已保存的自动安排。</li>
            ) : (
              autoAssignments.map((assignment) => (
                <li key={assignment.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAssignmentId(assignment.id);
                      onLocateDate(assignment.dutyDate);
                    }}
                  >
                    {assignment.dutyDate} · {floorLabel(assignment.slotFloor!)} ·{" "}
                    {assignment.teacherName}
                  </button>
                </li>
              ))
            )}
          </ul>
          {selectedAssignment ? (
            <p className="explanation-copy">
              {parseExplanation(selectedAssignment)
                ? explanationText(parseExplanation(selectedAssignment)!)
                : "这条自动记录缺少可读取的解释快照。"}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
