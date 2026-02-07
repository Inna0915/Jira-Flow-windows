import { useState, useCallback, useEffect, useRef } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Swimlane } from './Swimlane';
import { TaskDrawer } from './TaskDrawer';
import { useTasks } from '../hooks/useTasks';
import { useBoardStore, BOARD_COLUMNS, SWIMLANES } from '../stores/boardStore';

// 统一列宽常量 - 弹性宽度策略
// flex-1: 允许列填充可用空间
// min-w-[280px]: 最小宽度，防止挤压，小于此宽度时触发滚动
// max-w-[400px]: 最大宽度，防止过宽影响可读性
// flex-shrink-0: 禁止 Flex 容器压缩此元素
export const COLUMN_WIDTH = 280; // px (最小宽度参考值)
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
    selectTask,
    setDrawerOpen,
    getTasksBySwimlaneAndColumn,
    validateWorkflow,
    updateTaskColumn,
    syncWithJira,
  } = useBoardStore();

  const [isDragging, setIsDragging] = useState(false);

  // 处理拖拽结束
  const onDragEnd = useCallback(async (result: DropResult) => {
    setIsDragging(false);
    const { destination, draggableId } = result;

    if (!destination) return;

    // 解析 destination.droppableId
    // 假设 droppableId 格式为 "swimlaneId:columnId" 或直接是 "columnId"
    // 这里沿用你代码中的逻辑
    let targetColumn = destination.droppableId;
    if (destination.droppableId.includes(':')) {
      const destParts = destination.droppableId.split(':');
      targetColumn = destParts[1];
    }
    
    const task = tasks.find(t => t.key === draggableId);
    if (!task) return;

    if (task.status === targetColumn) return;

    // 工作流验证
    const validation = validateWorkflow(task, targetColumn);
    if (!validation.valid) {
      toast.error(validation.message || '无效的状态转换');
      return;
    }

    // 乐观更新
    const previousTasks = [...tasks];
    moveTask(draggableId, targetColumn);

    // 后台同步 - 先更新本地数据库
    try {
      const updateResult = await updateTaskColumn(draggableId, targetColumn);
      
      if (!updateResult) {
        throw new Error('更新数据库失败');
      }

      // ===== Jira 状态同步 (Reverse Sync) =====
      // 异步同步 Jira 状态，失败时回滚
      const jiraSyncPromise = window.electronAPI.jira.transitionIssueByColumn(draggableId, targetColumn);
      
      jiraSyncPromise.then((result) => {
        if (result.success) {
          toast.success(`Jira updated: ${task.key} → ${result.newStatus || targetColumn}`, {
            duration: 2000,
          });
        } else {
          // Jira 同步失败，回滚本地状态
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

      toast.success(`任务已移动到 ${targetColumn}`);

      // ===== 工作日志自动记录 (Phase 3) =====
      // Story: 移动到 EXECUTED 时记录
      // Bug: 移动到 VALIDATING 时记录
      const isStory = task.issuetype?.toLowerCase() === 'story';
      const isBug = task.issuetype?.toLowerCase() === 'bug';
      const shouldLog = (isStory && targetColumn === 'EXECUTED') || 
                        (isBug && targetColumn === 'VALIDATING');
      
      if (shouldLog) {
        // 后台异步记录，不阻塞 UI
        // 格式: [KEY] Task Title（纯净的任务标题，不包含状态文本）
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

        // ===== Obsidian 同步 (Phase 4) =====
        // 同步任务到 Obsidian Vault
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
          } else {
            // Vault 路径未配置时显示警告
            toast.warning('Obsidian sync skipped', {
              description: result.message || 'Vault path not set',
              duration: 3000,
            });
          }
        }).catch((err) => {
          console.error('[Board] Failed to sync to Obsidian:', err);
          toast.error('Obsidian sync failed');
        });
      }
    } catch (error) {
      setTasks(previousTasks);
      toast.error('移动失败，已恢复原状');
    }
  }, [tasks, moveTask, setTasks, validateWorkflow, updateTaskColumn]);

  // 处理任务点击
  const handleTaskClick = useCallback((task: typeof tasks[0]) => {
    selectTask(task);
  }, [selectTask]);

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

  // ===== 自动同步定时器 =====
  const autoSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [autoSyncMinutes, setAutoSyncMinutes] = useState<number>(5);

  // 读取自动同步设置
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

  // 设置自动同步定时器
  useEffect(() => {
    // 清除旧定时器
    if (autoSyncIntervalRef.current) {
      clearInterval(autoSyncIntervalRef.current);
      autoSyncIntervalRef.current = null;
    }

    // 只在未拖拽时启用自动同步
    if (!isDragging && autoSyncMinutes >= 1) {
      const intervalMs = autoSyncMinutes * 60 * 1000;
      console.log(`[Board] Auto-sync enabled: every ${autoSyncMinutes} minutes`);
      
      autoSyncIntervalRef.current = setInterval(() => {
        console.log('[Board] Auto-sync triggered');
        handleSync(false); // 增量同步
      }, intervalMs);
    }

    return () => {
      if (autoSyncIntervalRef.current) {
        clearInterval(autoSyncIntervalRef.current);
        autoSyncIntervalRef.current = null;
      }
    };
  }, [isDragging, autoSyncMinutes, handleSync]);

  return (
    <div className="flex h-full flex-col bg-[#F4F5F7]">
      {/* 顶部工具栏 - Clean Header */}
      <div className="flex-none flex items-center justify-between border-b border-[#DFE1E6] bg-white px-4 py-2 z-20 relative shadow-sm">
        <div className="flex items-center gap-4">
          {/* Sprint 选择器 */}
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
        </div>

        {/* Right side: Last Updated + Sync Icon */}
        <div className="flex items-center gap-3">
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
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex-none mx-4 mt-2 flex items-center gap-2 rounded border border-[#FF5630]/20 bg-[#FFEBE6] px-3 py-2 text-xs text-[#FF5630]">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* ===== 看板主体 - 统一滚动容器 ===== */}
      <div className={`flex-1 overflow-auto bg-[#F4F5F7] ${isDragging ? 'cursor-grabbing' : ''}`}>
        
        {/* Canvas 层 - 使用 inline-flex 确保宽度由内容决定 */}
        <div className="inline-flex flex-col">
          
          <DragDropContext 
            onDragStart={() => setIsDragging(true)}
            onDragEnd={onDragEnd}
          >
            {/* 1. 列标题 - 无 sticky 列，统一滚动 */}
            <div className="flex-none flex flex-row min-w-full bg-[#F4F5F7] border-b-2 border-[#DFE1E6]">
              {VISIBLE_COLUMNS.map((column) => (
                <div 
                  key={column.id}
                  // 使用统一的列宽类
                  className={`px-2 py-3 text-center ${COLUMN_WIDTH_CLASS}`}
                >
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B778C]">
                    {column.name}
                  </span>
                </div>
              ))}
            </div>

            {/* 2. 泳道容器 - 无独立滚动，随外层统一滚动 */}
            <div className="flex-1 min-w-full">
              {SWIMLANES.map((swimlane) => (
                <Swimlane
                  key={swimlane.id}
                  id={swimlane.id}
                  title={swimlane.title}
                  isCollapsed={collapsedSwimlanes.has(swimlane.id)}
                  onToggle={() => toggleSwimlane(swimlane.id)}
                  getTasksForColumn={(columnId) => getTasksBySwimlaneAndColumn(swimlane.id, columnId)}
                  onTaskClick={handleTaskClick}
                  // 只传递可见列的 ID
                  visibleColumns={VISIBLE_COLUMNS.map(c => c.id)}
                  // 传递列宽样式，确保 Swimlane 内部对齐
                  columnWidthClass={COLUMN_WIDTH_CLASS}
                />
              ))}
              
              {/* 空白填充 */}
              <div className="h-8"></div>
            </div>
          </DragDropContext>

          {/* 空状态 */}
          {tasks.length === 0 && !isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[#5E6C84] pointer-events-none">
              <div className="mb-4 rounded-full bg-[#DFE1E6] p-4">
                <RefreshCw className="h-8 w-8" />
              </div>
              <p className="mb-2 text-lg font-medium text-[#172B4D]">暂无任务</p>
              <p className="text-sm">点击"全量同步"从 Jira 获取任务</p>
            </div>
          )}

          {/* 加载状态 */}
          {isLoading && tasks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-50">
              <div className="flex items-center gap-3 text-[#5E6C84]">
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>正在加载任务...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 任务详情抽屉 */}
      <TaskDrawer
        task={selectedTask}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
      />
    </div>
  );
}

export default Board;