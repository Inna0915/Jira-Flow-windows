import { ipcMain } from 'electron';
import { getDatabase, settingsDB, tasksDB, workLogsDB } from '../db/schema';

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

  // 工作日志相关
  ipcMain.handle('db:workLogs:create', (_, log) => {
    try {
      const id = workLogsDB.create(log);
      return { success: true, data: { id } };
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
      return { success: true, data: workLogsDB.getByTaskKey(taskKey) };
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

  console.log('[IPC] Database IPC handlers registered');
}
