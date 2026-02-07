import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';

let db: Database.Database | null = null;

/**
 * 获取数据库实例（单例模式）
 */
export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'jira-flow.db');
    console.log('[Database] Opening database at:', dbPath);
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initializeSchema();
  }
  return db;
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[Database] Connection closed');
  }
}

/**
 * 初始化数据库表结构
 */
function initializeSchema(): void {
  if (!db) return;

  // 1. 任务表（支持 JIRA 和 LOCAL 个人任务）
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
      raw_json TEXT,
      source TEXT DEFAULT 'JIRA'
    )
  `);
  
  // 迁移：为现有任务添加 source 字段（如果不存在）
  try {
    db.prepare(`SELECT source FROM t_tasks LIMIT 1`).get();
  } catch (e) {
    console.log('[Database] Migrating t_tasks: adding source column');
    db.exec(`ALTER TABLE t_tasks ADD COLUMN source TEXT DEFAULT 'JIRA'`);
    db.exec(`UPDATE t_tasks SET source = 'JIRA' WHERE source IS NULL`);
  }

  // 迁移：为现有任务添加 description 字段（如果不存在）
  try {
    db.prepare(`SELECT description FROM t_tasks LIMIT 1`).get();
  } catch (e) {
    console.log('[Database] Migrating t_tasks: adding description column');
    db.exec(`ALTER TABLE t_tasks ADD COLUMN description TEXT`);
  }

  // 2. 工作日志表
  db.exec(`
    CREATE TABLE IF NOT EXISTS t_work_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_key TEXT NOT NULL,
      source TEXT NOT NULL,
      summary TEXT,
      log_date TEXT NOT NULL,
      created_at INTEGER,
      UNIQUE(task_key, log_date)
    )
  `);

  // 3. 设置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS t_settings (
      s_key TEXT PRIMARY KEY,
      s_value TEXT
    )
  `);

  // 4. 生成的报告表（支持周报/月报/季报/年报）
  db.exec(`
    CREATE TABLE IF NOT EXISTS t_generated_reports (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('weekly', 'monthly', 'quarterly', 'yearly')),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // 创建索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON t_tasks(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_column ON t_tasks(mapped_column)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_work_logs_date ON t_work_logs(log_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_type_date ON t_generated_reports(type, start_date, end_date)`);

  // 迁移：检查并修复 t_generated_reports 表的 CHECK 约束（添加 quarterly 和 yearly）
  try {
    const checkConstraint = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='t_generated_reports'`).get() as { sql: string } | undefined;
    if (checkConstraint && checkConstraint.sql) {
      const hasQuarterly = checkConstraint.sql.includes('quarterly');
      const hasYearly = checkConstraint.sql.includes('yearly');
      
      if (!hasQuarterly || !hasYearly) {
        console.log('[Database] Migrating t_generated_reports: updating CHECK constraint to include quarterly and yearly');
        // 重建表以更新约束
        db.exec(`
          ALTER TABLE t_generated_reports RENAME TO t_generated_reports_old;
          CREATE TABLE t_generated_reports (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL CHECK(type IN ('weekly', 'monthly', 'quarterly', 'yearly')),
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL
          );
          INSERT INTO t_generated_reports SELECT * FROM t_generated_reports_old;
          DROP TABLE t_generated_reports_old;
          CREATE INDEX IF NOT EXISTS idx_reports_type_date ON t_generated_reports(type, start_date, end_date);
        `);
        console.log('[Database] Migration completed successfully');
      }
    }
  } catch (e) {
    console.error('[Database] Failed to migrate t_generated_reports:', e);
  }

  console.log('[Database] Schema initialized');
}

// 导出快捷操作
export const settingsDB = {
  get(key: string): string | null {
    const row = getDatabase().prepare('SELECT s_value FROM t_settings WHERE s_key = ?').get(key) as { s_value: string } | undefined;
    return row?.s_value ?? null;
  },
  set(key: string, value: string): void {
    getDatabase().prepare('INSERT OR REPLACE INTO t_settings (s_key, s_value) VALUES (?, ?)').run(key, value);
  },
  delete(key: string): void {
    getDatabase().prepare('DELETE FROM t_settings WHERE s_key = ?').run(key);
  }
};

export const tasksDB = {
  upsert(task: any): void {
    const stmt = getDatabase().prepare(`
      INSERT OR REPLACE INTO t_tasks 
      (key, summary, status, issuetype, sprint, sprint_state, mapped_column, 
       assignee_name, assignee_avatar, due_date, priority, updated_at, synced_at, raw_json, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      task.key, task.summary, task.status, task.issuetype, task.sprint,
      task.sprint_state, task.mapped_column, task.assignee_name, task.assignee_avatar,
      task.due_date, task.priority, task.updated_at, task.synced_at, task.raw_json,
      task.source || 'JIRA'
    );
  },
  getAll(): any[] {
    return getDatabase().prepare('SELECT * FROM t_tasks ORDER BY synced_at DESC').all();
  },
  getByColumn(column: string): any[] {
    return getDatabase().prepare('SELECT * FROM t_tasks WHERE mapped_column = ?').all(column);
  },
  getBySource(source: string): any[] {
    return getDatabase().prepare('SELECT * FROM t_tasks WHERE source = ? ORDER BY updated_at DESC').all(source);
  },
  updateColumn(key: string, column: string): void {
    getDatabase().prepare('UPDATE t_tasks SET mapped_column = ?, synced_at = ? WHERE key = ?')
      .run(column, Date.now(), key);
  },
  clearAll(): { deletedCount: number } {
    const result = getDatabase().prepare('DELETE FROM t_tasks').run();
    return { deletedCount: result.changes };
  },
  // 创建个人任务
  createPersonal(task: {
    key: string;
    summary: string;
    priority?: string;
    due_date?: string;
    description?: string;
    assignee_name?: string;
    assignee_avatar?: string;
    initial_column?: string;
  }): any {
    // 使用传入的初始列或默认为 FUNNEL
    const initialColumn = task.initial_column || 'FUNNEL';
    const stmt = getDatabase().prepare(`
      INSERT INTO t_tasks 
      (key, summary, status, issuetype, sprint, sprint_state, mapped_column,
       assignee_name, assignee_avatar, due_date, priority, updated_at, synced_at, description, source)
      VALUES (?, ?, ?, 'Task', 'Personal Board', 'active', ?,
       ?, ?, ?, ?, ?, ?, ?, 'LOCAL')
    `);
    stmt.run(
      task.key,
      task.summary,
      initialColumn,
      initialColumn,
      task.assignee_name || 'Me',
      task.assignee_avatar || '',
      task.due_date || '',
      task.priority || 'Medium',
      new Date().toISOString(),
      Date.now(),
      task.description || ''
    );
    return this.getByKey(task.key);
  },
  // 更新个人任务
  updatePersonal(key: string, updates: {
    summary?: string;
    priority?: string;
    due_date?: string;
    description?: string;
    status?: string;
    mapped_column?: string;
  }): any {
    const sets: string[] = [];
    const values: any[] = [];
    
    if (updates.summary !== undefined) {
      sets.push('summary = ?');
      values.push(updates.summary);
    }
    if (updates.priority !== undefined) {
      sets.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.due_date !== undefined) {
      sets.push('due_date = ?');
      values.push(updates.due_date);
    }
    if (updates.description !== undefined) {
      sets.push('description = ?');
      values.push(updates.description);
    }
    if (updates.status !== undefined) {
      sets.push('status = ?');
      values.push(updates.status);
    }
    if (updates.mapped_column !== undefined) {
      sets.push('mapped_column = ?');
      values.push(updates.mapped_column);
    }
    
    if (sets.length === 0) return this.getByKey(key);
    
    sets.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(key);
    values.push('LOCAL');
    
    const stmt = getDatabase().prepare(`
      UPDATE t_tasks SET ${sets.join(', ')} WHERE key = ? AND source = ?
    `);
    stmt.run(...values);
    return this.getByKey(key);
  },
  getByKey(key: string): any | null {
    return getDatabase().prepare('SELECT * FROM t_tasks WHERE key = ?').get(key) || null;
  },
  // 删除个人任务（安全检查：只能删除 LOCAL 来源的任务）
  deletePersonal(key: string): { success: boolean; error?: string } {
    const task = this.getByKey(key);
    if (!task) {
      return { success: false, error: '任务不存在' };
    }
    if (task.source !== 'LOCAL') {
      return { success: false, error: '只能删除个人任务' };
    }
    getDatabase().prepare('DELETE FROM t_tasks WHERE key = ? AND source = ?').run(key, 'LOCAL');
    return { success: true };
  }
};

export const workLogsDB = {
  upsert(log: any): { isNew: boolean } {
    try {
      const stmt = getDatabase().prepare(`
        INSERT INTO t_work_logs (task_key, source, summary, log_date, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(log.task_key, log.source, log.summary, log.log_date, Date.now());
      return { isNew: true };
    } catch (e: any) {
      if (e.message.includes('UNIQUE constraint failed')) {
        return { isNew: false };
      }
      throw e;
    }
  },
  
  /**
   * 自动记录 Jira 任务（幂等性）
   */
  logAutoJira(task: { task_key: string; summary: string; log_date: string }): { isNew: boolean } {
    return this.upsert({
      task_key: task.task_key,
      source: 'JIRA',
      summary: task.summary,
      log_date: task.log_date,
    });
  },
  
  /**
   * 自动记录个人任务（幂等性）
   */
  logLocal(task: { task_key: string; summary: string; log_date: string }): { isNew: boolean } {
    return this.upsert({
      task_key: task.task_key,
      source: 'LOCAL',
      summary: task.summary,
      log_date: task.log_date,
    });
  },
  
  /**
   * 手动添加记录
   */
  logManual(content: { summary: string; log_date: string }): { isNew: boolean; task_key: string } {
    const task_key = `manual-${Date.now()}`;
    const result = this.upsert({
      task_key,
      source: 'MANUAL',
      summary: content.summary,
      log_date: content.log_date,
    });
    return { ...result, task_key };
  },
  
  getLogs(startDate: string, endDate: string): any[] {
    return getDatabase().prepare(
      'SELECT * FROM t_work_logs WHERE log_date >= ? AND log_date <= ? ORDER BY log_date DESC, created_at DESC'
    ).all(startDate, endDate);
  },
  getByDateRange(startDate: string, endDate: string): any[] {
    return getDatabase().prepare(
      'SELECT * FROM t_work_logs WHERE log_date >= ? AND log_date <= ? ORDER BY log_date DESC, created_at DESC'
    ).all(startDate, endDate);
  },
  delete(id: number): void {
    getDatabase().prepare('DELETE FROM t_work_logs WHERE id = ?').run(id);
  }
};

// 生成的报告表操作（支持层级：年/季/月/周）
export const reportsDB = {
  save(report: {
    id: string;
    type: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    start_date: string;
    end_date: string;
    content: string;
  }): void {
    getDatabase().prepare(`
      INSERT OR REPLACE INTO t_generated_reports (id, type, start_date, end_date, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(report.id, report.type, report.start_date, report.end_date, report.content, Date.now());
  },
  getByDateRange(type: string, startDate: string, endDate: string): any | null {
    return getDatabase().prepare(
      'SELECT * FROM t_generated_reports WHERE type = ? AND start_date = ? AND end_date = ?'
    ).get(type, startDate, endDate) || null;
  },
  // 获取层级报告包（年/季/月）
  getBundle(hierarchy: 'year' | 'quarter' | 'month', startDate: string, endDate: string): { 
    main: any | null; 
    children: any[];
    hierarchy: string;
  } {
    let mainType: string;
    let childType: string;
    
    switch (hierarchy) {
      case 'year':
        mainType = 'yearly';
        childType = 'monthly';
        break;
      case 'quarter':
        mainType = 'quarterly';
        childType = 'monthly';
        break;
      case 'month':
      default:
        mainType = 'monthly';
        childType = 'weekly';
        break;
    }
    
    const main = getDatabase().prepare(
      'SELECT * FROM t_generated_reports WHERE type = ? AND start_date >= ? AND end_date <= ? ORDER BY created_at DESC LIMIT 1'
    ).get(mainType, startDate, endDate) || null;
    
    const children = getDatabase().prepare(
      'SELECT * FROM t_generated_reports WHERE type = ? AND start_date >= ? AND end_date <= ? ORDER BY start_date'
    ).all(childType, startDate, endDate);
    
    return { main, children, hierarchy };
  },
  // 兼容旧接口
  getMonthlyBundle(monthStart: string, monthEnd: string): { monthly: any | null; weeklies: any[] } {
    const result = this.getBundle('month', monthStart, monthEnd);
    return { monthly: result.main, weeklies: result.children };
  },
  delete(id: string): void {
    getDatabase().prepare('DELETE FROM t_generated_reports WHERE id = ?').run(id);
  },
  // 获取指定类型和日期范围内的所有报告
  getByTypeAndDateRange(type: string, startDate: string, endDate: string): any[] {
    return getDatabase().prepare(
      'SELECT * FROM t_generated_reports WHERE type = ? AND start_date >= ? AND end_date <= ? ORDER BY start_date'
    ).all(type, startDate, endDate);
  }
};
