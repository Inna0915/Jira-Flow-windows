import { ipcMain } from 'electron';
import { getDatabase, settingsDB, tasksDB, workLogsDB, clearAllData } from '../db/schema';

/**
 * 注册数据库相关的 IPC 处理器
 * 这些处理器暴露给渲染进程使用
 */
export function registerDatabaseIPCs(): void {
  console.log('[IPC] Registering database IPC handlers...');

  // 设置相关
  ipcMain.handle('db:settings:get', (_, key: string) => {
    try {
      return { success: true, data: settingsDB.get(key) };
    } catch (error) {
      console.error('[IPC] settings:get error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('db:settings:set', (_, key: string, value: string) => {
    try {
      settingsDB.set(key, value);
      return { success: true };
    } catch (error) {
      console.error('[IPC] settings:set error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('db:settings:delete', (_, key: string) => {
    try {
      settingsDB.delete(key);
      return { success: true };
    } catch (error) {
      console.error('[IPC] settings:delete error:', error);
      return { success: false, error: String(error) };
    }
  });

  // 任务相关
  ipcMain.handle('db:tasks:getAll', () => {
    try {
      return { success: true, data: tasksDB.getAll() };
    } catch (error) {
      console.error('[IPC] tasks:getAll error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('db:tasks:getByColumn', (_, column: string) => {
    try {
      return { success: true, data: tasksDB.getByColumn(column) };
    } catch (error) {
      console.error('[IPC] tasks:getByColumn error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('db:tasks:upsert', (_, task) => {
    try {
      tasksDB.upsert(task);
      return { success: true };
    } catch (error) {
      console.error('[IPC] tasks:upsert error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('db:tasks:updateColumn', (_, key: string, column: string) => {
    try {
      tasksDB.updateColumn(key, column);
      return { success: true };
    } catch (error) {
      console.error('[IPC] tasks:updateColumn error:', error);
      return { success: false, error: String(error) };
    }
  });

  // 清空所有任务（调试用）
  ipcMain.handle('db:tasks:clearAll', () => {
    try {
      const db = getDatabase();
      const result = db.prepare('DELETE FROM t_tasks').run();
      console.log(`[IPC] Cleared ${result.changes} tasks from database`);
      return { success: true, data: { deletedCount: result.changes } };
    } catch (error) {
      console.error('[IPC] tasks:clearAll error:', error);
      return { success: false, error: String(error) };
    }
  });

  // 工作日志相关 (向后兼容，实际逻辑已移至 ipc/logs.ts)
  ipcMain.handle('db:workLogs:create', (_, log) => {
    // 兼容旧接口：转换为新的 logManual 或 logAutoJira 调用
    console.warn('[IPC] db:workLogs:create is deprecated, use db:log-auto-jira or db:log-manual instead');
    try {
      // 根据 log 内容判断是 Jira 还是 Manual
      if (log.task_key && !log.task_key.startsWith('manual-')) {
        // Jira 任务
        const result = workLogsDB.logAutoJira({
          task_key: log.task_key,
          summary: log.comment || log.task_key,
          log_date: log.log_date,
        });
        return { success: result.success, data: { id: 0 } };
      } else {
        // Manual 任务
        const result = workLogsDB.logManual({
          summary: log.comment || 'Manual entry',
          log_date: log.log_date,
        });
        return { success: result.success, data: { id: 0 } };
      }
    } catch (error) {
      console.error('[IPC] workLogs:create error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('db:workLogs:getByDateRange', (_, startDate: string, endDate: string) => {
    try {
      return { success: true, data: workLogsDB.getByDateRange(startDate, endDate) };
    } catch (error) {
      console.error('[IPC] workLogs:getByDateRange error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('db:workLogs:getByTaskKey', (_, taskKey: string) => {
    try {
      // 使用 query 方法作为兼容方案
      const db = getDatabase();
      const logs = db.prepare('SELECT * FROM t_work_logs WHERE task_key = ? ORDER BY created_at DESC').all(taskKey);
      return { success: true, data: logs };
    } catch (error) {
      console.error('[IPC] workLogs:getByTaskKey error:', error);
      return { success: false, error: String(error) };
    }
  });

  // 原始 SQL 查询（用于复杂查询）
  ipcMain.handle('db:query', (_, sql: string, params: unknown[] = []) => {
    try {
      const db = getDatabase();
      const stmt = db.prepare(sql);
      
      // 判断是查询还是修改
      if (sql.trim().toLowerCase().startsWith('select')) {
        return { success: true, data: stmt.all(...params) };
      } else {
        return { success: true, data: stmt.run(...params) };
      }
    } catch (error) {
      console.error('[IPC] query error:', error);
      return { success: false, error: String(error) };
    }
  });

  // 清空所有数据（保留头像等基础设置）
  ipcMain.handle('db:clear-all', () => {
    try {
      const result = clearAllData();
      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] clear-all error:', error);
      return { success: false, error: String(error) };
    }
  });

  console.log('[IPC] Database IPC handlers registered');
}
