import { useState, useEffect, useCallback } from 'react';
import type { BoardTask } from '../stores/boardStore';
import { useBoardStore } from '../stores/boardStore';

interface Sprint {
  id: string;
  name: string;
  state: string;
}

interface UseTasksReturn {
  tasks: BoardTask[];
  sprints: Sprint[];
  selectedSprintId: string;
  setSelectedSprintId: (id: string) => void;
  isLoading: boolean;
  error: string | null;
  refreshTasks: () => Promise<void>;
}

/**
 * 任务管理 Hook
 * 
 * 核心功能：
 * 1. 自动选择活跃 Sprint
 * 2. 按泳道过滤任务
 * 3. 加载状态管理
 */
export function useTasks(): UseTasksReturn {
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 获取 boardStore 的 setters，确保数据同步到全局状态
  const boardStoreSetTasks = useBoardStore(state => state.setTasks);
  const boardStoreSetCurrentSprint = useBoardStore(state => state.setCurrentSprint);

  /**
   * 自动选择活跃 Sprint
   */
  const autoSelectSprint = useCallback((availableSprints: Sprint[]) => {
    if (availableSprints.length === 0) {
      setSelectedSprintId('backlog');
      boardStoreSetCurrentSprint('Backlog');
      return;
    }

    // 1. 优先找 active
    const activeSprint = availableSprints.find(
      s => s.state.toLowerCase() === 'active'
    );
    if (activeSprint) {
      console.log(`[Sprint] Found active sprint: ${activeSprint.name} (${activeSprint.id})`);
      setSelectedSprintId(activeSprint.id);
      boardStoreSetCurrentSprint(activeSprint.name); // 同步到 boardStore
      return;
    }

    // 2. 找 future
    const futureSprint = availableSprints.find(
      s => s.state.toLowerCase() === 'future'
    );
    if (futureSprint) {
      console.log(`[Sprint] No active sprint, selecting future: ${futureSprint.name} (${futureSprint.id})`);
      setSelectedSprintId(futureSprint.id);
      boardStoreSetCurrentSprint(futureSprint.name); // 同步到 boardStore
      return;
    }

    // 3. 找 closed
    const closedSprint = availableSprints.find(
      s => s.state.toLowerCase() === 'closed'
    );
    if (closedSprint) {
      console.log(`[Sprint] Selecting closed sprint: ${closedSprint.name} (${closedSprint.id})`);
      setSelectedSprintId(closedSprint.id);
      boardStoreSetCurrentSprint(closedSprint.name); // 同步到 boardStore
      return;
    }

    // 4. 回退到第一个
    console.log(`[Sprint] Selecting first available: ${availableSprints[0].name} (${availableSprints[0].id})`);
    setSelectedSprintId(availableSprints[0].id);
    boardStoreSetCurrentSprint(availableSprints[0].name); // 同步到 boardStore
  }, [boardStoreSetCurrentSprint]);

  /**
   * 从数据库加载任务和 Sprint
   */
  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('[useTasks] 开始加载任务...');
      
      // 获取所有任务
      const result = await window.electronAPI.board.getTasks();
      
      console.log('[useTasks] 获取任务结果:', {
        success: result.success,
        taskCount: result.success ? result.tasks.length : 0,
        error: result.success ? null : result.error
      });
      
      if (!result.success) {
        throw new Error(result.error || '加载任务失败');
      }

      const allTasks = result.tasks;
      console.log('[useTasks] 原始任务数据:', allTasks.map(t => ({ 
        key: t.key, 
        summary: t.summary.substring(0, 30), 
        status: t.status,
        column: t.column,
        sprint: t.sprint,
        assignee: t.assignee ? t.assignee.name : 'NULL',
        assigneeObj: t.assignee,
        priority: t.priority,
        dueDate: t.dueDate
      })));
      
      // 调试：检查 assignee 字段
      const withAssignee = allTasks.filter(t => t.assignee && t.assignee.name).length;
      const withoutAssignee = allTasks.filter(t => !t.assignee || !t.assignee.name).length;
      console.log(`[useTasks] Assignee统计: 有负责人=${withAssignee}, 无负责人=${withoutAssignee}`);
      
      // 处理任务数据 - 计算泳道（基于 Planned End Date）
      // 定义"今天"（一天开始），忽略时间部分
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const processedTasks = allTasks.map((task) => {
        // 新规则：
        // - overdue: due_date < 今天（且未完成）
        // - onSchedule: due_date >= 今天（或已完成的超期任务）
        // - others: due_date 为空
        
        if (!task.dueDate) {
          return { ...task, isOverdue: false, isOnSchedule: false };
        }
        
        const dueDate = new Date(task.dueDate);
        dueDate.setHours(0, 0, 0, 0); // 忽略时间部分
        
        const isBeforeToday = dueDate.getTime() < today.getTime();
        const isDone = task.status === 'DONE' || task.status === 'CLOSED';
        
        // 已超期：due_date < 今天 且 未完成
        const isOverdue = isBeforeToday && !isDone;
        
        // 按期执行：due_date >= 今天，或已完成的超期任务
        const isOnSchedule = !isBeforeToday || isDone;

        return {
          ...task,
          isOverdue,
          isOnSchedule,
        };
      });

      setTasks(processedTasks);
      // 关键修复：同步到 boardStore，否则 Board.tsx 看不到数据
      boardStoreSetTasks(processedTasks);
      
      console.log('[useTasks] 处理后的任务已同步到 boardStore:', {
        total: processedTasks.length,
        overdue: processedTasks.filter(t => t.isOverdue).length,
        onSchedule: processedTasks.filter(t => t.isOnSchedule).length,
        others: processedTasks.filter(t => !t.isOverdue && !t.isOnSchedule).length,
        byColumn: processedTasks.reduce((acc, t) => {
          acc[t.column] = (acc[t.column] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      });

      // 提取唯一的 Sprint 列表
      const sprintMap = new Map<string, Sprint>();
      allTasks.forEach((task) => {
        const sprintName = task.sprint || 'Backlog';
        const sprintId = sprintName.toLowerCase().replace(/\s+/g, '_');
        if (!sprintMap.has(sprintId)) {
          sprintMap.set(sprintId, {
            id: sprintId,
            name: sprintName,
            state: task.sprint ? 'active' : 'backlog',
          });
        }
      });

      const availableSprints = Array.from(sprintMap.values());
      setSprints(availableSprints);
      console.log('[useTasks] 可用 Sprints:', availableSprints);

      // 自动选择 Sprint（如果没有选中或当前选中的不存在）
      const currentSelectedExists = availableSprints.some(s => s.id === selectedSprintId);
      if (!selectedSprintId || !currentSelectedExists) {
        autoSelectSprint(availableSprints);
      }

    } catch (err) {
      console.error('[useTasks] Failed to load tasks:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
      console.log('[useTasks] 加载任务完成');
    }
  }, [selectedSprintId, autoSelectSprint]);

  // 初始加载
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // 包装 setSelectedSprintId，同时更新 boardStore 的 currentSprint
  const handleSetSelectedSprintId = useCallback((id: string) => {
    setSelectedSprintId(id);
    // 找到对应的 sprint name 并更新 boardStore
    const sprint = sprints.find(s => s.id === id);
    if (sprint) {
      boardStoreSetCurrentSprint(sprint.name);
      console.log(`[Sprint] Manually selected: ${sprint.name} (${id})`);
    } else if (id === 'backlog') {
      boardStoreSetCurrentSprint('Backlog');
    }
  }, [sprints, boardStoreSetCurrentSprint]);

  return {
    tasks,
    sprints,
    selectedSprintId,
    setSelectedSprintId: handleSetSelectedSprintId, // 使用包装后的函数
    isLoading,
    error,
    refreshTasks: loadTasks,
  };
}

export default useTasks;
