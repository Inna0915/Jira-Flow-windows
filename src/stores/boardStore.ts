import { create } from 'zustand';

/**
 * 看板任务类型
 * 注意：这个接口必须与后端返回的数据结构一致
 */
export interface BoardTask {
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
  isOnSchedule: boolean; // 按期执行（due_date >= 今天）
  description?: string;
  parent?: string;
  links?: Array<{ key: string; summary: string; type: string }>;
  // 调试字段（可选）
  assignee_name?: string; // 后端原始字段（调试用）
  assignee_avatar?: string; // 后端原始字段（调试用）
}

/**
 * 看板列定义 - 严格按照要求的顺序
 */
export const BOARD_COLUMNS = [
  { id: 'FUNNEL', name: 'FUNNEL', order: 0 },
  { id: 'DEFINING', name: 'DEFINING', order: 1 },
  { id: 'READY', name: 'READY', order: 2 },
  { id: 'TO DO', name: 'TO DO', order: 3 },
  { id: 'EXECUTION', name: 'EXECUTION', order: 4 },
  { id: 'EXECUTED', name: 'EXECUTED', order: 5 },
  { id: 'TESTING & REVIEW', name: 'TESTING & REVIEW', order: 6 },
  { id: 'TEST DONE', name: 'TEST DONE', order: 7 },
  { id: 'VALIDATING', name: 'VALIDATING', order: 8 },
  { id: 'RESOLVED', name: 'RESOLVED', order: 9 },
  { id: 'DONE', name: 'DONE', order: 10 },
  { id: 'CLOSED', name: 'CLOSED', order: 11 },
] as const;

export type ColumnId = typeof BOARD_COLUMNS[number]['id'];

/**
 * 泳道类型 - 基于 Planned End Date 的业务逻辑
 * - overdue: 已超期 (due_date < 今天)
 * - onSchedule: 按期执行 (due_date >= 今天)
 * - others: 未设置排期 (due_date 为空)
 */
export type SwimlaneType = 'overdue' | 'onSchedule' | 'others';

export interface Swimlane {
  id: SwimlaneType;
  title: string;
  isCollapsible: boolean;
  isDefaultOpen: boolean;
}

export const SWIMLANES: Swimlane[] = [
  { id: 'overdue', title: 'OVERDUE (已超期)', isCollapsible: true, isDefaultOpen: true },
  { id: 'onSchedule', title: 'ON SCHEDULE (按期执行)', isCollapsible: true, isDefaultOpen: true },
  { id: 'others', title: 'OTHERS (未设置排期)', isCollapsible: true, isDefaultOpen: true },
];

/**
 * 看板 Store 状态
 */
interface BoardState {
  // 任务数据
  tasks: BoardTask[];
  currentSprint: string;
  
  // UI 状态
  isLoading: boolean;
  error: string | null;
  lastSync: number | null;
  
  // 泳道折叠状态
  collapsedSwimlanes: Set<SwimlaneType>;
  
  // 选中任务（用于抽屉）
  selectedTask: BoardTask | null;
  isDrawerOpen: boolean;
  
  // Actions
  setTasks: (tasks: BoardTask[]) => void;
  setCurrentSprint: (sprint: string) => void;
  moveTask: (taskKey: string, targetColumn: string) => void;
  toggleSwimlane: (swimlaneId: SwimlaneType) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLastSync: (timestamp: number) => void;
  selectTask: (task: BoardTask | null) => void;
  setDrawerOpen: (open: boolean) => void;
  
  // 获取任务
  getTasksBySwimlaneAndColumn: (swimlaneId: SwimlaneType, columnId: string) => BoardTask[];
  getFilteredTasks: () => BoardTask[];
  getTaskByKey: (key: string) => BoardTask | undefined;
  
  // 工作流验证
  validateWorkflow: (task: BoardTask, targetColumn: string) => { valid: boolean; message?: string };
  
  // 数据操作
  fetchTasks: () => Promise<void>;
  syncWithJira: (fullSync?: boolean) => Promise<void>;
  updateTaskColumn: (taskKey: string, columnId: string) => Promise<boolean>;
}

/**
 * 精确的状态映射表（与 SyncService.ts 保持一致）
 */
const STATUS_MAP: Record<string, string> = {
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
 * 部分匹配关键词
 */
const PARTIAL_MAPPINGS: Record<string, string> = {
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
 * Jira 状态到看板列的映射
 * 使用精确映射表 -> 部分匹配 -> 默认回退的三级策略
 */
export function mapJiraStatusToColumn(jiraStatus: string): string {
  // 1. 尝试精确匹配
  const exactMatch = STATUS_MAP[jiraStatus];
  if (exactMatch) {
    return exactMatch;
  }

  // 2. 尝试部分匹配
  const statusLower = jiraStatus.toLowerCase().trim();
  for (const [keyword, column] of Object.entries(PARTIAL_MAPPINGS)) {
    if (statusLower.includes(keyword.toLowerCase())) {
      return column;
    }
  }
  
  // 3. 默认映射到 TO DO
  console.warn(`[mapJiraStatusToColumn] Unknown status "${jiraStatus}" mapped to "TO DO"`);
  return 'TO DO';
}

/**
 * 工作流验证
 */
export function validateWorkflowTransition(
  task: BoardTask, 
  targetColumn: string
): { valid: boolean; message?: string } {
  const currentColumn = task.column;
  const isBug = task.issuetype?.toLowerCase() === 'bug';
  
  // 定义列的顺序（用于向前/向后检查）
  const columnOrder = BOARD_COLUMNS.map(c => c.id);
  const currentIndex = columnOrder.indexOf(currentColumn as ColumnId);
  const targetIndex = columnOrder.indexOf(targetColumn as ColumnId);
  
  if (currentIndex === -1 || targetIndex === -1) {
    return { valid: false, message: '无效的列' };
  }
  
  // Story 工作流: READY <-> TO DO <-> EXECUTION -> DONE
  if (!isBug) {
    const storyAllowedTransitions: Record<string, string[]> = {
      'READY': ['TO DO'],
      'TO DO': ['READY', 'EXECUTION'],
      'EXECUTION': ['TO DO', 'EXECUTED'],
      'EXECUTED': ['EXECUTION', 'TESTING & REVIEW'],
      'TESTING & REVIEW': ['EXECUTED', 'TEST DONE'],
      'TEST DONE': ['TESTING & REVIEW', 'VALIDATING'],
      'VALIDATING': ['TEST DONE', 'RESOLVED'],
      'RESOLVED': ['VALIDATING', 'DONE'],
      'DONE': ['RESOLVED', 'CLOSED'],
      'CLOSED': ['DONE'],
    };
    
    const allowed = storyAllowedTransitions[currentColumn] || [];
    if (!allowed.includes(targetColumn)) {
      // 允许向后退回到 READY/TO DO
      if (targetColumn === 'READY' || targetColumn === 'TO DO') {
        return { valid: true };
      }
      return { 
        valid: false, 
        message: `Story 不允许从 ${currentColumn} 移动到 ${targetColumn}` 
      };
    }
    return { valid: true };
  }
  
  // Bug 工作流: READY -> TO DO -> EXECUTION -> VALIDATING
  if (isBug) {
    const bugAllowedTransitions: Record<string, string[]> = {
      'READY': ['TO DO'],
      'TO DO': ['EXECUTION'],
      'EXECUTION': ['TO DO', 'VALIDATING'],
      'VALIDATING': ['EXECUTION', 'TEST DONE'],
      'TEST DONE': ['VALIDATING', 'DONE'],
      'DONE': ['CLOSED'],
      'CLOSED': [],
    };
    
    const allowed = bugAllowedTransitions[currentColumn] || [];
    if (!allowed.includes(targetColumn)) {
      return { 
        valid: false, 
        message: `Bug 不允许从 ${currentColumn} 移动到 ${targetColumn}` 
      };
    }
    return { valid: true };
  }
  
  return { valid: true };
}

/**
 * 看板状态管理 Store
 */
export const useBoardStore = create<BoardState>((set, get) => ({
  // 初始状态
  tasks: [],
  currentSprint: 'Sprint 1',
  isLoading: false,
  error: null,
  lastSync: null,
  collapsedSwimlanes: new Set(),
  selectedTask: null,
  isDrawerOpen: false,

  setTasks: (tasks) => set({ tasks }),
  
  setCurrentSprint: (sprint) => set({ currentSprint: sprint }),

  moveTask: (taskKey, targetColumn) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.key === taskKey ? { ...task, column: targetColumn } : task
      ),
    }));
  },

  toggleSwimlane: (swimlaneId) => {
    set((state) => {
      const newCollapsed = new Set(state.collapsedSwimlanes);
      if (newCollapsed.has(swimlaneId)) {
        newCollapsed.delete(swimlaneId);
      } else {
        newCollapsed.add(swimlaneId);
      }
      return { collapsedSwimlanes: newCollapsed };
    });
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setLastSync: (lastSync) => set({ lastSync }),
  
  selectTask: (task) => set({ selectedTask: task, isDrawerOpen: task !== null }),
  setDrawerOpen: (open) => set({ isDrawerOpen: open }),

  getTasksBySwimlaneAndColumn: (swimlaneId, columnId) => {
    const { tasks, currentSprint } = get();
    
    // 定义"今天"（一天开始），忽略时间部分
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return tasks.filter((task) => {
      // 1. 过滤当前 Sprint
      if (task.sprint !== currentSprint) return false;
      
      // 2. 过滤列
      if (task.column !== columnId) return false;
      
      // 3. 根据 Planned End Date (dueDate) 过滤泳道
      // 新规则：
      // - overdue: due_date < 今天（且未完成）
      // - onSchedule: due_date >= 今天
      // - others: due_date 为空
      
      // Case 1: 没有设置截止日期 -> Others
      if (!task.dueDate) {
        return swimlaneId === 'others';
      }
      
      const dueDate = new Date(task.dueDate);
      dueDate.setHours(0, 0, 0, 0); // 忽略时间部分
      
      const isBeforeToday = dueDate.getTime() < today.getTime();
      const isDone = task.status === 'DONE' || task.status === 'CLOSED';
      
      // Case 2: 已超期（due_date < 今天 且 未完成）-> Overdue
      if (isBeforeToday && !isDone) {
        return swimlaneId === 'overdue';
      }
      
      // Case 3: 按期执行（due_date >= 今天，或已完成的超期任务）-> On Schedule
      // 注意：已完成的任务即使超期也显示在 On Schedule
      return swimlaneId === 'onSchedule';
    });
  },

  getFilteredTasks: () => {
    const { tasks, currentSprint } = get();
    return tasks.filter((task) => task.sprint === currentSprint);
  },
  
  getTaskByKey: (key) => {
    return get().tasks.find((task) => task.key === key);
  },

  validateWorkflow: (task, targetColumn) => {
    return validateWorkflowTransition(task, targetColumn);
  },

  fetchTasks: async () => {
    console.log('[BoardStore] fetchTasks 开始...');
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.board.getTasks();
      console.log('[BoardStore] getTasks 结果:', {
        success: result.success,
        taskCount: result.success ? result.tasks.length : 0
      });
      
      if (result.success) {
        // 处理任务数据，添加泳道标记（基于新的业务逻辑）
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // 获取有效的列 ID 集合
        const validColumnIds = new Set(BOARD_COLUMNS.map(c => c.id));
        
        const processedTasks = result.tasks.map((task) => {
          // 列安全处理：如果 column 不在有效列中，映射到 TO DO
          let safeColumn = task.column;
          if (!validColumnIds.has(task.column as ColumnId)) {
            console.warn(`[BoardStore] Task ${task.key} has unknown column "${task.column}", mapping to "TO DO"`);
            safeColumn = 'TO DO';
          }
          
          // 新泳道规则：
          // - overdue: due_date < 今天（且未完成）
          // - onSchedule: due_date >= 今天（或已完成的超期任务）
          // - others: due_date 为空
          
          if (!task.dueDate) {
            return { ...task, column: safeColumn, isOverdue: false, isOnSchedule: false };
          }
          
          const dueDate = new Date(task.dueDate);
          dueDate.setHours(0, 0, 0, 0);
          
          const isBeforeToday = dueDate.getTime() < today.getTime();
          const isDone = task.status === 'DONE' || task.status === 'CLOSED';
          
          const isOverdue = isBeforeToday && !isDone;
          const isOnSchedule = !isBeforeToday || isDone;
          
          return {
            ...task,
            column: safeColumn,
            isOverdue,
            isOnSchedule,
          };
        });
        
        set({ tasks: processedTasks });
        console.log('[BoardStore] fetchTasks 完成:', {
          total: processedTasks.length,
          byColumn: processedTasks.reduce((acc, t) => {
            acc[t.column] = (acc[t.column] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        });
      } else {
        set({ error: result.error || '获取任务失败' });
        console.error('[BoardStore] fetchTasks 失败:', result.error);
      }
    } catch (err) {
      console.error('[BoardStore] fetchTasks 异常:', err);
      set({ error: String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  syncWithJira: async (fullSync = false) => {
    console.log(`[BoardStore] syncWithJira 开始 (${fullSync ? '全量' : '增量'}同步)...`);
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.jira.syncNow({ fullSync });
      console.log('[BoardStore] syncNow 结果:', {
        success: result.success,
        ...(result.success ? {
          boardId: (result as any).boardId,
          sprintId: (result as any).sprintId,
          sprintIssues: (result as any).sprintIssues,
          backlogIssues: (result as any).backlogIssues,
        } : { error: result.error })
      });
      
      if (result.success) {
        console.log('[BoardStore] 同步成功，开始获取任务...');
        await get().fetchTasks();
        set({ lastSync: Date.now() });
        console.log('[BoardStore] syncWithJira 完成');
      } else {
        set({ error: result.error || '同步失败' });
        console.error('[BoardStore] 同步失败:', result.error);
      }
    } catch (err) {
      console.error('[BoardStore] syncWithJira 异常:', err);
      set({ error: String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  updateTaskColumn: async (taskKey, columnId) => {
    try {
      const result = await window.electronAPI.board.updateTaskColumn(taskKey, columnId);
      return result.success;
    } catch (err) {
      console.error('[BoardStore] Failed to update task column:', err);
      return false;
    }
  },
}));
