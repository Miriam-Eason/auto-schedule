# 阶段状态与关闭记录

> 文档版本：1.1  
> 当前阶段：**Phase 7（todo）**
> 上一完成阶段：**Phase 6（done，2026-09-02）**
> 关联文档：[TASKS.md](./TASKS.md)、[PRD.md](./PRD.md)、[BUSINESS_RULES.md](./BUSINESS_RULES.md)、[DATA_MODEL.md](./DATA_MODEL.md)、[../AGENTS.md](../AGENTS.md)

每个 Phase 结束时必须把本文件中对应条目从 `todo` 改为 `done`，并填写关闭记录。未开始的阶段保持 `todo`，不要预填完成项。

## 总览

| Phase | 名称                             | 状态 | 关闭日期   |
| ----- | -------------------------------- | ---- | ---------- |
| 0     | 项目骨架与持久化探针             | done | 2026-09-02 |
| 1     | 学期、教师与三 Sheet 导入        | done | 2026-09-02 |
| 2     | 月排班、日期类型与跨月特殊返校   | done | 2026-09-02 |
| 3     | 人工固定排班、月度排除与账本统计 | done | 2026-09-02 |
| 4     | 纯 TypeScript 排班引擎           | done | 2026-09-02 |
| 5     | 自动排班工作台与解释             | done | 2026-09-02 |
| 6     | 人工调整、完整状态流与历史编辑   | done | 2026-09-02 |
| 7     | Excel 导出、备份与恢复           | todo | —          |
| 8     | 真实数据规则验证与体验收尾       | todo | —          |
| 9     | macOS 与 Windows 发布            | todo | —          |

里程碑：M0 技术可行、M1 可人工排班、M2 可自动排班 = **done**。M3–M4 仍为 todo。

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

## Phase 3 关闭记录（done）

- 关闭日期：2026-09-02
- 状态变化：`todo` → `done`

### 完成项

- 新增模式版本 4：`assignments`、`monthly_exclusions`，包含任务/来源/楼层枚举、人工锁定约束、同人同日唯一、普通日同岗位部分唯一索引、外键索引与跨表一致性触发器。
- 新增 Rust/Tauri 账本命令：按月列出、新增和删除人工安排；所有写操作校验活动学期与草稿月份，并在事务内保存或回滚。
- 普通日支持人工选择 `LOWER` / `UPPER` 目标岗位，默认教师所属楼层并允许管理员明确跨楼层；同岗位重复和同人同日重复由数据库拒绝。
- 集中值班日支持任意人数且不生成双岗位；支持 `NORMAL_DUTY`、`BIG_DUTY`、`HEAD_TEACHER_GROUP`、`TERM_SPECIAL`、`LEADER`、`OTHER` 全部任务类型。
- 大值班落在普通系部日时占目标楼层岗位；落在非系部日时自动建立 `department_mode = NONE` 日期，只记账不占岗位，删除最后一项外部任务时清理该日期。
- 新增按月份保存、更新和移除月度排除；排除不跨月继承。人工选择已排除、本月已有值班、相邻日值班或跨楼层教师时，界面显示具体影响并允许管理员继续。
- 新增统一账本派生统计：本月实际、学期实际、初始公平基线、有效公平次数、特殊返校次数和历次日期；添加/删除及应用重启后均从账本重算。
- 月历加入 Phase 3 面板：月度排除表单、固定任务表单、人工账本列表和教师统计表；已确认月份及关闭学期保持只读。
- 删除已有人工安排的日期前给出明确影响提示；普通日已有占岗记录时禁止直接切换为集中日，避免留下不合法岗位。

### 未完成项 / 明确不做

- 未实现自动候选筛选、可行性估算、第二轮或自动落位；R025 的教师/参与状态/月度排除/同日人日输入已具备，实际候选算法严格留给 Phase 4 的纯 TypeScript 引擎。
- 未接入“生成”“补齐空缺”“重新自动排班”按钮，也未写入 `source = AUTO` 记录；属于 Phase 4–5。
- 确认月份仍只校验返校待确认状态；普通岗位完整性和警告知情确认属于 Phase 6。
- 未用真实教师名单写入用户数据库或测试快照；真实月份回放仍在 Phase 8。

### 测试结果

| 命令                                        | 结果                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                         | 通过                                                                                                   |
| `npm test`                                  | 12 通过（3 个文件）：既有 8 项 + 人工突破提示与跨月相邻日 4 项                                         |
| `npm run test:rust`                         | 18 通过：既有 13 项回归 + 普通岗位唯一、非系部大值班、集中日多人、月度排除人工突破、删除/重启重算 5 项 |
| `npm run build`                             | 通过；主块约 228 kB，ExcelJS 按需块约 937 kB（gzip 271 kB），保留既有 Vite 大块提示                    |
| `npm run format:check`                      | 通过                                                                                                   |
| `cargo clippy --all-targets -- -D warnings` | 通过                                                                                                   |
| `npm run tauri:build`                       | 通过；沙箱内 release 与 `.app` 成功但 DMG 脚本受限，授权后重跑生成 `.app` 与 `.dmg`                    |

手工验证：

- 启动本地 Vite 页面并在浏览器检查 Phase 3 标题、说明、学期空状态和基础布局均正常渲染，控制台无前端错误；普通浏览器无法提供 Tauri `invoke`，因此数据交互路径由临时 SQLite 的 Rust 集成测试覆盖。
- Rust 临时数据库实际执行了普通日占岗、集中日两人、非系部大值班、排除后人工安排、删除重算和关闭重开读取，未写入用户应用数据库。
- macOS release、`.app` 与 `.dmg` 产物均实际生成。

### 改动文件

- 迁移与 Rust：`src-tauri/migrations/004_assignments_exclusions.sql`、`src-tauri/src/{db,commands,lib}.rs`
- 前端：`src/app/ManualRosterPanel.tsx`、`src/app/{MonthlyCalendar,RosterApp}.tsx`、`src/domain/manualAssignmentWarnings{,.test}.ts`、`src/App.css`
- 仓储：`src/repositories/{types,sqlite}.ts`
- 文档：`AGENTS.md`、`README.md`、`docs/{PRD,BUSINESS_RULES,DATA_MODEL,TASKS,PHASE_STATUS}.md`

### 文档更新

- [PRD.md](./PRD.md)：实现状态推进到 Phase 4，补 F02、F05、F06 已落地范围，并确认导出模板已存在。
- [BUSINESS_RULES.md](./BUSINESS_RULES.md)：规则正文未改；标记 R005–R008、R015–R024 已实现测试及 R025 的 Phase 4 边界。
- [DATA_MODEL.md](./DATA_MODEL.md)：最新模式版本改为 4，记录两张 Phase 3 表、索引、触发器和外部大值班 `NONE` 日期生命周期。
- [TASKS.md](./TASKS.md)：Phase 3 标 done、M1 标 done，下一任务改为 Phase 4。
- [../README.md](../README.md) / [../AGENTS.md](../AGENTS.md)：更新当前阶段、数据库版本和下一 Phase。

### 遗留问题

1. R025 的最终候选资格组合、R015 的自动不得覆盖人工，以及 R024 的后续自然公平，需要 Phase 4 引擎用纯 TypeScript 固定输入测试完成；Phase 3 未越界实现算法。
2. ExcelJS 按需块的既有 Vite 500 kB 提示仍在，不影响首屏或离线功能。
3. 普通浏览器不能调用 Tauri 命令，本阶段没有向用户应用数据库写入演示数据；Tauri 命令与持久化由 Rust 临时库测试验证，真实桌面端流程在 Phase 8 回放。
4. `reference/排班导出模版.xlsx` 当前已存在，原先“模板缺失”的 Phase 7 阻断已解除；具体字段映射仍需 Phase 7 锁定。

### 下一 Phase 输入条件

已满足：模式版本 4、统一人工账本、月度排除、普通岗位占用、集中/外部日期结构、教师学期快照、实际/公平/返校统计和历次日期均可转换为引擎 DTO。下一步只实施 Phase 4 纯 TypeScript 排班引擎及规则测试，不接 UI、SQLite、文件系统或最终生成按钮。

---

## Phase 4 关闭记录（done）

- 关闭日期：2026-09-02
- 状态变化：`todo` → `done`

### 完成项

- 新增 `src/domain/scheduling/` 纯 TypeScript 领域模块，定义版本 1 输入/输出 DTO、规则版本、教师/日期/历史/现有安排输入、可行性、自动结果、空缺、统计、解释和问题项。
- 实现 R025 资格筛选：仅活动、参与本学期且未月度排除的教师进入自动池；同一教师同日已有值班时不会再次入选，跨楼层能力由后续 R031 约束控制。
- 实现 R026/R050 排班前可行性：总岗位、人工/既有已填、剩余岗位、排除人数、各楼层候选与未值班容量、预计最高轮次、容量下界说明和明显无解项。
- 实现 R027–R033 排序链：月度最低负担层及第二/第三轮、特殊返校最低层、相邻日先回避后警告放宽、楼层 ±1、公平口径累计、最近值班间隔。
- 实现 R034/R036 确定性：所有输入数组先规范排序，语义输入生成 FNV-1a 64 位指纹，空缺按特殊返校、候选稀缺度、日期和楼层排序，最终以学期/月/指纹/教师/岗位稳定决胜。
- 实现 R015/R035/R037 引擎边界：无解保留空缺并返回阻断错误；补齐模式保留全部现有记录；重新生成模式从工作集和指纹中剔除旧自动记录，但逐项保留人工记录。
- 实现 R046–R049 引擎职责：每条自动安排包含轮次、月度/特殊返校/学期公平、楼层原因、最近日期与间隔、放宽项和稳定键；问题项提供级别以及适用的日期、教师、岗位和建议动作。
- 建立 26 项固定夹具/表意测试，逐条覆盖 BR-T01–BR-T15，并覆盖特殊返校优先顺序、输入乱序、跨月间隔、第三轮、全体本楼层排除、补空不洗牌、重新生成保留人工、旧自动结果不扰动指纹、无解和完整解释字段。

### 未完成项 / 明确不做

- 未把仓储记录转换为引擎 DTO，未新增 Rust 自动排班命令、SQLite 写入事务或 `source = AUTO` 持久化；属于 Phase 5。
- 未加入“生成”“补齐空缺”“重新自动排班”按钮，也未在 UI 展示可行性、解释或可定位警告；属于 Phase 5。
- 未实现 Phase 6 的人工换人/移动和完整确认知情流程；BR-T11 在本阶段只验证补空模式不会改动现有人工/自动记录，最终交互验收仍由 Phase 6 完成。
- 未新增或修改数据库表；模式版本保持 4。

### 测试结果

| 命令                   | 结果                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run typecheck`    | 通过；TypeScript strict 与 Node 配置均无错误                                                     |
| `npm test`             | 38 通过（4 个文件）：既有 12 项回归 + Phase 4 引擎 26 项；含 BR-T01–BR-T15、100 次复现与补充边界 |
| `npm run test:rust`    | 18 通过；Phase 0–3 迁移、仓储、日期和人工账本测试全部回归通过                                    |
| `npm run build`        | 通过；主块约 229 kB，ExcelJS 按需块约 937 kB（gzip 271 kB），仅保留既有 Vite 500 kB 大块提示     |
| `npm run format:check` | 通过                                                                                             |

手工验证：

- 检查 `src/domain/scheduling/` 的运行时导入，仅引用同目录纯类型/纯函数模块；没有 React、仓储、Tauri、SQLite、文件系统、网络或随机数依赖。
- 用固定输入连续生成 100 次，完整规范结果逐次一致；再把第一次自动结果作为旧自动记录传回“重新生成”，指纹与自动结果仍一致。
- 检查无候选、待确认返校和已确认月份输入：均返回可定位阻断项与未填岗位，不抛出未处理异常，也不改动人工记录。

### 改动文件

- 引擎与 DTO：`src/domain/scheduling/{types,engine,index}.ts`
- 规则测试：`src/domain/scheduling/engine.test.ts`
- 阶段入口：`AGENTS.md`、`README.md`
- 文档：`docs/{PRD,BUSINESS_RULES,DATA_MODEL,TASKS,PHASE_STATUS}.md`

### 文档更新

- [PRD.md](./PRD.md)：实现状态推进到 Phase 5，补充 F07、F08、F09 的 Phase 4 引擎落地范围和 Phase 5 UI 边界。
- [BUSINESS_RULES.md](./BUSINESS_RULES.md)：规则正文未改；标记 R025–R037、R046–R050 的纯引擎职责已有实现和测试，保留 Phase 6 侧职责。
- [DATA_MODEL.md](./DATA_MODEL.md)：记录版本 1 引擎 DTO、语义指纹与解释/问题形状已落地；明确无迁移、模式版本仍为 4。
- [TASKS.md](./TASKS.md)：Phase 4 标 done，关闭摘要与下一任务改为 Phase 5；M2 因尚缺 Phase 5–6 保持 todo。
- [../README.md](../README.md) / [../AGENTS.md](../AGENTS.md)：当前完成范围更新为 Phase 0–4，下一阶段更新为 Phase 5。

### 遗留问题

1. 可行性预计轮次是 R050 定义的容量下界；实际结果可能因同日、楼层、特殊返校和相邻日约束进入更高轮次，Phase 5 必须同时展示说明和实际解释。
2. `assignmentKey` 是领域层稳定岗位键，不是 SQLite UUID；Phase 5 写入事务需要生成持久化 ID，并把 `AssignmentExplanation` 序列化到 `explanation_json`。
3. 确认条件、警告知情、人工换人后其他记录 ID 不变的完整业务流仍属于 Phase 6，本阶段没有越界接 UI。
4. ExcelJS 按需块的既有 Vite 500 kB 提示仍在，不影响纯引擎或首屏；模板映射继续留给 Phase 7。

### 下一 Phase 输入条件

已满足：版本 1 DTO、纯函数可行性/生成入口、稳定语义指纹、补空与重新生成模式、完整自动解释、可定位问题项、固定规则夹具和 Phase 0–3 仓储数据均可供 Phase 5 复用。下一步只实施 Phase 5 的仓储转换、原子写入、自动排班工作台和解释展示，不提前实施 Phase 6 人工调整与完整确认流。

---

## Phase 5 关闭记录（done）

- 关闭日期：2026-09-02
- 状态变化：`todo` → `done`

### 完成项

- 新增自动排班应用边界，把学期教师快照、当前月日期/排除/已有安排及其他月份历史人日转换为 Phase 4 版本 1 引擎 DTO；领域引擎继续保持纯 TypeScript，不引用仓储、Tauri 或 UI。
- 新增 Rust/Tauri 自动排班上下文：单次读取当前月份、教师状态与参与快照、跨月历史、排除和统一账本，并用规范序列化内容生成确定性快照令牌。
- 新增原子自动保存：事务开始后重新计算快照令牌，输入过期时拒绝写入；`FILL_VACANCIES` 仅插入空缺，`REGENERATE_AUTO` 只删除/重建自动记录，人工记录 ID 与内容不变。
- 自动记录以 UUID 持久化，写入 `source = AUTO`、`locked = 0`、普通岗位、输入指纹和完整 `explanation_json`；成功后递增 `generation_revision`。教师停用、退出学期或被月度排除时数据库层也拒绝自动写入。
- 自动保存中任一岗位校验或唯一约束失败会整笔回滚；测试覆盖重新生成删除旧自动记录后的插入失败，确认旧自动记录和人工记录均恢复。
- 月度页面升级为五步工作台；生成前展示总岗位、已填/剩余、排除、候选量、尚未值班人数、楼层容量、预计最高轮次和 R050 容量下界说明。
- 接入“生成自动排班/补齐空缺”和“重新自动排班”；按钮忙碌期间禁用以避免重复点击，重新生成前明确提示影响范围。
- 月历单元格和账本表显示人员、目标岗位、任务及人工/自动来源；自动记录不通过人工删除入口修改。
- 问题清单展示级别、代码、说明和建议动作，点击可定位到月历日期；自动记录可点击查看月度轮次、实际/公平口径、特殊返校、楼层原因、最近值班间隔和相邻日放宽的中文解释。
- 新增应用边界测试和 Rust 集成测试，覆盖 DTO 转换、解释序列化、乐观快照令牌、原子回滚、过期输入拒绝、补空/重生成及人工记录保留。

### 未完成项 / 明确不做

- 未实现自动结果的人工换人、移动或任意目标记录编辑；未改变“人工调整不得联动洗牌”的 Phase 6 边界。
- 未补齐确认月份的岗位完整性、`ERROR` 阻断和 `WARNING` 知情确认流程；当前基础确认状态仍按 Phase 2 行为，Phase 6 完善。
- 未实现历史月份调整后的后续问题刷新交互；账本查询已包含跨月历史，可供 Phase 6 使用。
- 未新增数据库表或迁移，模式版本保持 4；未实施 Phase 7 的 Excel 导出、备份与恢复。

### 测试结果

| 命令                                        | 结果                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run typecheck`                         | 通过；TypeScript strict 与 Node 配置无错误                                                   |
| `npm test`                                  | 40 通过（5 个文件）：既有 38 项 + 仓储上下文 DTO 转换与自动保存请求序列化 2 项               |
| `npm run test:rust`                         | 20 通过：既有 18 项回归 + 原子重生成/人工保留/失败回滚、过期快照拒绝 2 项                    |
| `npm run build`                             | 通过；主块约 248 kB，ExcelJS 按需块约 937 kB（gzip 271 kB），仅保留既有 Vite 500 kB 大块提示 |
| `npm run format:check`                      | 通过                                                                                         |
| `cargo clippy --all-targets -- -D warnings` | 通过                                                                                         |

手工验证：

- 启动生产预览并用内置浏览器检查 Phase 5 标识、标题、学期卡片和空状态的布局，页面正常渲染且浏览器控制台无 error/warning 日志。
- 普通浏览器没有 Tauri `invoke`，页面按预期显示数据桥不可用提示；未向用户应用数据库写入演示数据。自动上下文、补空、重生成、回滚和过期输入路径均由临时 SQLite 集成测试实际执行。
- 检查自动面板交互代码：生成与重新生成共享忙碌锁；重新生成有明确确认文案；问题点击更新日期选择并滚动到对应月历单元格；自动记录不显示人工删除按钮。

### 改动文件

- 应用边界与测试：`src/app/scheduleAutomation.ts`、`src/app/scheduleAutomation.test.ts`
- 自动工作台：`src/app/AutomaticRosterPanel.tsx`、`src/app/{ManualRosterPanel,MonthlyCalendar,RosterApp}.tsx`、`src/App.css`
- 仓储：`src/repositories/{types,sqlite}.ts`
- Rust/Tauri：`src-tauri/src/{db,commands,lib}.rs`
- 阶段入口：`AGENTS.md`、`README.md`
- 文档：`docs/{PRD,BUSINESS_RULES,DATA_MODEL,TASKS,PHASE_STATUS}.md`

### 文档更新

- [PRD.md](./PRD.md)：实现状态推进到 Phase 6，更新 F07–F10 的 Phase 5 落地范围。
- [BUSINESS_RULES.md](./BUSINESS_RULES.md)：规则正文未改；记录 R026、R037、R041 自动路径及 R046/R049 展示已接入测试。
- [DATA_MODEL.md](./DATA_MODEL.md)：记录快照令牌、原子自动保存、解释持久化与无迁移结论，模式版本保持 4。
- [TASKS.md](./TASKS.md)：Phase 5 标 done，关闭摘要与下一任务改为 Phase 6；M2 因 Phase 6 尚未完成继续保持 todo。
- [../README.md](../README.md) / [../AGENTS.md](../AGENTS.md)：当前完成范围更新为 Phase 0–5，下一阶段更新为 Phase 6。

### 遗留问题

1. 完整确认规则、警告知情、人工换人/移动和历史编辑属于 Phase 6；当前不能把 M2 标为完成。
2. 引擎问题在生成当次完整展示；应用重启后可从解释快照恢复逐条自动决策，但全月问题仍需基于当前账本重新分析，Phase 6 应统一确认前问题重算入口。
3. 普通浏览器无法执行 Tauri 数据桥，真实桌面端带数据交互仍按 Phase 8 做用户流程回放；本阶段没有污染用户数据库。
4. ExcelJS 按需块的既有 Vite 500 kB 提示仍在，不影响首屏自动工作台或离线功能。

### 下一 Phase 输入条件

已满足：自动记录、解释 JSON、来源/锁定、生成修订、输入指纹、快照令牌、补空与重生成原子事务、可行性/问题/统计 UI 均已落地。下一步只实施 Phase 6 的目标记录调整、调整后重算、完整确认知情流和历史编辑，不提前实施 Phase 7 导出或备份恢复。

---

## Phase 6 关闭记录（done）

- 关闭日期：2026-09-02
- 状态变化：`todo` → `done`

### 完成项

- 新增事务化目标记录调整命令：人工或自动记录均可换人、改日期、移动岗位、修改任务/说明；目标记录保留原 `id`，调整后转为 `MANUAL` + `locked = 1` 并清除旧自动解释，其他自动记录不更新。
- 删除入口扩展到人工和自动记录；删除只重算账本统计与问题并留下空缺，不调用排班引擎。既有人工添加路径继续支持普通日、集中日和非系部大值班。
- 新增统一确认前复核：从当前 SQLite 账本派生普通岗位空缺、待确认返校、非活动/不参与教师、月度排除突破、多轮、相邻日、特殊返校不均和跨楼层问题，返回可定位的日期、教师、岗位与建议动作。
- 完成 R043/R047 状态门禁：`ERROR` 始终阻止确认；只有 `WARNING` 时必须传入明确知情参数。复核和状态更新在同一事务中再次执行，避免检查后数据变化绕过门禁。
- UI 增加“调整目标记录”和“检查与确认”区域：账本每条记录可调整/删除；自动记录调整后明确说明转为人工锁定；问题按 `ERROR` / `WARNING` / `INFO` 汇总并可定位日期。
- 已确认月份保持只读；撤回为草稿不删除数据，可完成历史调整并再次确认。历史调整后所有月份统计从统一账本重算，后续月份既有记录及 ID 不变。
- M2“可自动排班”里程碑完成：纯引擎、工作台、解释、人工调整和确认状态流形成闭环。

### 未完成项 / 明确不做

- 未实施 Excel 导出、模板映射、系统备份或恢复；这些严格属于 Phase 7。
- 未用真实教师名单写入用户数据库，也未执行 Phase 8 的历史 Excel 回放与目标用户体验验收。
- 未新增数据库表、字段或迁移；模式版本继续为 4。

### 测试结果

| 命令                                        | 结果                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                         | 通过；TypeScript strict 与 Node 配置无错误                                                           |
| `npm test`                                  | 40 通过（5 个文件）；Phase 0–5 前端/领域测试全部回归通过                                             |
| `npm run test:rust`                         | 23 通过；新增单点换人/移动/删除不洗牌、确认错误/警告门禁、历史修改刷新后续统计 3 项，既有 20 项全通过 |
| `npm run build`                             | 通过；主块约 252 kB，ExcelJS 按需块约 937 kB（gzip 271 kB），仅保留既有 Vite 500 kB 提示             |
| `npm run format:check`                      | 通过                                                                                                 |
| `cargo clippy --all-targets -- -D warnings` | 通过                                                                                                 |

手工验证：

- 检查工作台交互路径：确认按钮先获取最新复核，存在 `ERROR` 时不弹出可放行确认；只有警告时列出具体警告并要求知情；撤回文案明确不删除排班。
- 检查账本调整路径：人工与自动行均显示调整/删除；编辑自动记录时提示保存后转为人工锁定；保存、删除均只调用目标事务与刷新，不调用自动生成函数。
- Rust 临时数据库实际执行了自动记录换人并移动到另一日期、删除后保留空缺、带警告确认、历史月份确认→撤回→换人、后续统计重算和后续记录逐条不变；未写入用户应用数据库。

### 改动文件

- Rust/Tauri：`src-tauri/src/{db,commands,lib}.rs`
- 仓储：`src/repositories/{types,sqlite}.ts`
- 前端：`src/app/{ManualRosterPanel,MonthlyCalendar,RosterApp}.tsx`、`src/App.css`
- 阶段入口：`AGENTS.md`
- 文档：`docs/{PRD,BUSINESS_RULES,DATA_MODEL,TASKS,PHASE_STATUS}.md`

### 文档更新

- [PRD.md](./PRD.md)：实现状态推进到 Phase 7，更新 F10/F11 的完整调整、确认和历史编辑范围。
- [BUSINESS_RULES.md](./BUSINESS_RULES.md)：规则正文未改；标记 R038–R045 与 R047–R050 调整/确认侧已有实现和测试。
- [DATA_MODEL.md](./DATA_MODEL.md)：记录单点调整、即时复核、知情确认事务与无迁移结论；模式版本保持 4。
- [TASKS.md](./TASKS.md)：Phase 6 标 done、M2 标 done，下一任务改为 Phase 7。
- [../AGENTS.md](../AGENTS.md)：已完成范围更新为 Phase 0–6，下一阶段更新为 Phase 7。
- [../README.md](../README.md)：开发命令、数据库位置和锁定依赖未变化，按仓库规则不修改。

### 遗留问题

1. ExcelJS 按需块的既有 Vite 500 kB 提示仍在；Phase 7 导出会继续复用 Excel 能力，届时结合模板读取评估是否需要进一步拆分。
2. 本阶段通过临时 SQLite 覆盖真实事务路径，但没有污染用户应用数据库；真实桌面端带数据流程仍按 Phase 8 回放。
3. 复核问题由当前账本即时派生，不保存历史问题快照；这符合 MVP 不做完整版本对比的范围。

### 下一 Phase 输入条件

已满足：只有已确认月份可作为稳定导出输入；账本已包含日期、岗位、任务、来源、集中日多人和历史统计；模式版本 4、数据库路径和完整性检查入口可供一致性备份/恢复复用；`reference/排班导出模版.xlsx` 已存在。下一步只实施 Phase 7 的 Excel 导出、备份与恢复，不提前执行 Phase 8 真实数据体验收尾。

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
