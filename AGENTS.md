# AGENTS

本仓库按 [docs/TASKS.md](docs/TASKS.md) 分 Phase 交付。每次只做一个 Phase。阶段状态以 [docs/PHASE_STATUS.md](docs/PHASE_STATUS.md) 为准。

## 当前状态

- 已完成：Phase 0、Phase 1、Phase 2、Phase 3、Phase 4、Phase 5（done，2026-09-02）
- 进行中 / 下一个：Phase 6（todo）— 人工调整、完整状态流与历史编辑
- 不要重做已标 `done` 的 Phase，除非关闭记录里的遗留问题明确要求返工

## 开始前

1. 阅读 `docs/PRD.md`、`docs/BUSINESS_RULES.md`、`docs/DATA_MODEL.md`、`docs/TASKS.md`、`docs/PHASE_STATUS.md` 和本文件。
2. 检查工作区已有改动，不覆盖用户文件。
3. 明确本 Phase 范围、依赖和验收命令；只实施 `TASKS.md` 中当前为 `todo` 的那一个 Phase。
4. 若实现需要改变业务规则，先停止并提出文档变更，不自行猜测。

## 每个 Phase 结束时必须更新文档

把状态从 `todo` 改为 `done`，并写关闭记录。缺任何一项都不得声称 Phase 完成。

1. **[docs/PHASE_STATUS.md](docs/PHASE_STATUS.md)**  
   总览表该行改为 `done` 并填关闭日期；追加完整关闭记录：完成项、未完成项、测试结果、改动文件、文档更新、遗留问题、下一 Phase 输入条件。
2. **[docs/TASKS.md](docs/TASKS.md)**  
   该 Phase 标题标注 `【done】`，补关闭记录摘要（可指向 PHASE_STATUS 详情）；把「下一个可交给 Codex 的任务」改成下一 Phase；里程碑若因此达成也改状态。
3. **[docs/PRD.md](docs/PRD.md)**  
   更新文首实现状态；若本 Phase 锁定了技术栈、页面或验收范围，同步对应章节。
4. **[docs/DATA_MODEL.md](docs/DATA_MODEL.md)**  
   若有新表、迁移或约束落地，更新实现状态和表定义，写明模式版本。
5. **[docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md)**  
   规则有增删改才改正文；否则只更新实现状态（哪些 Rxxx 已有测试）。禁止改规则却不改本文。
6. **[README.md](README.md)**  
   仅当开发命令、数据库位置或已锁定依赖变化时更新。

关闭记录必须能回答：做了什么、测了什么、改了哪些文件、文档改了哪几处、还剩什么问题。

## 技术约束

- TypeScript `strict`。
- 排班引擎必须是纯 TypeScript，不得直接访问 SQLite、文件系统或 UI。
- SQLite 通过 `rusqlite`（`bundled`）由 Rust 命令访问；前端只通过仓储接口调用命令。不要改回 `@tauri-apps/plugin-sql`，除非先更新本文件与 PRD。
- 日期使用本地业务日期 `YYYY-MM-DD`，避免时区把日期移到前一天。
- 不得引入服务器、远程数据库或运行时网络依赖。
- 不要把真实教师数据提交到公开仓库或测试快照。
- `probe_events` 是 Phase 0 开发探针，不是业务账本。

## 验收命令

每个 Phase 结束至少跑：

```bash
npm run typecheck
npm test
npm run test:rust
npm run build
```

Phase 0 及涉及桌面壳的阶段还要 `npm run tauri:build`（macOS）。手工验证项写进该 Phase 的关闭记录，不要只说「应该可以」。
