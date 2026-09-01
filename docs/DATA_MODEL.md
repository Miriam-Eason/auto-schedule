# 财会系值班排班系统：数据模型

> 文档版本：1.1  
> 状态：开发基线；模式版本 2 已落地（Phase 1 done，2026-09-02）
> 关联文档：[BUSINESS_RULES.md](./BUSINESS_RULES.md)、[PRD.md](./PRD.md)、[TASKS.md](./TASKS.md)、[PHASE_STATUS.md](./PHASE_STATUS.md)

## 1. 建模原则

1. SQLite 是本地事实来源；Excel 仅用于首次导入与结果导出。
2. 所有公平统计由“值班账本”派生，避免维护容易漂移的累计字段。
3. 教师主档与学期成员快照分离，保证历史可追溯。
4. 大值班人员仍属于一个楼层组，不能建成第三类教师。
5. 同一日期既要能表示普通双岗位、集中值班，也要能只记录不占系部岗位的大值班。
6. 人工与自动来源、是否锁定、是否占系部岗位必须显式保存。
7. 时间存储采用 ISO 8601；业务日期使用 `YYYY-MM-DD`，年月使用 `YYYY-MM`。

## 2. 实体关系概览

```text
Teacher 1 ── N SemesterTeacher N ── 1 Semester
   │                 │
   │                 └── initialFairnessCount（学期公平基线）
   │
   ├── N MonthlyExclusion N ── 1 MonthlySchedule
   │
   └── N Assignment N ── 1 DutyDate N ── 1 MonthlySchedule

MonthlySchedule 1 ── N DutyDate
MonthlySchedule 1 ── N Assignment
Assignment 0..1 ── 1 DepartmentSlot（由 DutyDate + floor 唯一表示）
```

MVP 中“岗位”不必单建表：普通日的 `LOWER`、`UPPER` 两个岗位由 `DutyDate.departmentMode = NORMAL` 推导，`Assignment.slotFloor` 指向所占岗位。

## 3. 枚举

```ts
type FloorGroup = "LOWER" | "UPPER"; // 1–3 楼、4–5 楼
type ScheduleStatus = "DRAFT" | "CONFIRMED";
type DepartmentMode = "NONE" | "NORMAL" | "SPECIAL_MANUAL";
type SpecialReturnSource = "AUTO" | "MANUAL" | "PENDING_CONFIRMATION" | null;
type AssignmentSource = "MANUAL" | "AUTO";
type DutyType =
  | "NORMAL_DUTY"
  | "BIG_DUTY"
  | "HEAD_TEACHER_GROUP"
  | "TERM_SPECIAL"
  | "LEADER"
  | "OTHER";
type Severity = "INFO" | "WARNING" | "ERROR";
```

界面中文映射必须集中维护，不在数据库中保存中文枚举值。

## 4. 表定义

### 4.1 `teachers`：教师主档

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | UUID。 |
| `name` | TEXT | NOT NULL | 姓名；不以姓名作为主键。 |
| `active` | INTEGER | NOT NULL DEFAULT 1 | 0 表示停用，不物理删除。 |
| `note` | TEXT | NULL | 备注。 |
| `created_at` | TEXT | NOT NULL | ISO 时间。 |
| `updated_at` | TEXT | NOT NULL | ISO 时间。 |

姓名允许重名；界面必要时用内部编号或备注区分。

### 4.2 `semesters`：学期

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | UUID。 |
| `name` | TEXT | NOT NULL UNIQUE | 如“2026 春季学期”。 |
| `start_date` | TEXT | NOT NULL | `YYYY-MM-DD`。 |
| `end_date` | TEXT | NOT NULL | 不早于开始日期。 |
| `status` | TEXT | NOT NULL | `ACTIVE` / `CLOSED`。 |
| `created_at` | TEXT | NOT NULL | 创建时间。 |
| `updated_at` | TEXT | NOT NULL | 更新时间。 |

同一业务日期不得落入两个活动学期；关闭学期默认只读，重新打开需明确操作。

### 4.3 `semester_teachers`：学期教师快照

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | UUID。 |
| `semester_id` | TEXT | FK, NOT NULL | 所属学期。 |
| `teacher_id` | TEXT | FK, NOT NULL | 教师。 |
| `floor_group` | TEXT | CHECK | `LOWER` / `UPPER`。 |
| `is_major_duty` | INTEGER | NOT NULL DEFAULT 0 | 是否属于大值班人员。 |
| `participates` | INTEGER | NOT NULL DEFAULT 1 | 是否为该学期有效成员。 |
| `initial_fairness_count` | INTEGER | NOT NULL DEFAULT 0, CHECK >= 0 | 公平基线。 |
| `display_name_snapshot` | TEXT | NOT NULL | 历史显示快照。 |
| `created_at` | TEXT | NOT NULL | 创建时间。 |
| `updated_at` | TEXT | NOT NULL | 更新时间。 |

唯一约束：`UNIQUE(semester_id, teacher_id)`。

### 4.4 `monthly_schedules`：月排班

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | UUID。 |
| `semester_id` | TEXT | FK, NOT NULL | 所属学期。 |
| `year_month` | TEXT | NOT NULL | `YYYY-MM`。 |
| `status` | TEXT | NOT NULL DEFAULT `DRAFT` | 草稿/已确认。 |
| `generation_revision` | INTEGER | NOT NULL DEFAULT 0 | 每次重新生成加 1。 |
| `input_fingerprint` | TEXT | NULL | 最近一次生成输入指纹。 |
| `confirmed_at` | TEXT | NULL | 确认时间。 |
| `created_at` | TEXT | NOT NULL | 创建时间。 |
| `updated_at` | TEXT | NOT NULL | 更新时间。 |

唯一约束：`UNIQUE(semester_id, year_month)`。年月必须落在学期覆盖范围内。

### 4.5 `duty_dates`：日期配置

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | UUID。 |
| `schedule_id` | TEXT | FK, NOT NULL | 月排班。 |
| `duty_date` | TEXT | NOT NULL | `YYYY-MM-DD`。 |
| `department_mode` | TEXT | NOT NULL | `NONE` / `NORMAL` / `SPECIAL_MANUAL`。 |
| `is_special_return` | INTEGER | NULL | 1/0；待确认时允许 NULL。 |
| `special_return_source` | TEXT | NULL | 自动、人工或待确认。 |
| `note` | TEXT | NULL | 日期说明。 |
| `created_at` | TEXT | NOT NULL | 创建时间。 |
| `updated_at` | TEXT | NOT NULL | 更新时间。 |

唯一约束：`UNIQUE(schedule_id, duty_date)`。

- `NORMAL` 推导出 `LOWER`、`UPPER` 两个岗位。
- `SPECIAL_MANUAL` 不推导岗位，人员全部人工指定。
- `NONE` 用于记录非系部值班日上的外部固定任务（典型为不占岗位的大值班）。

### 4.6 `assignments`：统一值班账本

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | UUID。 |
| `schedule_id` | TEXT | FK, NOT NULL | 冗余用于月度查询和事务边界。 |
| `duty_date_id` | TEXT | FK, NOT NULL | 日期。 |
| `teacher_id` | TEXT | FK, NOT NULL | 教师。 |
| `semester_teacher_id` | TEXT | FK, NOT NULL | 使用当时学期快照。 |
| `duty_type` | TEXT | NOT NULL | 业务类型。 |
| `source` | TEXT | NOT NULL | `MANUAL` / `AUTO`。 |
| `locked` | INTEGER | NOT NULL | 人工默认 1，自动默认 0。 |
| `occupies_department_slot` | INTEGER | NOT NULL | 是否填充普通系部岗位。 |
| `slot_floor` | TEXT | NULL | 占岗位时为 `LOWER` / `UPPER`。 |
| `explanation_json` | TEXT | NULL | 自动决策快照；JSON。 |
| `note` | TEXT | NULL | 人工说明。 |
| `created_at` | TEXT | NOT NULL | 创建时间。 |
| `updated_at` | TEXT | NOT NULL | 更新时间。 |

关键约束：

```sql
UNIQUE(duty_date_id, teacher_id) -- 同一教师同一日只记录一次
UNIQUE(duty_date_id, slot_floor) WHERE occupies_department_slot = 1
CHECK(
  (occupies_department_slot = 1 AND slot_floor IS NOT NULL)
  OR
  (occupies_department_slot = 0 AND slot_floor IS NULL)
)
```

补充校验：`SPECIAL_MANUAL` 日期不得有 `occupies_department_slot = 1`；自动记录必须为可解锁/可重建状态，人工记录不得被重新生成删除。

### 4.7 `monthly_exclusions`：月度排除

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | UUID。 |
| `schedule_id` | TEXT | FK, NOT NULL | 目标月份。 |
| `teacher_id` | TEXT | FK, NOT NULL | 教师。 |
| `reason` | TEXT | NULL | 自由文本，不建立“孕期”等敏感枚举。 |
| `created_at` | TEXT | NOT NULL | 创建时间。 |

唯一约束：`UNIQUE(schedule_id, teacher_id)`。

### 4.8 `schema_migrations` 与 `app_settings`

`schema_migrations` 记录迁移版本，禁止运行时临时改表。`app_settings` 仅保存界面偏好、默认导出路径等非业务事实；当前学期可以保存为偏好，但业务查询不得依赖它代替外键。

**Phase 0–1 已落地（最新模式版本 2）：**

| 表 | 状态 | 说明 |
|---|---|---|
| `schema_migrations` | 已实现 | `version` PK、`name` UNIQUE、`applied_at`。空库迁到 1；重复启动不重复插入。 |
| `app_settings` | 已建表 | `key` PK、`value`、`updated_at`。尚无业务读写。 |
| `probe_events` | 开发探针 | 仅验证重启持久化，**不是**值班账本，Phase 1 不得当教师/排班表使用。 |
| `teachers` | 已实现 | 教师主档；UUID 主键，支持停用/恢复，重名不作为关联键。 |
| `semesters` | 已实现 | 学期新建、选择、关闭/重开；合法日期与活动学期重叠在命令层校验。 |
| `semester_teachers` | 已实现 | 学期成员快照、楼层、大值班、参与状态与非负公平基线。 |

迁移 `002_teachers_semesters.sql` 已添加前三张业务表；`monthly_schedules` 及后续账本表仍待 Phase 2–3。数据库文件：macOS 开发/安装后位于 `~/Library/Application Support/com.caihui.duty-roster/duty-roster.db`。启动时开启 `foreign_keys` 与 WAL，并执行 `PRAGMA integrity_check`。

## 5. 派生视图与查询口径

### 5.1 实际月度次数

```sql
COUNT(DISTINCT duty_date)
WHERE teacher_id = ? AND duty_date BETWEEN month_start AND month_end
```

### 5.2 实际学期次数

```sql
COUNT(DISTINCT duty_date)
WHERE teacher_id = ? AND duty_date BETWEEN semester.start_date AND semester.end_date
```

### 5.3 有效学期公平次数

```text
semester_teachers.initial_fairness_count + 实际学期次数
```

### 5.4 特殊返校次数

统计该教师在 `duty_dates.is_special_return = 1` 日期上的不同人日数量。

### 5.5 最近值班日与相邻日

从统一账本查询目标日期之前最近的人日；相邻日判断同时检查 `D-1` 与 `D+1`，包括跨月记录。

### 5.6 普通岗位完整性

对每个 `department_mode = NORMAL` 的日期，应分别存在且仅存在一个占位 `LOWER` 和一个占位 `UPPER`。集中日与 `NONE` 日期的占位数必须为 0。

## 6. 解释与警告的数据形状

解释和警告可以由引擎即时生成，不要求全部持久化；自动分配的决策快照应保存在 `explanation_json`，便于结果复查。

```ts
interface AssignmentExplanation {
  ruleVersion: string;
  monthlyRound: number; // 1 表示落位前月次数 0
  monthCountBefore: number;
  specialReturnCountBefore?: number;
  actualSemesterCountBefore: number;
  initialFairnessCount: number;
  effectiveSemesterCountBefore: number;
  floorMatch: boolean;
  floorToleranceApplied: boolean;
  lastDutyDate?: string;
  gapDays?: number;
  relaxedConstraints: string[];
  stableTieBreakKey: string;
}

interface ScheduleIssue {
  code: string;
  severity: Severity;
  message: string;
  scheduleId: string;
  dutyDate?: string;
  teacherId?: string;
  slotFloor?: FloorGroup;
  suggestedAction?: string;
}
```

## 7. 状态与事务

### 7.1 状态流

```text
新建月份 → DRAFT → CONFIRMED
                 ↑        │
                 └─ 撤回 ─┘
```

`CONFIRMED` 默认只读。撤回不删除数据，只改变状态；再次确认前重新执行完整性与警告检查。

### 7.2 必须使用事务的操作

- 首次 Excel 导入教师与学期成员；
- 自动排班或重新生成；
- 人工换人；
- 删除日期及其关联排班；
- 确认/撤回；
- 备份恢复；
- 历史修改后的相关数据保存。

外键必须开启，删除采用受控级联：允许删除草稿月及其日期/分配；教师、已确认月份和有历史账本的学期不得物理删除。

## 8. Excel 三 Sheet 导入映射

输入工作簿包含：`1-3楼值班老师`、`4-5楼值班老师`、`大值班老师`（实际 Sheet 名允许在导入预览中映射）。导入过程：

1. 读取两个楼层 Sheet，按行创建/匹配教师并设置 `floor_group`。
2. 读取大值班 Sheet，把匹配教师的 `is_major_duty` 设为 1；它不是第三组。
3. 发现大值班姓名不在任一楼层 Sheet 时阻止提交，要求用户选择楼层。
4. 发现重名、空名、跨两个楼层重复、无法识别列时显示逐行错误。
5. 先展示预览与变更摘要，用户确认后在一个事务中写入。
6. 导入后运行时只读 SQLite，不长期依赖原工作簿。

不要仅按姓名静默合并历史教师；首次导入可按规范化姓名辅助匹配，但所有歧义必须由用户确认。

## 9. 备份与恢复

MVP 支持导出一个带版本元数据的系统备份包，至少包含 SQLite 一致性快照、应用版本、模式版本和导出时间。恢复前：

1. 校验文件类型、模式版本和完整性；
2. 展示将覆盖的本地数据摘要；
3. 明确确认后执行；
4. 恢复失败时保留原数据库；
5. 恢复成功后重启数据层并运行完整性检查。

## 10. 数据层验收标准

- 关闭应用再打开，教师、学期、月份和排班均保留。
- 历史教师停用后，过去排班仍显示当时姓名与楼层。
- 同一教师同日、同一普通岗位均无法重复写入。
- 跨月统计、特殊返校统计、大值班非系部日期统计正确。
- 初始公平次数只影响有效公平口径，不生成虚假日期。
- 重新自动排班只替换自动记录，人工记录不变。
- 所有统计可由账本重建，重建前后结果一致。
- 旧备份在支持的模式版本上可恢复；不兼容版本给出明确错误且不破坏现有数据。
