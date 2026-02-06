import { ipcMain, shell } from 'electron';
import { settingsDB } from '../db/schema';

/**
 * 注册系统相关的 IPC 处理器
 */
export function registerSystemIPCs(): void {
  console.log('[IPC] Registering system IPC handlers...');

  /**
   * 在系统默认浏览器中打开 Jira Issue
   */
  ipcMain.handle('system:open-jira-issue', async (_, issueKey: string) => {
    try {
      // 获取 Jira host
      const host = settingsDB.get('jira_host');
      
      if (!host) {
        return { success: false, error: 'Jira host not configured' };
      }

      // 移除末尾的斜杠（如果有）
      const cleanHost = host.replace(/\/$/, '');
      
      // 构建完整 URL
      const url = `${cleanHost}/browse/${issueKey}`;
      
      console.log(`[System] Opening external URL: ${url}`);
      
      // 在系统默认浏览器中打开
      await shell.openExternal(url);
      
      return { success: true };
    } catch (error) {
      console.error('[System] Failed to open Jira issue:', error);
      return { success: false, error: String(error) };
    }
  });

  console.log('[IPC] System IPC handlers registered');
}
