import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Plus, Trash2, FileText, RefreshCw, Copy, Check, 
  Sparkles, Calendar as CalendarIcon, Bot, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  parseISO,
} from 'date-fns';
import { Lunar } from 'lunar-javascript';
import { CalendarSidebar } from '../components/CalendarSidebar';

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

interface AIProfile {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isActive: boolean;
}

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

type ViewMode = 'day' | 'week' | 'month';

/**
 * 工作日志报告页面 - 左右分栏布局 with 农历日历
 */
export function Reports() {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [manualContent, setManualContent] = useState('');
  const [copied, setCopied] = useState(false);
  
  // 日历和视图状态
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  
  // AI 报告生成状态
  const [aiProfiles, setAiProfiles] = useState<AIProfile[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [showGenerationModal, setShowGenerationModal] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // 报告预览状态
  const [generatedReport, setGeneratedReport] = useState<string>('');
  const [showReportPreview, setShowReportPreview] = useState(false);

  // 初始化
  useEffect(() => {
    loadLogs();
    loadAIProfiles();
    loadPromptTemplates();
  }, [currentDate, viewMode]);

  // 获取农历日期字符串
  const getLunarDateString = useCallback((date: Date): string => {
    try {
      const lunar = Lunar.fromDate(date);
      return `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
    } catch {
      return '';
    }
  }, []);

  // 加载 AI Profiles
  const loadAIProfiles = async () => {
    try {
      const result = await window.electronAPI.ai.getProfiles();
      if (result.success) {
        const profiles = result.data || [];
        setAiProfiles(profiles);
        const active = profiles.find(p => p.isActive);
        if (active) {
          setSelectedProfileId(active.id);
        } else if (profiles.length > 0) {
          setSelectedProfileId(profiles[0].id);
        }
      }
    } catch (error) {
      console.error('[Reports] Failed to load AI profiles:', error);
    }
  };

  // 加载 Prompt Templates
  const loadPromptTemplates = async () => {
    try {
      const result = await window.electronAPI.ai.getTemplates();
      if (result.success) {
        const templates = result.data || [];
        setPromptTemplates(templates);
        if (templates.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(templates[0].id);
        }
      }
    } catch (error) {
      console.error('[Reports] Failed to load prompt templates:', error);
    }
  };

  /**
   * 根据当前视图模式获取日期范围
   */
  const getDateRange = useCallback(() => {
    switch (viewMode) {
      case 'day':
        return {
          start: currentDate,
          end: currentDate,
          label: format(currentDate, 'yyyy年MM月dd日')
        };
      case 'week':
        return {
          start: startOfWeek(currentDate, { weekStartsOn: 1 }),
          end: endOfWeek(currentDate, { weekStartsOn: 1 }),
          label: `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'MM/dd')} - ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'MM/dd')}`
        };
      case 'month':
        return {
          start: startOfMonth(currentDate),
          end: endOfMonth(currentDate),
          label: format(currentDate, 'yyyy年MM月')
        };
      default:
        return { start: currentDate, end: currentDate, label: '' };
    }
  }, [currentDate, viewMode]);

  /**
   * 加载日志数据
   */
  const loadLogs = useCallback(async () => {
    const { start, end } = getDateRange();
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');
    
    setIsLoading(true);
    try {
      const result = await window.electronAPI.database.workLogs.getLogs(startStr, endStr);
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
  }, [getDateRange]);

  /**
   * 添加手动记录
   */
  const handleAddManual = async () => {
    if (!manualContent.trim()) {
      toast.error('请输入内容');
      return;
    }

    try {
      const today = format(currentDate, 'yyyy-MM-dd');
      const result = await window.electronAPI.database.workLogs.logManual({
        summary: manualContent.trim(),
        log_date: today,
      });

      if (result.success) {
        toast.success('任务已添加');
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
        toast.success('已删除');
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
   * 复制文本摘要
   */
  const handleCopySummary = async () => {
    if (logs.length === 0) {
      toast.error('没有可复制的日志');
      return;
    }

    const { label } = getDateRange();
    const lines: string[] = [
      `工作报告 (${label}):`,
      '',
    ];

    logs.forEach((log) => {
      const prefix = log.source === 'JIRA' ? `[${log.task_key}]` : '[手动]';
      lines.push(`- [${log.source}] ${prefix} ${log.summary}`);
    });

    const text = lines.join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('复制失败');
    }
  };

  /**
   * 打开 AI 生成选项模态框
   */
  const handleOpenGenerationModal = () => {
    if (logs.length === 0) {
      toast.error('没有可用的工作日志');
      return;
    }
    if (aiProfiles.length === 0) {
      toast.error('请先配置 AI 模型');
      return;
    }
    if (promptTemplates.length === 0) {
      toast.error('没有可用的 Prompt Template');
      return;
    }
    setShowGenerationModal(true);
  };

  /**
   * 生成 AI 报告
   */
  const handleGenerateReport = async () => {
    if (!selectedProfileId || !selectedTemplateId) {
      toast.error('请选择 AI 模型和 Prompt Template');
      return;
    }

    const template = promptTemplates.find(t => t.id === selectedTemplateId);
    if (!template) {
      toast.error('Prompt Template 不存在');
      return;
    }

    setIsGenerating(true);
    const loadingToast = toast.loading('正在生成报告...');

    try {
      const logsForReport = logs.map(log => ({
        task_key: log.task_key,
        summary: log.summary,
        source: log.source,
        log_date: log.log_date,
      }));

      const result = await window.electronAPI.ai.generateReport(
        logsForReport,
        template.content,
        selectedProfileId
      );

      toast.dismiss(loadingToast);

      if (result.success) {
        setGeneratedReport(result.content || '');
        setShowGenerationModal(false);
        setShowReportPreview(true);
        toast.success('报告生成成功');
      } else {
        toast.error(`生成失败: ${result.error}`);
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('[Reports] Failed to generate report:', error);
      toast.error('生成报告失败');
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * 复制生成的报告
   */
  const handleCopyGeneratedReport = async () => {
    try {
      await navigator.clipboard.writeText(generatedReport);
      toast.success('报告已复制到剪贴板');
    } catch (err) {
      toast.error('复制失败');
    }
  };

  // 按日期分组日志
  const groupedLogs = useMemo(() => {
    return logs.reduce((acc, log) => {
      if (!acc[log.log_date]) {
        acc[log.log_date] = [];
      }
      acc[log.log_date].push(log);
      return acc;
    }, {} as Record<string, WorkLog[]>);
  }, [logs]);

  const sortedDates = Object.keys(groupedLogs).sort().reverse();
  const { label: dateRangeLabel } = getDateRange();
  const selectedTemplate = promptTemplates.find(t => t.id === selectedTemplateId);

  return (
    <div className="flex h-full bg-[#F4F5F7] overflow-hidden">
      {/* LEFT SIDEBAR: Calendar & Quick Filters */}
      <div className="w-[340px] min-w-[340px] bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-[#0052CC]" />
            工作日历
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          <CalendarSidebar 
            selectedDate={currentDate} 
            onSelect={(d) => { 
              setCurrentDate(d); 
              setViewMode('day'); 
            }} 
          />
        </div>
        
        {/* Quick Range Buttons */}
        <div className="p-4 border-t border-gray-100 space-y-2">
          <button
            onClick={() => setViewMode('week')}
            className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'week' 
                ? 'bg-[#0052CC] text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            查看本周
          </button>
          <button
            onClick={() => setViewMode('month')}
            className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'month' 
                ? 'bg-[#0052CC] text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            查看本月
          </button>
          <button
            onClick={() => setViewMode('day')}
            className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'day' 
                ? 'bg-[#0052CC] text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            查看当天
          </button>
        </div>
      </div>

      {/* RIGHT MAIN CONTENT: Log List & Input */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Header Toolbar */}
        <div className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">
              {dateRangeLabel}
            </h1>
            <span className="text-sm text-gray-500">
              ({getLunarDateString(currentDate)})
            </span>
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600">
              {logs.length} 条记录
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {/* AI 生成报告按钮 */}
            <button
              onClick={handleOpenGenerationModal}
              disabled={logs.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#6554C0] to-[#8777D9] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Sparkles className="h-4 w-4" />
              AI 生成报告
            </button>

            <button
              onClick={handleCopySummary}
              disabled={logs.length === 0 || copied}
              className="flex items-center gap-1.5 rounded-lg bg-[#0052CC] px-4 py-2 text-sm font-medium text-white hover:bg-[#0747A6] disabled:opacity-50 transition-colors"
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? '已复制' : '复制摘要'}
            </button>
            
            <button
              onClick={loadLogs}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
        </div>

        {/* Scrollable List Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Add Task Input */}
          <div className="mb-6 rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <h3 className="mb-3 text-sm font-medium text-gray-700">添加非 Jira 任务</h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={manualContent}
                onChange={(e) => setManualContent(e.target.value)}
                placeholder="输入任务内容..."
                className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0052CC] focus:outline-none focus:ring-1 focus:ring-[#0052CC]"
                onKeyDown={(e) => e.key === 'Enter' && handleAddManual()}
              />
              <button
                onClick={handleAddManual}
                disabled={!manualContent.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-[#0052CC] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#0747A6] disabled:opacity-50 transition-colors"
              >
                <Plus className="h-4 w-4" />
                添加
              </button>
            </div>
          </div>

          {/* Log List */}
          <div className="space-y-4">
            {sortedDates.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl bg-white py-16 text-gray-500 border border-dashed border-gray-200">
                <FileText className="mb-3 h-12 w-12 text-gray-300" />
                <p className="text-sm">暂无工作日志</p>
                <p className="mt-1 text-xs text-gray-400">
                  拖拽 Jira 任务到完成状态，或手动添加记录
                </p>
              </div>
            ) : (
              sortedDates.map((date) => (
                <div key={date} className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                  {/* 日期标题 */}
                  <div className="border-b border-gray-100 bg-gray-50/50 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {format(parseISO(date), 'yyyy年MM月dd日')}
                      </span>
                      <span className="text-xs text-gray-500">
                        {getLunarDateString(parseISO(date))}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {groupedLogs[date].length} 条记录
                    </span>
                  </div>

                  {/* 当天的日志条目 */}
                  <div className="divide-y divide-gray-50">
                    {groupedLogs[date].map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between px-4 py-3 hover:bg-gray-50/80 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* 来源标签 */}
                          <span
                            className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold ${
                              log.source === 'JIRA'
                                ? 'bg-[#0052CC] text-white'
                                : 'bg-gray-500 text-white'
                            }`}
                          >
                            {log.source}
                          </span>

                          {/* 任务内容 */}
                          <span className="truncate text-sm text-gray-900">
                            {log.source === 'JIRA' ? `[${log.task_key}] ${log.summary}` : log.summary}
                          </span>
                        </div>

                        {/* 删除按钮 */}
                        <button
                          onClick={() => handleDelete(log.id)}
                          className="ml-2 shrink-0 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
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
        </div>
      </div>

      {/* AI 生成选项模态框 */}
      {showGenerationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            {/* 模态框头部 */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#6554C0]" />
                <h2 className="text-lg font-semibold text-gray-900">使用 AI 生成报告</h2>
              </div>
              <button
                onClick={() => setShowGenerationModal(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100"
              >
                <span className="sr-only">关闭</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 模态框内容 */}
            <div className="px-6 py-4 space-y-4">
              {/* AI 模型选择 */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  AI 模型
                </label>
                <select
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#0052CC] focus:outline-none focus:ring-1 focus:ring-[#0052CC]"
                >
                  {aiProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} {profile.isActive ? '(默认)' : ''} - {profile.model}
                    </option>
                  ))}
                </select>
              </div>

              {/* Prompt Template 选择 */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  报告模板
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#0052CC] focus:outline-none focus:ring-1 focus:ring-[#0052CC]"
                >
                  {promptTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 模板描述预览 */}
              {selectedTemplate && (
                <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                  {selectedTemplate.description}
                </div>
              )}

              {/* 日志统计 */}
              <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Bot className="h-4 w-4" />
                  <span>将基于 <strong className="text-gray-900">{logs.length}</strong> 条工作日志生成报告</span>
                </div>
              </div>
            </div>

            {/* 模态框底部 */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => setShowGenerationModal(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleGenerateReport}
                disabled={isGenerating || !selectedProfileId || !selectedTemplateId}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#6554C0] to-[#8777D9] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    开始生成
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 报告预览模态框 */}
      {showReportPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-3xl max-h-[80vh] rounded-xl bg-white shadow-xl flex flex-col">
            {/* 模态框头部 */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#0052CC]" />
                <h2 className="text-lg font-semibold text-gray-900">生成的报告</h2>
              </div>
              <button
                onClick={() => setShowReportPreview(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100"
              >
                <span className="sr-only">关闭</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 报告内容 */}
            <div className="flex-1 overflow-auto p-6">
              <pre className="whitespace-pre-wrap font-sans text-sm text-gray-900 bg-gray-50 p-4 rounded-lg border border-gray-200">
                {generatedReport}
              </pre>
            </div>

            {/* 模态框底部 */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => setShowReportPreview(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={handleCopyGeneratedReport}
                className="flex items-center gap-1.5 rounded-lg bg-[#0052CC] px-4 py-2 text-sm font-medium text-white hover:bg-[#0747A6] transition-colors"
              >
                <Copy className="h-4 w-4" />
                复制报告
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Reports;
