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

  // 1. 任务表
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
       assignee_name, assignee_avatar, due_date, priority, updated_at, synced_at, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      task.key, task.summary, task.status, task.issuetype, task.sprint,
      task.sprint_state, task.mapped_column, task.assignee_name, task.assignee_avatar,
      task.due_date, task.priority, task.updated_at, task.synced_at, task.raw_json
    );
  },
  getAll(): any[] {
    return getDatabase().prepare('SELECT * FROM t_tasks ORDER BY synced_at DESC').all();
  },
  getByColumn(column: string): any[] {
    return getDatabase().prepare('SELECT * FROM t_tasks WHERE mapped_column = ?').all(column);
  },
  updateColumn(key: string, column: string): void {
    getDatabase().prepare('UPDATE t_tasks SET mapped_column = ?, synced_at = ? WHERE key = ?')
      .run(column, Date.now(), key);
  },
  clearAll(): { deletedCount: number } {
    const result = getDatabase().prepare('DELETE FROM t_tasks').run();
    return { deletedCount: result.changes };
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
