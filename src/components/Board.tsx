import { useState, useCallback } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Swimlane } from './Swimlane';
import { TaskDrawer } from './TaskDrawer';
import { useTasks } from '../hooks/useTasks';
import { useBoardStore, BOARD_COLUMNS, SWIMLANES } from '../stores/boardStore';

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

    const destParts = destination.droppableId.split(':');
    const targetColumn = destParts[1];
    const task = tasks.find(t => t.key === draggableId);
    if (!task) return;

    // 工作流验证
    const validation = validateWorkflow(task, targetColumn);
    if (!validation.valid) {
      toast.error(validation.message || '无效的状态转换');
      return;
    }

    // 乐观更新
    const previousTasks = [...tasks];
    moveTask(draggableId, targetColumn);

    // 后台同步
    try {
      const updateResult = await updateTaskColumn(draggableId, targetColumn);
      
      if (!updateResult) {
        throw new Error('更新数据库失败');
      }

      toast.success(`任务已移动到 ${targetColumn}`);

      // ===== 工作日志自动记录 (Phase 3) =====
      // Story: 移动到 DONE 时记录
      // Bug: 移动到 VALIDATING 时记录
      const isStory = task.issuetype?.toLowerCase() === 'story';
      const isBug = task.issuetype?.toLowerCase() === 'bug';
      const shouldLog = (isStory && targetColumn === 'DONE') || 
                        (isBug && targetColumn === 'VALIDATING');
      
      if (shouldLog) {
        // 后台异步记录，不阻塞 UI
        const today = new Date().toISOString().split('T')[0];
        window.electronAPI.database.workLogs.logAutoJira({
          task_key: task.key,
          summary: task.summary,
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

  return (
    <div className="flex h-full flex-col bg-[#F4F5F7]">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b border-[#DFE1E6] bg-white px-4 py-2">
        <div className="flex items-center gap-4">
          <h2 className="text-base font-semibold text-[#172B4D]">看板</h2>
          
          {/* 任务数量调试信息 */}
          <span className="rounded bg-[#E3FCEF] px-2 py-0.5 text-xs font-medium text-[#006644]">
            总任务: {tasks.length}
          </span>
          
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

          {/* 同步状态 */}
          <span className="text-xs text-[#5E6C84]">
            同步于 {formatLastSync(lastSync)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSync(false)}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded border border-[#DFE1E6] bg-white px-3 py-1.5 text-xs font-medium text-[#172B4D] hover:bg-[#F4F5F7] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            增量同步
          </button>
          <button
            onClick={() => handleSync(true)}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded bg-[#0052CC] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0747A6] disabled:opacity-50"
          >
            全量同步
          </button>
          
          {/* 调试按钮：清空所有任务 */}
          <button
            onClick={async () => {
              if (confirm('确定要清空所有任务数据吗？')) {
                const result = await window.electronAPI.database.tasks.clearAll();
                if (result.success) {
                  toast.success(`已清空 ${result.data?.deletedCount || 0} 个任务`);
                  await refreshTasks();
                } else {
                  toast.error('清空失败');
                }
              }
            }}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded border border-[#FF5630] bg-white px-3 py-1.5 text-xs font-medium text-[#FF5630] hover:bg-[#FFEBE6] disabled:opacity-50"
            title="调试用：清空本地数据库"
          >
            清空数据
          </button>
        </div>
      </div>

      {/* 列标题 - Agile Hive 风格 */}
      {/* 关键修复：添加 min-w-[280px] 防止列被压扁，启用水平滚动 */}
      <div 
        className="grid border-b-2 border-[#DFE1E6] bg-[#F4F5F7] overflow-x-auto" 
        style={{ gridTemplateColumns: `repeat(${BOARD_COLUMNS.length}, minmax(280px, 1fr))` }}
      >
        {BOARD_COLUMNS.map((column) => (
          <div 
            key={column.id}
            className="min-w-[280px] border-r border-[#DFE1E6] px-2 py-3 text-center last:border-r-0"
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B778C]">
              {column.name}
            </span>
          </div>
        ))}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded border border-[#FF5630]/20 bg-[#FFEBE6] px-3 py-2 text-xs text-[#FF5630]">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* 看板主体 */}
      <div className={`flex-1 overflow-auto p-4 ${isDragging ? 'cursor-grabbing' : ''}`}>
        <DragDropContext onDragEnd={onDragEnd}>
          {SWIMLANES.map((swimlane) => (
            <Swimlane
              key={swimlane.id}
              id={swimlane.id}
              title={swimlane.title}
              isCollapsed={collapsedSwimlanes.has(swimlane.id)}
              onToggle={() => toggleSwimlane(swimlane.id)}
              getTasksForColumn={(columnId) => getTasksBySwimlaneAndColumn(swimlane.id, columnId)}
              onTaskClick={handleTaskClick}
            />
          ))}
        </DragDropContext>

        {/* 空状态 */}
        {tasks.length === 0 && !isLoading && (
          <div className="flex h-64 flex-col items-center justify-center text-[#5E6C84]">
            <div className="mb-4 rounded-full bg-[#DFE1E6] p-4">
              <RefreshCw className="h-8 w-8" />
            </div>
            <p className="mb-2 text-lg font-medium text-[#172B4D]">暂无任务</p>
            <p className="text-sm">点击"全量同步"从 Jira 获取任务</p>
          </div>
        )}

        {/* 加载状态 */}
        {isLoading && tasks.length === 0 && (
          <div className="flex h-64 items-center justify-center">
            <div className="flex items-center gap-3 text-[#5E6C84]">
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span>正在加载任务...</span>
            </div>
          </div>
        )}
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
