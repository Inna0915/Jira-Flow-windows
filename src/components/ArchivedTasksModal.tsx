import { useState, useEffect, useMemo } from 'react';
import { X, Archive, Search, Calendar, ArrowUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface ArchivedTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestore?: (taskKey: string) => void;
}

interface ArchivedTask {
  key: string;
  summary: string;
  priority: string;
  due_date: string;
  updated_at: string;
  description?: string;
}

export function ArchivedTasksModal({ isOpen, onClose, onRestore }: ArchivedTasksModalProps) {
  const [tasks, setTasks] = useState<ArchivedTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dueDateFilter, setDueDateFilter] = useState('');
  const [updateDateFilter, setUpdateDateFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<'updated_at' | 'due_date'>('updated_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const pageSize = 30;

  const loadArchivedTasks = async () => {
    setIsLoading(true);
    try {
      // 获取所有本地任务，然后过滤出已归档的
      const result = await window.electronAPI.task.getBySource('LOCAL');
      if (result.success && result.data) {
        const archived = result.data.filter(
          (t: any) => t.status === 'ARCHIVED' || t.mapped_column === 'ARCHIVED'
        );
        setTasks(archived);
      }
    } catch (err) {
      console.error('Failed to load archived tasks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadArchivedTasks();
    }
  }, [isOpen]);

  // 过滤和排序
  const filteredTasks = useMemo(() => {
    let result = [...tasks];

    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        t =>
          t.summary.toLowerCase().includes(query) ||
          t.key.toLowerCase().includes(query) ||
          (t.description && t.description.toLowerCase().includes(query))
      );
    }

    // 截止日期过滤
    if (dueDateFilter) {
      result = result.filter(t => t.due_date === dueDateFilter);
    }

    // 更新日期过滤
    if (updateDateFilter) {
      result = result.filter(t => {
        if (!t.updated_at) return false;
        const updateDate = t.updated_at.split('T')[0];
        return updateDate === updateDateFilter;
      });
    }

    // 排序
    result.sort((a, b) => {
      const aVal = sortBy === 'updated_at' ? a.updated_at : a.due_date;
      const bVal = sortBy === 'updated_at' ? b.updated_at : b.due_date;
      if (sortOrder === 'desc') {
        return bVal.localeCompare(aVal);
      }
      return aVal.localeCompare(bVal);
    });

    return result;
  }, [tasks, searchQuery, dueDateFilter, updateDateFilter, sortBy, sortOrder]);

  // 分页
  const totalPages = Math.ceil(filteredTasks.length / pageSize);
  const paginatedTasks = filteredTasks.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-700';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700';
      case 'low':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-[900px] max-w-[95vw] h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Archive className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">已归档任务</h2>
              <p className="text-sm text-gray-500">共 {filteredTasks.length} 个已归档任务</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 查询工具栏 */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 space-y-3">
          <div className="flex gap-3">
            {/* 搜索框 */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索任务标题、Key 或描述..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            {/* 截止日期过滤 */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={dueDateFilter}
                onChange={(e) => {
                  setDueDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              {dueDateFilter && (
                <button
                  onClick={() => setDueDateFilter('')}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  清除
                </button>
              )}
            </div>
            {/* 更新日期过滤 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">更新于</span>
              <input
                type="date"
                value={updateDateFilter}
                onChange={(e) => {
                  setUpdateDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              {updateDateFilter && (
                <button
                  onClick={() => setUpdateDateFilter('')}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  清除
                </button>
              )}
            </div>
          </div>
          {/* 排序选项 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">排序：</span>
            <button
              onClick={() => {
                if (sortBy === 'updated_at') {
                  setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                } else {
                  setSortBy('updated_at');
                  setSortOrder('desc');
                }
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                sortBy === 'updated_at'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              更新日期
              {sortBy === 'updated_at' && (
                <ArrowUpDown className={`w-3 h-3 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
              )}
            </button>
            <button
              onClick={() => {
                if (sortBy === 'due_date') {
                  setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                } else {
                  setSortBy('due_date');
                  setSortOrder('desc');
                }
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                sortBy === 'due_date'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              截止日期
              {sortBy === 'due_date' && (
                <ArrowUpDown className={`w-3 h-3 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
              )}
            </button>
          </div>
        </div>

        {/* 任务列表 */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : paginatedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Archive className="w-16 h-16 mb-4 opacity-30" />
              <p>暂无已归档任务</p>
            </div>
          ) : (
            <div className="space-y-2">
              {paginatedTasks.map((task) => (
                <div
                  key={task.key}
                  className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-500">{task.key}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(
                          task.priority
                        )}`}
                      >
                        {task.priority || 'Medium'}
                      </span>
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 truncate">{task.summary}</h3>
                    {task.description && (
                      <p className="text-xs text-gray-500 mt-1 truncate">{task.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      {task.due_date && (
                        <span>截止: {task.due_date}</span>
                      )}
                      <span>
                        更新: {task.updated_at
                          ? format(new Date(task.updated_at), 'yyyy-MM-dd HH:mm', { locale: zhCN })
                          : '-'}
                      </span>
                    </div>
                  </div>
                  {onRestore && (
                    <button
                      onClick={() => onRestore(task.key)}
                      className="ml-4 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      恢复
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
            <span className="text-sm text-gray-500">
              第 {currentPage} / {totalPages} 页，共 {filteredTasks.length} 条
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
