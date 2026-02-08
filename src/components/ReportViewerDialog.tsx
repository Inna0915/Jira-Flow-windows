import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Save, FileText, Calendar, Clock, Folder, Sparkles, CheckCircle2, Circle } from 'lucide-react';
// import { MarkdownRenderer } from './MarkdownRenderer';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

interface Report {
  id: string;
  type: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date: string;
  content: string;
  created_at?: number;
}

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  type?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  isDefault?: boolean;
}

interface ReportViewerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  currentDate: Date;
}

// 格式化日期为 YYYY-MM-DD (local time)
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 格式化显示日期
function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

// 获取周数
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// 获取季度
function getQuarter(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

// 获取日期范围文本
function getRangeText(mode: string, date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  
  switch (mode) {
    case 'weekly':
      return `${year}年第${getWeekNumber(date)}周`;
    case 'monthly':
      return `${year}年${month}月`;
    case 'quarterly':
      return `${year}年第${getQuarter(date)}季度`;
    case 'yearly':
      return `${year}年度`;
    default:
      return '';
  }
}

// 计算日期范围
function calculateDateRange(mode: string, date: Date): { start: Date; end: Date; label: string } {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  switch (mode) {
    case 'weekly': {
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(year, month, diff);
      const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
      return { start, end, label: getRangeText(mode, date) };
    }
    case 'monthly': {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      return { start, end, label: getRangeText(mode, date) };
    }
    case 'quarterly': {
      const quarter = getQuarter(date);
      const start = new Date(year, (quarter - 1) * 3, 1);
      const end = new Date(year, quarter * 3, 0);
      return { start, end, label: getRangeText(mode, date) };
    }
    case 'yearly': {
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      return { start, end, label: getRangeText(mode, date) };
    }
    default:
      return { start: date, end: date, label: '' };
  }
}

// 获取层级映射
function getHierarchyMode(mode: string): 'week' | 'month' | 'quarter' | 'year' {
  switch (mode) {
    case 'weekly': return 'week';
    case 'monthly': return 'month';
    case 'quarterly': return 'quarter';
    case 'yearly': return 'year';
    default: return 'week';
  }
}

// 获取子项标签
function getChildLabel(childType: string, startDate: string): string {
  const date = new Date(startDate);
  switch (childType) {
    case 'weekly':
      return `第${getWeekNumber(date)}周`;
    case 'monthly':
      return `${date.getMonth() + 1}月`;
    case 'quarterly':
      return `Q${getQuarter(date)}`;
    default:
      return startDate;
  }
}

// 获取报告类型中文名
function getReportTypeName(type: string): string {
  switch (type) {
    case 'weekly': return '周报';
    case 'monthly': return '月报';
    case 'quarterly': return '季报';
    case 'yearly': return '年报';
    default: return '报告';
  }
}

export function ReportViewerDialog({ isOpen, onClose, mode, currentDate }: ReportViewerDialogProps) {
  // Report data
  const [report, setReport] = useState<Report | null>(null);
  const [childReports, setChildReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Navigation
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  
  // Content editing
  const [editedContent, setEditedContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Date range
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date; label: string } | null>(null);
  
  // AI Generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  // const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  // Get appropriate template for current mode - defined early for use in effects
  const getDefaultTemplateForMode = useCallback((reportMode: string) => {
    const typeMap: Record<string, string> = {
      'weekly': 'weekly',
      'monthly': 'monthly',
      'quarterly': 'quarterly',
      'yearly': 'yearly'
    };
    const targetType = typeMap[reportMode];
    const template = templates.find(t => t.type === targetType && t.isDefault) ||
                    templates.find(t => t.type === targetType) ||
                    templates.find(t => t.isDefault) ||
                    templates[0];
    return template;
  }, [templates]);

  const loadTemplates = async () => {
    try {
      const result = await window.electronAPI.ai.getTemplates();
      if (result.success && result.data) {
        setTemplates(result.data);
      }
    } catch (error) {
      console.error('[ReportViewer] Failed to load templates:', error);
    }
  };

  // Load report data
  const loadReports = useCallback(async () => {
    if (!isOpen) return;
    
    setIsLoading(true);
    setActiveReportId(null);
    
    try {
      const range = calculateDateRange(mode, currentDate);
      setDateRange(range);
      
      const hierarchy = getHierarchyMode(mode);
      const startDate = formatDate(range.start);
      const endDate = formatDate(range.end);
      
      const result = await window.electronAPI.report.getHierarchyBundle({
        hierarchy,
        startDate,
        endDate,
      });
      
      if (result.success && result.data) {
        const { main, children } = result.data;
        setReport(main);
        setChildReports(children || []);
        setEditedContent(main?.content || '');
      } else {
        setReport(null);
        setChildReports([]);
        setEditedContent('');
      }
    } catch (error) {
      console.error('[ReportViewer] Failed to load reports:', error);
      toast.error('加载报告失败');
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, mode, currentDate]);

  // Load templates when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  // Load reports when dialog opens or mode/date changes
  useEffect(() => {
    if (isOpen) {
      // mode 变化时重置 active report
      setActiveReportId(null);
      loadReports();
    }
  }, [isOpen, mode, currentDate]);

  // Get active report (parent or selected child)
  const activeReport = useMemo(() => {
    if (!activeReportId) return report;
    return childReports.find(r => r.id === activeReportId) || null;
  }, [activeReportId, report, childReports]);

  // Select default template when templates are loaded or mode/active report changes
  useEffect(() => {
    if (isOpen && templates.length > 0) {
      // 根据当前活动的报告类型选择对应的默认模板
      const targetMode = activeReport?.type || mode;
      const defaultTemplate = getDefaultTemplateForMode(targetMode);
      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id);
      }
    }
  }, [isOpen, templates, mode, activeReport?.type, getDefaultTemplateForMode]);

  // Get active date range for the selected report
  const activeDateRange = useMemo(() => {
    if (activeReport) {
      return {
        start: new Date(activeReport.start_date),
        end: new Date(activeReport.end_date)
      };
    }
    return dateRange ? { start: dateRange.start, end: dateRange.end } : null;
  }, [activeReport, dateRange]);

  // Determine if we're viewing parent or child
  const isParentActive = activeReportId === null;

  // Save report
  const handleSave = async () => {
    if (!activeDateRange) return;
    
    setIsSaving(true);
    try {
      const targetType = activeReport?.type || mode;
      const reportData = {
        id: activeReport?.id || uuidv4(),
        type: targetType,
        start_date: formatDate(activeDateRange.start),
        end_date: formatDate(activeDateRange.end),
        content: editedContent,
      };
      
      const result = await window.electronAPI.report.save(reportData);
      
      if (result.success) {
        const savedReport = { ...reportData, created_at: Date.now() };
        
        if (isParentActive) {
          setReport(savedReport);
        } else {
          setChildReports(prev => 
            prev.map(r => r.id === activeReportId ? savedReport : r)
          );
        }
        toast.success('报告已保存');
      } else {
        toast.error('保存失败');
      }
    } catch (error) {
      console.error('[ReportViewer] Failed to save report:', error);
      toast.error('保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  // Generate report with AI
  const handleGenerate = async () => {
    if (!selectedTemplateId) {
      toast.error('请先选择报告模板');
      return;
    }

    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) {
      toast.error('模板不存在');
      return;
    }

    if (!activeDateRange) return;

    setIsGenerating(true);
    try {
      // Get active profile
      const profileResult = await window.electronAPI.ai.getActiveProfile();
      if (!profileResult.success || !profileResult.data) {
        toast.error('请先配置 AI 模型');
        return;
      }

      // Get logs for the active date range
      const logsResult = await window.electronAPI.workLogs.getLogs(
        formatDate(activeDateRange.start),
        formatDate(activeDateRange.end)
      );

      const logs = logsResult.success && logsResult.data ? logsResult.data : [];

      // Get tasks with due_date in the selected week and status not EXECUTED
      const tasksResult = await window.electronAPI.database.query(
        `SELECT * FROM t_tasks 
         WHERE due_date >= ? AND due_date <= ? 
         AND status != 'EXECUTED' 
         AND mapped_column != 'EXECUTED'
         AND status != 'ARCHIVED'
         AND mapped_column != 'ARCHIVED'
         ORDER BY due_date ASC`,
        [formatDate(activeDateRange.start), formatDate(activeDateRange.end)]
      );
      
      const pendingTasks: any[] = tasksResult.success && Array.isArray(tasksResult.data) ? tasksResult.data : [];

      // Format logs text (标记为 EXECUTED 执行完成)
      const logsText = logs.length > 0 
        ? logs.map((log: any) => `- ${log.log_date}: ${log.summary} [EXECUTED 执行完成]`).join('\n')
        : '本周无工作日志记录';

      // Format pending tasks text (显示泳道状态)
      const pendingTasksText = pendingTasks.length > 0
        ? pendingTasks.map((t: any) => {
            const column = t.mapped_column || t.status || '未知状态';
            return `- ${t.key}: ${t.summary} [${column}] (截止: ${t.due_date})`;
          }).join('\n')
        : '本周无待完成任务';

      // Build system prompt with logs and pending tasks included
      const reportTypeName = getReportTypeName(activeReport?.type || mode);
      const systemPrompt = `你是一个专业的工作报告生成助手。请根据以下工作日志和待完成任务生成${reportTypeName}。

【工作日志 - 已执行任务】
${logsText}

【待完成任务 - 截止日在本周】
${pendingTasksText}

模板要求：
${template.content}

请用中文输出，格式清晰，内容专业。`;

      // Generate report
      const result = await window.electronAPI.ai.generateReport(
        logs,
        systemPrompt,
        profileResult.data.id
      );

      if (result.success) {
        setEditedContent(result.content);
        toast.success(`${reportTypeName}生成成功`);
      } else {
        toast.error('生成失败');
      }
    } catch (error) {
      console.error('[ReportViewer] Failed to generate report:', error);
      toast.error('生成报告失败');
    } finally {
      setIsGenerating(false);
    }
  };

  // Switch to parent report
  const handleSelectParent = () => {
    setActiveReportId(null);
    setEditedContent(report?.content || '');
    // 模板选择由 useEffect 自动处理
  };

  // Switch to child report
  const handleSelectChild = (child: Report) => {
    setActiveReportId(child.id);
    setEditedContent(child.content || '');
    // 模板选择由 useEffect 自动处理
  };

  if (!isOpen) return null;

  // Weekly Mode: Single View
  if (mode === 'weekly') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl shadow-2xl w-[900px] h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#EBECF0]">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#0052CC]/10 rounded-lg">
                <FileText className="w-5 h-5 text-[#0052CC]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[#172B4D]">
                  周报 - {dateRange?.label}
                </h2>
                {dateRange && (
                  <p className="text-xs text-[#6B778C] flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3" />
                    {formatDisplayDate(formatDate(dateRange.start))} 至 {formatDisplayDate(formatDate(dateRange.end))}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="p-2 hover:bg-[#F4F5F7] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#6B778C]" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex items-center gap-2 text-[#6B778C]">
                  <Clock className="w-5 h-5 animate-spin" />
                  加载中...
                </div>
              </div>
            ) : editedContent ? (
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                placeholder="在此输入周报内容..."
                className="flex-1 p-6 resize-none outline-none font-mono text-sm leading-relaxed bg-white text-[#172B4D]"
                spellCheck={false}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-[#6B778C]">
                <FileText className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium mb-2">暂无周报内容</p>
                <p className="text-sm mb-6">点击下方按钮生成周报</p>
              </div>
            )}
          </div>

          {/* Footer with Generate and Save */}
          <div className="px-6 py-4 border-t border-[#EBECF0] bg-[#FAFBFC]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Template Selector */}
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="px-3 py-2 border border-[#DFE1E6] rounded-lg text-sm text-[#172B4D] focus:outline-none focus:border-[#0052CC] bg-white min-w-[200px]"
                >
                  <option value="">选择模板...</option>
                  {templates
                    .filter(t => !t.type || t.type === 'weekly')
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.isDefault ? '(默认)' : ''}
                      </option>
                    ))}
                </select>
                
                {report?.created_at && (
                  <span className="text-xs text-[#6B778C]">
                    上次保存: {new Date(report.created_at).toLocaleString('zh-CN')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {isGenerating ? (
                    <Clock className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {isGenerating ? '生成中...' : '使用 AI 生成'}
                </button>
                
                <button
                  onClick={handleSave}
                  disabled={isSaving || !editedContent}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#36B37E] hover:bg-[#2EA36A] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Monthly/Quarterly/Yearly Mode: Split View with Hierarchy
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-[1200px] h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EBECF0]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#0052CC]/10 rounded-lg">
              <Folder className="w-5 h-5 text-[#0052CC]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#172B4D]">
                {mode === 'monthly' && '月报'}
                {mode === 'quarterly' && '季报'}
                {mode === 'yearly' && '年报'}
                {dateRange?.label && ` - ${dateRange.label}`}
              </h2>
              {dateRange && (
                <p className="text-xs text-[#6B778C] flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3 h-3" />
                  {formatDisplayDate(formatDate(dateRange.start))} 至 {formatDisplayDate(formatDate(dateRange.end))}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 hover:bg-[#F4F5F7] rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-[#6B778C]" />
            </button>
          </div>
        </div>

        {/* Content - Split View */}
        <div className="flex-1 flex overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-2 text-[#6B778C]">
                <Clock className="w-5 h-5 animate-spin" />
                加载中...
              </div>
            </div>
          ) : (
            <>
              {/* Left Sidebar - Hierarchy Navigation */}
              <div className="w-72 border-r border-[#EBECF0] bg-[#FAFBFC] flex flex-col">
                {/* Parent Summary Item */}
                <div className="px-4 py-3 border-b border-[#EBECF0]">
                  <h3 className="text-xs font-medium text-[#6B778C] uppercase tracking-wider mb-2">
                    {mode === 'monthly' && '月度总览'}
                    {mode === 'quarterly' && '季度总览'}
                    {mode === 'yearly' && '年度总览'}
                  </h3>
                  <button
                    onClick={handleSelectParent}
                    className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                      isParentActive 
                        ? 'bg-[#0052CC] text-white shadow-sm' 
                        : 'hover:bg-white bg-white border border-[#EBECF0] text-[#172B4D]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${isParentActive ? '' : 'text-[#172B4D]'}`}>
                        {dateRange?.label}
                      </span>
                      {report?.content ? (
                        <CheckCircle2 className={`w-4 h-4 ${isParentActive ? 'text-white' : 'text-[#36B37E]'}`} />
                      ) : (
                        <Circle className={`w-4 h-4 ${isParentActive ? 'text-white/60' : 'text-[#97A0AF]'}`} />
                      )}
                    </div>
                    <div className={`text-xs mt-1 ${isParentActive ? 'text-white/70' : 'text-[#6B778C]'}`}>
                      {report?.content ? '已生成' : '未生成'}
                    </div>
                  </button>
                </div>
                
                {/* Children List */}
                <div className="flex-1 overflow-auto">
                  <div className="px-4 py-3">
                    <h3 className="text-xs font-medium text-[#6B778C] uppercase tracking-wider mb-2">
                      {mode === 'monthly' && '包含周报'}
                      {mode === 'quarterly' && '包含月报'}
                      {mode === 'yearly' && '包含季报'}
                    </h3>
                    
                    <div className="space-y-2">
                      {childReports.length === 0 ? (
                        <div className="text-sm text-[#6B778C] py-4 text-center">
                          暂无子报告数据
                        </div>
                      ) : (
                        childReports.map((child) => {
                          const isActive = activeReportId === child.id;
                          const hasContent = !!child.content;
                          
                          return (
                            <button
                              key={child.id}
                              onClick={() => handleSelectChild(child)}
                              className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                                isActive 
                                  ? 'bg-[#0052CC] text-white shadow-sm' 
                                  : 'hover:bg-white bg-white border border-[#EBECF0] text-[#172B4D]'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className={`font-medium ${isActive ? '' : 'text-[#172B4D]'}`}>
                                  {getChildLabel(child.type, child.start_date)}
                                </span>
                                {hasContent ? (
                                  <CheckCircle2 className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#36B37E]'}`} />
                                ) : (
                                  <Circle className={`w-4 h-4 ${isActive ? 'text-white/60' : 'text-[#97A0AF]'}`} />
                                )}
                              </div>
                              <div className={`text-xs mt-1 ${isActive ? 'text-white/70' : 'text-[#6B778C]'}`}>
                                {formatDisplayDate(child.start_date).slice(5)} - {formatDisplayDate(child.end_date).slice(5)}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Content Area */}
              <div className="flex-1 flex flex-col bg-white">
                {/* Report Header */}
                <div className="px-6 py-4 border-b border-[#EBECF0]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-[#172B4D]">
                        {isParentActive 
                          ? `${dateRange?.label} 总览`
                          : getChildLabel(activeReport?.type || 'weekly', activeReport?.start_date || '')
                        }
                      </h3>
                      {activeDateRange && (
                        <p className="text-xs text-[#6B778C] mt-0.5">
                          {formatDisplayDate(formatDate(activeDateRange.start))} 至 {formatDisplayDate(formatDate(activeDateRange.end))}
                        </p>
                      )}
                    </div>
                    
                    {/* Template Selector for this report */}
                    <div className="flex items-center gap-3">
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        className="px-3 py-2 border border-[#DFE1E6] rounded-lg text-sm text-[#172B4D] focus:outline-none focus:border-[#0052CC] bg-white"
                      >
                        <option value="">选择模板...</option>
                        {templates
                          .filter(t => !t.type || t.type === (activeReport?.type || mode))
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} {t.isDefault ? '(默认)' : ''}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Report Content */}
                <div className="flex-1 overflow-hidden">
                  {editedContent ? (
                    <textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      placeholder={`在此输入${getReportTypeName(activeReport?.type || mode)}内容...`}
                      className="w-full h-full p-6 resize-none outline-none font-mono text-sm leading-relaxed text-[#172B4D]"
                      spellCheck={false}
                    />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-[#6B778C]">
                      <FileText className="w-16 h-16 mb-4 opacity-30" />
                      <p className="text-lg font-medium mb-2">
                        暂无{getReportTypeName(activeReport?.type || mode)}内容
                      </p>
                      <p className="text-sm mb-6">点击下方按钮生成报告</p>
                      <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="flex items-center gap-2 px-6 py-3 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                      >
                        {isGenerating ? (
                          <Clock className="w-5 h-5 animate-spin" />
                        ) : (
                          <Sparkles className="w-5 h-5" />
                        )}
                        {isGenerating ? '生成中...' : `生成${getReportTypeName(activeReport?.type || mode)}`}
                      </button>
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                {editedContent && (
                  <div className="px-6 py-4 border-t border-[#EBECF0] bg-[#FAFBFC]">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-[#6B778C]">
                        {activeReport?.created_at && (
                          <span>上次保存: {new Date(activeReport.created_at).toLocaleString('zh-CN')}</span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleGenerate}
                          disabled={isGenerating}
                          className="flex items-center gap-1.5 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          {isGenerating ? (
                            <Clock className="w-4 h-4 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4" />
                          )}
                          {isGenerating ? '生成中...' : '重新生成'}
                        </button>
                        
                        <button
                          onClick={handleSave}
                          disabled={isSaving}
                          className="flex items-center gap-1.5 px-4 py-2 bg-[#36B37E] hover:bg-[#2EA36A] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          <Save className="w-4 h-4" />
                          {isSaving ? '保存中...' : '保存'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
