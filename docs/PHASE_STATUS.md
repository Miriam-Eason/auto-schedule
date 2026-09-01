# 阶段状态与关闭记录

> 文档版本：1.1  
> 当前阶段：**Phase 1（todo）**  
> 上一完成阶段：**Phase 0（done，2026-09-02）**  
> 关联文档：[TASKS.md](./TASKS.md)、[PRD.md](./PRD.md)、[BUSINESS_RULES.md](./BUSINESS_RULES.md)、[DATA_MODEL.md](./DATA_MODEL.md)、[../AGENTS.md](../AGENTS.md)

每个 Phase 结束时必须把本文件中对应条目从 `todo` 改为 `done`，并填写关闭记录。未开始的阶段保持 `todo`，不要预填完成项。

## 总览

| Phase | 名称 | 状态 | 关闭日期 |
|---|---|---|---|
| 0 | 项目骨架与持久化探针 | done | 2026-09-02 |
| 1 | 学期、教师与三 Sheet 导入 | todo | — |
| 2 | 月排班、日期类型与跨月特殊返校 | todo | — |
| 3 | 人工固定排班、月度排除与账本统计 | todo | — |
| 4 | 纯 TypeScript 排班引擎 | todo | — |
| 5 | 自动排班工作台与解释 | todo | — |
| 6 | 人工调整、完整状态流与历史编辑 | todo | — |
| 7 | Excel 导出、备份与恢复 | todo | — |
| 8 | 真实数据规则验证与体验收尾 | todo | — |
| 9 | macOS 与 Windows 发布 | todo | — |

里程碑：M0 技术可行 = **done**。M1–M4 仍为 todo。

---

## Phase 0 关闭记录（done）

- 关闭日期：2026-09-02
- 状态变化：`todo` → `done`

### 完成项

- 初始化 Tauri 2 + React + TypeScript strict + Vite。
- 锁定 SQLite：`rusqlite 0.40.2`（`bundled`），WAL，启动开启 `foreign_keys`，启动时 `integrity_check`。
- 建立 `schema_migrations` 与 `001_init.sql`；空库迁到版本 1，重复启动不重复写入。
- 仓储接口 `ProbeRepository`：SQLite 走 Tauri 命令，测试用内存实现。
- 开发用持久化探针：写入、列表、显示数据库路径/模式版本。
- 配置 `typecheck` / Vitest / `cargo test` / Prettier / macOS `tauri build`。
- 编写 README：开发、测试、数据库位置、迁移方法。
- 恢复被脚手架覆盖的 `docs/` 与 `reference/` 样例（导出模版仍缺）。

### 未完成项 / 明确不做

- 教师、学期、日历、排班 UI 与算法（按 TASKS Phase 0 范围排除）。
- Windows 安装包（Phase 9）。
- `reference/排班导出模版.xlsx` 仍缺失。

### 测试结果

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test` | 2 通过（内存仓储） |
| `npm run test:rust` | 4 通过：空库迁移、重复迁移、重启后探针仍在、空消息拒绝 |
| `npm run format:check` | 通过 |
| `npm run build` | 通过 |
| `npm run tauri:build` | 通过，生成 `.app` 与 `.dmg` |

手工验证：

- macOS 启动 `财会系值班排班.app` 无错误。
- 数据库出现在 `~/Library/Application Support/com.caihui.duty-roster/duty-roster.db`。
- 写入探针行后重启，该行仍在；`schema_migrations` 仍为 1 条；`PRAGMA integrity_check = ok`。

### 改动文件

- 新增：`AGENTS.md`、`src-tauri/migrations/001_init.sql`、`src-tauri/src/{db,commands,error}.rs`、`src/repositories/*`、`src/app/ProbePanel.tsx`
- 修改：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`src-tauri/src/{lib,main}.rs`、`src/App.tsx`、`README.md`、Vite/TS 配置
- 文档：`docs/` 四份产品文档移入 `docs/`；PRD 第 10 节补真实参考文件名

### 文档更新

- [PRD.md](./PRD.md)：实现状态、已锁定技术栈、参考文件路径。
- [DATA_MODEL.md](./DATA_MODEL.md)：Phase 0 已落地 `schema_migrations` / `app_settings` / 开发表 `probe_events`。
- [BUSINESS_RULES.md](./BUSINESS_RULES.md)：规则未改，仅标注尚未实现。
- [TASKS.md](./TASKS.md)：Phase 0 标 done，下一任务改为 Phase 1。

### 遗留问题

1. `reference/排班导出模版.xlsx` 缺失，挡住 Phase 7 模板导出，不挡 Phase 1–6。
2. 脚手架 `-f` 曾覆盖仓库根目录；文档已从 Codex 输出恢复，参考表从 Downloads 补回。
3. 本机开发需 Node 22（fnm）与 Rust stable（rustup）；新终端要已加载 PATH。
4. `probe_events` 仅供开发验证，业务表从 Phase 1 用新迁移添加，不得把探针表当账本。

### 下一 Phase 输入条件

已满足：SQLite 迁移入口可用、macOS 构建通过、`reference/系部教师名单.xlsx` 在仓库中。可以开始 Phase 1。

---

## 关闭记录模板（Phase 1 起套用）

```markdown
## Phase N 关闭记录（done）

- 关闭日期：YYYY-MM-DD
- 状态变化：`todo` → `done`

### 完成项
-

### 未完成项 / 明确不做
-

### 测试结果
| 命令 | 结果 |
|---|---|
| `npm run typecheck` |  |
| `npm test` |  |
| `npm run test:rust` |  |
| `npm run build` |  |

手工验证：

### 改动文件
-

### 文档更新
- PRD / BUSINESS_RULES / DATA_MODEL / TASKS / 本文件

### 遗留问题
-

### 下一 Phase 输入条件
-
```
