import { ipcMain } from 'electron';
import { JiraClient } from '../services/JiraClient';
import { getDatabase, settingsDB } from '../db/schema';

/**
 * 状态名称标准化映射
 * 将各种变体统一为标准列 ID
 */
const STATUS_NORMALIZE_MAP: Record<string, string> = {
  // To Do / Backlog
  'to do': 'todo',
  'todo': 'todo',
  'backlog': 'todo',
  'open': 'todo',
  'new': 'todo',
  
  // In Progress
  'in progress': 'inprogress',
  'inprogress': 'inprogress',
  'progress': 'inprogress',
  'doing': 'inprogress',
  'development': 'inprogress',
  'developing': 'inprogress',
  
  // Review / Validation
  'review': 'review',
  'in review': 'review',
  'code review': 'review',
  'validation': 'review',
  'validating': 'review',
  'verify': 'review',
  'verified': 'review',
  
  // Done
  'done': 'done',
  'closed': 'done',
  'complete': 'done',
  'completed': 'done',
  'resolved': 'done',
  'finished': 'done',
};

/**
 * 标准化状态名称
 */
function normalizeStatus(status: string): string {
  const normalized = status.toLowerCase().trim();
  return STATUS_NORMALIZE_MAP[normalized] || normalized;
}

/**
 * 获取 JiraClient 实例
 * 直接从数据库读取配置
 */
function getJiraClient(): JiraClient | null {
  const host = settingsDB.get('jira_host');
  const username = settingsDB.get('jira_username');
  const password = settingsDB.get('jira_password');
  
  if (!host || !username || !password) {
    console.log('[IPC] Jira not configured');
    return null;
  }
  
  return new JiraClient({
    host,
    username,
    password,
  });
}

/**
 * 注册 Issue 相关的 IPC 处理器
 */
export function registerIssueIPCs(): void {
  console.log('[IPC] Registering issue IPC handlers...');

  /**
   * 执行 Jira 状态转换（通过目标列）
   * 在拖拽卡片时同步更新 Jira 状态
   */
  ipcMain.handle('jira:transition-issue-by-column', async (_, { key, targetColumn }: { key: string; targetColumn: string }) => {
    console.log(`[IPC] Transition issue ${key} to column ${targetColumn}`);
    
    const client = getJiraClient();
    if (!client) {
      return { success: false, error: 'Jira not configured' };
    }

    try {
      // 1. 获取可用 transitions
      const transitionsResult = await client.getTransitions(key);
      if (!transitionsResult.success) {
        return { success: false, error: `Failed to get transitions: ${transitionsResult.error}` };
      }

      const transitions = transitionsResult.transitions;
      console.log(`[IPC] Available transitions for ${key}:`, transitions.map(t => t.name));

      // 2. 查找匹配的 transition
      // 首先尝试通过名称匹配
      let matchedTransition = transitions.find(t => {
        const normalizedTransitionName = normalizeStatus(t.name);
        return normalizedTransitionName === targetColumn;
      });

      // 如果没有直接匹配，尝试获取每个 transition 的详细信息（包括 to 状态）
      if (!matchedTransition) {
        console.log(`[IPC] No direct match found, checking detailed transitions...`);
        
        // 获取任务详情来检查当前状态
        const issueResult = await client.getIssue(key);
        if (issueResult.success) {
          const currentStatus = issueResult.success ? issueResult.issue.fields.status.name : null;
          console.log(`[IPC] Current status: ${currentStatus}`);
        }

        // 尝试部分匹配（transition 名称包含目标列关键词）
        const targetKeywords = targetColumn.toLowerCase().split(/\s+/);
        matchedTransition = transitions.find(t => {
          const nameLower = t.name.toLowerCase();
          return targetKeywords.some(keyword => nameLower.includes(keyword));
        });
      }

      if (!matchedTransition) {
        return { 
          success: false, 
          error: `No valid transition found to "${targetColumn}". Available: ${transitions.map(t => t.name).join(', ')}` 
        };
      }

      console.log(`[IPC] Matched transition: ${matchedTransition.name} (id: ${matchedTransition.id})`);

      // 3. 执行 transition
      const transitionResult = await client.transitionIssue(key, matchedTransition.id);
      
      if (!transitionResult.success) {
        // 检查是否是 Resolution 字段缺失的错误
        if (transitionResult.error?.includes('resolution') || transitionResult.error?.includes('Resolution')) {
          return { 
            success: false, 
            error: 'Please update this status in Jira directly (Complex screen required).',
            code: 'RESOLUTION_REQUIRED'
          };
        }
        return { success: false, error: transitionResult.error };
      }

      // 4. 更新本地数据库
      try {
        const db = getDatabase();
        
        // 获取更新后的任务信息
        const updatedIssue = await client.getIssue(key);
        if (updatedIssue.success) {
          const issue = updatedIssue.issue;
          
          // 更新数据库中的状态
          db.prepare(
            `UPDATE t_tasks SET 
              status = ?, 
              updated_at = ?,
              mapped_column = ?
            WHERE key = ?`
          ).run(
            issue.fields.status.name,
            issue.fields.updated,
            targetColumn,
            key
          );
          
          console.log(`[IPC] Local DB updated for ${key}: status=${issue.fields.status.name}, column=${targetColumn}`);
        }
      } catch (dbError) {
        console.error('[IPC] Failed to update local DB:', dbError);
        // DB 更新失败不影响返回成功，因为 Jira 已经更新了
      }

      return { 
        success: true, 
        newStatus: matchedTransition.name 
      };

    } catch (error) {
      console.error('[IPC] Transition issue error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 获取任务的可用状态转换
   */
  ipcMain.handle('jira:get-transitions', async (_, issueKey: string) => {
    const client = getJiraClient();
    if (!client) {
      return { success: false, error: 'Jira not configured' };
    }

    try {
      const result = await client.getTransitions(issueKey);
      return result;
    } catch (error) {
      console.error('[IPC] Get transitions error:', error);
      return { success: false, error: String(error) };
    }
  });

  console.log('[IPC] Issue IPC handlers registered');
}
