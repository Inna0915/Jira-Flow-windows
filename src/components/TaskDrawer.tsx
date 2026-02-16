import { useState, useEffect, useCallback } from 'react';
import { X, Copy, ExternalLink, Calendar, User, Tag, Link2, Archive, Pencil, Hash, Save, Loader2 } from 'lucide-react';
import type { BoardTask } from '../stores/boardStore';
import { Avatar } from './Avatar';
import { JiraHtmlRenderer } from './JiraHtmlRenderer';
import { toast } from 'sonner';

interface TaskDrawerProps {
  task: BoardTask | null;
  isOpen: boolean;
  onClose: () => void;
  onArchive?: (taskKey: string) => void;
  onEdit?: (task: any) => void;
  onUpdate?: (task: BoardTask, updates: { storyPoints?: number | null; dueDate?: string | null }) => void;
  canEditStoryPoints?: boolean;
  canEditDueDate?: boolean;
}

export function TaskDrawer({ 
  task, 
  isOpen, 
  onClose, 
  onArchive, 
  onEdit, 
  onUpdate,
  canEditStoryPoints = false,
  canEditDueDate = true,
}: TaskDrawerProps) {
  // 编辑状态
  const [storyPoints, setStoryPoints] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // 当任务变化时，重置编辑状态
  useEffect(() => {
    if (task) {
      setStoryPoints(task.storyPoints?.toString() || '');
      setDueDate(task.dueDate || '');
      setHasChanges(false);
    }
  }, [task?.key]);

  // 检查是否有修改
  useEffect(() => {
    if (task) {
      const originalStoryPoints = task.storyPoints?.toString() || '';
      const originalDueDate = task.dueDate || '';
      setHasChanges(
        storyPoints !== originalStoryPoints || dueDate !== originalDueDate
      );
    }
  }, [storyPoints, dueDate, task]);

  // 提前返回必须放在所有 Hooks 之后，这里使用记忆化值
  const isLocalTask = task ? (task as any).source === 'LOCAL' : false;
  const isInExecuted = task ? (task.column === 'EXECUTED' || task.status === 'EXECUTED') : false;

  const handleCopyInfo = useCallback(() => {
    if (!task) return;
    const text = `${task.summary} - ${task.key}`;
    navigator.clipboard.writeText(text);
    toast.success('已复制到剪贴板');
  }, [task]);

  const openInJira = useCallback(() => {
    if (!task) return;
    console.log('[TaskDrawer] Opening Jira issue:', task.key);
    if (window.electronAPI?.system?.openJiraIssue) {
      window.electronAPI.system.openJiraIssue(task.key);
    } else {
      console.error('[TaskDrawer] electronAPI.system not available');
      window.open(`https://jira.example.com/browse/${task.key}`, '_blank');
    }
  }, [task]);
  
  const openLinkedIssue = useCallback((issueKey: string) => {
    console.log('[TaskDrawer] Opening linked Jira issue:', issueKey);
    if (window.electronAPI?.system?.openJiraIssue) {
      window.electronAPI.system.openJiraIssue(issueKey);
    } else {
      console.error('[TaskDrawer] electronAPI.system not available');
      window.open(`https://jira.example.com/browse/${issueKey}`, '_blank');
    }
  }, []);

  // 保存修改 - 必须在所有条件返回之前定义
  const handleSave = useCallback(async () => {
    if (!task || !hasChanges) return;

    setIsSaving(true);
    
    try {
      const updates: { storyPoints?: number | null; dueDate?: string | null } = {};
      
      // 处理故事点
      const originalStoryPoints = task.storyPoints?.toString() || '';
      if (canEditStoryPoints && storyPoints !== originalStoryPoints) {
        const value = storyPoints.trim() === '' ? null : parseFloat(storyPoints);
        if (value !== null && (isNaN(value) || value < 0)) {
          toast.error('故事点必须是非负数');
          setIsSaving(false);
          return;
        }
        updates.storyPoints = value;
      }
      
      // 处理截止日期
      const originalDueDate = task.dueDate || '';
      if (canEditDueDate && dueDate !== originalDueDate) {
        updates.dueDate = dueDate.trim() === '' ? null : dueDate;
      }
      
      // 如果没有实际变化，直接返回
      if (Object.keys(updates).length === 0) {
        setIsSaving(false);
        return;
      }

      // 调用 API 更新
      const result = await window.electronAPI.jira.updateIssue(task.key, updates);
      
      if (result.success) {
        // 更新本地状态
        onUpdate?.(task, updates);
        toast.success('保存成功');
        setHasChanges(false);
      } else {
        toast.error('保存失败: ' + (result as any).error);
        // 恢复原值
        setStoryPoints(task.storyPoints?.toString() || '');
        setDueDate(task.dueDate || '');
      }
    } catch (error) {
      console.error('[TaskDrawer] Save failed:', error);
      toast.error('保存失败');
      // 恢复原值
      setStoryPoints(task.storyPoints?.toString() || '');
      setDueDate(task.dueDate || '');
    } finally {
      setIsSaving(false);
    }
  }, [task, storyPoints, dueDate, canEditStoryPoints, canEditDueDate, hasChanges, onUpdate]);

  // 取消修改 - 必须在所有条件返回之前定义
  const handleCancel = useCallback(() => {
    if (task) {
      setStoryPoints(task.storyPoints?.toString() || '');
      setDueDate(task.dueDate || '');
      setHasChanges(false);
    }
  }, [task]);

  // 格式化日期显示 - 普通函数，放在最后
  const formatDateDisplay = useCallback((dateStr: string) => {
    if (!dateStr) return '未设置';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('zh-CN', { 
      year: 'numeric',
      month: 'long', 
      day: 'numeric' 
    });
  }, []);

  // ⚠️ 所有 Hooks 定义完成后，才能条件返回
  if (!task) return null;

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/20 transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={`
          fixed right-0 top-0 z-50 h-full w-[520px] transform bg-white shadow-2xl transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-[#DFE1E6] bg-white px-4 py-3">
          <span 
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-[#0052CC] hover:text-[#0747A6] cursor-pointer" 
            onClick={openInJira}
            title="在浏览器中打开"
          >
            <span className="hover:underline">{task.key}</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyInfo}
              className="flex items-center gap-1 rounded border border-[#DFE1E6] bg-white px-3 py-1.5 text-xs font-medium text-[#172B4D] hover:bg-[#F4F5F7]"
            >
              <Copy className="h-3 w-3" />
              复制信息
            </button>
            <button
              onClick={onClose}
              className="rounded p-1.5 text-[#5E6C84] hover:bg-[#F4F5F7]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 内容 */}
        <div className="h-[calc(100%-60px)] overflow-y-auto bg-white p-4">
          <h2 className="mb-4 text-lg font-semibold text-[#172B4D]">
            {task.summary}
          </h2>

          {/* 基本信息 */}
          <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg bg-[#F4F5F7] p-3 text-sm">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-[#5E6C84]" />
              <span className="text-[#5E6C84]">类型:</span>
              <span className="font-medium text-[#172B4D]">{task.issuetype || 'Unknown'}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-[#5E6C84]" />
              <span className="text-[#5E6C84]">负责人:</span>
              <div className="flex items-center gap-1">
                <Avatar name={task.assignee?.name} size={20} />
                <span className="font-medium text-[#172B4D]">{task.assignee?.name || '未分配'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-[#5E6C84]" />
              <span className="text-[#5E6C84]">状态:</span>
              <span className="rounded bg-[#DEEBFF] px-2 py-0.5 text-xs font-medium text-[#0747A6]">
                {task.column}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-[#5E6C84]" />
              <span className="text-[#5E6C84]">优先级:</span>
              <span className={`
                rounded px-2 py-0.5 text-xs font-medium
                ${task.priority?.toLowerCase().includes('high') 
                  ? 'bg-[#FFEBE6] text-[#FF5630]' 
                  : task.priority?.toLowerCase().includes('low')
                  ? 'bg-[#E3FCEF] text-[#36B37E]'
                  : 'bg-[#FFF0B3] text-[#FF8B00]'
                }
              `}>
                {task.priority || 'Medium'}
              </span>
            </div>
          </div>

          {/* 可编辑字段区域 */}
          <div className="mb-6 rounded-lg border border-[#DFE1E6] bg-white p-4">
            <h3 className="mb-4 text-sm font-semibold text-[#172B4D] flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              任务属性
            </h3>
            
            <div className="space-y-4">
              {/* 故事点 */}
              {canEditStoryPoints && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-24 text-sm text-[#5E6C84]">
                    <Hash className="h-4 w-4" />
                    <span>故事点</span>
                  </div>
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={storyPoints}
                      onChange={(e) => setStoryPoints(e.target.value)}
                      placeholder="未设置"
                      className="w-32 px-3 py-2 text-sm bg-white border border-gray-400 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#4C9AFF] focus:border-[#0052CC]"
                    />
                    <span className="ml-2 text-xs text-[#5E6C84]">SP</span>
                  </div>
                </div>
              )}
              
              {!canEditStoryPoints && task.storyPoints !== undefined && task.storyPoints !== null && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-24 text-sm text-[#5E6C84]">
                    <Hash className="h-4 w-4" />
                    <span>故事点</span>
                  </div>
                  <div className="flex-1">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#E3FCEF] text-[#006644] text-sm font-medium">
                      <Hash className="h-3 w-3" />
                      {task.storyPoints}
                    </span>
                  </div>
                </div>
              )}

              {/* 截止日期 */}
              {canEditDueDate && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-24 text-sm text-[#5E6C84]">
                    <Calendar className="h-4 w-4" />
                    <span>截止日期</span>
                  </div>
                  <div className="flex-1">
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-40 px-3 py-2 text-sm bg-white border border-gray-400 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#4C9AFF] focus:border-[#0052CC]"
                    />
                    {dueDate && (
                      <span className="ml-2 text-xs text-[#5E6C84]">
                        ({formatDateDisplay(dueDate)})
                      </span>
                    )}
                  </div>
                </div>
              )}

              {!canEditDueDate && task.dueDate && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-24 text-sm text-[#5E6C84]">
                    <Calendar className="h-4 w-4" />
                    <span>截止日期</span>
                  </div>
                  <div className="flex-1">
                    <span className="text-sm text-[#172B4D]">
                      {formatDateDisplay(task.dueDate)}
                    </span>
                  </div>
                </div>
              )}

              {/* 保存/取消按钮 */}
              {hasChanges && (
                <div className="flex items-center gap-2 pt-3 border-t border-[#DFE1E6]">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {isSaving ? '保存中...' : '保存'}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="px-4 py-2 border border-[#DFE1E6] hover:bg-[#F4F5F7] text-[#172B4D] text-sm font-medium rounded-lg transition-colors"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 描述 */}
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-semibold text-[#172B4D]">描述</h3>
            <div className="rounded-lg border border-[#DFE1E6] bg-white p-3">
              <JiraHtmlRenderer html={task.description || ''} />
            </div>
          </div>

          {/* Sprint */}
          {task.sprint && (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-[#172B4D]">Sprint</h3>
              <span className="rounded-full bg-[#EAE6FF] px-3 py-1 text-xs font-medium text-[#403294]">
                {task.sprint}
              </span>
            </div>
          )}

          {/* 关联任务 */}
          {task.links && task.links.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#172B4D]">
                <Link2 className="h-4 w-4" />
                关联任务
              </h3>
              <div className="space-y-2">
                {task.links.map((link) => (
                  <div 
                    key={link.key}
                    className="flex items-center justify-between rounded-lg border border-[#DFE1E6] bg-white p-2 hover:bg-[#F4F5F7]"
                  >
                    <div className="flex-1 min-w-0">
                      <button
                        className="text-xs font-medium text-[#0052CC] hover:text-[#0747A6] hover:underline"
                        onClick={() => openLinkedIssue(link.key)}
                        title={`在浏览器中打开 ${link.key}`}
                      >
                        {link.key}
                      </button>
                      <p className="text-xs text-[#5E6C84] truncate">{link.summary}</p>
                    </div>
                    <span className="rounded bg-[#F4F5F7] px-2 py-0.5 text-[10px] text-[#5E6C84] ml-2 shrink-0">
                      {link.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 底部操作按钮 */}
          {isLocalTask && (
            <div className="flex items-center gap-2 pt-4 border-t border-[#DFE1E6]">
              {/* 编辑按钮 */}
              {onEdit && (
                <button
                  onClick={() => onEdit(task)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                  编辑
                </button>
              )}
              {/* 归档按钮 - 仅在 EXECUTED 列显示 */}
              {isInExecuted && onArchive && (
                <button
                  onClick={() => onArchive(task.key)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Archive className="h-4 w-4" />
                  归档
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default TaskDrawer;
