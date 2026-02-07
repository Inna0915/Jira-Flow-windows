Project Name: Jira-Flow (Desktop Workbench)
1. Project Overview
A local-first, Windows-focused desktop application built with Electron. It serves as a developer workbench to synchronize Jira tasks, visualize them in a highly customized Kanban board (Agile Hive style), log daily work (Auto & Manual), sync to Obsidian, and generate/persist AI reports.

2. Tech Stack & Architecture
Runtime: Electron (latest) with Multi-window support.

Frontend: React 18+, TypeScript, Vite.

Styling: TailwindCSS (Theme: Light Mode ONLY).

Database: SQLite (better-sqlite3).

Network: Axios (httpsAgent: { rejectUnauthorized: false }).

3. Core Business Logic (Strict)
A. Data Sync & Mapping
Sprint Logic: Auto-select the first sprint where state is 'active'.

Date Mapping: Primary: customfield_10329 (Planned End). Fallback: duedate.

Sync Consistency: "Sync & Prune" strategy.

Tasks are stamped with a synced_at timestamp during fetch.

Stale tasks (older timestamp) are deleted post-sync to ensure 1:1 mirroring with Jira.

B. Avatar System
Source: t_settings (user_avatar_base64).

Display: Custom Image > Identicon/Initials > NEVER Jira URL.

C. Swimlane Logic (Strict)
Overdue: due_date < Today AND status != Done/Closed.

On Schedule: due_date >= Today.

Others: due_date IS NULL.

D. Work Logging (Auto & Manual)
Auto-Trigger:

Story -> DONE

Bug -> VALIDATING

Logic: Insert into t_work_logs.

Constraint: UNIQUE(task_key, log_date) to prevent duplicates on the same day.

Content: Pure Task Title (No "Moved to..." text).

E. Reports & Calendar System (New)
Calendar Navigation:

Month Click: Filters log list to the entire month.

Week Number Click: Filters log list to that specific ISO week.

Day Click: Filters log list to that specific date.

Report Persistence:

Generated AI reports are Saved to DB, not ephemeral.

Linked to specific Date Ranges (Weekly/Monthly).

Report Viewer (Modal):

Weekly Mode: Displays single Markdown content.

Monthly Mode (Split-View):

Sidebar: Lists "Monthly Summary" + All "Weekly Reports" in that month.

Content: Displays selected report.

F. Obsidian Integration
Trigger: Same as Work Logging (Done/Validating).

Logic:

Check vault_path in settings.

If file exists: Update Frontmatter ONLY (Status, Date). Preserve Body.

If new: Create [Key] Summary.md with Frontmatter + Description.

4. UI Design Specs (Agile Hive Replica)
A. Board Layout (Elastic & Fluid)
Container: overflow-x-auto overflow-y-hidden.

Column Sizing: Elastic Strategy.

Logic: flex-1 min-w-[280px] max-w-[400px] flex-shrink-0.

Behavior: Columns grow to fill screen (no whitespace) but maintain minimum readability width on small screens.

Alignment: Header cells and Swimlane cells MUST use identical width classes.

B. Styling
Swimlanes:

Overdue: Red (#FFEBE6).

On Schedule: Teal/Green (#E6FCFF).

Others: Gray (#F4F5F7).

Cards:

Story: Blue Key, "UNCOVERED" badge.

Bug: Red left-strip.

Content: Truncated Summary & Sprint Tag.

5. Database Schema (Reference)
t_tasks: key, summary, status, assignee_name, issuetype, due_date, priority, sprint_state, synced_at.

t_work_logs:

id, task_key, source ('JIRA'/'MANUAL'), summary, log_date.

Constraint: UNIQUE(task_key, log_date).

t_generated_reports (New):

id (UUID), type ('daily'/'weekly'/'monthly'), start_date, end_date, content, created_at.

t_settings: s_key, s_value (includes obsidian_vault_path).