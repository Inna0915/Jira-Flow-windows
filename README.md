# Jira Flow v1.1.0

一个本地优先的 Windows 桌面应用，用于同步 Jira 任务、可视化看板管理、记录工作日志，并生成 AI 驱动的周报。

![Jira Flow](https://img.shields.io/badge/Electron-34.2.0-blue)
![React](https://img.shields.io/badge/React-18.3.1-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-green)

## 功能特性

- **Jira Agile API 同步**: 支持 4 步 Agile 同步（Board → Sprint → Issues），自动过滤当前用户任务
- **智能泳道分组**: 基于 Planned End Date 自动分组：
  - **OVERDUE (已超期)**: 截止日期已过且未完成
  - **ON SCHEDULE (按期执行)**: 截止日期在今天或之后，或已完成
  - **OTHERS (未设置排期)**: 无截止日期
- **看板视图**: 12 列高密度看板（FUNNEL → CLOSED），支持拖拽工作流验证
- **本地优先**: 所有数据存储在本地 SQLite 数据库，支持离线使用
- **头像系统**: 支持自定义头像上传（Base64 存储），自动首字母头像回退
- **工作流验证**: Story 和 Bug 有不同的状态流转规则
- **自定义字段支持**: 支持 Jira 自定义字段（如 customfield_10329 Planned End Date）
- **工作日志系统 (Phase 3)**:
  - **自动记录**: Story 拖拽到 DONE / Bug 拖拽到 VALIDATING 时自动记录
  - **手动记录**: 支持添加非 Jira 任务到工作日志
  - **幂等性**: 同一天同一任务只记录一次
  - **报告视图**: 按日期分组展示，支持 Jira/Manual 标签区分

## 技术栈

- **桌面框架**: Electron 34
- **前端**: React 18 + TypeScript + Vite
- **样式**: TailwindCSS
- **状态管理**: Zustand
- **数据库**: SQLite (better-sqlite3)
- **拖拽**: @hello-pangea/dnd

## 数据库结构

```sql
-- 任务表
CREATE TABLE t_tasks (
  key TEXT PRIMARY KEY,
  summary TEXT,
  status TEXT,
  issuetype TEXT,
  sprint TEXT,
  sprint_state TEXT,
  mapped_column TEXT,
  assignee_name TEXT,
  assignee_avatar TEXT,
  due_date TEXT,
  priority TEXT,
  updated_at TEXT,
  synced_at INTEGER,
  raw_json TEXT
);

-- 工作日志表 (v2.0 - Phase 3)
-- 支持 Jira 自动记录和手动记录，幂等性约束
CREATE TABLE t_work_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_key TEXT NOT NULL,       -- Jira Key (PROJ-123) OR UUID (manual-xxx)
  source TEXT NOT NULL,         -- 'JIRA' or 'MANUAL'
  summary TEXT,                 -- 任务标题或自定义文本
  log_date TEXT NOT NULL,       -- YYYY-MM-DD
  created_at INTEGER,
  -- 约束：同一天同一任务只能有一条记录（幂等性）
  UNIQUE(task_key, log_date)
);

-- 设置表
CREATE TABLE t_settings (
  s_key TEXT PRIMARY KEY,
  s_value TEXT
);
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
npm run electron:build
```

## 项目结构

```
jira-flow/
├── electron/           # Electron 主进程
│   ├── main/          # 主进程入口
│   │   ├── db/        # SQLite 数据库
│   │   ├── ipc/       # IPC 处理器
│   │   └── services/  # 同步服务、Jira 客户端
│   └── preload/       # 预加载脚本
├── src/               # 渲染进程 React 代码
│   ├── components/    # React 组件（Board, TaskCard, Swimlane 等）
│   ├── hooks/         # 自定义 Hooks
│   ├── stores/        # Zustand 状态管理
│   └── types/         # TypeScript 类型
└── dist/              # 构建输出
```

## 配置说明

首次使用时，需要在设置页面配置 Jira 连接：

1. **服务器地址**: Jira 实例 URL (如 `https://jira.company.com`)
2. **用户名**: Jira 账户名（用于过滤"My Tasks"）
3. **密码**: 建议使用 Personal Access Token (PAT)
4. **Project Key**: 项目缩写（如 PROJ），用于 Agile API 自动检测 Board

应用会自动将配置保存在本地 SQLite 中。

## 主要更新日志

### v1.2.0 (WIP - Phase 3)
- 新增工作日志系统：
  - Story 拖拽到 DONE / Bug 拖拽到 VALIDATING 时自动记录
  - 支持手动添加非 Jira 任务
  - 新增工作日志报告页面
  - 数据库表重构，支持幂等性约束

### v1.1.0
- 新增 Agile API 4 步同步（Board → Sprint → Issues）
- 新增基于 Planned End Date 的智能泳道分组
- 新增自定义字段支持（customfield_10329）
- 新增头像上传功能
- 修复中文编码问题（UTF-8 解码）
- 修复 CSP 策略允许 base64 图片
- 优化看板列宽防止溢出（min-w-[280px]）

### v1.0.0
- 初始版本，基础 Jira 同步和看板功能

## 开发说明

### 原生模块重新编译

如果遇到 `better-sqlite3` 版本不匹配错误，请运行：

```bash
npx electron-rebuild -f -w better-sqlite3
```

### IPC 通信

渲染进程通过 `window.electronAPI` 访问主进程功能：

```typescript
// 获取设置
const result = await window.electronAPI.database.settings.get('key');

// 同步 Jira
await window.electronAPI.jira.syncNow({ fullSync: true });

// 清空任务数据（调试用）
await window.electronAPI.database.tasks.clearAll();
```

## 许可证

MIT
