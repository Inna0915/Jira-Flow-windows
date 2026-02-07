const { contextBridge, ipcRenderer } = require('electron');

/**
 * 预加载脚本 - 安全地暴露 Electron API 给渲染进程
 */

// 数据库 API（基础操作）
const databaseAPI = {
  // 设置
  settings: {
    get: (key) => ipcRenderer.invoke('db:settings:get', key),
    set: (key, value) => ipcRenderer.invoke('db:settings:set', key, value),
    delete: (key) => ipcRenderer.invoke('db:settings:delete', key),
  },

  // 任务 - 基础操作
  tasks: {
    getAll: () => ipcRenderer.invoke('db:tasks:getAll'),
    getByColumn: (column) => ipcRenderer.invoke('db:tasks:getByColumn', column),
    upsert: (task) => ipcRenderer.invoke('db:tasks:upsert', task),
    updateColumn: (key, column) => ipcRenderer.invoke('db:tasks:updateColumn', key, column),
    clearAll: () => ipcRenderer.invoke('db:tasks:clearAll'), // 清空所有任务（调试用）
  },

  // 工作日志 (v2.0 - 支持 Jira 自动记录和手动记录)
  workLogs: {
    // 旧接口（向后兼容）
    create: (log) => ipcRenderer.invoke('db:workLogs:create', log),
    getByDateRange: (startDate, endDate) => 
      ipcRenderer.invoke('db:workLogs:getByDateRange', startDate, endDate),
    getByTaskKey: (taskKey) => ipcRenderer.invoke('db:workLogs:getByTaskKey', taskKey),
    // 新接口
    logAutoJira: (task) => ipcRenderer.invoke('db:log-auto-jira', task),
    logLocal: (task) => ipcRenderer.invoke('db:log-local', task),
    logManual: (content) => ipcRenderer.invoke('db:log-manual', content),
    getLogs: (startDate, endDate) => ipcRenderer.invoke('db:get-logs', { startDate, endDate }),
  },

  // 原始 SQL 查询
  query: (sql, params) => ipcRenderer.invoke('db:query', sql, params ?? []),
};

// Jira API（通过 SyncService）
const jiraAPI = {
  /**
   * 测试 Jira 连接
   */
  testConnection: (config) =>
    ipcRenderer.invoke('jira:test-connection', config),
  
  /**
   * 保存 Jira 配置
   */
  saveConfig: (config) =>
    ipcRenderer.invoke('jira:save-config', config),
  
  /**
   * 获取 Jira 配置（包含明文密码）
   */
  getConfig: () => ipcRenderer.invoke('jira:get-config'),
  
  /**
   * 立即同步任务
   */
  syncNow: (options) => ipcRenderer.invoke('jira:sync-now', options),
  
  /**
   * 获取同步状态
   */
  getSyncStatus: () => ipcRenderer.invoke('jira:get-sync-status'),
  
  /**
   * 获取任务的可用状态转换
   */
  getTransitions: (issueKey) =>
    ipcRenderer.invoke('jira:get-transitions', issueKey),
  
  /**
   * 执行状态转换（旧接口，保留兼容）
   */
  transitionIssue: (issueKey, transitionId) =>
    ipcRenderer.invoke('jira:transition-issue-legacy', issueKey, transitionId),
  
  /**
   * 拖拽卡片时同步 Jira 状态
   * @param key 任务 Key
   * @param targetColumn 目标列 ID (todo/inprogress/review/done)
   */
  transitionIssueByColumn: (key, targetColumn) =>
    ipcRenderer.invoke('jira:transition-issue-by-column', { key, targetColumn }),
};

// 看板 API（基于 SyncService 的高级操作）
const boardAPI = {
  /**
   * 获取看板所有任务
   */
  getTasks: () => ipcRenderer.invoke('db:get-tasks'),
  
  /**
   * 获取指定列的任务
   */
  getTasksByColumn: (columnId) => ipcRenderer.invoke('db:get-tasks-by-column', columnId),
  
  /**
   * 更新任务所在列
   */
  updateTaskColumn: (taskKey, columnId) => ipcRenderer.invoke('db:update-task-column', taskKey, columnId),
};

// 任务 API（支持个人看板）
const taskAPI = {
  /**
   * 创建个人任务
   */
  createPersonal: (data) => ipcRenderer.invoke('task:create-personal', data),
  
  /**
   * 更新个人任务
   */
  updatePersonal: (taskKey, updates) => ipcRenderer.invoke('task:update-personal', taskKey, updates),
  
  /**
   * 删除个人任务
   */
  deletePersonal: (taskKey) => ipcRenderer.invoke('task:delete-personal', taskKey),
  
  /**
   * 按来源获取任务
   */
  getBySource: (source) => ipcRenderer.invoke('task:get-by-source', source),
};

// Obsidian 集成 API
const obsidianAPI = {
  /**
   * 同步任务到 Obsidian
   */
  syncTask: (task) => ipcRenderer.invoke('obsidian:sync-task', task),
  
  /**
   * 设置 Vault 路径
   */
  setVaultPath: (path) => ipcRenderer.invoke('obsidian:set-vault-path', path),
  
  /**
   * 获取 Vault 路径
   */
  getVaultPath: () => ipcRenderer.invoke('obsidian:get-vault-path'),
};

// 系统 API
const systemAPI = {
  /**
   * 在系统默认浏览器中打开 Jira Issue
   */
  openJiraIssue: (issueKey) => ipcRenderer.invoke('system:open-jira-issue', issueKey),
};

// AI 配置 API
const aiAPI = {
  // Profile 管理
  getProfiles: () => ipcRenderer.invoke('ai:get-profiles'),
  saveProfiles: (profiles) => ipcRenderer.invoke('ai:save-profiles', profiles),
  addProfile: (profile) => ipcRenderer.invoke('ai:add-profile', profile),
  updateProfile: (profileId, updates) => ipcRenderer.invoke('ai:update-profile', profileId, updates),
  deleteProfile: (profileId) => ipcRenderer.invoke('ai:delete-profile', profileId),
  setActiveProfile: (profileId) => ipcRenderer.invoke('ai:set-active-profile', profileId),
  getActiveProfile: () => ipcRenderer.invoke('ai:get-active-profile'),
  
  // Prompt Template 管理
  getTemplates: () => ipcRenderer.invoke('ai:get-templates'),
  saveTemplates: (templates) => ipcRenderer.invoke('ai:save-templates', templates),
  addTemplate: (template) => ipcRenderer.invoke('ai:add-template', template),
  updateTemplate: (templateId, updates) => ipcRenderer.invoke('ai:update-template', templateId, updates),
  deleteTemplate: (templateId) => ipcRenderer.invoke('ai:delete-template', templateId),
  resetTemplates: () => ipcRenderer.invoke('ai:reset-templates'),
  
  // AI 连接与报告生成
  testConnection: (config) => ipcRenderer.invoke('ai:test-connection', config),
  generateReport: (logs, systemPrompt, profileId) => ipcRenderer.invoke('ai:generate-report', logs, systemPrompt, profileId),
  
  // Provider 预设模板
  getProviderTemplates: () => ipcRenderer.invoke('ai:get-provider-templates'),
};

// 报告 API（支持层级：年/季/月/周）
const reportAPI = {
  save: (report) => ipcRenderer.invoke('report:save', report),
  getHierarchyBundle: ({ hierarchy, startDate, endDate }) => 
    ipcRenderer.invoke('report:get-hierarchy-bundle', { hierarchy, startDate, endDate }),
  getMonthlyBundle: ({ monthStart, monthEnd }) => ipcRenderer.invoke('report:get-monthly-bundle', { monthStart, monthEnd }),
  getByRange: ({ type, startDate, endDate }) => ipcRenderer.invoke('report:get-by-range', { type, startDate, endDate }),
  getByTypeAndRange: ({ type, startDate, endDate }) => ipcRenderer.invoke('report:get-by-type-and-range', { type, startDate, endDate }),
};

// 将 API 暴露给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  database: databaseAPI,
  workLogs: databaseAPI.workLogs, // 提升到顶层方便访问
  jira: jiraAPI,
  board: boardAPI,
  task: taskAPI, // 个人任务 API
  obsidian: obsidianAPI,
  ai: aiAPI,
  system: systemAPI,
  report: reportAPI,
});

console.log('[Preload] Electron API exposed to window.electronAPI');
