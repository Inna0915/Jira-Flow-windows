import { ipcMain } from 'electron';
import { workLogsDB } from '../db/schema';

/**
 * 注册工作日志相关的 IPC 处理器
 * 支持 Jira 自动记录和手动记录
 */
export function registerWorkLogIPCs(): void {
  console.log('[IPC] Registering work log IPC handlers...');

  /**
   * 自动记录 Jira 任务（幂等性）
   * payload: { task_key: string, summary: string, log_date: string }
   */
  ipcMain.handle('db:log-auto-jira', (_, task: {
    task_key: string;
    summary: string;
    log_date: string;
  }) => {
    try {
      const result = workLogsDB.logAutoJira(task);
      return result;
    } catch (error) {
      console.error('[IPC] log-auto-jira error:', error);
      return { success: false, isNew: false };
    }
  });

  /**
   * 手动添加记录（非 Jira 任务）
   * payload: { summary: string, log_date: string }
   */
  ipcMain.handle('db:log-manual', (_, content: {
    summary: string;
    log_date: string;
  }) => {
    try {
      const result = workLogsDB.logManual(content);
      return result;
    } catch (error) {
      console.error('[IPC] log-manual error:', error);
      return { success: false, task_key: '' };
    }
  });

  /**
   * 查询日期范围内的日志
   * payload: { startDate: string, endDate: string }
   */
  ipcMain.handle('db:get-logs', (_, { startDate, endDate }: {
    startDate: string;
    endDate: string;
  }) => {
    try {
      const logs = workLogsDB.getByDateRange(startDate, endDate);
      return { success: true, data: logs };
    } catch (error) {
      console.error('[IPC] get-logs error:', error);
      return { success: false, error: String(error) };
    }
  });

  console.log('[IPC] Work log IPC handlers registered');
}
