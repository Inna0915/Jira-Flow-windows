import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, FileText, Loader2 } from 'lucide-react';
import { CalendarSidebar } from '../components/CalendarSidebar';
import { ReportViewerDialog } from '../components/ReportViewerDialog';
import { toast } from 'sonner';

// View mode type
type ViewMode = 'day' | 'week' | 'month' | 'quarter' | 'year';

interface LogEntry {
  id: number;
  task_key: string;
  source: 'JIRA' | 'LOCAL' | 'MANUAL';
  summary: string;
  log_date: string;
  created_at: number;
}

interface PendingTask {
  key: string;
  summary: string;
  status: string;
  mapped_column: string;
  due_date: string;
  priority: string;
  source: string;
  assignee_name?: string;
}

// Format date as YYYY-MM-DD (local time)
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get start of week (Monday)
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// Get end of week (Sunday)
function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  return new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
}

// Get quarter
function getQuarter(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

// Calculate date range
function calculateDateRange(mode: ViewMode, date: Date): { start: Date; end: Date } {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  switch (mode) {
    case 'day':
      return { start: date, end: date };
    case 'week': {
      return { start: getWeekStart(date), end: getWeekEnd(date) };
    }
    case 'month': {
      return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0) };
    }
    case 'quarter': {
      const quarter = getQuarter(date);
      return { start: new Date(year, (quarter - 1) * 3, 1), end: new Date(year, quarter * 3, 0) };
    }
    case 'year': {
      return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
    }
  }
}

export function Reports() {
  // Core state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Report viewer state
  const [reportViewerMode, setReportViewerMode] = useState<'weekly' | 'monthly' | 'quarterly' | 'yearly'>('weekly');
  const [reportViewerOpen, setReportViewerOpen] = useState(false);
  
  // Task status for calendar dots
  const [dayTaskStatus, setDayTaskStatus] = useState<Record<string, boolean>>({});
  const [weekTaskStatus, setWeekTaskStatus] = useState<Record<string, boolean>>({});

  // Calculate current date range
  const dateRange = useMemo(() => calculateDateRange(viewMode, currentDate), [viewMode, currentDate]);

  // Load logs when date/view changes
  useEffect(() => {
    loadLogs();
  }, [currentDate, viewMode]);

  // Load task status for calendar
  useEffect(() => {
    console.log('[Reports] Effect triggered - loading task status', { currentDate: formatDate(currentDate), viewMode });
    loadTaskStatus();
  }, [currentDate, viewMode]);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      // 加载已完成的工作日志
      const logsResult = await window.electronAPI.workLogs.getLogs(
        formatDate(dateRange.start),
        formatDate(dateRange.end)
      );
      if (logsResult.success && logsResult.data) {
        setLogs(logsResult.data);
      }
      
      // 加载预计完成的任务（截止日在当前时间范围内且未完成）
      const pendingResult = await window.electronAPI.task.getPendingByDueDate(
        formatDate(dateRange.start),
        formatDate(dateRange.end)
      );
      if (pendingResult.success && pendingResult.data) {
        setPendingTasks(pendingResult.data);
      }
    } catch (error) {
      console.error('[Reports] Failed to load logs:', error);
      toast.error('加载日志失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 将 YYYY-MM-DD 字符串解析为本地日期（避免时区问题）
  const parseLocalDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // 使用 ref 防止并发请求覆盖状态
  const loadingRef = useRef(false);
  
  const loadTaskStatus = async () => {
    if (loadingRef.current) {
      console.log('[Reports] loadTaskStatus already running, skipping');
      return;
    }
    
    loadingRef.current = true;
    const callId = Date.now();
    console.log(`[Reports] [${callId}] loadTaskStatus starting`);
    
    try {
      const year = currentDate.getFullYear();
      
      const dayStatus: Record<string, boolean> = {};
      const weekStatus: Record<string, boolean> = {};
      
      // 1. Load work logs for day/week markers
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31);
      
      const result = await window.electronAPI.workLogs.getLogs(
        formatDate(yearStart),
        formatDate(yearEnd)
      );
      
      if (result.success && result.data) {
        result.data.forEach((log: LogEntry) => {
          if (log.log_date) {
            dayStatus[log.log_date] = true;
            const logDate = parseLocalDate(log.log_date);
            const weekStart = getWeekStart(logDate);
            const weekKey = `${year}-W${getWeekNumber(weekStart)}`;
            weekStatus[weekKey] = true;
          }
        });
      }
      
      console.log(`[Reports] [${callId}] After logs:`, { ...weekStatus });
      
      // 2. Load weekly reports to mark weeks with saved reports
      try {
        const weeklyReportsResult = await window.electronAPI.report.getByTypeAndRange({
          type: 'weekly',
          startDate: formatDate(yearStart),
          endDate: formatDate(yearEnd)
        });
        
        console.log(`[Reports] [${callId}] Weekly reports result:`, weeklyReportsResult.success, (weeklyReportsResult as any).data?.length);
        
        if (weeklyReportsResult.success && weeklyReportsResult.data) {
          weeklyReportsResult.data.forEach((report: any) => {
            if (report.content && report.start_date) {
              const reportStart = parseLocalDate(report.start_date);
              const weekKey = `${year}-W${getWeekNumber(reportStart)}`;
              console.log(`[Reports] [${callId}] Marking week ${weekKey}`);
              weekStatus[weekKey] = true;
            }
          });
        }
      } catch (e) {
        console.error(`[Reports] [${callId}] Error loading weekly reports:`, e);
      }
      
      console.log(`[Reports] [${callId}] Final weekStatus:`, weekStatus);
      setDayTaskStatus(dayStatus);
      setWeekTaskStatus(weekStatus);
    } catch (error) {
      console.error(`[Reports] [${callId}] Failed to load task status:`, error);
    } finally {
      loadingRef.current = false;
      console.log(`[Reports] [${callId}] loadTaskStatus completed`);
    }
  };

  const getWeekNumber = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  // Selection handlers (silent - no toast)
  const handleSelectDate = useCallback((date: Date) => {
    setCurrentDate(date);
    setViewMode('day');
  }, []);

  const handleSelectWeek = useCallback((weekStart: Date, _weekEnd: Date) => {
    setCurrentDate(weekStart);
    setViewMode('week');
  }, []);

  const handleSelectMonth = useCallback((monthStart: Date, _monthEnd: Date) => {
    setCurrentDate(monthStart);
    setViewMode('month');
  }, []);

  const handleSelectQuarter = useCallback((quarterStart: Date, _quarterEnd: Date) => {
    setCurrentDate(quarterStart);
    setViewMode('quarter');
  }, []);

  const handleSelectYear = useCallback((yearStart: Date, _yearEnd: Date) => {
    setCurrentDate(yearStart);
    setViewMode('year');
  }, []);

  const handleViewReport = (mode: 'weekly' | 'monthly' | 'quarterly' | 'yearly') => {
    setReportViewerMode(mode);
    setReportViewerOpen(true);
  };

  // Refresh task status when report dialog closes
  const handleReportDialogClose = () => {
    setReportViewerOpen(false);
    loadTaskStatus(); // 重新加载周标记状态
  };

  const getPeriodLabel = () => {
    switch (viewMode) {
      case 'day':
        return `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月${currentDate.getDate()}日`;
      case 'week':
        return `${currentDate.getFullYear()}年第${getWeekNumber(dateRange.start)}周`;
      case 'month':
        return `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;
      case 'quarter':
        return `${currentDate.getFullYear()}年第${getQuarter(currentDate)}季度`;
      case 'year':
        return `${currentDate.getFullYear()}年度`;
    }
  };

  return (
    <div className="h-full flex bg-[#FAFBFC]">
      {/* Calendar Sidebar */}
      <CalendarSidebar
        selectedDate={currentDate}
        onSelectDate={handleSelectDate}
        onSelectWeek={handleSelectWeek}
        onSelectMonth={handleSelectMonth}
        onSelectQuarter={handleSelectQuarter}
        onSelectYear={handleSelectYear}
        weekTaskStatus={weekTaskStatus}
        dayTaskStatus={dayTaskStatus}
      />

      {/* Main Content - Only Log List */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#EBECF0] bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-[#172B4D]">
                {getPeriodLabel()}
              </h1>
              <span className="px-2.5 py-1 bg-[#F4F5F7] text-[#6B778C] text-xs rounded-full">
                {viewMode === 'day' && '日视图'}
                {viewMode === 'week' && '周视图'}
                {viewMode === 'month' && '月视图'}
                {viewMode === 'quarter' && '季度视图'}
                {viewMode === 'year' && '年视图'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* View Report Buttons */}
              <div className="flex items-center gap-2 mr-4">
                <button
                  onClick={() => handleViewReport('weekly')}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#0052CC] hover:bg-[#DEEBFF] rounded-lg transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  查看周报
                </button>
                <button
                  onClick={() => handleViewReport('monthly')}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#0052CC] hover:bg-[#DEEBFF] rounded-lg transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  查看月报
                </button>
                <button
                  onClick={() => handleViewReport('quarterly')}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#0052CC] hover:bg-[#DEEBFF] rounded-lg transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  查看季报
                </button>
                <button
                  onClick={() => handleViewReport('yearly')}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#0052CC] hover:bg-[#DEEBFF] rounded-lg transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  查看年报
                </button>
              </div>

              <button
                onClick={loadLogs}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#6B778C] hover:bg-[#F4F5F7] rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                刷新
              </button>
            </div>
          </div>
        </div>

        {/* Content - Pending Tasks & Log List */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Pending Tasks Section */}
            <div>
              <h2 className="text-lg font-medium text-[#172B4D] mb-4">
                预计完成任务 ({pendingTasks.length})
                <span className="ml-2 text-sm font-normal text-[#6B778C]">截止日在{getPeriodLabel()}内</span>
              </h2>

              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-[#6B778C]">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  加载中...
                </div>
              ) : pendingTasks.length === 0 ? (
                <div className="text-center py-8 text-[#6B778C] bg-white rounded-lg border border-[#EBECF0]">
                  <p>暂无预计完成的任务</p>
                  <p className="text-sm mt-1">当前时间范围内没有截止的待完成任务</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingTasks.map((task) => (
                    <div
                      key={task.key}
                      className="p-4 bg-white rounded-lg border border-[#EBECF0] hover:border-[#0052CC] transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-[#FFAB00]/10 text-[#FFAB00] text-xs rounded font-medium">
                              截止: {task.due_date}
                            </span>
                            <span className="text-xs text-[#6B778C] font-mono">
                              {task.key}
                            </span>
                            <span className={`px-1.5 py-0.5 text-xs rounded ${
                              task.source === 'JIRA' 
                                ? 'bg-[#E3FCEF] text-[#36B37E]' 
                                : 'bg-[#DEEBFF] text-[#0052CC]'
                            }`}>
                              {task.source === 'JIRA' ? 'Jira' : '个人'}
                            </span>
                            <span className="px-1.5 py-0.5 text-xs rounded bg-[#F4F5F7] text-[#6B778C]">
                              {task.mapped_column || task.status}
                            </span>
                          </div>
                          <p className="text-sm text-[#172B4D]">{task.summary}</p>
                          {task.assignee_name && (
                            <p className="text-xs text-[#6B778C] mt-1">
                              负责人: {task.assignee_name}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-[#EBECF0] pt-6">
              <h2 className="text-lg font-medium text-[#172B4D] mb-4">
                已完成工作 ({logs.length})
              </h2>

              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-[#6B778C]">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  加载中...
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-12 text-[#6B778C] bg-white rounded-lg border border-[#EBECF0]">
                  <p>暂无工作日志</p>
                  <p className="text-sm mt-1">在指定时间范围内没有找到记录</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-4 bg-white rounded-lg border border-[#EBECF0] hover:border-[#0052CC] transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-[#36B37E]/10 text-[#36B37E] text-xs rounded font-medium">
                              {log.log_date} [EXECUTED 执行完成]
                            </span>
                            {log.task_key && (
                              <span className="text-xs text-[#6B778C] font-mono">
                                {log.task_key}
                              </span>
                            )}
                            <span className={`px-1.5 py-0.5 text-xs rounded ${
                              log.source === 'JIRA' 
                                ? 'bg-[#E3FCEF] text-[#36B37E]' 
                                : 'bg-[#F4F5F7] text-[#6B778C]'
                            }`}>
                              {log.source === 'JIRA' ? 'Jira' : '手动'}
                            </span>
                          </div>
                          <p className="text-sm text-[#172B4D]">{log.summary}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Report Viewer Dialog */}
      <ReportViewerDialog
        isOpen={reportViewerOpen}
        onClose={handleReportDialogClose}
        mode={reportViewerMode}
        currentDate={currentDate}
      />
    </div>
  );
}
