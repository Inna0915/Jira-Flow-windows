import { ipcMain } from 'electron';
import { tasksDB, settingsDB } from '../db/schema';

/**
 * 获取用户头像和名称设置
 * 从 saved_avatars 中获取第一个头像作为当前用户头像
 */
function getUserSettings(): { name: string; avatar: string } {
  let name = 'Me';
  let avatar = '';
  
  // 1. 尝试获取已保存的头像列表
  const savedAvatarsSetting = settingsDB.get('saved_avatars');
  if (savedAvatarsSetting) {
    try {
      const savedAvatars = JSON.parse(savedAvatarsSetting);
      if (Array.isArray(savedAvatars) && savedAvatars.length > 0) {
        // 使用第一个头像作为当前用户头像
        const firstAvatar = savedAvatars[0];
        avatar = firstAvatar.image || '';
        if (firstAvatar.name) {
          name = firstAvatar.name;
        }
      }
    } catch (e) {
      console.log('[IPC] Failed to parse saved_avatars setting:', e);
    }
  }
  
  // 2. 如果没有头像设置，尝试获取 Jira 用户名
  if (name === 'Me') {
    const jiraConfig = settingsDB.get('jira_config');
    if (jiraConfig) {
      try {
        const config = JSON.parse(jiraConfig);
        if (config.username) {
          name = config.username;
        }
      } catch (e) {
        console.log('[IPC] Failed to parse jira config:', e);
      }
    }
  }
  
  return { name, avatar };
}

/**
 * 注册任务相关的 IPC 处理器
 * 支持个人看板任务管理
 */
export function registerTaskIPCs(): void {
  console.log('[IPC] Registering Task IPC handlers...');

  /**
   * 创建个人任务
   */
  ipcMain.handle('task:create-personal', async (_, data: {
    summary: string;
    priority?: string;
    dueDate?: string;
    description?: string;
    initialColumn?: string;
  }) => {
    try {
      // 生成唯一 Key: ME-XXXXXX
      const key = 'ME-' + Date.now().toString().slice(-6);
      
      // 获取用户设置
      const userSettings = getUserSettings();

      // 创建任务
      const task = tasksDB.createPersonal({
        key,
        summary: data.summary,
        priority: data.priority || 'Medium',
        due_date: data.dueDate || '',
        description: data.description || '',
        assignee_name: userSettings.name,
        assignee_avatar: userSettings.avatar,
        initial_column: data.initialColumn || 'FUNNEL',
      });

      console.log('[IPC] Personal task created:', task.key, 'in column:', data.initialColumn || 'FUNNEL');
      return { success: true, task };
    } catch (error) {
      console.error('[IPC] Failed to create personal task:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 更新个人任务
   */
  ipcMain.handle('task:update-personal', async (_, taskKey: string, updates: {
    summary?: string;
    priority?: string;
    due_date?: string;
    description?: string;
    status?: string;
    mapped_column?: string;
  }) => {
    try {
      const task = tasksDB.updatePersonal(taskKey, updates);
      if (task) {
        console.log('[IPC] Personal task updated:', taskKey);
        return { success: true, task };
      } else {
        return { success: false, error: '任务不存在或更新失败' };
      }
    } catch (error) {
      console.error('[IPC] Failed to update personal task:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 删除个人任务
   */
  ipcMain.handle('task:delete-personal', async (_, taskKey: string) => {
    try {
      const result = tasksDB.deletePersonal(taskKey);
      if (result.success) {
        console.log('[IPC] Personal task deleted:', taskKey);
      } else {
        console.log('[IPC] Failed to delete personal task:', result.error);
      }
      return result;
    } catch (error) {
      console.error('[IPC] Failed to delete personal task:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 按来源获取任务
   */
  ipcMain.handle('task:get-by-source', async (_, source: string) => {
    try {
      const tasks = tasksDB.getBySource(source);
      return { success: true, data: tasks };
    } catch (error) {
      console.error('[IPC] Failed to get tasks by source:', error);
      return { success: false, error: String(error) };
    }
  });

  console.log('[IPC] Task IPC handlers registered');
}
