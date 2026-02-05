# Project Name: Jira-Flow (Desktop Workbench)

## 1. Project Overview
A local-first, Windows-focused desktop application built with Electron. It serves as a developer workbench to synchronize Jira tasks, visualize them in a Kanban board, log daily work, and generate AI-powered weekly reports. It also syncs task status to a local Obsidian vault.

## 2. Tech Stack & Architecture
- **Runtime**: Electron (latest) with Multi-window support.
- **Frontend**: React 18+, TypeScript, Vite.
- **Styling**: TailwindCSS (Utility-first). 
    - *Component Library Recommendation*: shadcn/ui (for the Moonshot-style settings and clean Kanban look).
- **State Management**: Zustand (for lightweight, efficient global state).
- **Database**: SQLite (via `better-sqlite3`) running in the Main Process.
- **Jira Integration**: Axios (configured to ignore SSL errors for internal servers).
- **Local Storage**: Electron `electron-store` for simple user configs (window size, last position), but business data must go to SQLite.

## 3. Database Schema (SQLite)
Use `better-sqlite3`. Initialize the following tables on app launch:

```sql
CREATE TABLE IF NOT EXISTS t_tasks (
  key TEXT PRIMARY KEY,       -- e.g., "PROJ-1024"
  summary TEXT,
  status TEXT,                -- Original Jira Status
  mapped_column TEXT,         -- Mapped UI Column (e.g., "EXECUTION")
  assignee_name TEXT,
  assignee_avatar TEXT,
  due_date TEXT,
  priority TEXT,
  updated_at TEXT,
  synced_at INTEGER,
  raw_json TEXT               -- Store full JSON for backup
);

CREATE TABLE IF NOT EXISTS t_work_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_key TEXT,
  action TEXT,                -- 'MOVE_TO_DONE', 'CREATE'
  log_date TEXT,              -- Format: YYYY-MM-DD
  comment TEXT,               -- AI summary or user note
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS t_settings (
  s_key TEXT PRIMARY KEY,
  s_value TEXT
);

```
4. Key Features & Business Logic
A. Jira Synchronization (Local-First)
Logic:

On Launch: Check last_sync_time. If > 24h or empty, perform Full Sync (last 30 days). Else, perform Incremental Sync (updated >= last_sync_time).

Background: Auto-sync every 5 minutes.

Network: Must configure Axios httpsAgent to { rejectUnauthorized: false } for self-hosted Jira.

Auth: Support Basic Auth (Username + Password/PAT).

B. Kanban Board (UI)
Style: Mimic "Agile Hive" visual density.

Columns: Configurable mapping. Example: Jira 'In Progress' -> UI 'Execution'.

Swimlanes:

Urgent: Priority = High OR DueDate < Today.

Normal: Everything else.

Interaction: Drag & Drop using @hello-pangea/dnd.

Optimistic UI: Update UI immediately on drop, send API request in background. If failed, revert UI.

C. Obsidian Sync (File I/O)
Trigger: When a task moves to "Done".

Logic:

Check file {VaultPath}/{Key} {Summary}.md.

If exists: Update Frontmatter only (Status, Sprint). DO NOT OVERWRITE CONTENT.

If new: Create file with Frontmatter + Description.

D. AI Reports
Source: Query t_work_logs by date range.

Config UI: "Moonshot" style sidebar. Support OpenAI-compatible endpoints (Kimi, DeepSeek).

5. UI/UX Guidelines
Dark Mode: Default.

Density: High density for the Board (show key info without scrolling).

Settings: Clean, card-based layout with a sidebar.
