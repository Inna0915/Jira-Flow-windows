# Jira-Flow 同步核心逻辑与泳道架构说明

## 1. 项目概述

Jira-Flow 是一个基于 Electron + React 的本地看板应用，通过 Jira Agile REST API 将 Jira 中的任务同步到本地 SQLite 数据库，并以自定义的 12 列看板 + 3 泳道的形式展示。支持拖拽卡片时双向同步状态回 Jira。

---

## 2. 核心同步逻辑（4 步 Agile 同步）

同步入口：`electron/main/services/SyncService.ts` → `performAgileSync(projectKey)`

### 2.1 同步流程

```
Step 1: detectBoardId(projectKey)
  ↓  GET /rest/agile/1.0/board?projectKeyOrId={projectKey}
  ↓  优先选择 scrum 类型看板，否则取第一个
  ↓
Step 2: fetchActiveSprint(boardId)
  ↓  GET /rest/agile/1.0/board/{boardId}/sprint?state=active
  ↓  依次尝试 active → future → closed
  ↓
Step 3: fetchSprintIssues(sprintId)
  ↓  GET /rest/agile/1.0/sprint/{sprintId}/issue
  ↓  JQL 过滤: assignee="{当前用户}"
  ↓  分页获取（每页 100 条）
  ↓
Step 4: fetchBacklogIssues(boardId, projectKey)
  ↓  GET /rest/agile/1.0/board/{boardId}/backlog
  ↓  JQL 过滤: project="{projectKey}" AND assignee="{当前用户}"
  ↓  过滤掉已有 Sprint 信息的任务（避免重复）
  ↓
合并 & 去重 → 保存到 SQLite → 清理过期任务(Prune)
```

### 2.2 Sync & Prune 策略

每次同步使用统一时间戳 `syncTimestamp`，所有同步到的任务都标记此时间戳。同步完成后，删除 `synced_at < syncTimestamp` 且 `source = 'JIRA'` 的记录，确保本地数据库与 Jira 严格一致。`source = 'LOCAL'` 的个人任务不受影响。

### 2.3 JQL 回退机制

当 Agile API 不可用时（如 Step 1 检测 Board 失败），自动回退到 JQL 同步：

```
JQL: assignee = currentUser() ORDER BY updated DESC
```

同样使用 Sync & Prune 策略。

### 2.4 反向同步（拖拽 → Jira）

当用户在看板上拖拽卡片到新列时，触发 `jira:transition-issue-by-column` IPC 调用（`electron/main/ipc/issues.ts:37`）：

1. 调用 `GET /rest/api/2/issue/{key}/transitions` 获取可用状态转换
2. 将每个 transition 名称通过 `normalizeStatus()` 映射到看板列 ID
3. 匹配目标列 → 精确匹配优先，失败则模糊匹配关键词
4. 调用 `POST /rest/api/2/issue/{key}/transitions` 执行状态转换
5. 更新本地数据库

---

## 3. 数据库结构

数据库：SQLite（`better-sqlite3`），文件路径见 `electron/main/db/schema.ts`

### 3.1 核心表 `t_tasks`

| 字段 | 类型 | 说明 |
|------|------|------|
| key | TEXT PK | Jira Issue Key，如 `PROJ-123` |
| summary | TEXT | 任务标题 |
| status | TEXT | Jira 原始状态名（如 `Building 构建中`） |
| issuetype | TEXT | 任务类型（Story / Bug / Task 等） |
| sprint | TEXT | Sprint 名称 |
| sprint_state | TEXT | Sprint 状态（active / future / closed） |
| mapped_column | TEXT | 映射后的看板列 ID（如 `EXECUTION`） |
| assignee_name | TEXT | 负责人显示名 |
| assignee_avatar | TEXT | 负责人头像 URL |
| due_date | TEXT | 截止日期（优先取 `customfield_10329`，回退到 `duedate`） |
| priority | TEXT | 优先级 |
| story_points | REAL | 故事点（自定义字段，默认 `customfield_10016`） |
| source | TEXT | 来源：`JIRA` 或 `LOCAL` |
| synced_at | INTEGER | 同步时间戳 |
| raw_json | TEXT | Jira 原始 JSON |

---

## 4. 看板列定义（12 列）

定义位置：`src/stores/boardStore.ts:37`

| 序号 | 列 ID | 显示名称 | 阶段 |
|------|-------|---------|------|
| 0 | FUNNEL | FUNNEL 积压 | 前期 |
| 1 | DEFINING | DEFINING 细化 | 前期 |
| 2 | READY | READY 就绪 | 前期 |
| 3 | TO DO | TO DO 待办 | 待办 |
| 4 | EXECUTION | EXECUTION 执行 | 执行 |
| 5 | EXECUTED | EXECUTED 执行完成 | 执行 |
| 6 | TESTING & REVIEW | TESTING & REVIEW 测试和复核 | 测试 |
| 7 | TEST DONE | TEST DONE 测试完成 | 测试 |
| 8 | VALIDATING | VALIDATING 验证 | 验证 |
| 9 | RESOLVED | RESOLVED 已解决 | 完成 |
| 10 | DONE | DONE 完成 | 完成 |
| 11 | CLOSED | CLOSED 关闭 | 完成 |

---

## 5. Jira 状态 → 看板列映射

映射逻辑同时存在于 `SyncService.ts` 和 `boardStore.ts`，采用三级策略：

### 5.1 精确匹配（优先级最高）

| Jira 状态 | 看板列 |
|-----------|--------|
| Funnel 漏斗 | FUNNEL |
| Defining 定义 | DEFINING |
| Ready 就绪 | READY |
| To Do 待办 / Open 打开 | TO DO |
| Building 构建中 / In Progress 处理中 | EXECUTION |
| Build Done 构建完成 | EXECUTED |
| In Review 审核中 / Testing 测试中 / Integrating & Testing 集成测试中 | TESTING & REVIEW |
| Test Done 测试完成 | TEST DONE |
| Validating 验证 / Validating 验证中 | VALIDATING |
| Resolved 已解决 | RESOLVED |
| Done 完成 | DONE |
| Closed 关闭 | CLOSED |

### 5.2 部分匹配（关键词包含）

当精确匹配失败时，对状态名称做 `toLowerCase()` 后检查是否包含以下关键词：

- 中文关键词：漏斗、定义、就绪、待办、构建中、处理中、开始任务、构建完成、审核中、测试中、集成测试、测试完成、验证、已解决、完成、关闭
- 英文关键词：funnel, defining, ready, to do, open, building, in progress, build done, in review, testing, integrating, test done, validating, resolved, done, closed

### 5.3 自定义映射

支持通过 `t_settings` 表存储自定义映射：`status_map_{状态名小写}` → 列 ID

### 5.4 默认回退

所有未匹配的状态默认映射到 `TO DO`。

---

## 6. 泳道（Swimlane）架构

### 6.1 泳道定义

定义位置：`src/stores/boardStore.ts:54-73`

泳道基于任务的 `dueDate`（Planned End Date）字段划分，共 3 条：

| 泳道 ID | 显示名称 | 分类规则 | 颜色 |
|---------|---------|---------|------|
| `overdue` | OVERDUE (已超期) | `due_date < 今天` 且任务未完成 | 红色背景 `#FFEBE6` |
| `onSchedule` | ON SCHEDULE (按期执行) | `due_date >= 今天`，或已完成的超期任务 | 蓝绿背景 `#E6FCFF` |
| `others` | OTHERS (未设置排期) | `due_date` 为空 | 灰色背景 `#F4F5F7` |

### 6.2 泳道分类逻辑

核心代码位于 `src/stores/boardStore.ts:347-386`（`getTasksBySwimlaneAndColumn` 方法）：

```
对于每个任务:
  1. 先过滤当前 Sprint（task.sprint === currentSprint）
  2. 再过滤目标列（task.column === columnId）
  3. 按 dueDate 分配泳道:
     ├─ dueDate 为空 → others
     ├─ dueDate < 今天 且 状态不是 DONE/CLOSED → overdue
     └─ dueDate >= 今天，或状态是 DONE/CLOSED → onSchedule
```

关键规则：已完成的任务（DONE / CLOSED）即使超期也归入 `onSchedule`，不会出现在 `overdue` 泳道。

### 6.3 dueDate 数据来源

同步时优先使用 Jira 自定义字段 `customfield_10329`（Planned End Date），如果为空则回退到标准字段 `duedate`。见 `SyncService.ts:661-664`：

```typescript
const plannedEnd = issue.fields?.customfield_10329 || null;
const standardDue = issue.fields?.duedate || null;
const dueDate = plannedEnd || standardDue || null;
```

### 6.4 泳道 UI 行为

- 每条泳道可独立折叠/展开（`collapsedSwimlanes: Set<SwimlaneType>`）
- 任务数为 0 时自动折叠
- 泳道内支持拖拽（Droppable ID 格式：`{swimlaneId}:{columnId}`）
- 默认全部展开

---

## 7. 工作流验证

拖拽卡片时会进行工作流验证（`boardStore.ts:220-288`），Story 和 Bug 有不同的允许路径：

### Story 工作流

```
READY ↔ TO DO ↔ EXECUTION → EXECUTED → TESTING & REVIEW → TEST DONE → VALIDATING → RESOLVED → DONE → CLOSED
```

允许向后退回到 READY / TO DO。

### Bug 工作流

```
READY → TO DO → EXECUTION → VALIDATING → TEST DONE → DONE → CLOSED
```

Bug 可从 EXECUTION 退回 TO DO，从 VALIDATING 退回 EXECUTION。

---

## 8. 关键文件索引

| 文件 | 职责 |
|------|------|
| `electron/main/services/SyncService.ts` | 同步核心：4 步 Agile 同步、状态映射、数据转换 |
| `electron/main/services/JiraClient.ts` | Jira REST API 封装：认证、搜索、状态转换 |
| `electron/main/db/schema.ts` | 数据库初始化、表结构、CRUD 操作 |
| `electron/main/ipc/jira.ts` | IPC 处理：配置管理、触发同步 |
| `electron/main/ipc/issues.ts` | IPC 处理：拖拽时的 Jira 状态转换 |
| `src/stores/boardStore.ts` | 前端状态管理：列定义、泳道定义、状态映射、工作流验证 |
| `src/components/Swimlane.tsx` | 泳道 UI 组件：折叠、拖拽、样式 |

---

## 9. 数据流总览

```
┌─────────────────────────────────────────────────────────┐
│                    Jira Server                          │
│  Board → Sprint → Issues (Agile REST API)              │
└──────────────────────┬──────────────────────────────────┘
                       │ 同步 (4步)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              SyncService (Electron Main)                │
│  convertAgileIssue() → mapStatusToColumn() → TaskRecord │
└──────────────────────┬──────────────────────────────────┘
                       │ 写入
                       ▼
┌─────────────────────────────────────────────────────────┐
│              SQLite (t_tasks)                           │
│  key | status | mapped_column | due_date | source ...   │
└──────────────────────┬──────────────────────────────────┘
                       │ IPC: board:get-tasks
                       ▼
┌─────────────────────────────────────────────────────────┐
│              boardStore (React Renderer)                │
│  fetchTasks() → 计算 isOverdue/isOnSchedule            │
│  getTasksBySwimlaneAndColumn() → 按泳道+列分发任务      │
└──────────────────────┬──────────────────────────────────┘
                       │ 渲染
                       ▼
┌─────────────────────────────────────────────────────────┐
│              看板 UI                                    │
│  ┌──────────┬──────────┬──────────┬─────────┐          │
│  │ OVERDUE  │ col1     │ col2     │ ...     │ ← 泳道1  │
│  ├──────────┼──────────┼──────────┼─────────┤          │
│  │ON SCHED. │ col1     │ col2     │ ...     │ ← 泳道2  │
│  ├──────────┼──────────┼──────────┼─────────┤          │
│  │ OTHERS   │ col1     │ col2     │ ...     │ ← 泳道3  │
│  └──────────┴──────────┴──────────┴─────────┘          │
│                    拖拽卡片                              │
│                       │                                 │
│          transition-issue-by-column (IPC)               │
│                       ▼                                 │
│              同步状态回 Jira                             │
└─────────────────────────────────────────────────────────┘
```
