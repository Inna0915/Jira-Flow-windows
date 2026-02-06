import { ipcMain } from 'electron';
import { settingsDB } from '../db/schema';
import { ObsidianService, ObsidianTask } from '../services/ObsidianService';

/**
 * 注册第三方集成的 IPC 处理器
 * 
 * 当前支持：
 * - Obsidian: 将 Jira 任务同步到本地 Markdown 文件
 */
export function registerIntegrationIPCs(): void {
  console.log('[IPC] Registering integration IPC handlers...');

  /**
   * 同步任务到 Obsidian
   * payload: task (ObsidianTask)
   * 
   * 流程：
   * 1. 从设置获取 vaultPath 和 jiraHost
   * 2. 如果 vaultPath 为空，返回错误
   * 3. 调用 ObsidianService.syncTask
   */
  ipcMain.handle('obsidian:sync-task', async (_, task: ObsidianTask) => {
    try {
      // 获取 Obsidian Vault 路径
      const vaultPath = settingsDB.get('obsidian_vault_path');
      const jiraHost = settingsDB.get('jira_host');

      // 检查配置
      if (!vaultPath) {
        return {
          success: false,
          message: 'Vault path not set',
          code: 'VAULT_NOT_CONFIGURED',
        };
      }

      if (!jiraHost) {
        return {
          success: false,
          message: 'Jira host not configured',
          code: 'JIRA_NOT_CONFIGURED',
        };
      }

      // 同步任务
      const service = new ObsidianService(vaultPath, jiraHost);
      const result = await service.syncTask(task);

      return result;
    } catch (error) {
      console.error('[IPC] obsidian:sync-task error:', error);
      return {
        success: false,
        message: String(error),
        code: 'UNKNOWN_ERROR',
      };
    }
  });

  /**
   * 设置 Obsidian Vault 路径
   * payload: vaultPath: string
   */
  ipcMain.handle('obsidian:set-vault-path', (_, vaultPath: string) => {
    try {
      // 如果路径为空，也允许保存（表示禁用 Obsidian 同步）
      settingsDB.set('obsidian_vault_path', vaultPath || '');
      console.log('[IPC] Obsidian vault path saved:', vaultPath || '(empty)');
      return { success: true };
    } catch (error) {
      console.error('[IPC] obsidian:set-vault-path error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 获取 Obsidian Vault 路径
   */
  ipcMain.handle('obsidian:get-vault-path', () => {
    try {
      const vaultPath = settingsDB.get('obsidian_vault_path') || '';
      return { success: true, data: vaultPath };
    } catch (error) {
      console.error('[IPC] obsidian:get-vault-path error:', error);
      return { success: false, error: String(error) };
    }
  });

  console.log('[IPC] Integration IPC handlers registered');
}
