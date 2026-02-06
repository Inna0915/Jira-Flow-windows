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
 * 检查列是否存在
 */
function columnExists(tableName: string, columnName: string): boolean {
  if (!db) return false;
  try {
    const result = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    return result.some(col => col.name === columnName);
  } catch {
    return false;
  }
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
    )
  `);

  // 迁移：添加新列（如果旧表缺少这些列）
  if (!columnExists('t_tasks', 'issuetype')) {
    console.log('[Database] Migrating: Adding issuetype column...');
    db.exec('ALTER TABLE t_tasks ADD COLUMN issuetype TEXT');
  }
  if (!columnExists('t_tasks', 'sprint')) {
    console.log('[Database] Migrating: Adding sprint column...');
    db.exec('ALTER TABLE t_tasks ADD COLUMN sprint TEXT');
  }
  if (!columnExists('t_tasks', 'sprint_state')) {
    console.log('[Database] Migrating: Adding sprint_state column...');
    db.exec('ALTER TABLE t_tasks ADD COLUMN sprint_state TEXT');
  }

  // 工作日志表 - 支持 Jira 自动记录和手动记录
  // v2.0: 重构表结构，支持混合内容类型
  // 检查是否需要迁移（旧表结构兼容）
  const workLogsNeedsMigration = db.prepare("SELECT name FROM pragma_table_info('t_work_logs') WHERE name = 'source'").get() === undefined;
  
  if (workLogsNeedsMigration && columnExists('t_work_logs', 'action')) {
    console.log('[Database] Migrating t_work_logs to v2.0...');
    // 旧表存在且需要迁移：重建表
    db.exec(`
      -- 1. 创建临时表（新结构）
      CREATE TABLE t_work_logs_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_key TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'JIRA',
        summary TEXT,
        log_date TEXT NOT NULL,
        created_at INTEGER,
        UNIQUE(task_key, log_date)
      );
      
      -- 2. 迁移旧数据
      INSERT INTO t_work_logs_new (id, task_key, source, summary, log_date, created_at)
      SELECT 
        id,
        COALESCE(task_key, 'UNKNOWN'),
        CASE 
          WHEN task_key LIKE 'manual-%' THEN 'MANUAL'
          ELSE 'JIRA'
        END,
        COALESCE(comment, action, 'Legacy entry'),
        log_date,
        created_at
      FROM t_work_logs;
      
      -- 3. 删除旧表
      DROP TABLE t_work_logs;
      
      -- 4. 重命名新表
      ALTER TABLE t_work_logs_new RENAME TO t_work_logs;
    `);
    console.log('[Database] t_work_logs migration completed');
  } else {
    // 创建新表（如果不存在）
    db.exec(`
      CREATE TABLE IF NOT EXISTS t_work_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_key TEXT NOT NULL,       -- Jira Key (PROJ-123) OR UUID (manual-xxx)
        source TEXT NOT NULL,         -- 'JIRA' or 'MANUAL'
        summary TEXT,                 -- 任务标题或自定义文本
        log_date TEXT NOT NULL,       -- YYYY-MM-DD
        created_at INTEGER,
        -- 约束：同一天同一任务只能有一条记录（幂等性）
        UNIQUE(task_key, log_date)
      )
    `);
  }

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
    issuetype?: string;
    sprint?: string;
    sprint_state?: string;
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
       (key, summary, status, issuetype, sprint, sprint_state, mapped_column, assignee_name, assignee_avatar, due_date, priority, updated_at, synced_at, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      task.key,
      task.summary,
      task.status,
      task.issuetype ?? null,
      task.sprint ?? null,
      task.sprint_state ?? null,
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

// 工作日志操作 (v2.0 - 支持 Jira 自动记录和手动记录)
export const workLogsDB = {
  /**
   * 自动记录 Jira 任务（幂等性：同一天同一任务只记录一次）
   * 使用 INSERT OR IGNORE 实现幂等性
   */
  logAutoJira(task: {
    task_key: string;
    summary: string;
    log_date: string;
  }): { success: boolean; isNew: boolean } {
    try {
      const result = getDatabase().prepare(
        `INSERT OR IGNORE INTO t_work_logs (task_key, source, summary, log_date, created_at)
         VALUES (?, 'JIRA', ?, ?, ?)`
      ).run(task.task_key, task.summary, task.log_date, Date.now());
      
      const isNew = result.changes > 0;
      console.log(`[WorkLogs] Auto-log Jira task ${task.task_key}: ${isNew ? 'NEW' : 'EXISTS'}`);
      return { success: true, isNew };
    } catch (error) {
      console.error('[WorkLogs] Failed to auto-log Jira task:', error);
      return { success: false, isNew: false };
    }
  },

  /**
   * 手动添加记录（非 Jira 任务）
   */
  logManual(content: {
    summary: string;
    log_date: string;
  }): { success: boolean; task_key: string } {
    try {
      // 生成 UUID 作为 task_key
      const task_key = `manual-${crypto.randomUUID()}`;
      
      const result = getDatabase().prepare(
        `INSERT INTO t_work_logs (task_key, source, summary, log_date, created_at)
         VALUES (?, 'MANUAL', ?, ?, ?)`
      ).run(task_key, content.summary, content.log_date, Date.now());
      
      console.log(`[WorkLogs] Manual log created: ${task_key}`);
      return { success: true, task_key };
    } catch (error) {
      console.error('[WorkLogs] Failed to create manual log:', error);
      return { success: false, task_key: '' };
    }
  },

  /**
   * 查询日期范围内的日志
   */
  getByDateRange(startDate: string, endDate: string): Array<{
    id: number;
    task_key: string;
    source: 'JIRA' | 'MANUAL';
    summary: string;
    log_date: string;
    created_at: number;
  }> {
    return getDatabase().prepare(
      `SELECT id, task_key, source, summary, log_date, created_at 
       FROM t_work_logs 
       WHERE log_date BETWEEN ? AND ? 
       ORDER BY log_date DESC, created_at DESC`
    ).all(startDate, endDate) as any;
  },

  /**
   * 删除日志
   */
  delete(id: number): boolean {
    try {
      const result = getDatabase().prepare(
        'DELETE FROM t_work_logs WHERE id = ?'
      ).run(id);
      return result.changes > 0;
    } catch (error) {
      console.error('[WorkLogs] Failed to delete log:', error);
      return false;
    }
  },
};
