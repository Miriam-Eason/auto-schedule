import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DepartmentMode,
  DutyDate,
  MonthlySchedule,
  RosterRepository,
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
      const nextDates = nextId ? await repository.listDutyDates(nextId) : [];
      setSchedules(nextSchedules);
      setSelectedScheduleId(nextId);
      setDates(nextDates);
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
      setDates(await repository.listDutyDates(id));
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
    const next = schedule.status === "DRAFT" ? "CONFIRMED" : "DRAFT";
    if (
      !window.confirm(
        next === "CONFIRMED"
          ? `确认 ${schedule.yearMonth}？确认后月份只读。Phase 6 将补充岗位完整性检查。`
          : `将 ${schedule.yearMonth} 撤回为草稿以继续编辑？`,
      )
    )
      return;
    await run(
      async () => {
        await repository.setMonthlyScheduleStatus(schedule.id, next);
        await load(schedule.id);
      },
      next === "CONFIRMED" ? "月份已确认并设为只读。" : "月份已撤回为草稿。",
    );
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
              const inSemester = value >= semester.startDate && value <= semester.endDate;
              return (
                <button
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
          />
        </>
      ) : (
        <p className="empty-row">先创建学期范围内的月份，再在月历中选择系部值班日。</p>
      )}
    </section>
  );
}
