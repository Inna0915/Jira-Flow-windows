import { useState } from 'react';
import { ExternalLink, Calendar, Hash } from 'lucide-react';
import { Avatar } from './Avatar';
import type { BoardTask } from '../stores/boardStore';

interface TaskCardProps {
  task: BoardTask;
  onClick?: (task: BoardTask) => void;
  onUpdate?: (task: BoardTask, updates: { storyPoints?: number | null; dueDate?: string | null }) => void;
}

/**
 * 任务卡片组件 - Jira Agile Hive 风格
 * 
 * 根据 issuetype 显示不同样式：
 * - Story: 绿色左边框 (border-l-4 border-[#36B37E])
 * - Bug: 红色左边框 (border-l-4 border-[#FF5630])
 * 
 * 故事点和截止日期显示（编辑功能已移至侧弹窗）
 */
export function TaskCard({ task, onClick }: TaskCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  const isBug = task.issuetype?.toLowerCase() === 'bug';

  // 格式化日期显示
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { text: `${Math.abs(diffDays)}天超期`, color: 'text-[#DE350B]', bg: 'bg-[#FFEBE6]' };
    if (diffDays === 0) return { text: '今天', color: 'text-[#FF8B00]', bg: 'bg-[#FFFAE6]' };
    if (diffDays <= 3) return { text: `${diffDays}天后`, color: 'text-[#FF8B00]', bg: 'bg-[#FFFAE6]' };
    return { text: date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }), color: 'text-[#5E6C84]', bg: 'bg-[#F4F5F7]' };
  };

  const dueInfo = formatDate(task.dueDate);

  return (
    <div
      onClick={() => onClick?.(task)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        task-card relative cursor-pointer rounded bg-white p-3 shadow-sm
        border border-[#DFE1E6]
        ${isBug ? 'border-l-4 border-l-[#FF5630]' : 'border-l-4 border-l-[#36B37E]'}
        ${isHovered ? 'ring-1 ring-[#4C9AFF]' : ''}
        w-full h-[210px] flex flex-col
      `}
    >
      {/* Bug 标签 */}
      {isBug && (
        <div className="absolute right-2 top-2 rounded bg-[#FFEBE6] px-1.5 py-0.5 text-[10px] font-bold text-[#DE350B]">
          BUG
        </div>
      )}

      {/* 顶部：Issue Key - 可点击在浏览器中打开 */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <span
          className="group inline-flex items-center gap-1 text-xs font-medium text-[#0052CC] hover:text-[#0747A6] cursor-pointer truncate"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('[TaskCard] Opening Jira issue:', task.key);
            if (window.electronAPI?.system?.openJiraIssue) {
              window.electronAPI.system.openJiraIssue(task.key);
            } else {
              console.error('[TaskCard] electronAPI.system not available');
              window.open(`https://jira.example.com/browse/${task.key}`, '_blank');
            }
          }}
          title={`在浏览器中打开 ${task.key}`}
        >
          <span className="hover:underline">{task.key}</span>
          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </span>
      </div>

      {/* 中间：Summary */}
      <p className="flex-1 mb-3 text-sm font-normal text-[#172B4D] line-clamp-4 leading-snug break-words overflow-hidden">
        {task.summary}
      </p>

      {/* 日期提示和故事点 - 仅显示，编辑功能移至侧弹窗 */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {/* 故事点显示 */}
        {task.storyPoints !== undefined && task.storyPoints !== null ? (
          <span
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#E3FCEF] text-[#006644]"
            title={`故事点: ${task.storyPoints}`}
          >
            <Hash className="h-3 w-3" />
            <span>{task.storyPoints}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#F4F5F7] text-[#5E6C84]">
            <Hash className="h-3 w-3" />
            <span>-</span>
          </span>
        )}
        
        {/* 截止日期显示 */}
        {dueInfo ? (
          <span
            className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] ${dueInfo.bg} ${dueInfo.color}`}
            title={`截止: ${task.dueDate}`}
          >
            <Calendar className="h-3 w-3" />
            <span>{dueInfo.text}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] bg-[#F4F5F7] text-[#5E6C84]">
            <Calendar className="h-3 w-3" />
            <span>未设置</span>
          </span>
        )}
      </div>

      {/* 底部区域 */}
      <div className="flex items-center justify-between">
        {/* 左侧：UNCOVERED 徽章（仅 Story） */}
        {!isBug && (
          <span className="inline-flex items-center rounded-full bg-[#DEEBFF] px-2 py-0.5 text-[10px] font-bold text-[#0747A6]">
            UNCOVERED
          </span>
        )}
        
        {/* Bug 显示优先级 */}
        {isBug && task.priority && (
          <span className={`
            rounded px-1.5 py-0.5 text-[10px] font-bold
            ${task.priority.toLowerCase().includes('high') || task.priority.toLowerCase().includes('critical')
              ? 'bg-[#FFEBE6] text-[#DE350B]'
              : 'bg-[#FFFAE6] text-[#FF8B00]'
            }
          `}>
            {task.priority}
          </span>
        )}

        {/* 右侧：头像和名字 */}
        <div className="flex items-center gap-1.5">
          <Avatar 
            name={task.assignee?.name || task.assignee_name || ''} 
            size={24} 
          />
          <span className="max-w-[70px] truncate text-[11px] text-[#5E6C84]">
            {task.assignee?.name || task.assignee_name || '未分配'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default TaskCard;
