import { save } from "@tauri-apps/plugin-dialog";
import { useMemo, useState } from "react";

import {
  buildScheduleExportWorkbook,
  loadScheduleExportTemplate,
  suggestedScheduleExportName,
} from "../domain/scheduleExport";
import type { MonthlySchedule, RosterRepository } from "../repositories/types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ScheduleExportPanel({
  schedule,
  repository,
}: {
  schedule: MonthlySchedule;
  repository: RosterRepository;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const filename = useMemo(
    () => suggestedScheduleExportName(schedule.yearMonth),
    [schedule.yearMonth],
  );

  async function exportWorkbook() {
    setNotice(null);
    const path = await save({
      title: `导出 ${schedule.yearMonth} 已确认排班`,
      defaultPath: filename,
      filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }],
    });
    if (!path) return;
    setBusy(true);
    try {
      const [data, template] = await Promise.all([
        repository.getScheduleExportData(schedule.id),
        loadScheduleExportTemplate(),
      ]);
      const workbook = await buildScheduleExportWorkbook(data, template);
      const savedPath = await repository.writeExportFile(path, Array.from(workbook));
      setNotice(`导出成功：${savedPath}`);
    } catch (error) {
      setNotice(`导出失败，已保存的排班数据未受影响：${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="output-panel" aria-labelledby="schedule-export-heading">
      <div className="section-heading compact-heading">
        <div>
          <h3 id="schedule-export-heading">6 导出 Excel</h3>
          <p>导出只读取已确认账本；失败不会修改数据库。</p>
        </div>
        <button
          type="button"
          disabled={busy || schedule.status !== "CONFIRMED"}
          onClick={() => void exportWorkbook()}
        >
          {busy ? "正在导出…" : "选择位置并导出"}
        </button>
      </div>
      <dl className="output-preview">
        <div>
          <dt>文件名预览</dt>
          <dd>{filename}</dd>
        </div>
        <div>
          <dt>保存位置</dt>
          <dd>点击导出后由系统文件窗口选择；同名文件由系统提示处理。</dd>
        </div>
      </dl>
      {schedule.status !== "CONFIRMED" ? (
        <p className="panel-hint">当前月份仍是草稿，请先完成检查与确认。</p>
      ) : null}
      {notice ? (
        <div className="inline-notice" role="status">
          {notice}
        </div>
      ) : null}
    </section>
  );
}
