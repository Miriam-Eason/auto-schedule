import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  buildTeacherImportPreview,
  readTeacherWorkbook,
  suggestTeacherImportMapping,
  type TeacherImportMapping,
  type WorkbookGrid,
} from "../domain/teacherImport";
import type {
  FloorGroup,
  RosterRepository,
  Semester,
  SemesterTeacher,
  Teacher,
} from "../repositories/types";
import { MonthlyCalendar } from "./MonthlyCalendar";

interface RosterAppProps {
  repository: RosterRepository;
}

interface TeacherDraft {
  teacherId: string | null;
  semesterTeacherId: string | null;
  name: string;
  note: string;
  floorGroup: FloorGroup;
  isMajorDuty: boolean;
  participates: boolean;
  initialFairnessCount: number;
}

const emptyTeacherDraft: TeacherDraft = {
  teacherId: null,
  semesterTeacherId: null,
  name: "",
  note: "",
  floorGroup: "LOWER",
  isMajorDuty: false,
  participates: true,
  initialFairnessCount: 0,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function RosterApp({ repository }: RosterAppProps) {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [selectedSemesterId, setSelectedSemesterId] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [members, setMembers] = useState<SemesterTeacher[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedSemester = semesters.find((item) => item.id === selectedSemesterId) ?? null;
  const visibleMembers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("zh-CN");
    if (!query) return members;
    return members.filter(
      (member) =>
        member.name.toLocaleLowerCase("zh-CN").includes(query) ||
        (member.note ?? "").toLocaleLowerCase("zh-CN").includes(query),
    );
  }, [members, search]);
  const availableTeachers = useMemo(() => {
    const memberIds = new Set(members.map((member) => member.teacherId));
    return teachers.filter((teacher) => !memberIds.has(teacher.id));
  }, [members, teachers]);

  const refresh = useCallback(
    async (preferredSemesterId?: string | null) => {
      const [nextSemesters, storedSemesterId, nextTeachers] = await Promise.all([
        repository.listSemesters(),
        repository.getSelectedSemesterId(),
        repository.listTeachers(),
      ]);
      const candidate = preferredSemesterId ?? storedSemesterId;
      const nextSelected = nextSemesters.some((semester) => semester.id === candidate)
        ? candidate
        : (nextSemesters[0]?.id ?? null);
      if (nextSelected && nextSelected !== storedSemesterId) {
        await repository.selectSemester(nextSelected);
      }
      const nextMembers = nextSelected ? await repository.listSemesterTeachers(nextSelected) : [];
      setSemesters(nextSemesters);
      setSelectedSemesterId(nextSelected);
      setTeachers(nextTeachers);
      setMembers(nextMembers);
    },
    [repository],
  );

  useEffect(() => {
    setBusy(true);
    refresh()
      .catch((error: unknown) => setNotice(errorMessage(error)))
      .finally(() => setBusy(false));
  }, [refresh]);

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

  async function handleSelect(id: string) {
    await run(async () => {
      await repository.selectSemester(id);
      await refresh(id);
    }, "已切换工作学期。");
  }

  async function handleStatus() {
    if (!selectedSemester) return;
    const next = selectedSemester.status === "ACTIVE" ? "CLOSED" : "ACTIVE";
    const verb = next === "CLOSED" ? "关闭" : "重新打开";
    let draftCount = 0;
    try {
      const schedules =
        next === "CLOSED" ? await repository.listMonthlySchedules(selectedSemester.id) : [];
      draftCount = schedules.filter((schedule) => schedule.status === "DRAFT").length;
    } catch (error) {
      setNotice(errorMessage(error));
      return;
    }
    const draftNotice = draftCount > 0 ? `当前还有 ${draftCount} 个草稿月份。` : "";
    if (
      !window.confirm(
        `${verb}“${selectedSemester.name}”？${draftNotice}关闭后该学期与月份默认为只读。`,
      )
    )
      return;
    await run(async () => {
      await repository.setSemesterStatus(selectedSemester.id, next);
      await refresh(selectedSemester.id);
    }, `已${verb}学期。`);
  }

  return (
    <main className="workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">自动排班工作台</p>
          <h1>财会系值班排班</h1>
          <p className="lede">
            按步骤选择日期、排除人员、录入固定任务，再检查容量并生成可解释的自动排班。
          </p>
        </div>
        <span className="phase-badge">Phase 5</span>
      </header>

      {notice ? (
        <div className="notice" role="status">
          {notice}
        </div>
      ) : null}

      <section className="card semester-card">
        <div className="section-heading">
          <div>
            <h2>工作学期</h2>
            <p>活动学期日期不能重叠；关闭后成员资料只读。</p>
          </div>
          {selectedSemester ? (
            <button className="secondary" type="button" disabled={busy} onClick={handleStatus}>
              {selectedSemester.status === "ACTIVE" ? "关闭学期" : "重新打开"}
            </button>
          ) : null}
        </div>
        <div className="semester-controls">
          <label>
            当前学期
            <select
              value={selectedSemesterId ?? ""}
              disabled={busy || semesters.length === 0}
              onChange={(event) => void handleSelect(event.currentTarget.value)}
            >
              {semesters.length === 0 ? <option value="">尚未创建</option> : null}
              {semesters.map((semester) => (
                <option key={semester.id} value={semester.id}>
                  {semester.name} · {semester.status === "ACTIVE" ? "进行中" : "已关闭"}
                </option>
              ))}
            </select>
          </label>
          {selectedSemester ? (
            <div className="semester-summary">
              <span>
                {selectedSemester.startDate} — {selectedSemester.endDate}
              </span>
              <span className={`status-chip ${selectedSemester.status.toLowerCase()}`}>
                {selectedSemester.status === "ACTIVE" ? "可编辑" : "只读"}
              </span>
            </div>
          ) : null}
        </div>
        <SemesterForm
          disabled={busy}
          onCreate={(request) =>
            run(async () => {
              const semester = await repository.createSemester({
                id: crypto.randomUUID(),
                ...request,
              });
              await repository.selectSemester(semester.id);
              await refresh(semester.id);
            }, "学期已创建并选中。")
          }
        />
      </section>

      {selectedSemester ? (
        <>
          <MonthlyCalendar
            semester={selectedSemester}
            repository={repository}
            members={members}
            onLedgerChanged={() => refresh(selectedSemester.id)}
          />
          <TeacherManager
            semester={selectedSemester}
            members={visibleMembers}
            availableTeachers={availableTeachers}
            search={search}
            busy={busy}
            onSearch={setSearch}
            onSave={(draft) =>
              run(
                async () => {
                  await repository.saveTeacher({
                    teacherId: draft.teacherId ?? crypto.randomUUID(),
                    semesterTeacherId: draft.semesterTeacherId ?? crypto.randomUUID(),
                    semesterId: selectedSemester.id,
                    name: draft.name,
                    note: draft.note.trim() || null,
                    floorGroup: draft.floorGroup,
                    isMajorDuty: draft.isMajorDuty,
                    participates: draft.participates,
                    initialFairnessCount: draft.initialFairnessCount,
                  });
                  await refresh(selectedSemester.id);
                },
                draft.teacherId ? "教师资料已更新；其他学期快照未改变。" : "教师已加入本学期。",
              )
            }
            onSetActive={(member) =>
              run(
                async () => {
                  await repository.setTeacherActive(member.teacherId, !member.active);
                  await refresh(selectedSemester.id);
                },
                member.active ? "教师已停用，历史快照仍保留。" : "教师已恢复。",
              )
            }
          />
          <ImportPanel
            semester={selectedSemester}
            teachers={teachers}
            members={members}
            repository={repository}
            busy={busy}
            onBusy={setBusy}
            onNotice={setNotice}
            onImported={() => refresh(selectedSemester.id)}
          />
        </>
      ) : (
        <section className="card empty-state">
          <h2>先创建一个学期</h2>
          <p>教师和 Excel 导入会按学期保存快照。</p>
        </section>
      )}
    </main>
  );
}

function SemesterForm({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: (
    request: Omit<Parameters<RosterRepository["createSemester"]>[0], "id">,
  ) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onCreate({ name: name.trim(), startDate, endDate });
    setName("");
    setStartDate("");
    setEndDate("");
  }
  return (
    <form className="inline-form" onSubmit={(event) => void submit(event)}>
      <label>
        名称
        <input
          required
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          placeholder="2026 秋季学期"
        />
      </label>
      <label>
        开始日期
        <input
          required
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.currentTarget.value)}
        />
      </label>
      <label>
        结束日期
        <input
          required
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.currentTarget.value)}
        />
      </label>
      <button disabled={disabled} type="submit">
        新建学期
      </button>
    </form>
  );
}

function TeacherManager({
  semester,
  members,
  availableTeachers,
  search,
  busy,
  onSearch,
  onSave,
  onSetActive,
}: {
  semester: Semester;
  members: SemesterTeacher[];
  availableTeachers: Teacher[];
  search: string;
  busy: boolean;
  onSearch: (value: string) => void;
  onSave: (draft: TeacherDraft) => Promise<void>;
  onSetActive: (member: SemesterTeacher) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TeacherDraft>(emptyTeacherDraft);
  const editable = semester.status === "ACTIVE";
  function edit(member: SemesterTeacher) {
    setDraft({
      teacherId: member.teacherId,
      semesterTeacherId: member.id,
      name: member.name,
      note: member.note ?? "",
      floorGroup: member.floorGroup,
      isMajorDuty: member.isMajorDuty,
      participates: member.participates,
      initialFairnessCount: member.initialFairnessCount,
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave(draft);
    setDraft(emptyTeacherDraft);
  }
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <h2>学期教师</h2>
          <p>{members.length} 位当前可见；同名教师以内部 ID 区分，不按姓名串联。</p>
        </div>
        <input
          className="search"
          value={search}
          onChange={(event) => onSearch(event.currentTarget.value)}
          placeholder="搜索姓名或备注"
        />
      </div>
      <form className="teacher-form" onSubmit={(event) => void submit(event)}>
        {availableTeachers.length > 0 && !draft.teacherId ? (
          <label>
            从教师主档加入
            <select
              disabled={!editable || busy}
              value=""
              onChange={(event) => {
                const teacher = availableTeachers.find(
                  (candidate) => candidate.id === event.currentTarget.value,
                );
                if (teacher) {
                  setDraft({
                    ...emptyTeacherDraft,
                    teacherId: teacher.id,
                    name: teacher.name,
                    note: teacher.note ?? "",
                  });
                }
              }}
            >
              <option value="">选择已有教师…</option>
              {availableTeachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                  {teacher.active ? "" : "（已停用）"}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          姓名
          <input
            required
            disabled={!editable || busy}
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
          />
        </label>
        <label>
          楼层
          <select
            disabled={!editable || busy}
            value={draft.floorGroup}
            onChange={(event) =>
              setDraft({ ...draft, floorGroup: event.currentTarget.value as FloorGroup })
            }
          >
            <option value="LOWER">1–3 楼</option>
            <option value="UPPER">4–5 楼</option>
          </select>
        </label>
        <label>
          初始公平次数
          <input
            disabled={!editable || busy}
            type="number"
            min="0"
            step="1"
            value={draft.initialFairnessCount}
            onChange={(event) =>
              setDraft({ ...draft, initialFairnessCount: Number(event.currentTarget.value) })
            }
          />
        </label>
        <label>
          备注
          <input
            disabled={!editable || busy}
            value={draft.note}
            onChange={(event) => setDraft({ ...draft, note: event.currentTarget.value })}
          />
        </label>
        <label className="check">
          <input
            disabled={!editable || busy}
            type="checkbox"
            checked={draft.isMajorDuty}
            onChange={(event) => setDraft({ ...draft, isMajorDuty: event.currentTarget.checked })}
          />
          大值班
        </label>
        <label className="check">
          <input
            disabled={!editable || busy}
            type="checkbox"
            checked={draft.participates}
            onChange={(event) => setDraft({ ...draft, participates: event.currentTarget.checked })}
          />
          参与本学期
        </label>
        <div className="form-actions">
          <button disabled={!editable || busy} type="submit">
            {draft.teacherId ? "保存修改" : "新增教师"}
          </button>
          {draft.teacherId ? (
            <button className="secondary" type="button" onClick={() => setDraft(emptyTeacherDraft)}>
              取消编辑
            </button>
          ) : null}
        </div>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>教师</th>
              <th>楼层 / 标签</th>
              <th>参与</th>
              <th>实际 / 公平</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td>
                  <strong>{member.name}</strong>
                  {member.note ? <small>{member.note}</small> : null}
                </td>
                <td>
                  {member.floorGroup === "LOWER" ? "1–3 楼" : "4–5 楼"}
                  {member.isMajorDuty ? <span className="tag">大值班</span> : null}
                </td>
                <td>{member.participates ? "是" : "否"}</td>
                <td>
                  {member.actualSemesterCount} / {member.effectiveSemesterCount}
                  <small>基线 {member.initialFairnessCount}</small>
                </td>
                <td>{member.active ? "在职" : "已停用"}</td>
                <td className="row-actions">
                  <button
                    className="link-button"
                    disabled={!editable || busy}
                    type="button"
                    onClick={() => edit(member)}
                  >
                    编辑
                  </button>
                  <button
                    className="link-button"
                    disabled={!editable || busy}
                    type="button"
                    onClick={() => void onSetActive(member)}
                  >
                    {member.active ? "停用" : "恢复"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 ? (
          <p className="empty-row">尚无教师，可手工新增或从三 Sheet 工作簿导入。</p>
        ) : null}
      </div>
    </section>
  );
}

function ImportPanel({
  semester,
  teachers,
  members,
  repository,
  busy,
  onBusy,
  onNotice,
  onImported,
}: {
  semester: Semester;
  teachers: Teacher[];
  members: SemesterTeacher[];
  repository: RosterRepository;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onNotice: (value: string | null) => void;
  onImported: () => Promise<void>;
}) {
  const [workbook, setWorkbook] = useState<WorkbookGrid | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<TeacherImportMapping | null>(null);
  const preview = useMemo(
    () =>
      workbook && mapping ? buildTeacherImportPreview(workbook, mapping, teachers, members) : null,
    [workbook, mapping, teachers, members],
  );
  async function chooseFile(file: File | undefined) {
    if (!file) return;
    onBusy(true);
    onNotice(null);
    try {
      const grid = await readTeacherWorkbook(file);
      setWorkbook(grid);
      setFileName(file.name);
      setMapping(suggestTeacherImportMapping(grid));
      onNotice("工作簿已读取，请核对 Sheet、列和预览后再提交。");
    } catch (error) {
      onNotice(`无法读取工作簿：${errorMessage(error)}`);
    } finally {
      onBusy(false);
    }
  }
  async function commit() {
    if (!preview || preview.errors.length > 0 || preview.rows.length === 0) return;
    onBusy(true);
    onNotice(null);
    try {
      const result = await repository.importTeachers({
        semesterId: semester.id,
        rows: preview.rows.map((row) => ({
          teacherId: row.matchedTeacherId,
          newTeacherId: crypto.randomUUID(),
          semesterTeacherId: crypto.randomUUID(),
          name: row.name,
          floorGroup: row.floorGroup,
          isMajorDuty: row.isMajorDuty,
          initialFairnessCount: row.initialFairnessCount,
        })),
      });
      await onImported();
      onNotice(
        `导入完成：新建 ${result.createdTeachers} 位，匹配 ${result.matchedTeachers} 位，本学期共写入 ${result.semesterMembers} 位。`,
      );
    } catch (error) {
      onNotice(`导入未写入任何部分数据：${errorMessage(error)}`);
    } finally {
      onBusy(false);
    }
  }
  function updateMapping(key: keyof TeacherImportMapping, value: string | number) {
    if (mapping) setMapping({ ...mapping, [key]: value });
  }
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <h2>三 Sheet 导入</h2>
          <p>大值班是楼层教师的附加标签；校验全部通过后才会单事务写入。</p>
        </div>
        <label className="file-button">
          选择 Excel
          <input
            disabled={busy || semester.status !== "ACTIVE"}
            type="file"
            accept=".xlsx"
            onChange={(event) => void chooseFile(event.currentTarget.files?.[0])}
          />
        </label>
      </div>
      {fileName ? <p className="file-name">已选择：{fileName}</p> : null}
      {workbook && mapping ? (
        <>
          <div className="mapping-grid">
            <MappingControl
              label="1–3 楼"
              role="lower"
              workbook={workbook}
              mapping={mapping}
              onChange={updateMapping}
            />
            <MappingControl
              label="4–5 楼"
              role="upper"
              workbook={workbook}
              mapping={mapping}
              onChange={updateMapping}
            />
            <MappingControl
              label="大值班"
              role="major"
              workbook={workbook}
              mapping={mapping}
              onChange={updateMapping}
            />
          </div>
          {preview ? (
            <div className="import-preview">
              <div className="preview-summary">
                <strong>预览 {preview.rows.length} 位</strong>
                <span>
                  新建 {preview.createdCount} · 匹配已有 {preview.matchedCount} · 大值班{" "}
                  {preview.rows.filter((row) => row.isMajorDuty).length}
                </span>
              </div>
              {preview.errors.length > 0 ? (
                <ul className="error-list">
                  {preview.errors.map((error, index) => (
                    <li key={`${error.code}-${index}`}>{error.message}</li>
                  ))}
                </ul>
              ) : (
                <p className="success-text">校验通过。提交后应用不再依赖原工作簿。</p>
              )}
              <div className="preview-list">
                {preview.rows.slice(0, 12).map((row) => (
                  <span key={`${row.floorGroup}-${row.name}`}>
                    {row.name} · {row.floorGroup === "LOWER" ? "1–3 楼" : "4–5 楼"}
                    {row.isMajorDuty ? " · 大值班" : ""}
                    {row.matchedTeacherId ? " · 匹配已有" : " · 新建"}
                  </span>
                ))}
                {preview.rows.length > 12 ? <span>另有 {preview.rows.length - 12} 位…</span> : null}
              </div>
              <button
                disabled={
                  busy ||
                  semester.status !== "ACTIVE" ||
                  preview.errors.length > 0 ||
                  preview.rows.length === 0
                }
                type="button"
                onClick={() => void commit()}
              >
                确认并一次性导入
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function MappingControl({
  label,
  role,
  workbook,
  mapping,
  onChange,
}: {
  label: string;
  role: "lower" | "upper" | "major";
  workbook: WorkbookGrid;
  mapping: TeacherImportMapping;
  onChange: (key: keyof TeacherImportMapping, value: string | number) => void;
}) {
  const sheetKey = `${role}Sheet` as keyof TeacherImportMapping;
  const columnKey = `${role}Column` as keyof TeacherImportMapping;
  return (
    <fieldset>
      <legend>{label}</legend>
      <label>
        Sheet
        <select
          value={String(mapping[sheetKey])}
          onChange={(event) => onChange(sheetKey, event.currentTarget.value)}
        >
          {workbook.sheets.map((sheet) => (
            <option key={sheet.name} value={sheet.name}>
              {sheet.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        姓名列
        <input
          type="number"
          min="1"
          value={Number(mapping[columnKey])}
          onChange={(event) => onChange(columnKey, Number(event.currentTarget.value))}
        />
      </label>
    </fieldset>
  );
}
