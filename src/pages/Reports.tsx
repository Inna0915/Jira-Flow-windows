import { useState, useEffect, useCallback } from 'react';
import { Calendar, Plus, Trash2, FileText, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

/**
 * 工作日志条目类型
 */
interface WorkLog {
  id: number;
  task_key: string;
  source: 'JIRA' | 'MANUAL';
  summary: string;
  log_date: string;
  created_at: number;
}

/**
 * 工作日志报告页面
 * 
 * 功能：
 * 1. 显示日期范围内的日志列表
 * 2. 支持添加手动记录（非 Jira 任务）
 * 3. 删除日志条目
 */
export function Reports() {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [manualContent, setManualContent] = useState('');
  
  // 默认显示本周
  const today = new Date();
  const [startDate, setStartDate] = useState(() => {
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);
    return monday.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => today.toISOString().split('T')[0]);

  /**
   * 加载日志数据
   */
  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.database.workLogs.getLogs(startDate, endDate);
      if (result.success) {
        setLogs(result.data || []);
      } else {
        toast.error('加载日志失败');
      }
    } catch (error) {
      console.error('[Reports] Failed to load logs:', error);
      toast.error('加载日志失败');
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate]);

  // 初始加载和日期变化时刷新
  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  /**
   * 添加手动记录
   */
  const handleAddManual = async () => {
    if (!manualContent.trim()) {
      toast.error('请输入内容');
      return;
    }

    try {
      const result = await window.electronAPI.database.workLogs.logManual({
        summary: manualContent.trim(),
        log_date: today.toISOString().split('T')[0],
      });

      if (result.success) {
        toast.success('Manual task added');
        setManualContent('');
        await loadLogs();
      } else {
        toast.error('添加失败');
      }
    } catch (error) {
      console.error('[Reports] Failed to add manual log:', error);
      toast.error('添加失败');
    }
  };

  /**
   * 删除日志（无确认对话框）
   */
  const handleDelete = async (id: number) => {
    try {
      const result = await window.electronAPI.database.query(
        'DELETE FROM t_work_logs WHERE id = ?',
        [id]
      );
      
      if (result.success) {
        toast.success('Log deleted');
        await loadLogs();
      } else {
        toast.error('删除失败');
      }
    } catch (error) {
      console.error('[Reports] Failed to delete log:', error);
      toast.error('删除失败');
    }
  };

  /**
   * 格式化日期显示
   */
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    });
  };

  /**
   * 按日期分组日志
   */
  const groupedLogs = logs.reduce((acc, log) => {
    if (!acc[log.log_date]) {
      acc[log.log_date] = [];
    }
    acc[log.log_date].push(log);
    return acc;
  }, {} as Record<string, WorkLog[]>);

  // 按日期降序排列
  const sortedDates = Object.keys(groupedLogs).sort().reverse();

  return (
    <div className="flex h-full flex-col bg-[#F4F5F7]">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between border-b border-[#DFE1E6] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-[#0052CC]" />
          <h1 className="text-lg font-semibold text-[#172B4D]">Daily Work Log</h1>
        </div>
        
        <button
          onClick={loadLogs}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded border border-[#DFE1E6] bg-white px-3 py-1.5 text-xs font-medium text-[#172B4D] hover:bg-[#F4F5F7] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-6">
        {/* 日期选择器 */}
        <div className="mb-6 flex items-center gap-4 rounded-lg bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#5E6C84]" />
            <span className="text-sm text-[#5E6C84]">日期范围:</span>
          </div>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-[#DFE1E6] bg-white px-3 py-1.5 text-sm text-[#172B4D] focus:border-[#4C9AFF] focus:outline-none focus:ring-1 focus:ring-[#4C9AFF]"
          />
          <span className="text-[#5E6C84]">至</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-[#DFE1E6] bg-white px-3 py-1.5 text-sm text-[#172B4D] focus:border-[#4C9AFF] focus:outline-none focus:ring-1 focus:ring-[#4C9AFF]"
          />
        </div>

        {/* 添加手动记录 */}
        <div className="mb-6 rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-[#172B4D]">Add non-Jira task...</h2>
          <div className="flex gap-3">
            {/* Shadcn Input 风格 */}
            <input
              type="text"
              value={manualContent}
              onChange={(e) => setManualContent(e.target.value)}
              placeholder="输入非 Jira 任务内容..."
              className="flex-1 rounded-md border border-[#DFE1E6] bg-white px-3 py-2 text-sm text-[#172B4D] placeholder:text-[#C1C7D0] focus:border-[#4C9AFF] focus:outline-none focus:ring-1 focus:ring-[#4C9AFF] disabled:cursor-not-allowed disabled:opacity-50"
              onKeyDown={(e) => e.key === 'Enter' && handleAddManual()}
            />
            <button
              onClick={handleAddManual}
              disabled={!manualContent.trim()}
              className="flex items-center gap-1.5 rounded bg-[#0052CC] px-4 py-2 text-sm font-medium text-white hover:bg-[#0747A6] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              添加
            </button>
          </div>
        </div>

        {/* 日志列表 */}
        <div className="space-y-4">
          {sortedDates.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg bg-white py-16 text-[#5E6C84]">
              <FileText className="mb-3 h-12 w-12 text-[#C1C7D0]" />
              <p className="text-sm">暂无工作日志</p>
              <p className="mt-1 text-xs text-[#8993A4]">
                拖拽 Jira 任务到完成状态，或手动添加记录
              </p>
            </div>
          ) : (
            sortedDates.map((date) => (
              <div key={date} className="rounded-lg bg-white shadow-sm">
                {/* 日期标题 */}
                <div className="border-b border-[#DFE1E6] bg-[#F4F5F7] px-4 py-2">
                  <span className="text-sm font-medium text-[#172B4D]">
                    {formatDate(date)}
                  </span>
                  <span className="ml-2 text-xs text-[#5E6C84]">
                    ({groupedLogs[date].length} 条记录)
                  </span>
                </div>

                {/* 当天的日志条目 */}
                <div className="divide-y divide-[#DFE1E6]">
                  {groupedLogs[date].map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between px-4 py-3 hover:bg-[#F4F5F7]"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* 来源标签 */}
                        <span
                          className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${
                            log.source === 'JIRA'
                              ? 'bg-[#E3FCEF] text-[#006644]'
                              : 'bg-[#EAE6FF] text-[#403294]'
                          }`}
                        >
                          {log.source}
                        </span>

                        {/* Jira 任务：显示 Key (蓝色链接风格) + Summary */}
                        {log.source === 'JIRA' && (
                          <>
                            <span className="shrink-0 text-xs font-medium text-[#0052CC]">
                              {log.task_key}
                            </span>
                            <span className="truncate text-sm text-[#172B4D]">{log.summary}</span>
                          </>
                        )}

                        {/* Manual 任务：只显示 Content */}
                        {log.source === 'MANUAL' && (
                          <span className="truncate text-sm text-[#172B4D]">{log.summary}</span>
                        )}
                      </div>

                      {/* 删除按钮 */}
                      <button
                        onClick={() => handleDelete(log.id)}
                        className="ml-2 shrink-0 rounded p-1.5 text-[#5E6C84] hover:bg-[#FFEBE6] hover:text-[#DE350B]"
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 统计信息 */}
        {logs.length > 0 && (
          <div className="mt-6 flex items-center justify-between rounded-lg bg-white p-4 shadow-sm text-sm text-[#5E6C84]">
            <span>
              总计: <strong className="text-[#172B4D]">{logs.length}</strong> 条记录
            </span>
            <span>
              Jira: <strong className="text-[#006644]">
                {logs.filter(l => l.source === 'JIRA').length}
              </strong>
              {' / '}
              Manual: <strong className="text-[#403294]">
                {logs.filter(l => l.source === 'MANUAL').length}
              </strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default Reports;
