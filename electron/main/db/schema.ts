import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

let db: Database.Database | null = null;

/**
 * 获取数据库连接实例（单例模式）
 */
export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'jira-flow.db');
    console.log('[Database] Opening database at:', dbPath);
    
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL'); // 启用 WAL 模式提高并发性能
    
    initializeTables();
  }
  return db;
}

/**
 * 初始化数据库表结构
 * 根据 SPEC.md 定义创建 t_tasks, t_work_logs, t_settings 表
 */
function initializeTables(): void {
  if (!db) return;

  console.log('[Database] Initializing tables...');

  // 任务表 - 存储从 Jira 同步的任务
  db.exec(`
    CREATE TABLE IF NOT EXISTS t_tasks (
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
    )
  `);

  // 工作日志表 - 记录用户操作和 AI 摘要
  db.exec(`
    CREATE TABLE IF NOT EXISTS t_work_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_key TEXT,
      action TEXT,
      log_date TEXT,
      comment TEXT,
      created_at INTEGER
    )
  `);

  // 设置表 - 存储应用配置
  db.exec(`
    CREATE TABLE IF NOT EXISTS t_settings (
      s_key TEXT PRIMARY KEY,
      s_value TEXT
    )
  `);

  // 创建索引以提高查询性能
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON t_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_mapped_column ON t_tasks(mapped_column);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON t_tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_work_logs_task_key ON t_work_logs(task_key);
    CREATE INDEX IF NOT EXISTS idx_work_logs_log_date ON t_work_logs(log_date);
  `);

  console.log('[Database] Tables initialized successfully');
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    console.log('[Database] Closing database connection');
    db.close();
    db = null;
  }
}

/**
 * 数据库操作辅助函数
 */

// 设置项操作
export const settingsDB = {
  get(key: string): string | null {
    const row = getDatabase().prepare('SELECT s_value FROM t_settings WHERE s_key = ?').get(key) as { s_value: string } | undefined;
    return row?.s_value ?? null;
  },

  set(key: string, value: string): void {
    getDatabase().prepare(
      'INSERT OR REPLACE INTO t_settings (s_key, s_value) VALUES (?, ?)'
    ).run(key, value);
  },

  delete(key: string): void {
    getDatabase().prepare('DELETE FROM t_settings WHERE s_key = ?').run(key);
  },
};

// 任务操作
export const tasksDB = {
  upsert(task: {
    key: string;
    summary: string;
    status: string;
    mapped_column?: string | null;
    assignee_name?: string;
    assignee_avatar?: string;
    due_date?: string;
    priority?: string;
    updated_at?: string;
    raw_json?: string;
  }): void {
    getDatabase().prepare(
      `INSERT OR REPLACE INTO t_tasks 
       (key, summary, status, mapped_column, assignee_name, assignee_avatar, due_date, priority, updated_at, synced_at, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      task.key,
      task.summary,
      task.status,
      task.mapped_column ?? null,
      task.assignee_name ?? null,
      task.assignee_avatar ?? null,
      task.due_date ?? null,
      task.priority ?? null,
      task.updated_at ?? null,
      Date.now(),
      task.raw_json ?? null
    );
  },

  getAll(): Array<Record<string, unknown>> {
    return getDatabase().prepare('SELECT * FROM t_tasks ORDER BY synced_at DESC').all();
  },

  getByColumn(column: string): Array<Record<string, unknown>> {
    return getDatabase().prepare('SELECT * FROM t_tasks WHERE mapped_column = ?').all(column);
  },

  updateColumn(key: string, column: string): void {
    getDatabase().prepare(
      'UPDATE t_tasks SET mapped_column = ?, synced_at = ? WHERE key = ?'
    ).run(column, Date.now(), key);
  },
};

// 工作日志操作
export const workLogsDB = {
  create(log: {
    task_key: string;
    action: string;
    log_date: string;
    comment?: string;
  }): number {
    const result = getDatabase().prepare(
      `INSERT INTO t_work_logs (task_key, action, log_date, comment, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(log.task_key, log.action, log.log_date, log.comment ?? null, Date.now());
    return Number(result.lastInsertRowid);
  },

  getByDateRange(startDate: string, endDate: string): Array<Record<string, unknown>> {
    return getDatabase().prepare(
      'SELECT * FROM t_work_logs WHERE log_date BETWEEN ? AND ? ORDER BY created_at DESC'
    ).all(startDate, endDate);
  },

  getByTaskKey(taskKey: string): Array<Record<string, unknown>> {
    return getDatabase().prepare(
      'SELECT * FROM t_work_logs WHERE task_key = ? ORDER BY created_at DESC'
    ).all(taskKey);
  },
};
