# 财会系值班排班系统

离线桌面应用：排班计算器 + 可视化编辑器 + 历史值班账本。

当前完成 **Phase 0–4**（done，2026-09-02）。下一阶段是 **Phase 5**：自动排班工作台与解释。阶段状态与关闭记录见 [docs/PHASE_STATUS.md](docs/PHASE_STATUS.md)。

产品文档：

- [PRD](docs/PRD.md)
- [业务规则](docs/BUSINESS_RULES.md)
- [数据模型](docs/DATA_MODEL.md)
- [开发任务](docs/TASKS.md)
- [阶段状态](docs/PHASE_STATUS.md)
- [AGENTS](AGENTS.md)

## 技术栈（已锁定）

| 层         | 版本                                             |
| ---------- | ------------------------------------------------ |
| Tauri      | 2.x（CLI 2.11.4 / JS API 2.11.1）                |
| React      | 19.2                                             |
| TypeScript | 5.8 strict                                       |
| Vite       | 7                                                |
| SQLite     | `rusqlite 0.40.2`，`bundled`，WAL + foreign_keys |
| Excel      | ExcelJS 4.4（本地按需解析；`uuid` 覆盖至 11.x）  |
| 测试       | Vitest 4、`cargo test`                           |

未使用 `@tauri-apps/plugin-sql`：业务仓储需要事务、迁移版本表和 Rust 侧完整性检查，Phase 0 将 SQLite 放在 Rust 命令层。

## 开发环境

- macOS
- Node.js 22（本机可用 `fnm`）
- Rust stable（`rustup`）
- Xcode Command Line Tools

```bash
npm install
npm run tauri:dev
```

## 常用命令

```bash
npm run typecheck    # TypeScript
npm test             # Vitest
npm run test:rust    # rusqlite 迁移与探针
npm run build        # 前端生产构建
npm run tauri:build  # macOS 桌面构建
npm run format:check
```

## 数据库位置

应用数据目录由 Tauri `app_data_dir` 决定，文件名为 `duty-roster.db`。

macOS 开发模式下通常为：

```text
~/Library/Application Support/com.caihui.duty-roster/duty-roster.db
```

启动时会：

1. 创建目录（若不存在）
2. 打开 SQLite，开启 `foreign_keys` 与 WAL
3. 按 `src-tauri/migrations/` 顺序执行尚未应用的迁移
4. 运行 `PRAGMA integrity_check`

重复启动不会重复写入 `schema_migrations`。当前最新模式版本为 `4`：版本 1 包含 `app_settings` 与开发探针表 `probe_events`，版本 2 新增 `teachers`、`semesters`、`semester_teachers`，版本 3 新增 `monthly_schedules`、`duty_dates`，版本 4 新增统一账本 `assignments` 与 `monthly_exclusions`。`probe_events` 仍不是业务账本。

## 迁移方法

1. 在 `src-tauri/migrations/` 增加 `00N_description.sql`。
2. 在 `src-tauri/src/db.rs` 的 `MIGRATIONS` 中追加对应版本，版本号必须连续。
3. 为空库和已有库各写一条测试：新库直接到最新版；旧库再次 `migrate()` 不重复应用。
4. 不要在运行时临时 `ALTER` 业务表。

回滚不通过自动 down 迁移完成。恢复策略是备份/恢复（Phase 7）。

## 持久化探针

`probe_events` 与旧探针命令仍保留用于迁移回归；当前用户界面已加入 Phase 3 人工固定排班、月度排除与派生统计。探针只用于验证本地 SQLite，不是业务功能。
