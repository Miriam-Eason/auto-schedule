import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  Assignment,
  DepartmentMode,
  DutyDate,
  MonthlySchedule,
  RosterRepository,
  ScheduleReview,
  Semester,
  SemesterTeacher,
} from "../repositories/types";
import { ManualRosterPanel } from "./ManualRosterPanel";

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function calendarDates(yearMonth: string): Array<string | null> {
  const [yearText, monthText] = yearMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const sundayFirst = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const mondayFirst = (sundayFirst + 6) % 7;
  const cells: Array<string | null> = Array.from({ length: mondayFirst }, () => null);
  for (let day = 1; day <= days; day += 1) {
    cells.push(`${yearMonth}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function sourceLabel(date: DutyDate): string {
  if (date.specialReturnSource === "PENDING_CONFIRMATION") return "返校待确认";
  if (date.specialReturnSource === "MANUAL") return "人工返校标记";
  return "系统推导";
}

export function MonthlyCalendar({
  semester,
  repository,
  members,
  onLedgerChanged,
}: {
  semester: Semester;
  repository: RosterRepository;
  members: SemesterTeacher[];
  onLedgerChanged: () => Promise<void>;
}) {
  const [schedules, setSchedules] = useState<MonthlySchedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [dates, setDates] = useState<DutyDate[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [review, setReview] = useState<ScheduleReview | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [newMonth, setNewMonth] = useState(semester.startDate.slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const schedule = schedules.find((item) => item.id === selectedScheduleId) ?? null;
  const departmentDates = useMemo(
    () => dates.filter((date) => date.departmentMode !== "NONE"),
    [dates],
  );
  const dateByValue = useMemo(
    () => new Map(departmentDates.map((date) => [date.dutyDate, date])),
    [departmentDates],
  );
  const selectedDutyDate = selectedDate ? (dateByValue.get(selectedDate) ?? null) : null;
  const assignmentsByDate = useMemo(() => {
    const grouped = new Map<string, Assignment[]>();
    for (const assignment of assignments) {
      grouped.set(assignment.dutyDate, [...(grouped.get(assignment.dutyDate) ?? []), assignment]);
    }
    return grouped;
  }, [assignments]);
  const cells = useMemo(() => (schedule ? calendarDates(schedule.yearMonth) : []), [schedule]);
  const editable = semester.status === "ACTIVE" && schedule?.status === "DRAFT";
  const pendingCount = departmentDates.filter(
    (date) => date.specialReturnSource === "PENDING_CONFIRMATION",
  ).length;

  const load = useCallback(
    async (preferredId?: string | null) => {
      const nextSchedules = await repository.listMonthlySchedules(semester.id);
      const nextId = nextSchedules.some((item) => item.id === preferredId)
        ? (preferredId ?? null)
        : (nextSchedules[nextSchedules.length - 1]?.id ?? null);
      const [nextDates, nextAssignments, nextReview] = nextId
        ? await Promise.all([
            repository.listDutyDates(nextId),
            repository.listAssignments(nextId),
            repository.reviewSchedule(nextId),
          ])
        : [[], [], null];
      setSchedules(nextSchedules);
      setSelectedScheduleId(nextId);
      setDates(nextDates);
      setAssignments(nextAssignments);
      setReview(nextReview);
      setSelectedDate((current) =>
        current && nextDates.some((date) => date.dutyDate === current) ? current : null,
      );
    },
    [repository, semester.id],
  );

  useEffect(() => {
    setNewMonth(semester.startDate.slice(0, 7));
    setBusy(true);
    load()
      .catch((error: unknown) => setNotice(errorMessage(error)))
      .finally(() => setBusy(false));
  }, [load, semester.startDate]);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice(success);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function selectSchedule(id: string) {
    setBusy(true);
    setNotice(null);
    try {
      setSelectedScheduleId(id);
      const [nextDates, nextAssignments, nextReview] = await Promise.all([
        repository.listDutyDates(id),
        repository.listAssignments(id),
        repository.reviewSchedule(id),
      ]);
      setDates(nextDates);
      setAssignments(nextAssignments);
      setReview(nextReview);
      setSelectedDate(null);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function createSchedule() {
    await run(async () => {
      const created = await repository.createMonthlySchedule({
        id: crypto.randomUUID(),
        semesterId: semester.id,
        yearMonth: newMonth,
      });
      await load(created.id);
    }, "月份已创建为草稿。月初如缺少前月记录，首个值班日会等待确认。");
  }

  async function saveDate(mode: DepartmentMode) {
    if (!schedule || !selectedDate) return;
    await run(
      async () => {
        setDates(
          await repository.saveDutyDate({
            id: selectedDutyDate?.id ?? crypto.randomUUID(),
            scheduleId: schedule.id,
            dutyDate: selectedDate,
            departmentMode: mode,
          }),
        );
        await load(schedule.id);
        setSelectedDate(selectedDate);
      },
      selectedDutyDate ? "日期类型已更新。" : "已设为系部值班日。相邻日期标记已刷新。",
    );
  }

  async function removeDate() {
    if (!schedule || !selectedDate) return;
    if (
      !window.confirm(
        `取消 ${selectedDate} 的系部值班日？该日期已有的人工值班会随日期一并删除并重算统计。`,
      )
    )
      return;
    await run(async () => {
      setDates(await repository.deleteDutyDate(schedule.id, selectedDate));
      await load(schedule.id);
      setSelectedDate(null);
    }, "已取消系部值班日；后续月份的自动返校标记已刷新。");
  }

  async function setSpecialReturn(value: boolean | null) {
    if (!schedule || !selectedDate) return;
    await run(
      async () => {
        setDates(await repository.setSpecialReturn(schedule.id, selectedDate, value));
        await load(schedule.id);
        setSelectedDate(selectedDate);
      },
      value === null ? "已恢复系统推导。" : "已保存人工返校标记。",
    );
  }

  async function toggleStatus() {
    if (!schedule) return;
    if (schedule.status === "CONFIRMED") {
      if (!window.confirm(`将 ${schedule.yearMonth} 撤回为草稿以继续编辑？既有排班不会被删除。`))
        return;
      await run(async () => {
        await repository.setMonthlyScheduleStatus(schedule.id, "DRAFT");
        await load(schedule.id);
      }, "月份已撤回为草稿，可修改后再次确认。");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const latestReview = await repository.reviewSchedule(schedule.id);
      setReview(latestReview);
      if (latestReview.errorCount > 0) {
        setNotice(`确认被阻止：仍有 ${latestReview.errorCount} 项 ERROR。请按检查清单处理后重试。`);
        return;
      }
      const warningText = latestReview.issues
        .filter((issue) => issue.severity === "WARNING")
        .map((issue) => `• ${issue.message}`)
        .join("\n");
      const prompt =
        latestReview.warningCount > 0
          ? `确认 ${schedule.yearMonth}？当前有 ${latestReview.warningCount} 项警告，请确认你已知情：\n\n${warningText}`
          : `确认 ${schedule.yearMonth}？普通岗位完整且没有阻断错误；确认后月份只读。`;
      if (!window.confirm(prompt)) return;
      await repository.confirmMonthlySchedule({
        scheduleId: schedule.id,
        acknowledgeWarnings: latestReview.warningCount > 0,
      });
      await load(schedule.id);
      setNotice("月份已通过完整性检查并确认；如需修改，请先撤回为草稿。");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card monthly-card">
      <div className="section-heading">
        <div>
          <h2>月份与值班日历</h2>
          <p>日期由管理员选择；周几仅作视觉辅助，特殊返校按相邻自然日推导。</p>
        </div>
        {schedule ? (
          <button
            className="secondary"
            disabled={busy || semester.status !== "ACTIVE"}
            type="button"
            onClick={() => void toggleStatus()}
          >
            {schedule.status === "DRAFT" ? "确认月份" : "撤回为草稿"}
          </button>
        ) : null}
      </div>

      {notice ? (
        <div className="inline-notice" role="status">
          {notice}
        </div>
      ) : null}

      <div className="month-toolbar">
        <label>
          已建月份
          <select
            disabled={busy || schedules.length === 0}
            value={selectedScheduleId ?? ""}
            onChange={(event) => void selectSchedule(event.currentTarget.value)}
          >
            {schedules.length === 0 ? <option value="">尚未创建</option> : null}
            {schedules.map((item) => (
              <option key={item.id} value={item.id}>
                {item.yearMonth} · {item.status === "DRAFT" ? "草稿" : "已确认"}
              </option>
            ))}
          </select>
        </label>
        <div className="create-month">
          <label>
            新建月份
            <input
              disabled={busy || semester.status !== "ACTIVE"}
              type="month"
              min={semester.startDate.slice(0, 7)}
              max={semester.endDate.slice(0, 7)}
              value={newMonth}
              onChange={(event) => setNewMonth(event.currentTarget.value)}
            />
          </label>
          <button
            disabled={busy || semester.status !== "ACTIVE" || !newMonth}
            type="button"
            onClick={() => void createSchedule()}
          >
            创建月份
          </button>
        </div>
      </div>

      {schedule ? (
        <>
          <ol className="workflow-steps" aria-label="排班步骤">
            <li>1 选择日期</li>
            <li>2 排除人员</li>
            <li>3 固定安排</li>
            <li>4 自动排班</li>
            <li className="active">5 检查确认</li>
          </ol>
          <div className="calendar-status">
            <span className={`status-chip ${schedule.status.toLowerCase()}`}>
              {schedule.status === "DRAFT" ? "草稿可编辑" : "已确认只读"}
            </span>
            <span>{departmentDates.length} 个系部值班日</span>
            {pendingCount > 0 ? (
              <strong>{pendingCount} 个返校标记待确认，当前不能确认月份</strong>
            ) : null}
          </div>
          <div className="calendar-grid weekday-row" aria-hidden="true">
            {weekdays.map((day) => (
              <span key={day}>周{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {cells.map((value, index) => {
              if (!value) return <span className="calendar-empty" key={`empty-${index}`} />;
              const date = dateByValue.get(value);
              const dayAssignments = assignmentsByDate.get(value) ?? [];
              const inSemester = value >= semester.startDate && value <= semester.endDate;
              return (
                <button
                  id={`calendar-day-${value}`}
                  className={`calendar-day ${date ? "has-duty" : ""} ${selectedDate === value ? "selected" : ""}`}
                  disabled={!inSemester}
                  key={value}
                  type="button"
                  onClick={() => setSelectedDate(value)}
                >
                  <span className="day-number">{Number(value.slice(-2))}</span>
                  {!inSemester ? <small>学期外</small> : null}
                  {date ? (
                    <>
                      <strong>{date.departmentMode === "NORMAL" ? "普通日" : "集中日"}</strong>
                      <small>
                        {date.isSpecialReturn === null
                          ? "返校待确认"
                          : date.isSpecialReturn
                            ? "特殊返校"
                            : "连续周期"}
                      </small>
                      {dayAssignments.slice(0, 3).map((assignment) => (
                        <small className="calendar-assignment" key={assignment.id}>
                          {assignment.slotFloor
                            ? assignment.slotFloor === "LOWER"
                              ? "1–3楼"
                              : "4–5楼"
                            : "任务"}
                          · {assignment.teacherName} ·{" "}
                          {assignment.source === "AUTO" ? "自动" : "人工"}
                        </small>
                      ))}
                      {dayAssignments.length > 3 ? (
                        <small>另有 {dayAssignments.length - 3} 人</small>
                      ) : null}
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
          {selectedDate ? (
            <div className="date-editor">
              <div>
                <strong>{selectedDate}</strong>
                <span>
                  {selectedDutyDate
                    ? `${selectedDutyDate.departmentMode === "NORMAL" ? "普通双岗位日" : "集中人工值班日"} · ${sourceLabel(selectedDutyDate)}`
                    : "尚未设为系部值班日"}
                </span>
              </div>
              <div className="date-actions">
                {!selectedDutyDate ? (
                  <button
                    disabled={!editable || busy}
                    type="button"
                    onClick={() => void saveDate("NORMAL")}
                  >
                    设为普通值班日
                  </button>
                ) : (
                  <>
                    <select
                      aria-label="日期类型"
                      disabled={!editable || busy}
                      value={selectedDutyDate.departmentMode}
                      onChange={(event) =>
                        void saveDate(event.currentTarget.value as DepartmentMode)
                      }
                    >
                      <option value="NORMAL">普通日（双岗位）</option>
                      <option value="SPECIAL_MANUAL">集中日（人工多人）</option>
                    </select>
                    <button
                      className="secondary"
                      disabled={!editable || busy}
                      type="button"
                      onClick={() => void setSpecialReturn(true)}
                    >
                      标为特殊返校
                    </button>
                    <button
                      className="secondary"
                      disabled={!editable || busy}
                      type="button"
                      onClick={() => void setSpecialReturn(false)}
                    >
                      取消特殊返校
                    </button>
                    <button
                      className="secondary"
                      disabled={!editable || busy}
                      type="button"
                      onClick={() => void setSpecialReturn(null)}
                    >
                      恢复自动推导
                    </button>
                    <button
                      className="danger"
                      disabled={!editable || busy}
                      type="button"
                      onClick={() => void removeDate()}
                    >
                      取消值班日
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="calendar-hint">选择一个日期以新增、改类型或确认特殊返校标记。</p>
          )}
          <section className="schedule-review" aria-labelledby="schedule-review-heading">
            <div className="section-heading compact-heading">
              <div>
                <h3 id="schedule-review-heading">5 检查与确认</h3>
                <p>每次调整后从账本重算；ERROR 阻止确认，WARNING 需明确知情。</p>
              </div>
              {review ? (
                <span className="review-counts">
                  ERROR {review.errorCount} · WARNING {review.warningCount} · INFO{" "}
                  {review.infoCount}
                </span>
              ) : null}
            </div>
            <ul className="issue-list review-issue-list">
              {review?.issues.length ? (
                review.issues.map((issue, index) => (
                  <li
                    className={`issue-${issue.severity.toLowerCase()}`}
                    key={`${issue.code}-${index}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!issue.dutyDate) return;
                        setSelectedDate(issue.dutyDate);
                        window.requestAnimationFrame(() =>
                          document
                            .getElementById(`calendar-day-${issue.dutyDate}`)
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            }),
                        );
                      }}
                    >
                      <span>
                        {issue.severity} · {issue.code}
                      </span>
                      <strong>{issue.message}</strong>
                    </button>
                  </li>
                ))
              ) : (
                <li className="empty-row">当前账本没有确认前问题。</li>
              )}
            </ul>
          </section>
          <ManualRosterPanel
            schedule={schedule}
            dates={dates}
            members={members}
            selectedDate={selectedDate}
            editable={Boolean(editable)}
            repository={repository}
            onLedgerChanged={async () => {
              await load(schedule.id);
              await onLedgerChanged();
            }}
            onLocateDate={(dutyDate) => {
              setSelectedDate(dutyDate);
              window.requestAnimationFrame(() =>
                document.getElementById(`calendar-day-${dutyDate}`)?.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                }),
              );
            }}
          />
        </>
      ) : (
        <p className="empty-row">先创建学期范围内的月份，再在月历中选择系部值班日。</p>
      )}
    </section>
  );
}
