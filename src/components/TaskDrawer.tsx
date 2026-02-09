import { X, Copy, ExternalLink, Calendar, User, Tag, Link2, Archive, Pencil } from 'lucide-react';
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
}

export function TaskDrawer({ task, isOpen, onClose, onArchive, onEdit }: TaskDrawerProps) {
  if (!task) return null;

  // 判断是否是个人任务
  const isLocalTask = (task as any).source === 'LOCAL';
  // 判断是否在 EXECUTED 列
  const isInExecuted = task.column === 'EXECUTED' || task.status === 'EXECUTED';

  const handleCopyInfo = () => {
    const text = `${task.summary} - ${task.key}`;
    navigator.clipboard.writeText(text);
    toast.success('已复制到剪贴板');
  };

  const openInJira = () => {
    console.log('[TaskDrawer] Opening Jira issue:', task.key);
    if (window.electronAPI?.system?.openJiraIssue) {
      window.electronAPI.system.openJiraIssue(task.key);
    } else {
      console.error('[TaskDrawer] electronAPI.system not available');
      // Fallback
      window.open(`https://jira.example.com/browse/${task.key}`, '_blank');
    }
  };
  
  const openLinkedIssue = (issueKey: string) => {
    console.log('[TaskDrawer] Opening linked Jira issue:', issueKey);
    if (window.electronAPI?.system?.openJiraIssue) {
      window.electronAPI.system.openJiraIssue(issueKey);
    } else {
      console.error('[TaskDrawer] electronAPI.system not available');
      // Fallback
      window.open(`https://jira.example.com/browse/${issueKey}`, '_blank');
    }
  };

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
          fixed right-0 top-0 z-50 h-full w-[480px] transform bg-white shadow-2xl transition-transform duration-300 ease-in-out
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
              <Calendar className="h-4 w-4 text-[#5E6C84]" />
              <span className="text-[#5E6C84]">截止日期:</span>
              <span className="font-medium text-[#172B4D]">{task.dueDate || '未设置'}</span>
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

          {/* 优先级 */}
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-semibold text-[#172B4D]">优先级</h3>
            <span className={`
              rounded px-3 py-1 text-xs font-medium
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
