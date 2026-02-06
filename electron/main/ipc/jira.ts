import { ipcMain } from 'electron';
import { syncService, SyncService } from '../services/SyncService';
import { JiraClientConfig } from '../services/JiraClient';
import { settingsDB, workLogsDB } from '../db/schema';

/**
 * 注册 Jira 相关的 IPC 处理器
 * 暴露给渲染进程使用
 */
export function registerJiraIPCs(): void {
  console.log('[IPC] Registering Jira IPC handlers...');

  /**
   * 测试 Jira 连接
   * payload: { host: string, username: string, password: string }
   */
  ipcMain.handle('jira:test-connection', async (_, config: JiraClientConfig) => {
    try {
      console.log('[IPC] Testing Jira connection to:', config.host);
      const result = await syncService.testConnection(config);
      return result;
    } catch (error) {
      console.error('[IPC] Test connection error:', error);
      return { 
        success: false, 
        error: `测试连接时发生错误: ${String(error)}` 
      };
    }
  });

  /**
   * 保存 Jira 配置
   * payload: { host: string, username: string, password: string, projectKey?: string }
   */
  ipcMain.handle('jira:save-config', async (_, config: JiraClientConfig & { projectKey?: string }) => {
    try {
      console.log('[IPC] Saving Jira config for:', config.username);
      
      // 保存到数据库
      settingsDB.set('jira_host', config.host);
      settingsDB.set('jira_username', config.username);
      settingsDB.set('jira_password', config.password);
      settingsDB.set('jira_lastSync', '0'); // 重置同步时间
      
      // 保存 projectKey（如果提供）
      if (config.projectKey) {
        settingsDB.set('jira_projectKey', config.projectKey);
        console.log('[IPC] Project key saved:', config.projectKey);
      }
      
      // 初始化同步服务
      syncService.initializeWithConfig(config);
      
      return { success: true };
    } catch (error) {
      console.error('[IPC] Save config error:', error);
      return { 
        success: false, 
        error: `保存配置失败: ${String(error)}` 
      };
    }
  });

  /**
   * 获取 Jira 配置（直接返回明文密码和 projectKey）
   */
  ipcMain.handle('jira:get-config', () => {
    try {
      const host = settingsDB.get('jira_host');
      const username = settingsDB.get('jira_username');
      const password = settingsDB.get('jira_password');
      const projectKey = settingsDB.get('jira_projectKey');
      
      if (!host || !username) {
        return { success: false, error: 'Jira 未配置' };
      }

      return { 
        success: true, 
        data: { 
          host, 
          username,
          password: password || '', // 直接返回明文密码
          projectKey: projectKey || '' // 返回 projectKey
        } 
      };
    } catch (error) {
      console.error('[IPC] Get config error:', error);
      return { 
        success: false, 
        error: `获取配置失败: ${String(error)}` 
      };
    }
  });

  /**
   * 立即同步任务 - 使用 Agile API（4步同步）
   * payload: { fullSync?: boolean }
   */
  ipcMain.handle('jira:sync-now', async (_, options?: { fullSync?: boolean }) => {
    try {
      console.log('[IPC] Starting Agile sync, fullSync:', options?.fullSync);
      
      // 确保服务已初始化
      if (!syncService.isConfigured()) {
        const initialized = syncService.initializeFromDB();
        if (!initialized) {
          return { 
            success: false, 
            error: 'Jira 未配置，请先设置 Jira 连接信息' 
          };
        }
      }

      // 获取 projectKey
      const projectKey = settingsDB.get('jira_projectKey');
      
      if (projectKey) {
        // 使用 4 步 Agile 同步
        console.log(`[IPC] Using Agile API with project: ${projectKey}`);
        const result = await syncService.performAgileSync(projectKey);
        return result;
      } else {
        // 回退到 JQL 同步
        console.log('[IPC] No projectKey, falling back to JQL sync');
        const result = await syncService.performJQLSync();
        return {
          success: result.success,
          boardId: 0,
          sprintId: 0,
          sprintIssues: result.success ? result.upserted : 0,
          backlogIssues: 0,
          ...(result.success ? {} : { error: result.error }),
        };
      }
    } catch (error) {
      console.error('[IPC] Sync error:', error);
      return { 
        success: false, 
        error: `同步失败: ${String(error)}` 
      };
    }
  });

  /**
   * 获取看板任务列表
   */
  ipcMain.handle('db:get-tasks', () => {
    try {
      const result = syncService.getTasksForBoard();
      return result;
    } catch (error) {
      console.error('[IPC] Get tasks error:', error);
      return { 
        success: false, 
        error: `获取任务列表失败: ${String(error)}` 
      };
    }
  });

  /**
   * 获取指定列的任务
   * payload: columnId: string
   */
  ipcMain.handle('db:get-tasks-by-column', (_, columnId: string) => {
    try {
      const result = syncService.getTasksByColumn(columnId);
      return result;
    } catch (error) {
      console.error('[IPC] Get tasks by column error:', error);
      return { 
        success: false, 
        error: `获取任务失败: ${String(error)}` 
      };
    }
  });

  /**
   * 更新任务看板列
   * payload: { taskKey: string, columnId: string }
   */
  ipcMain.handle('db:update-task-column', (_, taskKey: string, columnId: string) => {
    try {
      const result = syncService.updateTaskColumn(taskKey, columnId);
      
      if (result.success) {
        // 记录工作日志
        workLogsDB.create({
          task_key: taskKey,
          action: 'MOVE_COLUMN',
          log_date: new Date().toISOString().split('T')[0],
          comment: `移动到列: ${columnId}`,
        });
      }
      
      return result;
    } catch (error) {
      console.error('[IPC] Update task column error:', error);
      return { 
        success: false, 
        error: `更新任务列失败: ${String(error)}` 
      };
    }
  });

  /**
   * 获取任务的可用状态转换
   * payload: issueKey: string
   */
  ipcMain.handle('jira:get-transitions', async (_, issueKey: string) => {
    try {
      if (!syncService.isConfigured()) {
        const initialized = syncService.initializeFromDB();
        if (!initialized) {
          return { 
            success: false, 
            error: 'Jira 未配置' 
          };
        }
      }

      const client = syncService.getClient();
      if (!client) {
        return { success: false, error: 'Jira 客户端未初始化' };
      }

      const result = await client.getTransitions(issueKey);
      return result;
    } catch (error) {
      console.error('[IPC] Get transitions error:', error);
      return { 
        success: false, 
        error: `获取状态转换失败: ${String(error)}` 
      };
    }
  });

  /**
   * 执行状态转换
   * payload: { issueKey: string, transitionId: string }
   */
  ipcMain.handle('jira:transition-issue', async (_, issueKey: string, transitionId: string) => {
    try {
      if (!syncService.isConfigured()) {
        const initialized = syncService.initializeFromDB();
        if (!initialized) {
          return { 
            success: false, 
            error: 'Jira 未配置' 
          };
        }
      }

      const client = syncService.getClient();
      if (!client) {
        return { success: false, error: 'Jira 客户端未初始化' };
      }

      const result = await client.transitionIssue(issueKey, transitionId);
      
      if (result.success) {
        // 记录工作日志
        workLogsDB.create({
          task_key: issueKey,
          action: 'TRANSITION',
          log_date: new Date().toISOString().split('T')[0],
          comment: `状态转换: ${transitionId}`,
        });
      }
      
      return result;
    } catch (error) {
      console.error('[IPC] Transition issue error:', error);
      return { 
        success: false, 
        error: `状态转换失败: ${String(error)}` 
      };
    }
  });

  /**
   * 获取同步状态
   */
  ipcMain.handle('jira:get-sync-status', () => {
    try {
      const lastSync = settingsDB.get('jira_lastSync');
      const isConfigured = syncService.isConfigured() || !!settingsDB.get('jira_host');
      
      return {
        success: true,
        data: {
          isConfigured,
          lastSync: lastSync ? parseInt(lastSync, 10) : null,
        },
      };
    } catch (error) {
      console.error('[IPC] Get sync status error:', error);
      return { 
        success: false, 
        error: `获取同步状态失败: ${String(error)}` 
      };
    }
  });

  console.log('[IPC] Jira IPC handlers registered');
}
