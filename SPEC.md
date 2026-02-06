# Project Name: Jira-Flow (Desktop Workbench)

## 1. Project Overview
A local-first, Windows-focused desktop application built with Electron. It serves as a developer workbench to synchronize Jira tasks, visualize them in a highly customized Kanban board (Agile Hive style), log daily work, and generate AI-powered reports.

## 2. Tech Stack & Architecture
- **Runtime**: Electron (latest) with Multi-window support.
- **Frontend**: React 18+, TypeScript, Vite.
- **Styling**: TailwindCSS (Theme: Light Mode ONLY).
- **Database**: SQLite (`better-sqlite3`).
- **Network**: Axios (`httpsAgent: { rejectUnauthorized: false }`).

## 3. Core Business Logic (Strict)

### A. Data Sync & Mapping
- **Sprint Logic**: Auto-select the first sprint where `state` is `'active'`.
- **Date Mapping**:
  - Primary Source: **`customfield_10329`** (Planned End Date).
  - Fallback: Standard `duedate`.
  - Database Field: Store as `due_date` (YYYY-MM-DD).

### B. Avatar System (Strict)
- **Source**: `t_settings` (`user_avatar_base64`).
- **Format**: MUST include prefix `data:image/png;base64,...`.
- **Display**: Custom Image > Identicon/Initials > **NEVER** use Jira URL.

### C. Swimlane Logic (Refined v2.2)
The board groups tasks into 3 strict categories based on `due_date`:
1.  **Overdue (已超期)**: 
    - `due_date` IS NOT NULL
    - AND `due_date < Today`
    - AND `status` != Done/Closed.
2.  **On Schedule (按期执行)**: 
    - `due_date` IS NOT NULL
    - AND `due_date >= Today`.
    - (Replaces the old "Due Soon" logic).
3.  **Others (未排期/其他)**: 
    - `due_date` IS NULL.

### D. Column Mapping (Fixed Order)
`FUNNEL`, `DEFINING`, `READY`, `TO DO`, `EXECUTION`, `EXECUTED`, `TESTING & REVIEW`, `TEST DONE`, `VALIDATING`, `RESOLVED`, `DONE`, `CLOSED`.

## 4. UI Design Specs (Agile Hive Replica)

### A. Board Styling
- **Canvas**: `#F4F5F7`.
- **Grid**: Columns must have `min-w-[280px]` to prevent squashing, with right-border separators.
- **Headers**: Uppercase, `text-[11px]`, `font-bold`, `text-[#6B778C]`.

### B. Swimlane Styling
- **Overdue**: Red background (`bg-[#FFEBE6]`), Text Red.
- **On Schedule**: Green/Teal background (`bg-[#E6FCFF]`), Text Dark Teal.
- **Others**: Neutral Gray background (`bg-[#F4F5F7]`).

### C. Task Card
- **Story**: Blue Key, "UNCOVERED" badge.
- **Bug**: Red vertical left-strip.
- **Content**: Summary & Sprint Tag must truncate (`text-ellipsis`) to avoid overflow.
- **Interaction**: Click -> Right Drawer.

## 5. Database Schema (Reference)
- `t_tasks`: key, summary, status, assignee_name, issuetype, due_date (from customfield), priority, sprint_state.