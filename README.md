# Jira Flow v1.8.0

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
- **看板视图**: 9 列高密度看板（隐藏已完成列），支持拖拽工作流验证，列宽 200px，卡片 190×210px
- **本地优先**: 所有数据存储在本地 SQLite 数据库，支持离线使用
- **头像系统**: 支持自定义头像上传（Base64 存储），自动首字母头像回退
- **工作流验证**: Story 和 Bug 有不同的状态流转规则
- **自定义字段支持**: 支持 Jira 自定义字段（如 customfield_10329 Planned End Date）
- **故事点和截止日期编辑 (v1.6.0)**: 
  - 看板卡片上直接编辑 Story Points 和 Due Date
  - 支持自定义字段配置（Story Points Field ID、Due Date Field ID）
  - 实时同步到 Jira，乐观 UI 更新
- **Jira HTML 描述渲染 (v1.6.1)**:
  - 支持渲染 Jira 富文本描述（格式、表格、代码块等）
  - 认证加载内嵌图片，解决相对路径和权限问题
  - 单击图片放大查看，支持全屏浏览
- **全局快速添加个人任务 (v1.7.0)**:
  - 快捷键 `Ctrl+N` 从任何页面快速创建个人任务
  - 顶部导航栏新增"新建"按钮
  - 创建后自动刷新看板
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
-- 任务表（支持 Jira 和本地个人任务）
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
  raw_json TEXT,
  source TEXT DEFAULT 'JIRA',  -- 'JIRA' 或 'LOCAL'
  description TEXT             -- 任务描述
);

-- 工作日志表 (v2.0 - Phase 3)
-- 支持 Jira 自动记录、个人任务记录和手动记录，幂等性约束
CREATE TABLE t_work_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_key TEXT NOT NULL,       -- Jira Key (PROJ-123) OR UUID (manual-xxx)
  source TEXT NOT NULL,         -- 'JIRA', 'LOCAL' 或 'MANUAL'
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

-- 生成的报告表（v1.3.0+）
-- 支持周报/月报/季报/年报存储
CREATE TABLE t_generated_reports (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
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

### v1.5.0 (2025-02-09)
- **便携版数据路径优化**:
  - 便携版数据现在保存在 exe 同级目录的 `data/` 文件夹中
  - 实现真正的便携性，数据和程序一起移动
  - 安装版仍使用系统用户数据目录 `%APPDATA%\Jira Flow\`
- **工作日志界面重构**:
  - 上方展示预计完成的任务（截止日在当前时间范围内且未完成）
  - 下方展示已完成的工作日志，标记为 `[EXECUTED 执行完成]`
  - 兼容所有视图：日视图、周视图、月视图、季度视图、年视图
  - 支持 JIRA 任务和个人任务
- **AI 报告生成优化**:
  - 提示词同时包含已完成的工作日志和预计完成的任务
  - 任务列表显示当前泳道状态和截止日期
  - 工作日志标记执行完成状态

### v1.4.0 (2025-02-07)
- **个人看板 (Personal Kanban)**:
  - 新增独立的 Personal Board 视图，支持创建本地任务（非 Jira 任务）
  - 个人任务支持自定义初始列（FUNNEL 到 VALIDATING 可选）
  - 个人任务使用设置中保存的头像和用户名作为创建人
  - 个人任务支持完整的 CRUD 操作（创建、编辑、删除、归档）
  - 个人任务拖拽无工作流限制，可自由移动
  - 个人任务移动到 EXECUTED 时自动记录工作日志（source=LOCAL）
- **归档功能**:
  - 新增任务归档功能，已完成的任务可归档隐藏
  - 支持查看已归档任务列表，支持搜索和恢复
- **泳道自动展开/收起**:
  - Jira 看板和个人看板的泳道都支持根据任务数量自动展开/收起
  - 任务数量为 0 时自动收起，大于 0 时自动展开
- **数据库**:
  - 新增 `source` 字段区分 JIRA/LOCAL 任务
  - 新增 `description` 字段支持任务描述
  - 工作日志表支持 LOCAL 类型记录

### v1.3.0 (2025-02-07)
- **层级报告系统**:
  - 新增周报/月报/季报/年报四级报告体系
  - 月报/季报/年报支持左侧层级导航（Matryoshka 模式）
  - 支持在报告中为子报告生成内容
  - 每种报告类型对应独立的 AI 提示词模板
- **报告管理**:
  - 新增报告数据库存储（t_generated_reports 表）
  - 支持报告保存、查看、重新生成
  - 周报保存后日历周数显示蓝色标记
- **日历优化**:
  - 日历宽度增加至 370px，更好展示农历信息
  - 新增年份切换按钮（<< >>）
  - 修复日期选择时区问题（使用本地日期）
  - 今天日期显示蓝色圆环和"今"标记
- **设置页面**:
  - Prompt Templates 新增四种预设模板（周报/月报/季报/年报）
  - 系统预设模板只允许修改内容，不可删除或修改名称
- **工作日志**:
  - 默认视图改为今日视图（原本周视图）

### v1.2.0 (2025-02-06)
- **设置页面重构**: Chrome 风格侧边栏布局，更清晰的功能分组
- **农历日历**: 工作日志页面新增中国农历日历侧边栏，支持节气、节日显示
- **数据一致性**: 同步服务新增 "Sync & Prune" 策略，自动清理 Jira 中已删除的任务
- **看板优化**:
  - 隐藏已完成列（RESOLVED/DONE/CLOSED），聚焦进行中的工作
  - 列宽调整为 200px，卡片固定 190×210px
  - 修复横向滚动时表头错位问题
- **工作日志系统**:
  - Story 拖拽到 DONE / Bug 拖拽到 VALIDATING 时自动记录
  - 支持手动添加非 Jira 任务
  - 新增农历日期显示
- **设置功能**:
  - 新增数据管理页面，支持清空本地缓存
  - 头像设置页面优化为 Profile Card 布局
  - AI 配置和 Prompt 模板支持独立标签页管理

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
