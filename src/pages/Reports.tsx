import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, Plus, Trash2, FileText, RefreshCw, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  isSameDay,
  parseISO,
} from 'date-fns';

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

type DateRangePreset = 'today' | 'thisWeek' | 'lastWeek' | 'thisMonth';

/**
 * 工作日志报告页面 - TimeSheet Dashboard
 * 
 * 功能：
 * 1. 日期范围选择（Today / This Week / Last Week / This Month）
 * 2. 按日期分组显示日志
 * 3. 复制文本摘要
 * 4. 添加/删除手动记录
 */
export function Reports() {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [manualContent, setManualContent] = useState('');
  const [copied, setCopied] = useState(false);
  
  // 日期范围状态
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [activePreset, setActivePreset] = useState<DateRangePreset>('thisWeek');

  // 初始化默认范围（本周）
  useEffect(() => {
    applyPreset('thisWeek');
  }, []);

  /**
   * 应用日期范围预设
   */
  const applyPreset = (preset: DateRangePreset) => {
    const today = new Date();
    let start: Date;
    let end: Date;

    switch (preset) {
      case 'today':
        start = today;
        end = today;
        break;
      case 'thisWeek':
        start = startOfWeek(today, { weekStartsOn: 1 }); // 周一开始
        end = endOfWeek(today, { weekStartsOn: 1 });
        break;
      case 'lastWeek':
        const lastWeek = subWeeks(today, 1);
        start = startOfWeek(lastWeek, { weekStartsOn: 1 });
        end = endOfWeek(lastWeek, { weekStartsOn: 1 });
        break;
      case 'thisMonth':
        start = startOfMonth(today);
        end = endOfMonth(today);
        break;
      default:
        return;
    }

    setActivePreset(preset);
    setStartDate(format(start, 'yyyy-MM-dd'));
    setEndDate(format(end, 'yyyy-MM-dd'));
  };

  /**
   * 获取预设按钮文本
   */
  const getPresetLabel = (preset: DateRangePreset): string => {
    const labels: Record<DateRangePreset, string> = {
      today: 'Today',
      thisWeek: 'This Week',
      lastWeek: 'Last Week',
      thisMonth: 'This Month',
    };
    return labels[preset];
  };

  /**
   * 加载日志数据
   */
  const loadLogs = useCallback(async () => {
    if (!startDate || !endDate) return;
    
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

  // 日期变化时刷新
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
      const today = format(new Date(), 'yyyy-MM-dd');
      const result = await window.electronAPI.database.workLogs.logManual({
        summary: manualContent.trim(),
        log_date: today,
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
   * 删除日志
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
   * 生成并复制文本摘要
   */
  const handleCopySummary = async () => {
    if (logs.length === 0) {
      toast.error('没有可复制的日志');
      return;
    }

    // 按日期分组
    const grouped = logs.reduce((acc, log) => {
      if (!acc[log.log_date]) {
        acc[log.log_date] = [];
      }
      acc[log.log_date].push(log);
      return acc;
    }, {} as Record<string, WorkLog[]>);

    // 生成文本
    const sortedDates = Object.keys(grouped).sort();
    const lines: string[] = [
      `Work Report (${format(parseISO(startDate), 'MMM dd')} - ${format(parseISO(endDate), 'MMM dd, yyyy')}):`,
      '',
    ];

    sortedDates.forEach((date) => {
      lines.push(`${date}:`);
      grouped[date].forEach((log) => {
        const prefix = log.source === 'JIRA' ? `[${log.task_key}]` : '[MANUAL]';
        lines.push(`- [${log.source}] ${prefix} ${log.summary}`);
      });
      lines.push('');
    });

    const text = lines.join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Report copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('复制失败');
    }
  };

  /**
   * 格式化日期显示（如：Friday, Feb 06）
   */
  const formatDateHeader = (dateStr: string): string => {
    const date = parseISO(dateStr);
    return format(date, 'EEEE, MMM dd');
  };

  /**
   * 按日期分组日志
   */
  const groupedLogs = useMemo(() => {
    return logs.reduce((acc, log) => {
      if (!acc[log.log_date]) {
        acc[log.log_date] = [];
      }
      acc[log.log_date].push(log);
      return acc;
    }, {} as Record<string, WorkLog[]>);
  }, [logs]);

  // 按日期降序排列
  const sortedDates = Object.keys(groupedLogs).sort().reverse();

  // 检查是否是今天
  const isToday = (dateStr: string): boolean => {
    return isSameDay(parseISO(dateStr), new Date());
  };

  return (
    <div className="flex h-full flex-col bg-[#F4F5F7]">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between border-b border-[#DFE1E6] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-[#0052CC]" />
          <h1 className="text-lg font-semibold text-[#172B4D]">Work Report</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopySummary}
            disabled={logs.length === 0 || copied}
            className="flex items-center gap-1.5 rounded bg-[#0052CC] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0747A6] disabled:opacity-50"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? 'Copied' : 'Copy Text Summary'}
          </button>
          
          <button
            onClick={loadLogs}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded border border-[#DFE1E6] bg-white px-3 py-1.5 text-xs font-medium text-[#172B4D] hover:bg-[#F4F5F7] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-6">
        {/* 日期范围控制面板 */}
        <div className="mb-6 rounded-lg bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4">
            {/* 预设按钮 */}
            <div className="flex items-center gap-2">
              {(['today', 'thisWeek', 'lastWeek', 'thisMonth'] as DateRangePreset[]).map((preset) => (
                <button
                  key={preset}
                  onClick={() => applyPreset(preset)}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    activePreset === preset
                      ? 'bg-[#0052CC] text-white'
                      : 'bg-[#F4F5F7] text-[#172B4D] hover:bg-[#EBECF0]'
                  }`}
                >
                  {getPresetLabel(preset)}
                </button>
              ))}
            </div>
            
            {/* 日期显示和自定义选择 */}
            <div className="flex items-center justify-between border-t border-[#DFE1E6] pt-3">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-[#5E6C84]" />
                <span className="font-medium text-[#172B4D]">
                  {format(parseISO(startDate || new Date().toISOString()), 'MMM dd')} - {format(parseISO(endDate || new Date().toISOString()), 'MMM dd, yyyy')}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setActivePreset('' as DateRangePreset);
                  }}
                  className="rounded-md border border-[#DFE1E6] bg-white px-2 py-1 text-xs text-[#172B4D] focus:border-[#4C9AFF] focus:outline-none"
                />
                <span className="text-[#5E6C84]">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setActivePreset('' as DateRangePreset);
                  }}
                  className="rounded-md border border-[#DFE1E6] bg-white px-2 py-1 text-xs text-[#172B4D] focus:border-[#4C9AFF] focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 添加手动记录 */}
        <div className="mb-6 rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-[#172B4D]">Add non-Jira task</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={manualContent}
              onChange={(e) => setManualContent(e.target.value)}
              placeholder="输入非 Jira 任务内容..."
              className="flex-1 rounded-md border border-[#DFE1E6] bg-white px-3 py-2 text-sm text-[#172B4D] placeholder:text-[#C1C7D0] focus:border-[#4C9AFF] focus:outline-none focus:ring-1 focus:ring-[#4C9AFF]"
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

        {/* 日志列表 - 按日期分组 */}
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
              <div key={date} className="rounded-lg bg-white shadow-sm overflow-hidden">
                {/* 日期标题 */}
                <div className="border-b border-[#DFE1E6] bg-[#F4F5F7] px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#172B4D]">
                      {formatDateHeader(date)}
                    </span>
                    {isToday(date) && (
                      <span className="rounded bg-[#0052CC] px-2 py-0.5 text-[10px] font-bold text-white">
                        TODAY
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[#5E6C84]">
                    {groupedLogs[date].length} entries
                  </span>
                </div>

                {/* 当天的日志条目 */}
                <div className="divide-y divide-[#DFE1E6]">
                  {groupedLogs[date].map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between px-4 py-3 hover:bg-[#FAFBFC] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* 来源标签 - JIRA蓝色，MANUAL灰色 */}
                        <span
                          className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold ${
                            log.source === 'JIRA'
                              ? 'bg-[#0052CC] text-white'
                              : 'bg-[#5E6C84] text-white'
                          }`}
                        >
                          {log.source}
                        </span>

                        {/* 任务内容 */}
                        <span className="truncate text-sm text-[#172B4D]">
                          {log.source === 'JIRA' ? `[${log.task_key}] ${log.summary}` : log.summary}
                        </span>
                      </div>

                      {/* 删除按钮 */}
                      <button
                        onClick={() => handleDelete(log.id)}
                        className="ml-2 shrink-0 rounded p-1.5 text-[#5E6C84] hover:bg-[#FFEBE6] hover:text-[#DE350B] transition-colors"
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
          <div className="mt-6 flex items-center justify-between rounded-lg bg-white p-4 shadow-sm text-sm">
            <span className="text-[#5E6C84]">
              Total: <strong className="text-[#172B4D]">{logs.length}</strong> entries
            </span>
            <div className="flex items-center gap-4">
              <span className="text-[#5E6C84]">
                <span className="inline-block w-2 h-2 rounded-full bg-[#0052CC] mr-1"></span>
                Jira: <strong className="text-[#172B4D]">
                  {logs.filter(l => l.source === 'JIRA').length}
                </strong>
              </span>
              <span className="text-[#5E6C84]">
                <span className="inline-block w-2 h-2 rounded-full bg-[#5E6C84] mr-1"></span>
                Manual: <strong className="text-[#172B4D]">
                  {logs.filter(l => l.source === 'MANUAL').length}
                </strong>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Reports;
