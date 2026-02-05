/// <reference types="vite/client" />

// Electron API 类型声明
declare global {
  interface Window {
    electronAPI: {
      database: {
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
            mapped_column?: string | null;
            assignee_name?: string;
            assignee_avatar?: string;
            due_date?: string;
            priority?: string;
            updated_at?: string;
            raw_json?: string;
          }) => Promise<{ success: boolean; error?: string }>;
          updateColumn: (key: string, column: string) => Promise<{ success: boolean; error?: string }>;
        };
        workLogs: {
          create: (log: {
            task_key: string;
            action: string;
            log_date: string;
            comment?: string;
          }) => Promise<{ success: boolean; data?: { id: number }; error?: string }>;
          getByDateRange: (startDate: string, endDate: string) => Promise<{ success: boolean; data?: Array<Record<string, unknown>>; error?: string }>;
          getByTaskKey: (taskKey: string) => Promise<{ success: boolean; data?: Array<Record<string, unknown>>; error?: string }>;
        };
        query: (sql: string, params?: unknown[]) => Promise<{ success: boolean; data?: unknown; error?: string }>;
      };
      jira: {
        testConnection: (config: { baseUrl: string; username: string; password: string }) => Promise<{ success: boolean; data?: unknown; error?: string }>;
        saveConfig: (config: { baseUrl: string; username: string; password: string }) => Promise<{ success: boolean; error?: string }>;
        getConfig: () => Promise<{ success: boolean; data?: { baseUrl: string; username: string }; error?: string }>;
        fullSync: () => Promise<{ success: boolean; data?: { syncedCount: number; lastSync: number }; error?: string }>;
        incrementalSync: () => Promise<{ success: boolean; data?: { syncedCount: number; lastSync: number }; error?: string }>;
        transitionIssue: (issueKey: string, transitionId: string) => Promise<{ success: boolean; error?: string }>;
      };
    };
  }
}

export {};
