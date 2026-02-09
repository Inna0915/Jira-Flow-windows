import { JiraClient, JiraClientConfig } from './JiraClient';
import { settingsDB, tasksDB, workLogsDB, getDatabase } from '../db/schema';
import axios from 'axios';

/**
 * Jira Agile API 返回的 Board 类型
 */
interface AgileBoard {
  id: number;
  name: string;
  type: string;
  self: string;
}

/**
 * Jira Agile API 返回的 Sprint 类型
 */
interface AgileSprint {
  id: number;
  name: string;
  state: string;
  self: string;
}

/**
 * Jira Agile API 返回的 Issue 类型
 */
interface AgileIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    status: {
      name: string;
      id: string;
    };
    issuetype?: {
      name: string;
    };
    assignee?: {
      displayName: string;
      avatarUrls?: {
        '48x48': string;
      };
    };
    duedate?: string;
    // Planned End Date 自定义字段
    customfield_10329?: string;
    // Story Points 自定义字段（字段 ID 从设置获取）
    [storyPointsField: string]: any;
    priority?: {
      name: string;
      id: string;
    };
    updated: string;
    description?: string;
    parent?: {
      key: string;
    };
    issuelinks?: Array<{
      outwardIssue?: {
        key: string;
        fields: {
          summary: string;
        };
      };
      inwardIssue?: {
        key: string;
        fields: {
          summary: string;
        };
      };
      type: {
        name: string;
      };
    }>;
    // Sprint 字段可能在不同的自定义字段中
    sprint?: AgileSprint;
    closedSprints?: AgileSprint[];
  };
}

/**
 * 状态名称标准化 - 用于将 Jira 状态/动作映射到看板列 ID
 */
export function normalizeStatus(rawStatus: string): string {
  if (!rawStatus) return 'TO DO';
  const status = rawStatus.toLowerCase().trim();

  // 1. EXECUTION (Running, Building, Processing, Start)
  // Added '开始' (Start) to catch transitions like "开始任务"
  if (
    status.includes('progress') || 
    status.includes('building') || 
    status.includes('processing') || 
    status.includes('running') ||
    status.includes('执行') || 
    status.includes('处理中') || 
    status.includes('构建中') ||
    status.includes('进行中') ||
    status.includes('开始') ||  // Fix: Catch "开始任务"
    status.includes('start')
  ) {
    return 'EXECUTION'; // Fix: Match Board Column ID
  }

  // 2. EXECUTED (Build Done)
  if (
    (status.includes('build') && status.includes('done')) || 
    status.includes('executed') || 
    status.includes('构建完成') ||
    status.includes('执行完成')
  ) {
    return 'EXECUTED';
  }

  // 3. TESTING & REVIEW
  if (
    status.includes('review') || 
    status.includes('testing') || 
    status.includes('integrating') || 
    status.includes('审核') || 
    status.includes('测试中') ||
    status.includes('代码审查') ||
    status.includes('集成')
  ) {
    return 'TESTING & REVIEW'; // Fix: Match Board Column ID
  }

  // 4. TEST DONE
  if (
    (status.includes('test') && status.includes('done')) || 
    status.includes('测试完成') ||
    status.includes('测试通过')
  ) {
    return 'TEST DONE'; // Fix: Match Board Column ID
  }

  // 5. VALIDATING
  // Note: "解决" (Resolve) in many workflows means "Ready for Validation"
  if (
    status.includes('validating') || 
    status.includes('验证') ||
    status.includes('validation') ||
    status.includes('解决') || // Fix: Map "解决" to VALIDATING
    status.includes('resolve') // Fix: Map "Resolve" to VALIDATING
  ) {
    return 'VALIDATING';
  }

  // 6. DONE / RESOLVED / CLOSED
  // Note: "resolved" without "解决" keyword, as "解决" is mapped to VALIDATING above
  if (status.includes('resolved') && !status.includes('解决')) return 'RESOLVED';
  if (status.includes('closed') || status.includes('关闭')) return 'CLOSED';
  if (status.includes('done') || status.includes('完成') || status.includes('已完成')) return 'DONE';

  // 7. PRE-WORK
  if (status.includes('funnel') || status.includes('漏斗')) return 'FUNNEL';
  if (status.includes('defin') || status.includes('定义')) return 'DEFINING';
  if (status.includes('ready') || status.includes('就绪')) return 'READY';

  // 8. TO DO (Default)
  if (
    status.includes('backlog') || 
    status.includes('todo') || 
    status.includes('to do') || 
    status.includes('open') || 
    status.includes('new') ||
    status.includes('待办') ||
    status.includes('新建') ||
    status.includes('未开始') ||
    status.includes('打开')
  ) {
    return 'TO DO';
  }

  console.log(`[normalizeStatus] Unmatched status: "${rawStatus}", defaulting to TO DO`);
  return 'TO DO';
}

/**
 * 同步任务的数据库记录格式
 */
export interface TaskRecord {
  key: string;
  summary: string;
  status: string;
  issuetype: string | null;
  sprint: string | null;
  sprint_state: string | null;
  mapped_column: string | null;
  assignee_name: string | null;
  assignee_avatar: string | null;
  due_date: string | null;
  priority: string | null;
  story_points: number | null;
  updated_at: string | null;
  synced_at: number;
  raw_json: string;
}

/**
 * 前端看板需要的任务格式
 */
export interface BoardTask {
  key: string;
  summary: string;
  status: string;
  issuetype: string | null;
  sprint: string | null;
  sprintState: string | null;
  column: string;
  priority: 'highest' | 'high' | 'medium' | 'low' | 'lowest' | null;
  assignee: {
    name: string;
    avatar?: string;
  } | null;
  dueDate: string | null;
  isOverdue: boolean;
  isDueSoon: boolean;
  description?: string;
  parent?: string;
  links?: Array<{ key: string; summary: string; type: string }>;
  storyPoints?: number | null;
}

/**
 * 同步服务 - 使用 Jira Agile REST API
 * 
 * 4 步同步逻辑：
 * 1. 自动检测 Board ID
 * 2. 获取活跃 Sprint
 * 3. 获取活跃 Sprint 的任务
 * 4. 获取 Backlog 任务
 */
export class SyncService {
  private jiraClient: JiraClient | null = null;
  private agileClient: axios.AxiosInstance | null = null;

  /**
   * 加载同步配置（在 initializeFromDB 之后调用）
   */
  public loadSyncConfig(): void {
    // 配置已在 initializeFromDB 中加载，此方法用于兼容旧代码
    console.log('[SyncService] Sync config loaded');
  }

  /**
   * 从数据库加载 Jira 配置并初始化客户端
   */
  public initializeFromDB(): boolean {
    const host = settingsDB.get('jira_host');
    const username = settingsDB.get('jira_username');
    const password = settingsDB.get('jira_password');

    if (!host || !username || !password) {
      console.log('[SyncService] Jira not configured');
      return false;
    }

    this.initializeWithConfig({ host, username, password });
    console.log('[SyncService] JiraClient initialized');
    return true;
  }

  /**
   * 使用传入的配置初始化客户端
   */
  public initializeWithConfig(config: JiraClientConfig): void {
    this.jiraClient = new JiraClient(config);
    
    // 创建 Agile API 客户端（使用 UTF-8 解码修复中文乱码）
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    this.agileClient = axios.create({
      baseURL: config.host,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000,
      responseType: 'arraybuffer',
      transformResponse: [
        (data: ArrayBuffer) => {
          if (!data) return data;
          try {
            const decoder = new TextDecoder('utf-8');
            const jsonStr = decoder.decode(data);
            return JSON.parse(jsonStr);
          } catch (e) {
            console.error('[SyncService] Failed to decode response:', e);
            return data;
          }
        }
      ],
    });
  }

  /**
   * 获取 JiraClient 实例
   */
  public getClient(): JiraClient | null {
    return this.jiraClient;
  }

  /**
   * 检查是否已配置
   */
  public isConfigured(): boolean {
    return this.jiraClient !== null && this.agileClient !== null;
  }

  /**
   * 测试连接
   */
  public async testConnection(config?: JiraClientConfig): Promise<{ success: true; user: { displayName: string; emailAddress?: string } } | { success: false; error: string }> {
    let client: JiraClient;
    
    if (config) {
      client = new JiraClient(config);
    } else if (this.jiraClient) {
      client = this.jiraClient;
    } else {
      return { success: false, error: 'Jira 未配置' };
    }

    const result = await client.testConnection();
    if (result.success) {
      return {
        success: true,
        user: {
          displayName: result.user.displayName,
          emailAddress: result.user.emailAddress,
        },
      };
    }
    return result;
  }

  // ==================== 4 步 Agile 同步 ====================

  /**
   * Step 1: 自动检测 Board ID
   * GET /rest/agile/1.0/board?projectKeyOrId={projectKey}
   */
  public async detectBoardId(projectKey: string): Promise<{ success: true; boardId: number; boardName: string } | { success: false; error: string }> {
    if (!this.agileClient) {
      return { success: false, error: 'Agile 客户端未初始化' };
    }

    try {
      console.log(`[SyncService] Step 1: Detecting board for project: ${projectKey}`);
      
      const response = await this.agileClient.get('/rest/agile/1.0/board', {
        params: { projectKeyOrId: projectKey },
      });

      const boards: AgileBoard[] = response.data.values || [];
      
      if (boards.length === 0) {
        return { success: false, error: `项目 ${projectKey} 没有找到看板` };
      }

      // 优先选择 scrum 类型的看板，否则选择第一个
      const scrumBoard = boards.find(b => b.type.toLowerCase() === 'scrum');
      const selectedBoard = scrumBoard || boards[0];

      // 保存 boardId 到数据库
      settingsDB.set('jira_boardId', String(selectedBoard.id));
      settingsDB.set('jira_boardName', selectedBoard.name);
      
      console.log(`[SyncService] Step 1: Found board ${selectedBoard.name} (ID: ${selectedBoard.id}, Type: ${selectedBoard.type})`);
      
      return {
        success: true,
        boardId: selectedBoard.id,
        boardName: selectedBoard.name,
      };
    } catch (error) {
      console.error('[SyncService] Step 1 failed:', error);
      return { success: false, error: `检测看板失败: ${String(error)}` };
    }
  }

  /**
   * Step 2: 获取活跃 Sprint
   * GET /rest/agile/1.0/board/{boardId}/sprint?state=active
   */
  public async fetchActiveSprint(boardId: number): Promise<{ success: true; sprintId: number; sprintName: string; sprintState: string } | { success: false; error: string }> {
    if (!this.agileClient) {
      return { success: false, error: 'Agile 客户端未初始化' };
    }

    try {
      console.log(`[SyncService] Step 2: Fetching active sprint for board ${boardId}`);
      
      // 先尝试获取 active sprint
      let response = await this.agileClient.get(`/rest/agile/1.0/board/${boardId}/sprint`, {
        params: { state: 'active' },
      });

      let sprints: AgileSprint[] = response.data.values || [];
      
      // 如果没有 active，尝试 future
      if (sprints.length === 0) {
        console.log('[SyncService] No active sprint, trying future...');
        response = await this.agileClient.get(`/rest/agile/1.0/board/${boardId}/sprint`, {
          params: { state: 'future' },
        });
        sprints = response.data.values || [];
      }

      // 如果还没有，尝试 closed
      if (sprints.length === 0) {
        console.log('[SyncService] No future sprint, trying closed...');
        response = await this.agileClient.get(`/rest/agile/1.0/board/${boardId}/sprint`, {
          params: { state: 'closed' },
        });
        sprints = response.data.values || [];
      }

      if (sprints.length === 0) {
        return { success: false, error: '该看板没有 Sprint' };
      }

      const sprint = sprints[0]; // 取第一个

      // 保存到数据库
      settingsDB.set('jira_activeSprintId', String(sprint.id));
      settingsDB.set('jira_activeSprintName', sprint.name);
      settingsDB.set('jira_activeSprintState', sprint.state);

      console.log(`[SyncService] Step 2: Found sprint ${sprint.name} (ID: ${sprint.id}, State: ${sprint.state})`);

      return {
        success: true,
        sprintId: sprint.id,
        sprintName: sprint.name,
        sprintState: sprint.state,
      };
    } catch (error) {
      console.error('[SyncService] Step 2 failed:', error);
      return { success: false, error: `获取 Sprint 失败: ${String(error)}` };
    }
  }

  /**
   * Step 3: 获取活跃 Sprint 的任务（仅当前用户的任务）
   * GET /rest/agile/1.0/sprint/{sprintId}/issue
   * 使用 jql 参数过滤分配给当前用户的任务
   */
  public async fetchSprintIssues(sprintId: number): Promise<{ success: true; issues: AgileIssue[]; count: number } | { success: false; error: string }> {
    if (!this.agileClient) {
      return { success: false, error: 'Agile 客户端未初始化' };
    }

    try {
      // 获取当前用户名
      const username = settingsDB.get('jira_username');
      if (!username) {
        console.warn('[SyncService] No username configured, fetching all issues');
      }
      
      console.log(`[SyncService] Step 3: Fetching issues for sprint ${sprintId}, assignee: ${username || 'all'}`);
      
      const allIssues: AgileIssue[] = [];
      let startAt = 0;
      const maxResults = 100;
      let total = 0;

      // 显式请求字段（包含 Planned End Date 和 Story Points 自定义字段）
      const storyPointsField = settingsDB.get('jira_storyPointsField') || 'customfield_10016';
      const fields = `summary,status,assignee,priority,issuetype,sprint,created,updated,description,parent,issuelinks,customfield_10329,duedate,${storyPointsField}`;
      
      // 构建 JQL：只获取分配给当前用户的任务
      const jql = username ? `assignee="${username}"` : undefined;
      if (jql) {
        console.log(`[SyncService] Using JQL filter: ${jql}`);
      }

      // 分页获取任务
      do {
        const params: Record<string, string | number> = { 
          startAt, 
          maxResults,
          fields,
        };
        if (jql) {
          params.jql = jql;
        }
        
        const response = await this.agileClient.get(`/rest/agile/1.0/sprint/${sprintId}/issue`, { params });

        const issues: AgileIssue[] = response.data.issues || [];
        total = response.data.total || 0;
        
        allIssues.push(...issues);
        startAt += issues.length;

        console.log(`[SyncService] Fetched ${issues.length} issues (total: ${allIssues.length}/${total})`);
      } while (allIssues.length < total);

      console.log(`[SyncService] Step 3: Total ${allIssues.length} issues in sprint (filtered by assignee)`);

      // 调试：打印第一个任务的字段结构
      if (allIssues.length > 0) {
        const first = allIssues[0];
        console.log('[SyncService] Sample issue fields:', {
          key: first.key,
          hasAssignee: !!first.fields.assignee,
          assigneeName: first.fields.assignee?.displayName || 'N/A',
          hasPriority: !!first.fields.priority,
          priorityName: first.fields.priority?.name || 'N/A',
          dueDate: first.fields.duedate || 'N/A',
        });
      }

      return {
        success: true,
        issues: allIssues,
        count: allIssues.length,
      };
    } catch (error) {
      console.error('[SyncService] Step 3 failed:', error);
      return { success: false, error: `获取 Sprint 任务失败: ${String(error)}` };
    }
  }

  /**
   * Step 4: 获取 Backlog 任务
   * GET /rest/agile/1.0/board/{boardId}/backlog
   * 显式请求字段以确保获取所有需要的数据
   */
  /**
   * Step 4: 获取 Backlog 任务（仅当前用户的任务）
   * GET /rest/agile/1.0/board/{boardId}/backlog
   * 使用 jql 参数过滤分配给当前用户的任务
   */
  public async fetchBacklogIssues(boardId: number, projectKey: string): Promise<{ success: true; issues: AgileIssue[]; count: number } | { success: false; error: string }> {
    if (!this.agileClient) {
      return { success: false, error: 'Agile 客户端未初始化' };
    }

    try {
      // 获取当前用户名
      const username = settingsDB.get('jira_username');
      if (!username) {
        console.warn('[SyncService] No username configured, fetching all backlog issues');
      }
      
      console.log(`[SyncService] Step 4: Fetching backlog for board ${boardId}, project: ${projectKey}, assignee: ${username || 'all'}`);
      
      const allIssues: AgileIssue[] = [];
      let startAt = 0;
      const maxResults = 100;
      let total = 0;

      // 显式请求字段（包含 Planned End Date 自定义字段）
      const storyPointsField = settingsDB.get('jira_storyPointsField') || 'customfield_10016';
      const fields = `summary,status,assignee,priority,issuetype,sprint,created,updated,description,parent,issuelinks,customfield_10329,duedate,${storyPointsField}`;
      
      // 构建 JQL：过滤项目和分配给当前用户的任务
      const conditions: string[] = [];
      
      // 添加项目过滤
      if (projectKey) {
        conditions.push(`project="${projectKey}"`);
      }
      
      // 添加负责人过滤
      if (username) {
        conditions.push(`assignee="${username}"`);
      }
      
      // 组合 JQL 条件
      const jql = conditions.length > 0 ? conditions.join(' AND ') : undefined;
      if (jql) {
        console.log(`[SyncService] Using JQL filter for backlog: ${jql}`);
      }

      // 分页获取 Backlog 任务
      do {
        const params: Record<string, string | number> = { 
          startAt, 
          maxResults,
          fields,
        };
        if (jql) {
          params.jql = jql;
        }
        
        const requestUrl = `/rest/agile/1.0/board/${boardId}/backlog`;
        console.log(`[SyncService] Backlog API Request: ${requestUrl}`, { params });
        
        const response = await this.agileClient.get(requestUrl, { params });

        const issues: AgileIssue[] = response.data.issues || [];
        total = response.data.total || 0;
        
        allIssues.push(...issues);
        startAt += issues.length;

        console.log(`[SyncService] Fetched ${issues.length} backlog issues (total: ${allIssues.length}/${total})`);
      } while (allIssues.length < total);

      console.log(`[SyncService] Step 4: Total ${allIssues.length} issues in backlog (filtered by assignee)`);

      return {
        success: true,
        issues: allIssues,
        count: allIssues.length,
      };
    } catch (error) {
      console.error('[SyncService] Step 4 failed:', error);
      return { success: false, error: `获取 Backlog 失败: ${String(error)}` };
    }
  }

  // ==================== 数据转换和保存 ====================

  /**
   * 将 Agile API 的 Issue 转换为任务数据
   * 安全地提取字段，处理可能的 null/undefined
   */
  private convertAgileIssue(issue: AgileIssue, sprintState: string, sprintName: string, syncTimestamp: number): TaskRecord {
    const rawStatus = issue.fields?.status?.name || 'Unknown';
    console.log(`[Mapping] Processing Issue ${issue.key} with Status: "${rawStatus}"`);
    
    const mappedColumn = this.mapStatusToColumn(rawStatus);
    console.log(`[Mapping] ${issue.key}: "${rawStatus}" -> "${mappedColumn}"`);

    // 提取 Sprint 信息
    let sprint = sprintName;
    let sprintStateValue = sprintState;
    
    if (issue.fields?.sprint) {
      sprint = issue.fields.sprint.name;
      sprintStateValue = issue.fields.sprint.state;
    }

    // 安全提取 assignee
    let assigneeName: string | null = null;
    let assigneeAvatar: string | null = null;
    
    if (issue.fields?.assignee) {
      // 优先使用 displayName（如 "Wang Puhui"），如果不存在则使用 name（如 "wangph"）
      assigneeName = issue.fields.assignee.displayName 
        || (issue.fields.assignee as any).name 
        || null;
      assigneeAvatar = issue.fields.assignee.avatarUrls?.['48x48'] || null;
      console.log(`[Mapping] ${issue.key} assignee: "${assigneeName}"`);
    } else {
      console.log(`[Mapping] ${issue.key} has no assignee`);
    }

    // 安全提取其他字段
    const summary = issue.fields?.summary || '(无标题)';
    const issuetype = issue.fields?.issuetype?.name || null;
    
    // 提取日期：优先使用 Planned End Date (customfield_10329)，回退到标准 duedate
    const plannedEnd = (issue.fields as any)?.customfield_10329 || null;
    const standardDue = issue.fields?.duedate || null;
    const dueDate = plannedEnd || standardDue || null;
    
    console.log(`[Date Sync] Key: ${issue.key}, CustomField: ${plannedEnd || 'N/A'}, Standard: ${standardDue || 'N/A'}, Final: ${dueDate || 'N/A'}`);
    
    const priority = issue.fields?.priority?.name || null;
    const updatedAt = issue.fields?.updated || new Date().toISOString();
    
    // 提取 Story Points（从配置的自定义字段）
    const storyPointsField = settingsDB.get('jira_storyPointsField') || 'customfield_10016';
    const storyPoints = (issue.fields as any)?.[storyPointsField] ?? null;

    console.log(`[Mapping] ${issue.key} extracted:`, {
      summary: summary.substring(0, 30),
      assignee: assigneeName || 'Unassigned',
      priority: priority || 'None',
      dueDate: dueDate || 'None',
      storyPoints: storyPoints ?? 'None',
    });

    return {
      key: issue.key,
      summary,
      status: rawStatus,
      issuetype,
      sprint,
      sprint_state: sprintStateValue,
      mapped_column: mappedColumn,
      assignee_name: assigneeName,
      assignee_avatar: assigneeAvatar,
      due_date: dueDate,
      priority,
      story_points: storyPoints,
      updated_at: updatedAt,
      synced_at: syncTimestamp,
      raw_json: JSON.stringify(issue),
    };
  }

  /**
   * 精确的状态映射表
   * 基于用户 Jira 系统的实际状态名称
   */
  private readonly STATUS_MAP: Record<string, string> = {
    // Funnel & Define
    'Funnel 漏斗': 'FUNNEL',
    'Defining 定义': 'DEFINING',
    
    // Ready & To Do
    'Ready 就绪': 'READY',
    'To Do 待办': 'TO DO',
    'Open 打开': 'TO DO',
    
    // Execution Phase
    'Building 构建中': 'EXECUTION',
    'In Progress 处理中': 'EXECUTION',
    'Build Done 构建完成': 'EXECUTED',
    
    // Testing & Review
    'In Review 审核中': 'TESTING & REVIEW',
    'Testing 测试中': 'TESTING & REVIEW',
    'Integrating & Testing 集成测试中': 'TESTING & REVIEW',
    'Test Done 测试完成': 'TEST DONE',
    
    // Validation & Done
    'Validating 验证': 'VALIDATING',
    'Validating 验证中': 'VALIDATING',
    'Resolved 已解决': 'RESOLVED',
    'Done 完成': 'DONE',
    'Closed 关闭': 'CLOSED'
  };

  /**
   * 部分匹配关键词（用于模糊匹配）
   */
  private readonly PARTIAL_MAPPINGS: Record<string, string> = {
    'funnel': 'FUNNEL',
    'defining': 'DEFINING',
    'ready': 'READY',
    'to do': 'TO DO',
    'open': 'TO DO',
    'building': 'EXECUTION',
    'in progress': 'EXECUTION',
    'build done': 'EXECUTED',
    'executed': 'EXECUTED',
    'in review': 'TESTING & REVIEW',
    'testing': 'TESTING & REVIEW',
    'integrating': 'TESTING & REVIEW',
    'test done': 'TEST DONE',
    'validating': 'VALIDATING',
    'resolved': 'RESOLVED',
    'done': 'DONE',
    'closed': 'CLOSED',
    // 中文关键词
    '漏斗': 'FUNNEL',
    '定义': 'DEFINING',
    '就绪': 'READY',
    '待办': 'TO DO',
    '构建中': 'EXECUTION',
    '处理中': 'EXECUTION',
    '开始任务': 'EXECUTION',
    '构建完成': 'EXECUTED',
    '审核中': 'TESTING & REVIEW',
    '测试中': 'TESTING & REVIEW',
    '集成测试': 'TESTING & REVIEW',
    '测试完成': 'TEST DONE',
    '验证': 'VALIDATING',
    '已解决': 'RESOLVED',
    '完成': 'DONE',
    '关闭': 'CLOSED'
  };

  /**
   * 将 Jira 状态映射到看板列
   * 使用精确映射表 -> 部分匹配 -> 默认回退的三级策略
   */
  private mapStatusToColumn(status: string): string {
    // 记录原始状态用于调试
    console.log(`[Mapping] Processing Issue with Status: "${status}"`);

    // 1. 尝试精确匹配
    const exactMatch = this.STATUS_MAP[status];
    if (exactMatch) {
      console.log(`[Mapping] Exact match: "${status}" -> "${exactMatch}"`);
      return exactMatch;
    }

    // 2. 检查自定义映射
    const customMapping = settingsDB.get(`status_map_${status.toLowerCase()}`);
    if (customMapping) {
      console.log(`[Mapping] Custom mapping: "${status}" -> "${customMapping}"`);
      return customMapping;
    }

    // 3. 尝试部分匹配
    const statusLower = status.toLowerCase().trim();
    for (const [keyword, column] of Object.entries(this.PARTIAL_MAPPINGS)) {
      if (statusLower.includes(keyword.toLowerCase())) {
        console.log(`[Mapping] Partial match: "${status}" contains "${keyword}" -> "${column}"`);
        return column;
      }
    }

    // 4. 回退机制：未知状态映射到 TO DO
    console.warn(`[Mapping] Warning: Unknown status "${status}" mapped to "TO DO"`);
    return 'TO DO';

    return 'TO DO';
  }

  /**
   * 保存任务到数据库
   */
  private saveTasksToDatabase(tasks: TaskRecord[]): { success: true; count: number } | { success: false; error: string } {
    try {
      console.log(`[SyncService] Saving ${tasks.length} tasks to database...`);
      
      // 调试：打印第一个任务的 assignee
      if (tasks.length > 0) {
        const first = tasks[0];
        console.log('[SyncService] Sample task before save:', {
          key: first.key,
          assignee_name: first.assignee_name || 'NULL',
          assignee_avatar: first.assignee_avatar ? 'has avatar' : 'NULL',
        });
      }
      
      for (const task of tasks) {
        tasksDB.upsert(task);
      }
      
      console.log(`[SyncService] Successfully saved ${tasks.length} tasks`);
      return { success: true, count: tasks.length };
    } catch (error) {
      console.error('[SyncService] Failed to save tasks:', error);
      return { success: false, error: String(error) };
    }
  }

  // ==================== 公开同步方法 ====================

  /**
   * 执行完整的 4 步 Agile 同步
   * 使用 "Sync & Prune" 策略确保本地数据库与 Jira 严格一致
   */
  public async performAgileSync(projectKey: string): Promise<{
    success: true;
    boardId: number;
    sprintId: number;
    sprintIssues: number;
    backlogIssues: number;
    pruned: number;
  } | {
    success: false;
    error: string;
    stage?: string;
  }> {
    // 1. 定义统一的同步时间戳
    const syncTimestamp = Date.now();
    const jiraHost = settingsDB.get('jira_host') || 'unknown';
    console.log(`[SyncService] Starting 4-Step Agile Sync (host: ${jiraHost}, timestamp: ${syncTimestamp})...`);

    // Step 1: 检测 Board ID
    const boardResult = await this.detectBoardId(projectKey);
    if (!boardResult.success) {
      console.warn('[SyncService] Step 1 failed, falling back to JQL sync');
      // 回退到 JQL 同步
      const jqlResult = await this.performJQLSync(syncTimestamp);
      if (jqlResult.success) {
        return {
          success: true,
          boardId: 0,
          sprintId: 0,
          sprintIssues: jqlResult.upserted,
          backlogIssues: 0,
          pruned: jqlResult.pruned,
        };
      }
      return { ...jqlResult, stage: 'step1' };
    }

    // Step 2: 获取活跃 Sprint
    const sprintResult = await this.fetchActiveSprint(boardResult.boardId);
    if (!sprintResult.success) {
      console.warn('[SyncService] Step 2 failed:', sprintResult.error);
      // 没有 Sprint 也可以继续同步 Backlog
    }

    const sprintId = sprintResult.success ? sprintResult.sprintId : 0;
    const sprintName = sprintResult.success ? sprintResult.sprintName : 'Backlog';
    const sprintState = sprintResult.success ? sprintResult.sprintState : 'future';

    // Step 3: 获取 Sprint 任务
    let sprintIssues: AgileIssue[] = [];
    if (sprintId > 0) {
      const sprintIssuesResult = await this.fetchSprintIssues(sprintId);
      if (sprintIssuesResult.success) {
        sprintIssues = sprintIssuesResult.issues;
      }
    }

    // Step 4: 获取 Backlog 任务
    const backlogResult = await this.fetchBacklogIssues(boardResult.boardId, projectKey);
    let backlogIssues: AgileIssue[] = [];
    if (backlogResult.success) {
      backlogIssues = backlogResult.issues;
      
      // 诊断：检查 Backlog 中是否包含 Sprint 任务（这本不该发生）
      const issuesWithSprint = backlogIssues.filter(issue => 
        issue.fields?.sprint || issue.fields?.closedSprints?.length
      );
      if (issuesWithSprint.length > 0) {
        console.warn(`[SyncService] WARNING: Backlog contains ${issuesWithSprint.length} issues that have sprint info:`, 
          issuesWithSprint.slice(0, 3).map(i => i.key)
        );
        // 过滤掉这些有 Sprint 的任务（防止域名访问时的异常行为）
        console.log(`[SyncService] Filtering out ${issuesWithSprint.length} issues with sprint info from backlog`);
        backlogIssues = backlogIssues.filter(issue => 
          !issue.fields?.sprint && !issue.fields?.closedSprints?.length
        );
      }
    }

    // 转换并保存 Sprint 任务（使用统一的 syncTimestamp）
    console.log(`[SyncService] Converting ${sprintIssues.length} sprint issues...`);
    const sprintTasks = sprintIssues.map(issue => 
      this.convertAgileIssue(issue, sprintState, sprintName, syncTimestamp)
    );

    // 转换并保存 Backlog 任务（使用统一的 syncTimestamp）
    console.log(`[SyncService] Converting ${backlogIssues.length} backlog issues...`);
    const backlogTasks = backlogIssues.map(issue => 
      this.convertAgileIssue(issue, 'future', 'Backlog', syncTimestamp)
    );

    // 调试：检查转换后的任务
    console.log('[SyncService] Sprint tasks sample:', sprintTasks.slice(0, 3).map(t => ({
      key: t.key,
      assignee_name: t.assignee_name || 'NULL',
      column: t.mapped_column,
    })));

    // 合并并去重（Backlog 和 Sprint 可能有重复）
    const allTasksMap = new Map<string, TaskRecord>();
    
    // 先添加 Backlog 任务
    for (const task of backlogTasks) {
      allTasksMap.set(task.key, task);
    }
    
    // 再添加 Sprint 任务（会覆盖 Backlog 中的重复项）
    for (const task of sprintTasks) {
      allTasksMap.set(task.key, task);
    }

    const allTasks = Array.from(allTasksMap.values());

    // 保存到数据库
    const saveResult = this.saveTasksToDatabase(allTasks);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error, stage: 'save' };
    }

    // 2. 清理旧数据：删除本次同步未触及的任务（已移出 Sprint 或在 Jira 中被删除）
    const prunedCount = this.pruneStaleTasks(syncTimestamp);

    // 更新最后同步时间
    settingsDB.set('jira_lastSync', String(Date.now()));
    settingsDB.set('jira_syncMethod', 'agile');

    // 注意：不记录系统同步日志到工作日志表，工作日志只记录用户完成任务
    console.log(`[SyncService] 4-Step Agile Sync completed successfully. Pruned ${prunedCount} stale tasks.`);

    return {
      success: true,
      boardId: boardResult.boardId,
      sprintId: sprintId,
      sprintIssues: sprintIssues.length,
      backlogIssues: backlogIssues.length,
      pruned: prunedCount,
    };
  }

  /**
   * 清理过期任务：删除 synced_at 早于当前同步时间戳的 JIRA 任务
   * 这些任务已从 Jira Sprint/Backlog 中移除
   * 注意：保留 LOCAL 个人任务，避免被误删
   */
  private pruneStaleTasks(syncTimestamp: number): number {
    try {
      const db = getDatabase();
      // 只删除 JIRA 来源的过期任务，保留 LOCAL 个人任务
      const result = db.prepare(
        "DELETE FROM t_tasks WHERE synced_at < ? AND (source IS NULL OR source = 'JIRA')"
      ).run(syncTimestamp);
      console.log(`[SyncService] Pruned ${result.changes} stale JIRA tasks (synced_at < ${syncTimestamp}, source = JIRA)`);
      return result.changes;
    } catch (error) {
      console.error('[SyncService] Failed to prune stale tasks:', error);
      return 0;
    }
  }

  /**
   * 回退：使用 JQL 同步（当 Agile API 不可用时）
   * 同样使用 "Sync & Prune" 策略确保数据一致性
   */
  public async performJQLSync(syncTimestamp?: number): Promise<{
    success: true;
    upserted: number;
    pruned: number;
  } | {
    success: false;
    error: string;
  }> {
    console.warn('[SyncService] Falling back to JQL sync...');

    if (!this.jiraClient) {
      return { success: false, error: 'Jira 客户端未初始化' };
    }

    // 如果没有提供时间戳，生成一个新的
    const timestamp = syncTimestamp || Date.now();

    const jql = 'assignee = currentUser() ORDER BY updated DESC';
    
    try {
      const result = await this.jiraClient.searchIssues(jql, 100);
      
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const tasks = result.issues.map(issue => 
        this.convertAgileIssue(issue as unknown as AgileIssue, 'unknown', 'Backlog', timestamp)
      );

      const saveResult = this.saveTasksToDatabase(tasks);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }

      // 清理旧数据
      const prunedCount = syncTimestamp ? 0 : this.pruneStaleTasks(timestamp);

      settingsDB.set('jira_lastSync', String(Date.now()));
      settingsDB.set('jira_syncMethod', 'jql');

      // 注意：不记录系统同步日志到工作日志表，工作日志只记录用户完成任务
      return { success: true, upserted: tasks.length, pruned: prunedCount };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  // ==================== 查询方法 ====================

  /**
   * 获取看板需要的任务列表
   */
  public getTasksForBoard(): { success: true; tasks: BoardTask[] } | { success: false; error: string } {
    try {
      console.log('[SyncService] getTasksForBoard: Reading from database...');
      const records = tasksDB.getAll() as TaskRecord[];
      console.log(`[SyncService] getTasksForBoard: Retrieved ${records.length} records from DB`);
      
      // 调试：打印第一条记录的原始数据
      if (records.length > 0) {
        const first = records[0];
        console.log('[SyncService] getTasksForBoard: First record from DB:', {
          key: first.key,
          assignee_name: first.assignee_name || 'NULL',
          assignee_avatar: first.assignee_avatar ? 'has avatar' : 'NULL',
          priority: first.priority || 'NULL',
          due_date: first.due_date || 'NULL',
          story_points: first.story_points ?? 'NULL',
          issuetype: first.issuetype || 'NULL',
        });
      }
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const threeDaysLater = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

      const tasks: BoardTask[] = records.map((record) => {
        const priority = (record.priority?.toLowerCase() || 'medium') as BoardTask['priority'];
        const dueDate = record.due_date ? new Date(record.due_date) : null;
        
        const isOverdue = dueDate !== null 
          && dueDate < today 
          && !['DONE', 'CLOSED'].includes(record.mapped_column || '');
        const isDueSoon = dueDate !== null 
          && dueDate >= today 
          && dueDate <= threeDaysLater;

        let description = '';
        let parent = '';
        let links: BoardTask['links'] = [];
        
        try {
          const raw = JSON.parse(record.raw_json || '{}');
          description = raw.fields?.description || '';
          parent = raw.fields?.parent?.key || '';
          links = (raw.fields?.issuelinks || []).map((link: any) => ({
            key: link.outwardIssue?.key || link.inwardIssue?.key || '',
            summary: link.outwardIssue?.fields?.summary || link.inwardIssue?.fields?.summary || '',
            type: link.type?.name || '',
          })).filter((l: { key: string }) => l.key);
        } catch (e) {
          // 忽略
        }

        return {
          key: record.key,
          summary: record.summary,
          status: record.status,
          issuetype: record.issuetype,
          sprint: record.sprint,
          sprintState: record.sprint_state,
          column: record.mapped_column || 'TO DO',
          priority,
          assignee: record.assignee_name ? {
            name: record.assignee_name,
            avatar: record.assignee_avatar || undefined,
          } : null,
          dueDate: record.due_date || null,
          isOverdue,
          isDueSoon,
          description,
          parent,
          links,
          storyPoints: record.story_points ?? null,
          source: record.source || 'JIRA',
        };
      });

      // 调试：打印转换后的第一个任务
      if (tasks.length > 0) {
        console.log('[SyncService] getTasksForBoard: First task after mapping:', {
          key: tasks[0].key,
          assignee: tasks[0].assignee ? tasks[0].assignee.name : 'NULL',
          priority: tasks[0].priority,
          dueDate: tasks[0].dueDate || 'NULL',
          storyPoints: tasks[0].storyPoints ?? 'NULL',
        });
      }

      console.log(`[SyncService] getTasksForBoard: Returning ${tasks.length} tasks`);
      return { success: true, tasks };
    } catch (error) {
      console.error('[SyncService] Failed to get tasks for board:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 更新任务的看板列
   */
  public updateTaskColumn(taskKey: string, columnId: string): { success: true } | { success: false; error: string } {
    try {
      tasksDB.updateColumn(taskKey, columnId);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * 获取同步信息
   */
  public getSyncInfo(): {
    boardId: string | null;
    boardName: string | null;
    sprintId: string | null;
    sprintName: string | null;
    syncMethod: string | null;
  } {
    return {
      boardId: settingsDB.get('jira_boardId'),
      boardName: settingsDB.get('jira_boardName'),
      sprintId: settingsDB.get('jira_activeSprintId'),
      sprintName: settingsDB.get('jira_activeSprintName'),
      syncMethod: settingsDB.get('jira_syncMethod'),
    };
  }
}

// 导出单例实例
export const syncService = new SyncService();
