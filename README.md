# Jira Flow

一个本地优先的 Windows 桌面应用，用于同步 Jira 任务、可视化看板管理、记录工作日志，并生成 AI 驱动的周报。

![Jira Flow](https://img.shields.io/badge/Electron-34.2.0-blue)
![React](https://img.shields.io/badge/React-18.3.1-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-green)

## 功能特性

- **Jira 同步**: 支持全量和增量同步，自动每 5 分钟后台同步
- **看板视图**: 类似 Agile Hive 的高密度看板，支持拖拽排序
- **本地优先**: 所有数据存储在本地 SQLite 数据库，支持离线使用
- **Obsidian 集成**: 任务完成时自动同步到 Obsidian Vault
- **AI 周报**: 基于工作日志自动生成周报（支持 OpenAI 兼容接口如 Kimi、DeepSeek）
- **深色主题**: 默认深色模式，符合开发者习惯

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
  mapped_column TEXT,
  assignee_name TEXT,
  assignee_avatar TEXT,
  due_date TEXT,
  priority TEXT,
  updated_at TEXT,
  synced_at INTEGER,
  raw_json TEXT
);

-- 工作日志表
CREATE TABLE t_work_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_key TEXT,
  action TEXT,
  log_date TEXT,
  comment TEXT,
  created_at INTEGER
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
│   │   └── ipc/       # IPC 处理器
│   └── preload/       # 预加载脚本
├── src/               # 渲染进程 React 代码
│   ├── components/    # React 组件
│   ├── hooks/         # 自定义 Hooks
│   ├── stores/        # Zustand 状态管理
│   ├── types/         # TypeScript 类型
│   └── utils/         # 工具函数
└── dist/              # 构建输出
```

## 配置说明

首次使用时，需要在设置页面配置 Jira 连接：

1. **服务器地址**: Jira 实例 URL (如 `https://jira.company.com`)
2. **用户名**: Jira 账户邮箱
3. **密码**: 建议使用 Personal Access Token (PAT)

应用会自动将配置保存在本地 SQLite 中。

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
await window.electronAPI.jira.fullSync();
```

## 许可证

MIT
