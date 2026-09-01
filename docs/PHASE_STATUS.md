# 阶段状态与关闭记录

> 文档版本：1.1  
> 当前阶段：**Phase 3（todo）**
> 上一完成阶段：**Phase 2（done，2026-09-02）**
> 关联文档：[TASKS.md](./TASKS.md)、[PRD.md](./PRD.md)、[BUSINESS_RULES.md](./BUSINESS_RULES.md)、[DATA_MODEL.md](./DATA_MODEL.md)、[../AGENTS.md](../AGENTS.md)

每个 Phase 结束时必须把本文件中对应条目从 `todo` 改为 `done`，并填写关闭记录。未开始的阶段保持 `todo`，不要预填完成项。

## 总览

| Phase | 名称                             | 状态 | 关闭日期   |
| ----- | -------------------------------- | ---- | ---------- |
| 0     | 项目骨架与持久化探针             | done | 2026-09-02 |
| 1     | 学期、教师与三 Sheet 导入        | done | 2026-09-02 |
| 2     | 月排班、日期类型与跨月特殊返校   | done | 2026-09-02 |
| 3     | 人工固定排班、月度排除与账本统计 | todo | —          |
| 4     | 纯 TypeScript 排班引擎           | todo | —          |
| 5     | 自动排班工作台与解释             | todo | —          |
| 6     | 人工调整、完整状态流与历史编辑   | todo | —          |
| 7     | Excel 导出、备份与恢复           | todo | —          |
| 8     | 真实数据规则验证与体验收尾       | todo | —          |
| 9     | macOS 与 Windows 发布            | todo | —          |

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

| 命令                   | 结果                                                   |
| ---------------------- | ------------------------------------------------------ |
| `npm run typecheck`    | 通过                                                   |
| `npm test`             | 2 通过（内存仓储）                                     |
| `npm run test:rust`    | 4 通过：空库迁移、重复迁移、重启后探针仍在、空消息拒绝 |
| `npm run format:check` | 通过                                                   |
| `npm run build`        | 通过                                                   |
| `npm run tauri:build`  | 通过，生成 `.app` 与 `.dmg`                            |

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

## Phase 1 关闭记录（done）

- 关闭日期：2026-09-02
- 状态变化：`todo` → `done`

### 完成项

- 新增模式版本 2：`teachers`、`semesters`、`semester_teachers`，含外键、枚举、唯一约束、非负公平基线和查询索引。
- 新增 Rust/Tauri 学期命令：列表、新建、选择、关闭、重开；校验真实 `YYYY-MM-DD`、起止顺序及活动学期日期重叠。
- 新增教师与学期快照命令：查看、搜索、新增、编辑、从主档加入、停用/恢复、楼层、大值班、学期参与和初始公平次数。
- R001–R004 落地：教师 UUID 关联、历史显示名/楼层快照、停用不删除、楼层与大值班独立、实际次数与公平口径次数分列。
- UI 从 Phase 0 探针切换为“教师与学期”工作区；关闭学期默认只读，重新打开需显式操作。
- 使用 ExcelJS 4.4 实现本地 `.xlsx` 按需读取、三 Sheet/姓名列映射、预览摘要和逐行错误；尾部空行忽略，中间空名阻止提交。
- 导入校验覆盖同 Sheet 重名、跨楼层重复、大值班缺楼层、空姓名、已有主档同名歧义；大值班合并为楼层教师标签。
- 确认导入走单个 Rust SQLite 事务；已有教师按唯一 ID 匹配，新教师和学期快照原子写入，失败全部回滚；运行时不依赖原 Excel。
- 将 ExcelJS 间接 `uuid` 覆盖到已修复的 11.x；生产依赖审计为 0 个已知漏洞。

### 未完成项 / 明确不做

- 月排班、日期类型、特殊返校、人工任务与排班算法按 Phase 2 起实施，本阶段未提前创建相关表或功能。
- 教师不提供物理删除；“删除”按 R002 落为停用/恢复，以保留历史关联。
- 未把真实教师姓名写入测试夹具、快照或新代码；手工校验只输出 Sheet 名、行数和错误计数。

### 测试结果

| 命令                                        | 结果                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run typecheck`                         | 通过                                                                                           |
| `npm test`                                  | 8 通过（2 个文件）：内存探针 2、三 Sheet 预览校验 6                                            |
| `npm run test:rust`                         | 9 通过：空库/版本 1 升级、幂等迁移、探针保留、学期日期/重叠、快照/公平基线、停用恢复、导入回滚 |
| `npm run build`                             | 通过；ExcelJS 独立按需块约 937 kB（gzip 271 kB），Vite 有大块提示                              |
| `npm run format:check`                      | 通过                                                                                           |
| `cargo clippy --all-targets -- -D warnings` | 通过                                                                                           |
| `npm run tauri:build`                       | 通过；生成 `.app` 与 `.dmg`（沙箱内 DMG 脚本受限，授权后重跑成功）                             |
| `npm audit --omit=dev`                      | 通过，0 vulnerabilities                                                                        |

手工验证：

- 用 `reference/系部教师名单.xlsx` 读取到三个目标 Sheet：楼层教师 44 行、大值班 5 行；同 Sheet 重复 0、跨楼层重复 0、大值班缺楼层 0。未提交真实教师数据。
- 启动 release `.app`，确认“教师与学期”窗口、工作学期卡片、新建表单、Phase 状态和空状态均正常渲染；未创建测试学期或改写用户数据库，验证后关闭应用。
- macOS `.app` 和 `.dmg` 产物均实际生成。

### 改动文件

- 迁移与 Rust：`src-tauri/migrations/002_teachers_semesters.sql`、`src-tauri/src/{db,commands,lib}.rs`
- 前端业务：`src/app/RosterApp.tsx`、`src/domain/teacherImport.ts`、`src/domain/teacherImport.test.ts`
- 仓储与入口：`src/repositories/{types,sqlite}.ts`、`src/{App.tsx,App.css}`
- 依赖：`package.json`、`package-lock.json`（ExcelJS 4.4、`uuid` 11.x override）
- 文档：`AGENTS.md`、`README.md`、`docs/{PRD,BUSINESS_RULES,DATA_MODEL,TASKS,PHASE_STATUS}.md`

### 文档更新

- [PRD.md](./PRD.md)：实现状态推进到 Phase 2，锁定 ExcelJS 本地按需解析。
- [BUSINESS_RULES.md](./BUSINESS_RULES.md)：规则正文未改；标记 R001–R004 已有实现与测试。
- [DATA_MODEL.md](./DATA_MODEL.md)：最新模式版本改为 2，记录三张 Phase 1 业务表及后续待实现表。
- [TASKS.md](./TASKS.md)：Phase 1 标 done，关闭摘要与下一任务改为 Phase 2。
- [../README.md](../README.md) / [../AGENTS.md](../AGENTS.md)：更新当前阶段、依赖和数据库版本。

### 遗留问题

1. ExcelJS 按需块触发 Vite 500 kB 提示；它不进入首屏主块且离线导入可用，后续如启动/安装体积成为问题再评估更轻解析器。
2. 为避免污染用户数据库，本次未在 release 应用中实际提交真实教师名单；解析、完整校验与事务提交分别由真实文件结构检查和自动测试覆盖。Phase 8 仍需按计划执行真实数据端到端回放。
3. `reference/排班导出模版.xlsx` 仍缺失，继续阻挡 Phase 7 模板导出，不阻挡 Phase 2–6。

### 下一 Phase 输入条件

已满足：模式版本 2、学期选择与只读状态、教师学期快照、Rust 事务命令、业务日期字符串约束均可供 Phase 2 复用。下一步只实施 `monthly_schedules`、`duty_dates`、日期类型与 R009–R014 跨月特殊返校，不接入教师排班。

---

## Phase 2 关闭记录（done）

- 关闭日期：2026-09-02
- 状态变化：`todo` → `done`

### 完成项

- 新增模式版本 3：`monthly_schedules`、`duty_dates`，包含学期/月唯一约束、日期与枚举约束、返校值/来源一致性约束、外键级联和查询索引。
- 新增 Rust/Tauri 月份命令：按学期列出、新建学期范围内月份、草稿确认和撤回；新月份默认 `DRAFT`，`CONFIRMED` 月份及关闭学期均由命令层保持只读。
- 新增日期命令：选择/取消系部值班日，在 `NORMAL` 与 `SPECIAL_MANUAL` 间切换，并校验日期同时属于月份和学期范围。
- R009–R014 落地：按相邻自然日推导连续周期；3 月 31 日与 4 月 1 日跨月连续；缺少前月月份记录时保存 `PENDING_CONFIRMATION` 和空返校值；人工确认保存 `MANUAL` 来源且优先于后续自动重算。
- 修改或删除前月值班日后，事务内重算所有相关草稿月自动来源；创建缺失前月后也会解除后月待确认状态。已确认月份不被后台改写，需先撤回草稿。
- 月历 UI 支持月份创建/选择、学期外日期禁用、日期类型、返校状态/来源、人工标记与恢复推导、待确认数量、确认和撤回；关闭学期前显示草稿月份数量。
- R042/R044 基础状态已建立：待确认返校日期会阻止确认；岗位完整性与黄色警告知情流程明确留给 Phase 6。

### 未完成项 / 明确不做

- 未创建 `assignments`、`monthly_exclusions`，未安排任何教师；人工固定任务、排除与账本统计属于 Phase 3。
- 未实现自动排班、可行性、解释或自动生成按钮，属于 Phase 4–5。
- 确认月份当前只校验返校待确认；普通岗位空缺、错误/警告知情等完整确认条件属于 Phase 6。

### 测试结果

| 命令                                        | 结果                                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                         | 通过                                                                                                       |
| `npm test`                                  | 8 通过（2 个文件）：内存探针 2、三 Sheet 导入规则 6                                                        |
| `npm run test:rust`                         | 13 通过：既有 9 项回归 + 月份范围/只读、同月连续与跨月刷新、历史不足/人工确认、日期类型与返校标记独立 4 项 |
| `npm run build`                             | 通过；主块约 220 kB，ExcelJS 按需块约 937 kB（gzip 271 kB），保留既有 Vite 大块提示                        |
| `npm run format:check`                      | 通过                                                                                                       |
| `cargo clippy --all-targets -- -D warnings` | 通过                                                                                                       |
| `npm run tauri:build`                       | 通过；沙箱内 release 与 `.app` 成功、DMG 脚本受限，授权后重跑生成 `.app` 与 `.dmg`                         |

手工验证：

- 启动新构建 release `.app`，确认窗口标题、Phase 2 标识、月份与日期规则说明、学期空状态和表单均正常渲染，无启动或迁移错误。
- 为避免污染用户应用数据库，未在 release 应用中写入测试学期/月；月份、日期、状态与跨月写入路径由临时 SQLite 自动测试覆盖。
- `.app` 与 `.dmg` 产物均实际生成；验证后关闭 release 应用和开发服务。

### 改动文件

- 迁移与 Rust：`src-tauri/migrations/003_monthly_schedules.sql`、`src-tauri/src/{db,commands,lib}.rs`
- 前端：`src/app/MonthlyCalendar.tsx`、`src/app/RosterApp.tsx`、`src/App.css`
- 仓储：`src/repositories/{types,sqlite}.ts`
- 文档：`AGENTS.md`、`README.md`、`docs/{PRD,BUSINESS_RULES,DATA_MODEL,TASKS,PHASE_STATUS}.md`

### 文档更新

- [PRD.md](./PRD.md)：实现状态推进到 Phase 3，补 F01、F04、F11 已落地范围。
- [BUSINESS_RULES.md](./BUSINESS_RULES.md)：规则正文未改；标记 R009–R014 与 R042/R044 基础状态已有实现和测试。
- [DATA_MODEL.md](./DATA_MODEL.md)：最新模式版本改为 3，记录两张 Phase 2 表、约束及 Phase 3 待建表。
- [TASKS.md](./TASKS.md)：Phase 2 标 done，关闭摘要与下一任务改为 Phase 3。
- [../README.md](../README.md) / [../AGENTS.md](../AGENTS.md)：更新当前阶段、数据库版本和下一 Phase。

### 遗留问题

1. ExcelJS 按需块的既有 Vite 500 kB 提示仍在，不影响 Phase 2 首屏或离线功能。
2. 已确认后月不会因前月变化被静默改写；管理员需先撤回相关月份再编辑依赖日期，这是只读语义的预期限制，Phase 6 可在历史编辑流程中增加更明确的依赖提示。
3. `reference/排班导出模版.xlsx` 仍缺失，继续阻挡 Phase 7 模板导出，不阻挡 Phase 3–6。

### 下一 Phase 输入条件

已满足：模式版本 3、月份/日期外键、普通/集中日期结构、人工返校来源、跨月日期查询和草稿事务边界均可供 Phase 3 复用。下一步只实施 `assignments`、`monthly_exclusions`、人工固定任务和统一人日账本统计，不接入自动排班引擎。

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

| 命令                | 结果 |
| ------------------- | ---- |
| `npm run typecheck` |      |
| `npm test`          |      |
| `npm run test:rust` |      |
| `npm run build`     |      |

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
