const { contextBridge, ipcRenderer } = require('electron');

/**
 * 预加载脚本 - 安全地暴露 Electron API 给渲染进程
 */

// 数据库 API
const databaseAPI = {
  // 设置
  settings: {
    get: (key) => ipcRenderer.invoke('db:settings:get', key),
    set: (key, value) => ipcRenderer.invoke('db:settings:set', key, value),
    delete: (key) => ipcRenderer.invoke('db:settings:delete', key),
  },

  // 任务
  tasks: {
    getAll: () => ipcRenderer.invoke('db:tasks:getAll'),
    getByColumn: (column) => ipcRenderer.invoke('db:tasks:getByColumn', column),
    upsert: (task) => ipcRenderer.invoke('db:tasks:upsert', task),
    updateColumn: (key, column) => ipcRenderer.invoke('db:tasks:updateColumn', key, column),
  },

  // 工作日志
  workLogs: {
    create: (log) => ipcRenderer.invoke('db:workLogs:create', log),
    getByDateRange: (startDate, endDate) => 
      ipcRenderer.invoke('db:workLogs:getByDateRange', startDate, endDate),
    getByTaskKey: (taskKey) => ipcRenderer.invoke('db:workLogs:getByTaskKey', taskKey),
  },

  // 原始 SQL 查询
  query: (sql, params) => ipcRenderer.invoke('db:query', sql, params ?? []),
};

// Jira API
const jiraAPI = {
  testConnection: (config) =>
    ipcRenderer.invoke('jira:testConnection', config),
  
  saveConfig: (config) =>
    ipcRenderer.invoke('jira:saveConfig', config),
  
  getConfig: () => ipcRenderer.invoke('jira:getConfig'),
  
  fullSync: () => ipcRenderer.invoke('jira:fullSync'),
  
  incrementalSync: () => ipcRenderer.invoke('jira:incrementalSync'),
  
  transitionIssue: (issueKey, transitionId) =>
    ipcRenderer.invoke('jira:transitionIssue', issueKey, transitionId),
};

// 将 API 暴露给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  database: databaseAPI,
  jira: jiraAPI,
});
