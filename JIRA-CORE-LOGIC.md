# Jira 核心逻辑梳理

## 一、Sprint 获取与任务同步（Jira → 本地）

### 1. 入口

前端触发 IPC `jira:sync-now`（`electron/main/ipc/jira.ts:102`），根据是否配置了 `projectKey` 决定走 Agile 4 步同步还是 JQL 降级同步。

### 2. 四步 Agile 同步流程

核心实现在 `electron/main/services/SyncService.ts` 的 `performAgileSync()` 方法（第 848 行）。

```
前端 jira:sync-now
  │
  ▼
Step 1: detectBoardId(projectKey)          ── 检测看板 ID
  │  API: GET /rest/agile/1.0/board?projectKeyOrId={projectKey}
  │  策略: 优先选 Scrum 类型 board，否则取第一个
  │  失败: 回退到 JQL 同步
  │
  ▼
Step 2: fetchActiveSprint(boardId)         ── 获取活跃 Sprint
  │  API: GET /rest/agile/1.0/board/{boardId}/sprint?state={state}
  │  策略: 按 active → future → closed 优先级依次尝试，取第一个
  │  结果: 保存 sprintId / sprintName / sprintState 到 settingsDB
  │  失败: 跳过，继续同步 Backlog
  │
  ▼
Step 3: fetchSprintIssues(sprintId)        ── 拉取 Sprint 内的任务
  │  API: GET /rest/agile/1.0/sprint/{sprintId}/issue
  │  JQL: assignee="{username}"（只拉当前用户的任务）
  │  分页: maxResults=100，循环直到全部拉完
  │
  ▼
Step 4: fetchBacklogIssues(boardId, projectKey) ── 拉取 Backlog 任务
     API: GET /rest/agile/1.0/board/{boardId}/backlog
     JQL: project="{projectKey}" AND assignee="{username}"
     过滤: 排除已有 sprint 信息的 issue（避免与 Step 3 重复）
```

### 3. 数据转换

`convertAgileIssue()`（第 626 行）将 Jira Issue 转为内部 `TaskRecord`：

| Jira 字段 | 本地字段 | 说明 |
|---|---|---|
| `fields.status.name` | `mapped_column` | 通过 `mapStatusToColumn()` 三级映射 |
| `fields.assignee.displayName` | `assignee_name` | |
| `customfield_10329` / `duedate` | `due_date` | 优先取 Planned End Date |
| `customfield_10016`（可配置） | `story_points` | |
| `fields.sprint.name` | `sprint` | |

状态映射策略（`mapStatusToColumn()`，第 779 行）：
1. 精确匹配 `STATUS_MAP`（如 `"Building 构建中"` → `EXECUTION`）
2. 查 settingsDB 自定义映射 `status_map_{status}`
3. 部分关键词匹配 `PARTIAL_MAPPINGS`（如包含 `"progress"` → `EXECUTION`）
4. 兜底返回 `TO DO`

### 4. 去重与存储

```
Backlog 任务 ──┐
               ├──▶ Map<key, TaskRecord>（Sprint 覆盖 Backlog 同 key 项）
Sprint 任务 ──┘
               │
               ▼
         saveTasksToDatabase()  ── upsert 到 t_tasks 表
               │
               ▼
         pruneStaleTasks()      ── 删除 synced_at < 本次时间戳 且 source='JIRA' 的记录
                                   保留 LOCAL 个人任务不受影响
```

### 5. JQL 降级同步

当 Agile API 不可用时（`performJQLSync()`，第 1010 行）：
- JQL: `assignee = currentUser() ORDER BY updated DESC`
- 最多拉 100 条，走相同的转换和清理逻辑

### 6. 前端 Sprint 过滤

`src/hooks/useTasks.ts` 的 `useTasks()` Hook：
1. 调用 `window.electronAPI.board.getTasks()` 从本地数据库读取全部任务
2. 从任务数据中提取唯一 Sprint 列表
3. 自动选择 Sprint：`active` → `future` → `closed` → 第一个
4. 同步到 `boardStore`（Zustand），Board 组件按 `task.sprint === currentSprint` 过滤展示
5. 按 dueDate 划分泳道：overdue（逾期未完成）/ onSchedule（按期或已完成）/ others（无日期）

---

## 二、反向同步 Jira（本地 → Jira）

项目中有三种操作会将本地变更写回 Jira。

### 1. 状态转换（拖拽卡片）

入口：IPC `jira:transition-issue-by-column`（`electron/main/ipc/issues.ts:37`）

```
用户拖拽卡片到目标列（targetColumn）
  │
  ▼
1. client.getTransitions(key)
   API: GET /rest/api/2/issue/{key}/transitions
   获取该 issue 当前可用的所有 transition
  │
  ▼
2. 匹配目标 transition
   精确匹配: normalizeStatus(transition.name) === targetColumn
   模糊匹配: targetColumn 的关键词出现在 transition.name 中
  │
  ▼
3. client.transitionIssue(key, transitionId)
   API: POST /rest/api/2/issue/{key}/transitions
   Body: { transition: { id: transitionId } }
  │
  ▼
4. 更新本地数据库
   API: GET /rest/api/2/issue/{key}  ── 获取转换后的最新状态
   SQL: UPDATE t_tasks SET status=?, mapped_column=? WHERE key=?
  │
  ▼
5. 特殊处理
   如果 Jira 返回 Resolution 字段缺失错误 → 返回 RESOLUTION_REQUIRED
   提示用户去 Jira 页面手动操作
```

匹配逻辑复用了 `normalizeStatus()` 函数（`SyncService.ts:87`），将 transition 名称映射到看板列 ID 后与目标列比较。

### 2. 字段更新（故事点、截止日期）

入口：IPC `jira:update-issue`（`electron/main/ipc/jira.ts:302`）

```
用户在卡片上编辑 Story Points 或 Due Date
  │
  ▼
client.updateIssue(key, fields, storyPointsField, dueDateField)
  API: PUT /rest/api/2/issue/{key}
  Body: { fields: { [storyPointsField]: value, [dueDateField]: value } }
  │
  ▼
更新本地数据库
  tasksDB.updatePersonal(key, { story_points, due_date })
```

- `storyPointsField` 默认 `customfield_10016`，可通过 settingsDB 配置
- `dueDateField` 默认 `duedate`，可通过 settingsDB 配置

### 3. 直接状态转换

入口：IPC `jira:transition-issue`（`electron/main/ipc/jira.ts:236`）

与拖拽不同，这里直接传入 `transitionId`，不需要匹配逻辑：

```
client.transitionIssue(issueKey, transitionId)
  API: POST /rest/api/2/issue/{key}/transitions
  │
  ▼
成功后自动记录工作日志
  workLogsDB.logAutoJira({ task_key, summary, log_date })
```

---

## 三、关键文件索引

| 文件 | 职责 |
|---|---|
| `electron/main/ipc/jira.ts` | IPC 入口：同步、配置、字段更新、附件获取 |
| `electron/main/ipc/issues.ts` | IPC 入口：拖拽状态转换 |
| `electron/main/ipc/logs.ts` | IPC 入口：工作日志记录 |
| `electron/main/services/SyncService.ts` | 核心同步逻辑：4 步 Agile 同步、数据转换、状态映射 |
| `electron/main/services/JiraClient.ts` | Jira REST API 封装：搜索、转换、更新、获取 |
| `src/hooks/useTasks.ts` | 前端 Hook：任务加载、Sprint 自动选择 |
| `src/stores/boardStore.ts` | Zustand Store：任务状态管理、Sprint 过滤 |
