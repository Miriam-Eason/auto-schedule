import { useCallback, useEffect, useState, type FormEvent } from "react";

import type { DatabaseInfo, ProbeEvent, ProbeRepository } from "../repositories/types";

interface ProbePanelProps {
  repository: ProbeRepository;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ProbePanel({ repository }: ProbePanelProps) {
  const [info, setInfo] = useState<DatabaseInfo | null>(null);
  const [events, setEvents] = useState<ProbeEvent[]>([]);
  const [message, setMessage] = useState("重启后应仍能看到这条记录");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [nextInfo, nextEvents] = await Promise.all([
      repository.getDatabaseInfo(),
      repository.list(),
    ]);
    setInfo(nextInfo);
    setEvents(nextEvents);
  }, [repository]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    refresh()
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus(formatError(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function handleInsert(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await repository.insert({
        id: crypto.randomUUID(),
        message: message.trim(),
        createdAt: new Date().toISOString(),
      });
      await refresh();
      setStatus("已写入本地 SQLite。关闭应用再打开后应仍能看到该记录。");
    } catch (error) {
      setStatus(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <header className="header">
        <p className="eyebrow">Phase 0 开发探针</p>
        <h1>财会系值班排班</h1>
        <p className="lede">
          当前只验证桌面壳、SQLite 迁移和重启后数据仍在。教师、日历与排班业务尚未实现。
        </p>
      </header>

      <section className="card">
        <h2>数据库</h2>
        {info ? (
          <dl className="meta">
            <div>
              <dt>路径</dt>
              <dd>{info.path}</dd>
            </div>
            <div>
              <dt>模式版本</dt>
              <dd>{info.schemaVersion}</dd>
            </div>
            <div>
              <dt>应用版本</dt>
              <dd>{info.appVersion}</dd>
            </div>
            <div>
              <dt>完整性</dt>
              <dd>{info.integrityOk ? "通过" : "失败"}</dd>
            </div>
          </dl>
        ) : (
          <p>{busy ? "正在读取数据库信息…" : "尚未读取到数据库信息。"}</p>
        )}
      </section>

      <section className="card">
        <h2>写入探针记录</h2>
        <form className="form" onSubmit={handleInsert}>
          <label htmlFor="probe-message">记录内容</label>
          <input
            id="probe-message"
            value={message}
            onChange={(event) => setMessage(event.currentTarget.value)}
            placeholder="输入任意说明文字"
            disabled={busy}
          />
          <button type="submit" disabled={busy || message.trim().length === 0}>
            {busy ? "处理中…" : "写入并刷新"}
          </button>
        </form>
        {status ? <p className="status">{status}</p> : null}
      </section>

      <section className="card">
        <h2>已保存记录</h2>
        {events.length === 0 ? (
          <p>还没有探针记录。</p>
        ) : (
          <ul className="events">
            {events.map((item) => (
              <li key={item.id}>
                <strong>{item.message}</strong>
                <span>{item.createdAt}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
