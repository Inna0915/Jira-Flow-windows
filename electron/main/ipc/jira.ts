import { ipcMain } from 'electron';
import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { settingsDB, tasksDB, workLogsDB } from '../db/schema';

/**
 * Jira API 配置类型
 */
interface JiraConfig {
  baseUrl: string;
  username: string;
  password: string; // PAT 或密码
}

/**
 * 创建 Jira API 客户端
 * 配置 Axios 忽略 SSL 证书错误（用于内部自托管服务器）
 */
function createJiraClient(config: JiraConfig): AxiosInstance {
  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

  return axios.create({
    baseURL: config.baseUrl,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false, // 忽略 SSL 证书错误
    }),
    timeout: 30000, // 30 秒超时
  });
}

/**
 * 从数据库获取 Jira 配置
 */
function getJiraConfigFromDB(): JiraConfig | null {
  const baseUrl = settingsDB.get('jira_baseUrl');
  const username = settingsDB.get('jira_username');
  const password = settingsDB.get('jira_password');

  if (!baseUrl || !username || !password) {
    return null;
  }

  return { baseUrl, username, password };
}

/**
 * 注册 Jira 相关的 IPC 处理器
 */
export function registerJiraIPCs(): void {
  console.log('[IPC] Registering Jira IPC handlers...');

  /**
   * 测试 Jira 连接
   */
  ipcMain.handle('jira:testConnection', async (_, config: JiraConfig) => {
    try {
      const client = createJiraClient(config);
      const response = await client.get('/rest/api/2/myself');
      
      return { 
        success: true, 
        data: {
          displayName: response.data.displayName,
          emailAddress: response.data.emailAddress,
          accountId: response.data.accountId,
        }
      };
    } catch (error) {
      console.error('[IPC] Jira test connection error:', error);
      if (axios.isAxiosError(error)) {
        return { 
          success: false, 
          error: error.response?.data?.errorMessages?.[0] || error.message 
        };
      }
      return { success: false, error: String(error) };
    }
  });

  /**
   * 保存 Jira 配置
   */
  ipcMain.handle('jira:saveConfig', async (_, config: JiraConfig) => {
    try {
      settingsDB.set('jira_baseUrl', config.baseUrl);
      settingsDB.set('jira_username', config.username);
      settingsDB.set('jira_password', config.password);
      
      // 保存最后同步时间
      settingsDB.set('jira_lastSync', '0');
      
      return { success: true };
    } catch (error) {
      console.error('[IPC] Jira save config error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 获取 Jira 配置（不含密码）
   */
  ipcMain.handle('jira:getConfig', () => {
    try {
      const baseUrl = settingsDB.get('jira_baseUrl');
      const username = settingsDB.get('jira_username');
      
      if (!baseUrl || !username) {
        return { success: false, error: '未配置 Jira' };
      }

      return { 
        success: true, 
        data: { baseUrl, username } 
      };
    } catch (error) {
      console.error('[IPC] Jira get config error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 执行全量同步（最近 30 天更新的任务）
   */
  ipcMain.handle('jira:fullSync', async () => {
    try {
      const config = getJiraConfigFromDB();
      if (!config) {
        return { success: false, error: '未配置 Jira' };
      }

      const client = createJiraClient(config);
      
      // 计算 30 天前的日期
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const jqlDate = thirtyDaysAgo.toISOString().split('T')[0];

      // JQL: 最近 30 天更新且分配给我的任务
      const jql = `updated >= "${jqlDate}" AND assignee = currentUser() ORDER BY updated DESC`;
      
      const response = await client.get('/rest/api/2/search', {
        params: {
          jql,
          maxResults: 100,
          fields: 'summary,status,assignee,duedate,priority,updated,description',
        },
      });

      const issues = response.data.issues || [];
      
      // 保存到数据库
      for (const issue of issues) {
        tasksDB.upsert({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status?.name || 'Unknown',
          mapped_column: null, // 需要用户手动映射
          assignee_name: issue.fields.assignee?.displayName,
          assignee_avatar: issue.fields.assignee?.avatarUrls?.['48x48'],
          due_date: issue.fields.duedate,
          priority: issue.fields.priority?.name,
          updated_at: issue.fields.updated,
          raw_json: JSON.stringify(issue),
        });
      }

      // 更新最后同步时间
      settingsDB.set('jira_lastSync', String(Date.now()));

      return { 
        success: true, 
        data: { 
          syncedCount: issues.length,
          lastSync: Date.now(),
        }
      };
    } catch (error) {
      console.error('[IPC] Jira full sync error:', error);
      if (axios.isAxiosError(error)) {
        return { 
          success: false, 
          error: error.response?.data?.errorMessages?.[0] || error.message 
        };
      }
      return { success: false, error: String(error) };
    }
  });

  /**
   * 执行增量同步（自上次同步以来更新的任务）
   */
  ipcMain.handle('jira:incrementalSync', async () => {
    try {
      const config = getJiraConfigFromDB();
      if (!config) {
        return { success: false, error: '未配置 Jira' };
      }

      const lastSyncStr = settingsDB.get('jira_lastSync');
      const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
      
      if (lastSync === 0) {
        // 如果没有上次同步记录，执行全量同步
        return ipcMain.emit('jira:fullSync');
      }

      const client = createJiraClient(config);
      
      // 转换时间戳为 JQL 日期格式
      const lastSyncDate = new Date(lastSync).toISOString();
      const jql = `updated >= "${lastSyncDate}" AND assignee = currentUser() ORDER BY updated DESC`;
      
      const response = await client.get('/rest/api/2/search', {
        params: {
          jql,
          maxResults: 100,
          fields: 'summary,status,assignee,duedate,priority,updated,description',
        },
      });

      const issues = response.data.issues || [];
      
      // 保存到数据库
      for (const issue of issues) {
        tasksDB.upsert({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status?.name || 'Unknown',
          mapped_column: null,
          assignee_name: issue.fields.assignee?.displayName,
          assignee_avatar: issue.fields.assignee?.avatarUrls?.['48x48'],
          due_date: issue.fields.duedate,
          priority: issue.fields.priority?.name,
          updated_at: issue.fields.updated,
          raw_json: JSON.stringify(issue),
        });
      }

      // 更新最后同步时间
      settingsDB.set('jira_lastSync', String(Date.now()));

      return { 
        success: true, 
        data: { 
          syncedCount: issues.length,
          lastSync: Date.now(),
        }
      };
    } catch (error) {
      console.error('[IPC] Jira incremental sync error:', error);
      if (axios.isAxiosError(error)) {
        return { 
          success: false, 
          error: error.response?.data?.errorMessages?.[0] || error.message 
        };
      }
      return { success: false, error: String(error) };
    }
  });

  /**
   * 更新任务状态
   */
  ipcMain.handle('jira:transitionIssue', async (_, issueKey: string, transitionId: string) => {
    try {
      const config = getJiraConfigFromDB();
      if (!config) {
        return { success: false, error: '未配置 Jira' };
      }

      const client = createJiraClient(config);
      
      await client.post(`/rest/api/2/issue/${issueKey}/transitions`, {
        transition: { id: transitionId },
      });

      // 记录工作日志
      workLogsDB.create({
        task_key: issueKey,
        action: 'TRANSITION',
        log_date: new Date().toISOString().split('T')[0],
        comment: `状态变更: ${transitionId}`,
      });

      return { success: true };
    } catch (error) {
      console.error('[IPC] Jira transition error:', error);
      if (axios.isAxiosError(error)) {
        return { 
          success: false, 
          error: error.response?.data?.errorMessages?.[0] || error.message 
        };
      }
      return { success: false, error: String(error) };
    }
  });

  console.log('[IPC] Jira IPC handlers registered');
}
