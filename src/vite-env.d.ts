/// <reference types="vite/client" />

// 数据库基础 API 类型
declare interface DatabaseAPI {
  settings: {
    get: (key: string) => Promise<{ success: boolean; data?: string | null; error?: string }>;
    set: (key: string, value: string) => Promise<{ success: boolean; error?: string }>;
    delete: (key: string) => Promise<{ success: boolean; error?: string }>;
  };
  tasks: {
    getAll: () => Promise<{ success: boolean; data?: Array<Record<string, unknown>>; error?: string }>;
    getByColumn: (column: string) => Promise<{ success: boolean; data?: Array<Record<string, unknown>>; error?: string }>;
    upsert: (task: {
      key: string;
      summary: string;
      status: string;
      issuetype?: string;
      sprint?: string;
      mapped_column?: string | null;
      assignee_name?: string;
      assignee_avatar?: string;
      due_date?: string;
      priority?: string;
      updated_at?: string;
      raw_json?: string;
    }) => Promise<{ success: boolean; error?: string }>;
    updateColumn: (key: string, column: string) => Promise<{ success: boolean; error?: string }>;
    clearAll: () => Promise<{ success: boolean; data?: { deletedCount: number }; error?: string }>; // 清空所有任务（调试用）
  };
  workLogs: {
    // 旧接口（向后兼容）
    create: (log: {
      task_key: string;
      action: string;
      log_date: string;
      comment?: string;
    }) => Promise<{ success: boolean; data?: { id: number }; error?: string }>;
    getByDateRange: (startDate: string, endDate: string) => Promise<{ success: boolean; data?: Array<Record<string, unknown>>; error?: string }>;
    getByTaskKey: (taskKey: string) => Promise<{ success: boolean; data?: Array<Record<string, unknown>>; error?: string }>;
    // 新接口 (v2.0)
    logAutoJira: (task: {
      task_key: string;
      summary: string;
      log_date: string;
    }) => Promise<{ success: boolean; isNew: boolean }>;
    logLocal: (task: {
      task_key: string;
      summary: string;
      log_date: string;
    }) => Promise<{ success: boolean; isNew: boolean }>;
    logManual: (content: {
      summary: string;
      log_date: string;
    }) => Promise<{ success: boolean; task_key: string }>;
    getLogs: (startDate: string, endDate: string) => Promise<{
      success: boolean;
      data?: Array<{
        id: number;
        task_key: string;
        source: 'JIRA' | 'LOCAL' | 'MANUAL';
        summary: string;
        log_date: string;
        created_at: number;
      }>;
      error?: string;
    }>;
  };
  query: (sql: string, params?: unknown[]) => Promise<{ success: boolean; data?: unknown; error?: string }>;
  
  /**
   * 清空所有业务数据（保留 JIRA 配置等设置）
   */
  clearAll: () => Promise<{ 
    success: boolean; 
    data?: { 
      tasksDeleted: number; 
      workLogsDeleted: number; 
      reportsDeleted: number;
      syncStatusCleared: boolean;
    }; 
    error?: string 
  }>;
}

// Jira 配置类型
declare interface JiraConfig {
  host: string;
  username: string;
  password: string;
  projectKey?: string;
}

// 看板任务类型
declare interface BoardTask {
  key: string;
  summary: string;
  status: string;
  issuetype: string | null;
  sprint: string | null;
  column: string;
  priority: 'highest' | 'high' | 'medium' | 'low' | 'lowest' | null;
  assignee: {
    name: string;
    avatar?: string;
  } | null;
  dueDate: string | null;
  isOverdue: boolean;
  isOnSchedule: boolean;
  description?: string;
  parent?: string;
  links?: Array<{ key: string; summary: string; type: string }>;
}

// Jira API 类型
declare interface JiraAPI {
  testConnection: (config: JiraConfig) => Promise<{ 
    success: true; 
    user: { displayName: string; emailAddress?: string };
  } | { 
    success: false; 
    error: string;
  }>;
  saveConfig: (config: JiraConfig) => Promise<{ success: boolean; error?: string }>;
  getConfig: () => Promise<{ 
    success: true; 
    data: { host: string; username: string; password: string; projectKey: string };
  } | { 
    success: false; 
    error: string;
  }>;
  syncNow: (options?: { fullSync?: boolean }) => Promise<{
    success: true;
    boardId: number;
    sprintId: number;
    sprintIssues: number;
    backlogIssues: number;
  } | {
    success: false;
    error: string;
    stage?: string;
  }>;
  getSyncStatus: () => Promise<{
    success: true;
    data: {
      isConfigured: boolean;
      lastSync: number | null;
    };
  } | {
    success: false;
    error: string;
  }>;
  getTransitions: (issueKey: string) => Promise<{
    success: true;
    transitions: Array<{ id: string; name: string }>;
  } | {
    success: false;
    error: string;
  }>;
  transitionIssue: (issueKey: string, transitionId: string) => Promise<{ success: boolean; error?: string }>;
  
  /**
   * 拖拽卡片时同步 Jira 状态
   * @param key 任务 Key
   * @param targetColumn 目标列 ID
   */
  transitionIssueByColumn: (key: string, targetColumn: string) => Promise<{
    success: true;
    newStatus?: string;
  } | {
    success: false;
    error: string;
    code?: string;
  }>;
}

// 看板 API 类型
declare interface BoardAPI {
  getTasks: () => Promise<{
    success: true;
    tasks: BoardTask[];
  } | {
    success: false;
    error: string;
  }>;
  getTasksByColumn: (columnId: string) => Promise<{
    success: true;
    tasks: BoardTask[];
  } | {
    success: false;
    error: string;
  }>;
  updateTaskColumn: (taskKey: string, columnId: string) => Promise<{ success: boolean; error?: string }>;
}

// Obsidian 集成 API 类型
declare interface ObsidianAPI {
  syncTask: (task: {
    key: string;
    summary: string;
    status: string;
    issuetype?: string | null;
    description?: string;
    dueDate?: string | null;
  }) => Promise<{
    success: true;
    isNew: boolean;
    filePath: string;
  } | {
    success: false;
    message: string;
    code?: string;
  }>;
  setVaultPath: (path: string) => Promise<{ success: boolean; error?: string }>;
  getVaultPath: () => Promise<{ success: true; data: string } | { success: false; error: string }>;
}

// AI Provider 类型
declare type AIProvider = 'openai' | 'deepseek' | 'moonshot' | 'qwen' | 'custom';

// AI Profile 类型
declare interface AIProfile {
  id: string;
  name: string;
  provider: AIProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  isActive: boolean;
}

// Provider 模板类型
declare interface ProviderTemplate {
  name: string;
  baseUrl: string;
  defaultModel: string;
}

// Prompt Template 类型
declare interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  type?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  isDefault?: boolean;
}

// Work Log 类型（用于报告生成）
declare interface WorkLogForReport {
  task_key: string;
  summary: string;
  source: 'JIRA' | 'LOCAL' | 'MANUAL';
  log_date: string;
}

// AI API 类型
declare interface AIAPI {
  // Profile 管理
  getProfiles: () => Promise<{ success: true; data: AIProfile[] } | { success: false; error: string }>;
  saveProfiles: (profiles: AIProfile[]) => Promise<{ success: boolean; error?: string }>;
  addProfile: (profile: Omit<AIProfile, 'id'>) => Promise<{ 
    success: true; 
    profile: AIProfile;
  } | { 
    success: false; 
    error: string;
  }>;
  updateProfile: (profileId: string, updates: Partial<AIProfile>) => Promise<{ success: boolean; error?: string }>;
  deleteProfile: (profileId: string) => Promise<{ success: boolean; error?: string }>;
  setActiveProfile: (profileId: string) => Promise<{ success: boolean; error?: string }>;
  getActiveProfile: () => Promise<{ success: true; data: AIProfile | null } | { success: false; error: string }>;
  
  // Prompt Template 管理
  getTemplates: () => Promise<{ success: true; data: PromptTemplate[] } | { success: false; error: string }>;
  saveTemplates: (templates: PromptTemplate[]) => Promise<{ success: boolean; error?: string }>;
  addTemplate: (template: Omit<PromptTemplate, 'id'>) => Promise<{
    success: true;
    template: PromptTemplate;
  } | {
    success: false;
    error: string;
  }>;
  updateTemplate: (templateId: string, updates: Partial<PromptTemplate>) => Promise<{ success: boolean; error?: string }>;
  deleteTemplate: (templateId: string) => Promise<{ success: boolean; error?: string }>;
  resetTemplates: () => Promise<{ success: true; data: PromptTemplate[] } | { success: false; error: string }>;
  
  // AI 连接与报告生成
  testConnection: (config: { baseUrl: string; apiKey: string; model: string }) => Promise<{
    success: true;
    latency: string;
  } | {
    success: false;
    error: string;
  }>;
  generateReport: (
    logs: WorkLogForReport[],
    systemPrompt: string,
    profileId?: string
  ) => Promise<{
    success: true;
    content: string;
  } | {
    success: false;
    error: string;
  }>;
  getProviderTemplates: () => Promise<{ success: true; data: Record<AIProvider, ProviderTemplate> } | { success: false; error: string }>;
}

// System API 类型
declare interface SystemAPI {
  /**
   * 在系统默认浏览器中打开 Jira Issue
   */
  openJiraIssue: (issueKey: string) => Promise<{ success: boolean; error?: string }>;
  
  /**
   * 在系统默认浏览器中打开任意 URL
   */
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
}

// Report 类型（支持年/季/月/周）
declare interface Report {
  id: string;
  type: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date: string;
  content: string;
  created_at: number;
}

// Report API 类型（支持层级报告）
declare interface ReportAPI {
  save: (report: Omit<Report, 'created_at'>) => Promise<{ success: true; id: string } | { success: false; error: string }>;
  // 获取层级报告包（年/季/月）
  getHierarchyBundle: ({ 
    hierarchy, 
    startDate, 
    endDate 
  }: { 
    hierarchy: 'year' | 'quarter' | 'month' | 'week'; 
    startDate: string; 
    endDate: string;
  }) => Promise<{
    success: true;
    data: {
      main: Report | null;
      children: Report[];
      hierarchy: string;
    };
  } | {
    success: false;
    error: string;
  }>;
  // 兼容旧接口
  getMonthlyBundle: ({ monthStart, monthEnd }: { monthStart: string; monthEnd: string }) => Promise<{
    success: true;
    data: { monthly: Report | null; weeklies: Report[] };
  } | {
    success: false;
    error: string;
  }>;
  getByRange: ({ type, startDate, endDate }: { type: string; startDate: string; endDate: string }) => Promise<{
    success: true;
    data: Report | null;
  } | {
    success: false;
    error: string;
  }>;
  // 获取指定类型和日期范围内的所有报告
  getByTypeAndRange: ({ type, startDate, endDate }: { type: string; startDate: string; endDate: string }) => Promise<{
    success: true;
    data: Report[];
  } | {
    success: false;
    error: string;
  }>;
}

// 任务 API 类型
declare interface TaskAPI {
  createPersonal: (data: {
    summary: string;
    priority?: string;
    dueDate?: string;
    description?: string;
    initialColumn?: string;
  }) => Promise<{
    success: true;
    task: any;
  } | {
    success: false;
    error: string;
  }>;
  updatePersonal: (taskKey: string, updates: {
    summary?: string;
    priority?: string;
    due_date?: string;
    description?: string;
    status?: string;
    mapped_column?: string;
  }) => Promise<{
    success: true;
    task: any;
  } | {
    success: false;
    error: string;
  }>;
  deletePersonal: (taskKey: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  getBySource: (source: string) => Promise<{
    success: true;
    data: any[];
  } | {
    success: false;
    error: string;
  }>;
}

// Electron API 类型声明
declare global {
  interface Window {
    electronAPI: {
      database: DatabaseAPI;
      workLogs: DatabaseAPI['workLogs']; // 提升到顶层
      jira: JiraAPI;
      board: BoardAPI;
      task: TaskAPI; // 个人任务 API
      obsidian: ObsidianAPI;
      system: SystemAPI;
      ai: AIAPI;
      report: ReportAPI;
    };
  }
}

export {};
