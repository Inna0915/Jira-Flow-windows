import { useState, useCallback, useEffect, useRef } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { RefreshCw, AlertCircle, Plus, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { Swimlane } from './Swimlane';
import { TaskDrawer } from './TaskDrawer';
import { CreateTaskModal } from './CreateTaskModal';
import { ArchivedTasksModal } from './ArchivedTasksModal';
import { useTasks } from '../hooks/useTasks';
import { useBoardStore, BOARD_COLUMNS, SWIMLANES } from '../stores/boardStore';

type ViewMode = 'JIRA' | 'LOCAL';

// 统一列宽常量 - 弹性宽度策略
export const COLUMN_WIDTH = 280;
export const COLUMN_WIDTH_CLASS = 'flex-1 min-w-[280px] max-w-[400px] flex-shrink-0 border-r border-[#DFE1E6] last:border-r-0';

// 隐藏的列 - 已完成状态不显示
const HIDDEN_COLUMNS = ['RESOLVED', 'DONE', 'CLOSED'];

// 过滤后的可见列
const VISIBLE_COLUMNS = BOARD_COLUMNS.filter(col => !HIDDEN_COLUMNS.includes(col.id));

export function Board() {
  const {
    selectedSprintId,
    setSelectedSprintId,
    sprints,
    isLoading,
    error,
    refreshTasks,
  } = useTasks();

  const {
    tasks,
    lastSync,
    collapsedSwimlanes,
    selectedTask,
    isDrawerOpen,
    setTasks,
    moveTask,
    toggleSwimlane,
    setSwimlaneCollapsed,
    selectTask,
    setDrawerOpen,
    getTasksBySwimlaneAndColumn,
    validateWorkflow,
    updateTaskColumn,
    syncWithJira,
  } = useBoardStore();

  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('JIRA');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isArchivedModalOpen, setIsArchivedModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [localTasks, setLocalTasks] = useState<any[]>([]);

  // 加载个人任务
  const loadLocalTasks = useCallback(async () => {
    try {
      const result = await window.electronAPI.task.getBySource('LOCAL');
      if (result.success && result.data) {
        setLocalTasks(result.data);
      }
    } catch (err) {
      console.error('[Board] Failed to load local tasks:', err);
    }
  }, []);

  // 视图切换时加载对应数据
  useEffect(() => {
    if (viewMode === 'LOCAL') {
      loadLocalTasks();
    }
  }, [viewMode, loadLocalTasks]);

  // 根据任务数量自动展开/收起泳道
  useEffect(() => {
    if (viewMode === 'JIRA') {
      // JIRA 视图：根据 tasks 计算每个泳道的任务数量
      SWIMLANES.forEach(swimlane => {
        const taskCount = VISIBLE_COLUMNS.reduce((sum, col) => {
          return sum + getTasksBySwimlaneAndColumn(swimlane.id, col.id).filter(
            t => (t as any).source !== 'LOCAL'
          ).length;
        }, 0);
        // 任务数量为 0 时收起，否则展开
        setSwimlaneCollapsed(swimlane.id, taskCount === 0);
      });
    } else {
      // Personal Board 视图：根据 localTasks 计算每个泳道的任务数量
      SWIMLANES.forEach(swimlane => {
        const taskCount = VISIBLE_COLUMNS.reduce((sum, col) => {
          return sum + getLocalTasksBySwimlaneAndColumn(swimlane.id, col.id).length;
        }, 0);
        // 任务数量为 0 时收起，否则展开
        setSwimlaneCollapsed(swimlane.id, taskCount === 0);
      });
    }
  }, [viewMode, tasks, localTasks, setSwimlaneCollapsed, getTasksBySwimlaneAndColumn]);

  // 判断本地任务属于哪个泳道（超期/按期/其他）
  const getLocalTaskSwimlane = (task: any): string => {
    if (!task.due_date) return 'others';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(task.due_date);
    dueDate.setHours(0, 0, 0, 0);
    // 已归档的任务不显示
    if (task.status === 'ARCHIVED' || task.mapped_column === 'ARCHIVED') {
      return 'archived';
    }
    // 超期：截止日期已过且未完成（不在EXECUTED/DONE/RESOLVED/CLOSED列）
    const doneColumns = ['EXECUTED', 'DONE', 'RESOLVED', 'CLOSED', 'ARCHIVED'];
    const isDone = doneColumns.includes(task.status) || doneColumns.includes(task.mapped_column);
    if (dueDate < today && !isDone) {
      return 'overdue';
    }
    // 按期：有截止日期且未超期，或已完成
    if (dueDate >= today || isDone) {
      return 'onSchedule';
    }
    return 'others';
  };

  // 将本地任务转换为 BoardTask 格式
  const convertLocalTaskToBoardTask = (task: any): any => {
    return {
      ...task,
      // 字段映射
      dueDate: task.due_date || null,
      column: task.mapped_column || task.status || 'TODO',
      issuetype: task.issuetype || 'Task',
      assignee: task.assignee_name ? {
        name: task.assignee_name,
        avatar: task.assignee_avatar,
      } : null,
      // 计算属性
      isOverdue: getLocalTaskSwimlane(task) === 'overdue',
      isOnSchedule: getLocalTaskSwimlane(task) === 'onSchedule',
      // 保留原始字段以便调试
      source: 'LOCAL',
    };
  };

  // 获取本地任务按泳道和列分组
  const getLocalTasksBySwimlaneAndColumn = (swimlaneId: string, columnId: string): any[] => {
    return localTasks
      .filter(task => {
        // 排除已归档任务
        if (task.status === 'ARCHIVED' || task.mapped_column === 'ARCHIVED') {
          return false;
        }
        const taskSwimlane = getLocalTaskSwimlane(task);
        const inColumn = task.mapped_column === columnId || task.status === columnId;
        return taskSwimlane === swimlaneId && inColumn;
      })
      .map(convertLocalTaskToBoardTask);
  };

  // 处理拖拽结束
  const onDragEnd = useCallback(async (result: DropResult) => {
    setIsDragging(false);
    const { destination, draggableId } = result;

    if (!destination) return;

    // JIRA 和 LOCAL 任务都支持拖拽

    let targetColumn = destination.droppableId;
    if (destination.droppableId.includes(':')) {
      const destParts = destination.droppableId.split(':');
      targetColumn = destParts[1];
    }
    
    // 在 JIRA 任务和个人任务中查找
    let task = tasks.find(t => t.key === draggableId);
    let isLocalTask = false;
    
    if (!task) {
      // 尝试在个人任务中查找
      const localTask = localTasks.find(t => t.key === draggableId);
      if (localTask) {
        task = convertLocalTaskToBoardTask(localTask);
        isLocalTask = true;
      }
    } else {
      // 检查是否是本地任务（通过 source 字段）
      isLocalTask = (task as any).source === 'LOCAL';
    }
    
    if (!task) return;

    if (task.status === targetColumn) return;

    // 个人任务不需要工作流验证，可以随意拖拽
    if (!isLocalTask) {
      // JIRA 任务工作流验证
      const validation = validateWorkflow(task, targetColumn);
      if (!validation.valid) {
        toast.error(validation.message || '无效的状态转换');
        return;
      }
    }

    // 乐观更新
    const previousTasks = [...tasks];
    const previousLocalTasks = [...localTasks];
    
    if (isLocalTask) {
      // 个人任务：直接更新 localTasks 状态
      setLocalTasks(prev => prev.map(t => 
        t.key === draggableId 
          ? { ...t, mapped_column: targetColumn, status: targetColumn }
          : t
      ));
    } else {
      // JIRA 任务：使用 store 的 moveTask
      moveTask(draggableId, targetColumn);
    }

    // 后台同步
    try {
      let updateResult;
      
      if (isLocalTask) {
        // 个人任务：使用 updatePersonal 更新
        updateResult = await window.electronAPI.task.updatePersonal(draggableId, {
          mapped_column: targetColumn,
          status: targetColumn,
        });
        updateResult = updateResult.success;
      } else {
        // JIRA 任务：使用 updateTaskColumn
        updateResult = await updateTaskColumn(draggableId, targetColumn);
      }
      
      if (!updateResult) {
        throw new Error('更新数据库失败');
      }

      if (!isLocalTask) {
        // Jira 状态同步 - 仅针对 JIRA 任务
        const jiraSyncPromise = window.electronAPI.jira.transitionIssueByColumn(draggableId, targetColumn);
        
        jiraSyncPromise.then((result) => {
          if (result.success) {
            toast.success(`Jira updated: ${task.key} → ${result.newStatus || targetColumn}`, {
              duration: 2000,
            });
          } else {
            console.error('[Board] Jira sync failed:', result.error);
            setTasks(previousTasks);
            
            if (result.code === 'RESOLUTION_REQUIRED') {
              toast.error('Please update this status in Jira directly (Complex screen required).', {
                duration: 5000,
              });
            } else {
              toast.error(`Jira sync failed: ${result.error || 'Unknown error'}`, {
                duration: 5000,
              });
            }
          }
        }).catch((err) => {
          console.error('[Board] Jira sync error:', err);
          setTasks(previousTasks);
          toast.error('Jira sync failed, reverted local change');
        });

        // 工作日志自动记录 - 仅针对 JIRA 任务
        const isStory = task.issuetype?.toLowerCase() === 'story';
        const isBug = task.issuetype?.toLowerCase() === 'bug';
        const shouldLog = (isStory && targetColumn === 'EXECUTED') || 
                          (isBug && targetColumn === 'VALIDATING');
        
        if (shouldLog) {
          const today = new Date().toISOString().split('T')[0];
          window.electronAPI.database.workLogs.logAutoJira({
            task_key: task.key,
            summary: `${task.key} ${task.summary}`,
            log_date: today,
          }).then((result) => {
            if (result.isNew) {
              toast.success('Task logged for report', {
                description: `${task.key} 已记录到工作日志`,
                duration: 2000,
              });
            }
          }).catch((err) => {
            console.error('[Board] Failed to auto-log task:', err);
          });

          // Obsidian 同步
          window.electronAPI.obsidian.syncTask({
            key: task.key,
            summary: task.summary,
            status: task.status,
            issuetype: task.issuetype,
            description: task.description,
            dueDate: task.dueDate,
          }).then((result) => {
            if (result.success) {
              toast.success('Obsidian note updated', {
                description: result.isNew ? 'Created new note' : 'Updated existing note',
                duration: 2000,
              });
            }
          }).catch((err) => {
            console.error('[Board] Failed to sync to Obsidian:', err);
          });
        }
      }

      toast.success(`任务已移动到 ${targetColumn}`);
      
      // 个人任务移动到 EXECUTED 时记录工作日志
      if (isLocalTask && targetColumn === 'EXECUTED') {
        const today = new Date().toISOString().split('T')[0];
        window.electronAPI.database.workLogs.logLocal({
          task_key: task.key,
          summary: `${task.key} ${task.summary}`,
          log_date: today,
        }).then((result) => {
          if (result.isNew) {
            toast.success('Task logged for report', {
              description: `${task.key} 已记录到工作日志`,
              duration: 2000,
            });
          }
        }).catch((err) => {
          console.error('[Board] Failed to auto-log local task:', err);
        });
      }
    } catch (error) {
      // 恢复状态
      if (isLocalTask) {
        setLocalTasks(previousLocalTasks);
      } else {
        setTasks(previousTasks);
      }
      toast.error('移动失败，已恢复原状');
    }
  }, [tasks, localTasks, moveTask, setTasks, validateWorkflow, updateTaskColumn, viewMode]);

  // 处理任务点击
  const handleTaskClick = useCallback((task: typeof tasks[0]) => {
    selectTask(task);
  }, [selectTask]);

  // 处理归档任务
  const handleArchiveTask = async (taskKey: string) => {
    try {
      const result = await window.electronAPI.task.updatePersonal(taskKey, {
        status: 'ARCHIVED',
        mapped_column: 'ARCHIVED',
      });
      if (result.success) {
        toast.success('任务已归档');
        loadLocalTasks();
        handleCloseDrawer();
      } else {
        toast.error(result.error || '归档失败');
      }
    } catch (err) {
      console.error('Failed to archive task:', err);
      toast.error('归档失败');
    }
  };

  // 处理编辑任务
  const handleEditTask = (task: any) => {
    setEditingTask(task);
    setDrawerOpen(false);
  };

  // 关闭抽屉
  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setTimeout(() => selectTask(null), 300);
  }, [setDrawerOpen, selectTask]);

  // 格式化上次同步时间
  const formatLastSync = (timestamp: number | null): string => {
    if (!timestamp) return '从未同步';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    return new Date(timestamp).toLocaleDateString('zh-CN');
  };

  // 处理同步
  const handleSync = async (fullSync: boolean = false) => {
    const loadingToast = toast.loading(fullSync ? '全量同步中...' : '增量同步中...');
    await syncWithJira(fullSync);
    await refreshTasks();
    toast.dismiss(loadingToast);
    
    if (!error) {
      toast.success(fullSync ? '全量同步完成' : '增量同步完成');
    } else {
      toast.error(`同步失败: ${error}`);
    }
  };

  // 自动同步定时器
  const autoSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [autoSyncMinutes, setAutoSyncMinutes] = useState<number>(5);

  useEffect(() => {
    const loadAutoSyncSetting = async () => {
      try {
        const result = await window.electronAPI.database.settings.get('jira_autoSyncInterval');
        if (result.success && result.data) {
          const minutes = parseInt(result.data, 10);
          if (!isNaN(minutes) && minutes >= 1) {
            setAutoSyncMinutes(minutes);
          }
        }
      } catch (err) {
        console.error('[Board] Failed to load auto-sync setting:', err);
      }
    };
    loadAutoSyncSetting();
  }, []);

  useEffect(() => {
    if (autoSyncIntervalRef.current) {
      clearInterval(autoSyncIntervalRef.current);
      autoSyncIntervalRef.current = null;
    }

    // 只在 JIRA 视图且未拖拽时启用自动同步
    if (viewMode === 'JIRA' && !isDragging && autoSyncMinutes >= 1) {
      const intervalMs = autoSyncMinutes * 60 * 1000;
      console.log(`[Board] Auto-sync enabled: every ${autoSyncMinutes} minutes`);
      
      autoSyncIntervalRef.current = setInterval(() => {
        console.log('[Board] Auto-sync triggered');
        handleSync(false);
      }, intervalMs);
    }

    return () => {
      if (autoSyncIntervalRef.current) {
        clearInterval(autoSyncIntervalRef.current);
        autoSyncIntervalRef.current = null;
      }
    };
  }, [isDragging, autoSyncMinutes, handleSync, viewMode]);

  // 处理任务创建/更新成功
  const handleTaskCreated = () => {
    loadLocalTasks();
    setEditingTask(null);
  };

  // 恢复归档任务
  const handleRestoreTask = async (taskKey: string) => {
    try {
      const result = await window.electronAPI.task.updatePersonal(taskKey, {
        status: 'TO DO',
        mapped_column: 'TO DO',
      });
      if (result.success) {
        toast.success('任务已恢复');
        loadLocalTasks();
        // 关闭归档列表，让用户在看板中查看恢复的任务
        setIsArchivedModalOpen(false);
      } else {
        toast.error(result.error || '恢复失败');
      }
    } catch (err) {
      console.error('Failed to restore task:', err);
      toast.error('恢复失败');
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#F4F5F7]">
      {/* 顶部工具栏 */}
      <div className="flex-none flex items-center justify-between border-b border-[#DFE1E6] bg-white px-4 py-2 z-20 relative shadow-sm">
        <div className="flex items-center gap-4">
          {/* 视图切换器 */}
          <div className="bg-gray-100 p-1 rounded-lg flex gap-1">
            <button
              onClick={() => setViewMode('JIRA')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === 'JIRA'
                  ? 'bg-white shadow text-[#0052CC]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Jira看板
            </button>
            <button
              onClick={() => setViewMode('LOCAL')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === 'LOCAL'
                  ? 'bg-white shadow text-[#0052CC]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              个人看板
            </button>
          </div>

          {/* Sprint 选择器（仅 JIRA 视图） */}
          {viewMode === 'JIRA' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#5E6C84]">Sprint:</span>
              <select 
                className="rounded border border-[#DFE1E6] bg-white px-2 py-1 text-xs text-[#172B4D] focus:border-[#4C9AFF] focus:outline-none"
                value={selectedSprintId}
                onChange={(e) => setSelectedSprintId(e.target.value)}
              >
                {sprints.map((sprint) => (
                  <option key={sprint.id} value={sprint.id}>
                    {sprint.name} ({sprint.state})
                  </option>
                ))}
                <option value="backlog">Backlog</option>
              </select>
            </div>
          )}
        </div>

        {/* 右侧操作区 */}
        <div className="flex items-center gap-3">
          {/* Personal Board 操作按钮 */}
          {viewMode === 'LOCAL' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0052CC] hover:bg-[#0747A6] text-white text-xs font-medium rounded-lg transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                新建任务
              </button>
              <button
                onClick={() => setIsArchivedModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <Archive className="h-3.5 w-3.5" />
                查看归档
              </button>
            </div>
          )}

          {/* 同步按钮（仅 JIRA 视图） */}
          {viewMode === 'JIRA' && (
            <>
              <span className="text-xs text-[#5E6C84]">
                Last updated: {formatLastSync(lastSync)}
              </span>
              <button
                onClick={() => handleSync(true)}
                disabled={isLoading}
                className="p-1.5 rounded-md text-[#5E6C84] hover:bg-[#F4F5F7] hover:text-[#0052CC] disabled:opacity-50 transition-colors"
                title="Sync Now"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {error && viewMode === 'JIRA' && (
        <div className="flex-none mx-4 mt-2 flex items-center gap-2 rounded border border-[#FF5630]/20 bg-[#FFEBE6] px-3 py-2 text-xs text-[#FF5630]">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* 看板主体 */}
      <div className={`flex-1 overflow-auto bg-[#F4F5F7] ${isDragging ? 'cursor-grabbing' : ''}`}>
        <div className="inline-flex flex-col">
          <DragDropContext 
            onDragStart={() => setIsDragging(true)}
            onDragEnd={onDragEnd}
          >
            {/* 列标题 */}
            <div className="flex-none flex flex-row min-w-full bg-[#F4F5F7] border-b-2 border-[#DFE1E6]">
              {VISIBLE_COLUMNS.map((column) => (
                <div 
                  key={column.id}
                  className={`px-2 py-3 text-center ${COLUMN_WIDTH_CLASS}`}
                >
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B778C]">
                    {column.name}
                  </span>
                </div>
              ))}
            </div>

            {/* 泳道容器 */}
            <div className="flex-1 min-w-full">
              {viewMode === 'JIRA' ? (
                // JIRA 视图：显示所有泳道
                SWIMLANES.map((swimlane) => (
                  <Swimlane
                    key={swimlane.id}
                    id={swimlane.id}
                    title={swimlane.title}
                    isCollapsed={collapsedSwimlanes.has(swimlane.id)}
                    onToggle={() => toggleSwimlane(swimlane.id)}
                    visibleColumns={VISIBLE_COLUMNS.map(col => col.id)}
                    columnWidthClass={COLUMN_WIDTH_CLASS}
                    getTasksForColumn={(columnId) => 
                      getTasksBySwimlaneAndColumn(swimlane.id, columnId)
                        .filter(t => (t as any).source !== 'LOCAL')
                    }
                    onTaskClick={handleTaskClick}
                  />
                ))
              ) : (
                // Personal Board 视图：使用相同的泳道分组逻辑
                SWIMLANES.map((swimlane) => (
                  <Swimlane
                    key={swimlane.id}
                    id={swimlane.id}
                    title={swimlane.title}
                    isCollapsed={collapsedSwimlanes.has(swimlane.id)}
                    onToggle={() => toggleSwimlane(swimlane.id)}
                    visibleColumns={VISIBLE_COLUMNS.map(col => col.id)}
                    columnWidthClass={COLUMN_WIDTH_CLASS}
                    getTasksForColumn={(columnId) => 
                      getLocalTasksBySwimlaneAndColumn(swimlane.id, columnId)
                    }
                    onTaskClick={handleTaskClick}
                  />
                ))
              )}
            </div>
          </DragDropContext>
        </div>
      </div>

      {/* 任务详情抽屉 */}
      <TaskDrawer
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        task={selectedTask}
        onArchive={viewMode === 'LOCAL' ? handleArchiveTask : undefined}
        onEdit={viewMode === 'LOCAL' ? handleEditTask : undefined}
      />

      {/* 创建/编辑任务模态框 */}
      <CreateTaskModal
        isOpen={isCreateModalOpen || !!editingTask}
        task={editingTask}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingTask(null);
        }}
        onSave={handleTaskCreated}
      />

      {/* 归档任务查看弹窗 */}
      <ArchivedTasksModal
        isOpen={isArchivedModalOpen}
        onClose={() => setIsArchivedModalOpen(false)}
        onRestore={handleRestoreTask}
      />
    </div>
  );
}
