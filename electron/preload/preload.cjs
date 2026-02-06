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
   * 执行状态转换
   */
  transitionIssue: (issueKey, transitionId) =>
    ipcRenderer.invoke('jira:transition-issue', issueKey, transitionId),
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

// AI 配置 API
const aiAPI = {
  /**
   * 获取所有 AI Profiles
   */
  getProfiles: () => ipcRenderer.invoke('ai:get-profiles'),
  
  /**
   * 保存所有 AI Profiles
   */
  saveProfiles: (profiles) => ipcRenderer.invoke('ai:save-profiles', profiles),
  
  /**
   * 添加新的 AI Profile
   */
  addProfile: (profile) => ipcRenderer.invoke('ai:add-profile', profile),
  
  /**
   * 更新 AI Profile
   */
  updateProfile: (profileId, updates) => ipcRenderer.invoke('ai:update-profile', profileId, updates),
  
  /**
   * 删除 AI Profile
   */
  deleteProfile: (profileId) => ipcRenderer.invoke('ai:delete-profile', profileId),
  
  /**
   * 设置激活的 Profile
   */
  setActiveProfile: (profileId) => ipcRenderer.invoke('ai:set-active-profile', profileId),
  
  /**
   * 获取当前激活的 Profile
   */
  getActiveProfile: () => ipcRenderer.invoke('ai:get-active-profile'),
  
  /**
   * 测试 AI 连接
   */
  testConnection: (config) => ipcRenderer.invoke('ai:test-connection', config),
  
  /**
   * 生成报告
   */
  generateReport: (prompt) => ipcRenderer.invoke('ai:generate-report', prompt),
  
  /**
   * 获取 Provider 预设模板
   */
  getProviderTemplates: () => ipcRenderer.invoke('ai:get-provider-templates'),
};

// 将 API 暴露给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  database: databaseAPI,
  jira: jiraAPI,
  board: boardAPI,
  obsidian: obsidianAPI,
  ai: aiAPI,
});

console.log('[Preload] Electron API exposed to window.electronAPI');
