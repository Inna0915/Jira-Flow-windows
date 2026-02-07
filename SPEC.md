---

# Project Name: Jira-Flow (Desktop Workbench)

## 1. Project Overview

A local-first, Windows-focused desktop application built with Electron. It serves as a unified developer workbench to:

1. **Synchronize & Visualize** Jira tasks (Agile Hive style).
2. **Manage Personal Tasks** (Local Kanban) alongside professional work.
3. **Log Work** automatically or manually.
4. **Generate AI Reports** with a hierarchical structure (Year/Quarter/Month/Week).
5. **Sync to Obsidian** for knowledge management.

## 2. Tech Stack & Architecture

* **Runtime**: Electron (latest) with Multi-window support.
* **Frontend**: React 18+, TypeScript, Vite.
* **Styling**: TailwindCSS (Theme: Light Mode ONLY).
* **Database**: SQLite (`better-sqlite3`).
* **Network**: Axios (`httpsAgent: { rejectUnauthorized: false }`).

## 3. Core Business Logic (Strict)

### A. Data Sync & Mapping (Hybrid System)

* **Source Differentiation**:
* **Jira Tasks**: `source = 'JIRA'`. Synced from API.
* **Personal Tasks**: `source = 'LOCAL'`. Created locally via "New Task" modal.


* **Key Generation**:
* Jira: Retains original Key (e.g., `PROJ-123`).
* Personal: Generated Key `ME-{timestamp_suffix}` (e.g., `ME-4921`).


* **Sync Consistency ("Sync & Prune")**:
* Jira tasks are stamped with `synced_at`. Stale Jira tasks are deleted post-sync.
* **Protection**: `source='LOCAL'` tasks are **NEVER** deleted during Jira sync.



### B. Avatar System

* **Source**: `t_settings` (`user_avatar_base64`).
* **Display**: Custom Image > Identicon/Initials > **NEVER** Jira URL.

### C. Swimlane Logic

1. **Overdue**: `due_date < Today` AND status != Done/Closed.
2. **On Schedule**: `due_date >= Today`.
3. **Others**: `due_date` IS NULL.

### D. Work Logging (Unified Flow)

* **Triggers**:
* **Jira**: Story -> DONE / Bug -> VALIDATING.
* **Personal**: Task -> DONE (Drag & Drop).


* **Storage**: `t_work_logs`.
* **Constraint**: `UNIQUE(task_key, log_date)`.
* **Content**: Pure Task Title. AI Reports read from this table, seamlessly blending Jira and Personal work.

### E. Reports & Calendar System (Hierarchical)

* **Calendar UI**:
* **Visuals**: No grid lines. "Today" has Blue Border + "今" badge.
* **Indicators**: Blue Dot under date if tasks/logs exist.
* **Localization**: Lunar Date + Festivals + Solar Terms (via `lunar-javascript`).
* **Navigation**: Month Switcher (`<` `>`) must handle year transitions correctly.


* **Selection Logic**:
* **Year/Quarter/Month/Week/Day**: Clicking filters the **Log List** (Right Panel) silently.


* **Report Architecture (The "Matryoshka" System)**:
* **Persistence**: Reports are saved to DB `t_generated_reports`.
* **Viewer Modal (Split-View)**:
* **Yearly Mode**: Sidebar lists "Annual Summary" + Links to Q1-Q4 Reports.
* **Quarterly Mode**: Sidebar lists "Quarter Summary" + Links to Monthly Reports.
* **Monthly Mode**: Sidebar lists "Monthly Summary" + Links to Weekly Reports.
* **Weekly Mode**: Single Markdown content view.


* **Generation**: "Generate" buttons are embedded within the Viewer Modal.



### F. Obsidian Integration

* **Trigger**: Same as Work Logging.
* **Logic**: Update Frontmatter if exists; Create new file if not.

## 4. UI Design Specs

### A. Board Layout (Dual View & Elastic)

* **View Switcher**: Segmented Control in Header -> `[ Jira Project | Personal Board ]`.
* **Jira View**: Shows `source='JIRA'`.
* **Personal View**: Shows `source='LOCAL'` + **[New Task]** Button.


* **Elastic Columns**:
* Logic: `flex-1 min-w-[280px] max-w-[400px] flex-shrink-0`.
* Behavior: Fills available screen width, no empty whitespace on right.


* **Create Task Modal**:
* Fields: Summary (Req), Priority, Due Date, Description.
* Style: Clean, Agile Hive aligned.



### B. Reports Page Layout

* **Left**: Calendar Sidebar (Year/Quarter/Month selectors + Lunar Date Grid).
* **Right**:
* **Top**: Header with Filter Info + Buttons `[View Weekly]` `[View Monthly]` `[View Quarterly]` `[View Yearly]`.
* **Body**: **Log List ONLY**. (No permanent AI panel).


* **Interaction**: All generation/viewing happens inside the **ReportViewerDialog**.

### C. Styling Standards

* **Swimlanes**: Overdue (Red #FFEBE6), On Schedule (Teal #E6FCFF), Others (Gray #F4F5F7).
* **Cards**:
* Jira: Blue Key, Status Badges.
* Personal: Distinct style (optional) or consistent with Jira cards.



## 5. Database Schema

### `t_tasks` (Unified Task Store)

| Field | Type | Note |
| --- | --- | --- |
| `key` | TEXT (PK) | `PROJ-123` or `ME-1234` |
| `source` | TEXT | **'JIRA'** or **'LOCAL'** (Default 'JIRA') |
| `summary` | TEXT |  |
| `status` | TEXT |  |
| `issuetype` | TEXT |  |
| `sprint` | TEXT | 'Personal' for local tasks |
| `sprint_state` | TEXT | 'active' for local tasks |
| `mapped_column` | TEXT |  |
| `assignee_name` | TEXT |  |
| `assignee_avatar` | TEXT |  |
| `due_date` | TEXT | YYYY-MM-DD |
| `priority` | TEXT |  |
| `updated_at` | TEXT |  |
| `synced_at` | INTEGER |  |
| `raw_json` | TEXT |  |

### `t_work_logs`

| Field | Type | Note |
| --- | --- | --- |
| `id` | INTEGER (PK) |  |
| `task_key` | TEXT |  |
| `source` | TEXT | 'JIRA' / 'MANUAL' / 'LOCAL' |
| `summary` | TEXT |  |
| `log_date` | TEXT | YYYY-MM-DD |
| **Constraint** |  | `UNIQUE(task_key, log_date)` |

### `t_generated_reports`

| Field | Type | Note |
| --- | --- | --- |
| `id` | TEXT (PK) | UUID |
| `type` | TEXT | 'weekly' / 'monthly' / 'quarterly' / 'yearly' |
| `start_date` | TEXT |  |
| `end_date` | TEXT |  |
| `content` | TEXT | Markdown |
| `created_at` | INTEGER |  |

### `t_settings`

* `s_key` (PK), `s_value`.
* Configs: `jira_config`, `ai_profiles`, `obsidian_config`, `user_avatar`.

---