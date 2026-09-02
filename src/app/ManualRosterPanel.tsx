import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { manualAssignmentWarnings } from "../domain/manualAssignmentWarnings";
import type {
  Assignment,
  DutyDate,
  DutyType,
  FloorGroup,
  MonthlyExclusion,
  MonthlySchedule,
  RosterRepository,
  SemesterTeacher,
  TeacherDutyStatistics,
} from "../repositories/types";
import { AutomaticRosterPanel } from "./AutomaticRosterPanel";

const dutyTypeLabels: Record<DutyType, string> = {
  NORMAL_DUTY: "普通值班",
  BIG_DUTY: "大值班",
  HEAD_TEACHER_GROUP: "班主任集中值班",
  TERM_SPECIAL: "开学/期末",
  LEADER: "领导安排",
  OTHER: "其他",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ManualRosterPanel({
  schedule,
  dates,
  members,
  selectedDate,
  editable,
  repository,
  onLedgerChanged,
  onLocateDate,
}: {
  schedule: MonthlySchedule;
  dates: DutyDate[];
  members: SemesterTeacher[];
  selectedDate: string | null;
  editable: boolean;
  repository: RosterRepository;
  onLedgerChanged: () => Promise<void>;
  onLocateDate: (dutyDate: string) => void;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [exclusions, setExclusions] = useState<MonthlyExclusion[]>([]);
  const [statistics, setStatistics] = useState<TeacherDutyStatistics[]>([]);
  const [teacherId, setTeacherId] = useState(members[0]?.teacherId ?? "");
  const [dutyDate, setDutyDate] = useState(selectedDate ?? `${schedule.yearMonth}-01`);
  const [dutyType, setDutyType] = useState<DutyType>("NORMAL_DUTY");
  const [slotFloor, setSlotFloor] = useState<FloorGroup>("LOWER");
  const [assignmentNote, setAssignmentNote] = useState("");
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [exclusionTeacherId, setExclusionTeacherId] = useState(members[0]?.teacherId ?? "");
  const [exclusionReason, setExclusionReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [automationRefreshVersion, setAutomationRefreshVersion] = useState(0);

  const load = useCallback(async () => {
    const [nextAssignments, nextExclusions, nextStatistics] = await Promise.all([
      repository.listAssignments(schedule.id),
      repository.listMonthlyExclusions(schedule.id),
      repository.getScheduleStatistics(schedule.id),
    ]);
    setAssignments(nextAssignments);
    setExclusions(nextExclusions);
    setStatistics(nextStatistics);
  }, [repository, schedule.id]);

  useEffect(() => {
    setBusy(true);
    load()
      .catch((error: unknown) => setNotice(errorMessage(error)))
      .finally(() => setBusy(false));
  }, [load]);

  useEffect(() => {
    if (selectedDate) setDutyDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (!teacherId && members[0]) setTeacherId(members[0].teacherId);
    if (!exclusionTeacherId && members[0]) setExclusionTeacherId(members[0].teacherId);
  }, [exclusionTeacherId, members, teacherId]);

  const dateConfig = useMemo(
    () => dates.find((item) => item.dutyDate === dutyDate) ?? null,
    [dates, dutyDate],
  );
  const selectedMember = members.find((member) => member.teacherId === teacherId) ?? null;
  const selectedStatistics = statistics.find((row) => row.teacherId === teacherId) ?? null;
  const exclusionIds = useMemo(
    () => new Set(exclusions.map((item) => item.teacherId)),
    [exclusions],
  );

  useEffect(() => {
    if (selectedMember && !editingAssignment) setSlotFloor(selectedMember.floorGroup);
  }, [editingAssignment, selectedMember]);

  async function refreshAfterMutation() {
    await load();
    await onLedgerChanged();
    setAutomationRefreshVersion((value) => value + 1);
  }

  async function saveAssignment(event: FormEvent) {
    event.preventDefault();
    if (!selectedMember) return;
    if (!dateConfig && dutyType !== "BIG_DUTY") {
      setNotice("非系部值班日只能录入大值班；请先在月历设置日期，或改选“大值班”。");
      return;
    }
    const replacingSameTeacher = editingAssignment?.teacherId === teacherId;
    const warnings = manualAssignmentWarnings({
      isExcluded: exclusionIds.has(teacherId),
      monthActualCount: Math.max(
        0,
        (selectedStatistics?.monthActualCount ?? 0) - (replacingSameTeacher ? 1 : 0),
      ),
      dutyDates: (selectedStatistics?.dutyDates ?? []).filter(
        (date) => !(replacingSameTeacher && date === editingAssignment?.dutyDate),
      ),
      dutyDate,
      homeFloor: selectedMember.floorGroup,
      slotFloor,
      occupiesDepartmentSlot: dateConfig?.departmentMode === "NORMAL",
    });
    if (
      warnings.length > 0 &&
      !window.confirm(`保存这项人工固定排班？\n\n${warnings.map((item) => `• ${item}`).join("\n")}`)
    )
      return;

    setBusy(true);
    setNotice(null);
    try {
      const request = {
        id: editingAssignment?.id ?? crypto.randomUUID(),
        dutyDateId: crypto.randomUUID(),
        scheduleId: schedule.id,
        dutyDate,
        teacherId,
        semesterTeacherId: selectedMember.id,
        dutyType,
        slotFloor: dateConfig?.departmentMode === "NORMAL" ? slotFloor : null,
        note: assignmentNote.trim() || null,
      };
      if (editingAssignment) {
        await repository.adjustAssignment({
          ...request,
          assignmentId: editingAssignment.id,
        });
      } else {
        await repository.saveManualAssignment(request);
      }
      setAssignmentNote("");
      setEditingAssignment(null);
      await refreshAfterMutation();
      setNotice(
        warnings.length > 0
          ? `已${editingAssignment ? "调整" : "保存"}，并显示 ${warnings.length} 项人工突破提示。`
          : editingAssignment
            ? "目标记录已原子调整；其他自动岗位未改变，统计与问题已重算。"
            : "人工固定排班已保存。",
      );
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function editAssignment(assignment: Assignment) {
    setEditingAssignment(assignment);
    setDutyDate(assignment.dutyDate);
    setTeacherId(assignment.teacherId);
    setDutyType(assignment.dutyType);
    setSlotFloor(assignment.slotFloor ?? assignment.teacherFloor);
    setAssignmentNote(assignment.note ?? "");
    onLocateDate(assignment.dutyDate);
    setNotice(
      assignment.source === "AUTO"
        ? "正在调整自动记录；保存后该记录会转为人工锁定，但保留原记录 ID。"
        : "正在编辑人工记录。可以换人、改日期、移动岗位或修改任务。",
    );
  }

  async function deleteAssignment(assignment: Assignment) {
    if (
      !window.confirm(
        `删除 ${assignment.dutyDate} · ${assignment.teacherName} 的${assignment.source === "AUTO" ? "自动" : "人工"}值班？只会留下空缺并重算统计，不会自动补人。`,
      )
    )
      return;
    setBusy(true);
    setNotice(null);
    try {
      await repository.deleteAssignment(schedule.id, assignment.id);
      await refreshAfterMutation();
      setNotice("人工值班已删除，账本统计已重算。");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveExclusion(event: FormEvent) {
    event.preventDefault();
    if (!exclusionTeacherId) return;
    setBusy(true);
    setNotice(null);
    try {
      await repository.saveMonthlyExclusion({
        id: crypto.randomUUID(),
        scheduleId: schedule.id,
        teacherId: exclusionTeacherId,
        reason: exclusionReason.trim() || null,
      });
      setExclusionReason("");
      await load();
      setAutomationRefreshVersion((value) => value + 1);
      setNotice("本月排除已保存；只影响后续自动候选，不阻止人工安排。");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteExclusion(teacherIdToDelete: string) {
    setBusy(true);
    setNotice(null);
    try {
      await repository.deleteMonthlyExclusion(schedule.id, teacherIdToDelete);
      await load();
      setAutomationRefreshVersion((value) => value + 1);
      setNotice("本月排除已移除。");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="manual-roster">
      <div className="section-heading compact-heading">
        <div>
          <h3>人工固定排班与月度排除</h3>
          <p>人工任务默认锁定；所有任务按同一教师同一自然日计一次账。</p>
        </div>
      </div>
      {notice ? (
        <div className="inline-notice" role="status">
          {notice}
        </div>
      ) : null}

      <div className="phase-three-grid">
        <form className="ledger-form" onSubmit={(event) => void saveExclusion(event)}>
          <h4>2 月度排除</h4>
          <label>
            教师
            <select
              disabled={!editable || busy}
              value={exclusionTeacherId}
              onChange={(event) => setExclusionTeacherId(event.currentTarget.value)}
            >
              {members.map((member) => (
                <option key={member.id} value={member.teacherId}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            原因（可选）
            <input
              disabled={!editable || busy}
              value={exclusionReason}
              onChange={(event) => setExclusionReason(event.currentTarget.value)}
            />
          </label>
          <button disabled={!editable || busy || !exclusionTeacherId} type="submit">
            保存本月排除
          </button>
          <ul className="compact-list">
            {exclusions.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{item.teacherName}</strong>
                  {item.reason ? ` · ${item.reason}` : ""}
                </span>
                <button
                  className="text-button"
                  disabled={!editable || busy}
                  type="button"
                  onClick={() => void deleteExclusion(item.teacherId)}
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        </form>

        <form className="ledger-form" onSubmit={(event) => void saveAssignment(event)}>
          <h4>{editingAssignment ? "3 调整目标记录" : "3 固定安排"}</h4>
          {editingAssignment ? (
            <p className="editing-banner">
              仅修改 {editingAssignment.dutyDate} · {editingAssignment.teacherName}
              ；不会自动重排其他岗位。
            </p>
          ) : null}
          <div className="form-two-columns">
            <label>
              日期
              <input
                disabled={!editable || busy}
                type="date"
                min={`${schedule.yearMonth}-01`}
                max={`${schedule.yearMonth}-31`}
                value={dutyDate}
                onChange={(event) => setDutyDate(event.currentTarget.value)}
              />
            </label>
            <label>
              教师
              <select
                disabled={!editable || busy}
                value={teacherId}
                onChange={(event) => setTeacherId(event.currentTarget.value)}
              >
                {members.map((member) => (
                  <option key={member.id} value={member.teacherId}>
                    {member.name} · {member.floorGroup === "LOWER" ? "1–3 楼" : "4–5 楼"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              任务类型
              <select
                disabled={!editable || busy}
                value={dutyType}
                onChange={(event) => setDutyType(event.currentTarget.value as DutyType)}
              >
                {Object.entries(dutyTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {dateConfig?.departmentMode === "NORMAL" ? (
              <label>
                占用岗位
                <select
                  disabled={!editable || busy}
                  value={slotFloor}
                  onChange={(event) => setSlotFloor(event.currentTarget.value as FloorGroup)}
                >
                  <option value="LOWER">1–3 楼</option>
                  <option value="UPPER">4–5 楼</option>
                </select>
              </label>
            ) : (
              <p className="field-note">
                {dateConfig?.departmentMode === "SPECIAL_MANUAL"
                  ? "集中日不限人数，不占双岗位。"
                  : "非系部日仅可记录不占岗位的大值班。"}
              </p>
            )}
          </div>
          <label>
            说明（可选）
            <input
              disabled={!editable || busy}
              value={assignmentNote}
              onChange={(event) => setAssignmentNote(event.currentTarget.value)}
            />
          </label>
          <div className="form-actions assignment-form-actions">
            <button disabled={!editable || busy || !teacherId || !dutyDate} type="submit">
              {editingAssignment ? "保存单点调整" : "添加人工固定排班"}
            </button>
            {editingAssignment ? (
              <button
                className="secondary"
                disabled={busy}
                type="button"
                onClick={() => {
                  setEditingAssignment(null);
                  setAssignmentNote("");
                }}
              >
                取消调整
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="table-wrap ledger-table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>教师</th>
              <th>任务</th>
              <th>来源</th>
              <th>岗位</th>
              <th>返校</th>
              <th>说明</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-row">
                  当前月份尚无值班记录。
                </td>
              </tr>
            ) : (
              assignments.map((item) => (
                <tr key={item.id}>
                  <td>{item.dutyDate}</td>
                  <td>{item.teacherName}</td>
                  <td>{dutyTypeLabels[item.dutyType]}</td>
                  <td>
                    <span className={`tag ${item.source === "AUTO" ? "auto-tag" : "manual-tag"}`}>
                      {item.source === "AUTO" ? "自动" : "人工锁定"}
                    </span>
                  </td>
                  <td>
                    {item.slotFloor
                      ? item.slotFloor === "LOWER"
                        ? "1–3 楼"
                        : "4–5 楼"
                      : "不占岗位"}
                  </td>
                  <td>{item.isSpecialReturn ? "特殊返校" : "—"}</td>
                  <td>{item.note ?? "—"}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="text-button"
                        disabled={!editable || busy}
                        type="button"
                        onClick={() => editAssignment(item)}
                      >
                        调整
                      </button>
                      <button
                        className="text-button danger-text"
                        disabled={!editable || busy}
                        type="button"
                        onClick={() => void deleteAssignment(item)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AutomaticRosterPanel
        scheduleId={schedule.id}
        editable={editable}
        repository={repository}
        refreshVersion={automationRefreshVersion}
        onLocateDate={onLocateDate}
        onSaved={refreshAfterMutation}
      />

      <div className="table-wrap statistics-table-wrap">
        <table>
          <thead>
            <tr>
              <th>教师</th>
              <th>楼层</th>
              <th>本月实际</th>
              <th>学期实际</th>
              <th>公平口径</th>
              <th>特殊返校</th>
              <th>历次日期</th>
            </tr>
          </thead>
          <tbody>
            {statistics.map((row) => (
              <tr key={row.semesterTeacherId}>
                <td>
                  {row.teacherName}
                  {exclusionIds.has(row.teacherId) ? (
                    <span className="tag warning-tag">本月排除</span>
                  ) : null}
                </td>
                <td>{row.floorGroup === "LOWER" ? "1–3 楼" : "4–5 楼"}</td>
                <td>{row.monthActualCount}</td>
                <td>{row.semesterActualCount}</td>
                <td>{row.effectiveSemesterCount}</td>
                <td>{row.specialReturnCount}</td>
                <td>{row.dutyDates.join("、") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
