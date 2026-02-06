import { ipcMain } from 'electron';
import { JiraClient } from '../services/JiraClient';
import { getDatabase, settingsDB } from '../db/schema';
import { normalizeStatus } from '../services/SyncService';

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
    console.log(`[Jira] Transition request: ${key} -> ${targetColumn}`);
    
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
      console.log(`[Jira] Available transitions for ${key}:`, transitions.map(t => t.name));

      // 2. 查找匹配的 transition - 使用详细日志
      console.log(`[Jira] Checking transitions for ${key} to reach column ${targetColumn}...`);
      
      let matchedTransition = null;
      
      for (const t of transitions) {
        // 获取 transition 的目标状态名称
        // 注意：transitions API 返回的格式可能包含 to 字段
        const targetStatus = t.name; // transition 名称通常就是目标状态
        const mappedColumn = normalizeStatus(targetStatus);
        
        console.log(`   - Option: "${t.name}" -> Mapped: ${mappedColumn}`);
        
        if (mappedColumn === targetColumn.toUpperCase()) {
          console.log(`   >>> MATCH FOUND! Executing transition ${t.id}`);
          matchedTransition = t;
          break;
        }
      }

      // 如果没有直接匹配，尝试部分匹配
      if (!matchedTransition) {
        console.log(`[Jira] No exact match found, trying fuzzy matching...`);
        const targetKeywords = targetColumn.toLowerCase().split(/\s+/);
        
        for (const t of transitions) {
          const nameLower = t.name.toLowerCase();
          const hasMatch = targetKeywords.some(keyword => nameLower.includes(keyword));
          
          if (hasMatch) {
            console.log(`   >>> FUZZY MATCH: "${t.name}" contains keywords from "${targetColumn}"`);
            matchedTransition = t;
            break;
          }
        }
      }

      if (!matchedTransition) {
        console.log(`[Jira] ERROR: No valid transition found to "${targetColumn}"`);
        return { 
          success: false, 
          error: `No valid transition found to "${targetColumn}". Available: ${transitions.map(t => t.name).join(', ')}` 
        };
      }

      console.log(`[Jira] Executing transition: ${matchedTransition.name} (id: ${matchedTransition.id})`);

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

      console.log(`[Jira] Transition successful: ${key} -> ${matchedTransition.name}`);

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
          
          console.log(`[Jira] Local DB updated: ${key} status=${issue.fields.status.name}, column=${targetColumn}`);
        }
      } catch (dbError) {
        console.error('[Jira] Failed to update local DB:', dbError);
        // DB 更新失败不影响返回成功，因为 Jira 已经更新了
      }

      return { 
        success: true, 
        newStatus: matchedTransition.name 
      };

    } catch (error) {
      console.error('[Jira] Transition issue error:', error);
      return { success: false, error: String(error) };
    }
  });

  console.log('[IPC] Issue IPC handlers registered');
}
