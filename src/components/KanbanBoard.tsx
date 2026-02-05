import { useEffect, useState } from 'react';

interface Task {
  key: string;
  summary: string;
  status: string;
  mapped_column?: string;
  priority?: string;
  assignee_name?: string;
}

interface Column {
  id: string;
  name: string;
  tasks: Task[];
}

const DEFAULT_COLUMNS: Column[] = [
  { id: 'todo', name: '待办', tasks: [] },
  { id: 'execution', name: '执行中', tasks: [] },
  { id: 'review', name: '审核中', tasks: [] },
  { id: 'done', name: '已完成', tasks: [] },
];

export function KanbanBoard() {
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const result = await window.electronAPI.database.tasks.getAll();
      if (result.success && result.data) {
        // 将任务按列分组
        const tasksByColumn: Record<string, Task[]> = {
          todo: [],
          execution: [],
          review: [],
          done: [],
        };

        (result.data as unknown as Task[]).forEach((task) => {
          const columnId = task.mapped_column || 'todo';
          if (!tasksByColumn[columnId]) {
            tasksByColumn[columnId] = [];
          }
          tasksByColumn[columnId].push(task);
        });

        setColumns((prev) =>
          prev.map((col) => ({
            ...col,
            tasks: tasksByColumn[col.id] || [],
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.jira.fullSync();
      if (result.success) {
        await loadTasks();
      } else {
        console.error('Sync failed:', result.error);
        alert(`同步失败: ${result.error}`);
      }
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority?.toLowerCase()) {
      case 'highest':
      case 'high':
        return 'bg-red-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'low':
      case 'lowest':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-100">任务看板</h2>
        <button
          onClick={handleSync}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              同步中...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              同步 Jira
            </>
          )}
        </button>
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto">
        {columns.map((column) => (
          <div
            key={column.id}
            className="flex w-80 min-w-[320px] flex-col rounded-lg border border-gray-800 bg-gray-800/50"
          >
            <div className="flex items-center justify-between border-b border-gray-700 p-3">
              <h3 className="font-medium text-gray-200">{column.name}</h3>
              <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-400">
                {column.tasks.length}
              </span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {column.tasks.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-gray-500">
                  暂无任务
                </div>
              ) : (
                column.tasks.map((task) => (
                  <div
                    key={task.key}
                    className="group cursor-pointer rounded-md border border-gray-700 bg-gray-800 p-3 transition-colors hover:border-gray-600"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${getPriorityColor(task.priority)}`} />
                        <span className="text-xs font-medium text-blue-400">{task.key}</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-200 line-clamp-2">{task.summary}</p>
                    {task.assignee_name && (
                      <div className="mt-2 flex items-center gap-1">
                        <div className="h-5 w-5 rounded-full bg-gray-600 text-center text-xs leading-5 text-gray-300">
                          {task.assignee_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs text-gray-500">{task.assignee_name}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
