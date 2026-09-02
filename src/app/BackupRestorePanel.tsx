import { open, save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";

import type { BackupPreview, RosterRepository } from "../repositories/types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function suggestedBackupName(): string {
  const today = new Date();
  const date = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  return `财会系排班备份-${date}.duty-roster-backup`;
}

export function BackupRestorePanel({
  repository,
  onRestored,
}: {
  repository: RosterRepository;
  onRestored: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function createBackup() {
    setNotice(null);
    const path = await save({
      title: "导出系统备份",
      defaultPath: suggestedBackupName(),
      filters: [{ name: "财会系排班备份", extensions: ["duty-roster-backup"] }],
    });
    if (!path) return;
    setBusy(true);
    try {
      const created = await repository.createBackup(path);
      setNotice(
        `备份完成：${created.path}（模式版本 ${created.schemaVersion}，${created.summary.assignmentCount} 条值班记录）`,
      );
    } catch (error) {
      setNotice(`备份失败，当前数据库未改变：${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function chooseBackup() {
    setNotice(null);
    const path = await open({
      title: "选择要恢复的系统备份",
      multiple: false,
      directory: false,
      filters: [{ name: "财会系排班备份", extensions: ["duty-roster-backup"] }],
    });
    if (!path || Array.isArray(path)) return;
    setBusy(true);
    try {
      setPreview(await repository.inspectBackup(path));
    } catch (error) {
      setPreview(null);
      setNotice(`备份校验失败，未改动当前数据库：${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup() {
    if (!preview) return;
    const summary = preview.summary;
    if (
      !window.confirm(
        `恢复此备份会覆盖当前全部本地数据。\n\n备份时间：${preview.exportedAt}\n教师 ${summary.teacherCount} 人，学期 ${summary.semesterCount} 个，月份 ${summary.scheduleCount} 个，值班记录 ${summary.assignmentCount} 条。\n\n是否继续？`,
      )
    )
      return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await repository.restoreBackup(preview.path, preview.restoreToken);
      await onRestored();
      setPreview(null);
      setNotice(
        `恢复成功并通过完整性检查：模式版本 ${result.schemaVersion}，${result.summary.assignmentCount} 条值班记录。`,
      );
    } catch (error) {
      setNotice(`恢复失败，原数据库已保留：${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card backup-card" aria-labelledby="backup-heading">
      <div className="section-heading">
        <div>
          <h2 id="backup-heading">备份与恢复</h2>
          <p>备份包含 SQLite 一致性快照、应用/模式版本、导出时间和校验值。</p>
        </div>
        <div className="backup-actions">
          <button type="button" disabled={busy} onClick={() => void createBackup()}>
            {busy ? "处理中…" : "导出备份"}
          </button>
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => void chooseBackup()}
          >
            选择备份并校验
          </button>
        </div>
      </div>
      {preview ? (
        <div className="restore-preview">
          <strong>覆盖预览</strong>
          <span>{preview.path}</span>
          <span>
            导出于 {preview.exportedAt} · 应用 {preview.appVersion} · 模式 {preview.schemaVersion}
          </span>
          <span>
            教师 {preview.summary.teacherCount} · 学期 {preview.summary.semesterCount} · 月份{" "}
            {preview.summary.scheduleCount} · 日期 {preview.summary.dutyDateCount} · 值班{" "}
            {preview.summary.assignmentCount}
          </span>
          <button
            className="danger"
            type="button"
            disabled={busy}
            onClick={() => void restoreBackup()}
          >
            确认覆盖并恢复
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="inline-notice" role="status">
          {notice}
        </div>
      ) : null}
    </section>
  );
}
