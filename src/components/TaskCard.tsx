import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Avatar } from './Avatar';
import type { BoardTask } from '../stores/boardStore';

interface TaskCardProps {
  task: BoardTask;
  onClick?: (task: BoardTask) => void;
}

/**
 * 任务卡片组件 - Jira Agile Hive 风格
 * 
 * 根据 issuetype 显示不同样式：
 * - Story: 绿色左边框 (border-l-4 border-[#36B37E])
 * - Bug: 红色左边框 (border-l-4 border-[#FF5630])
 */
export function TaskCard({ task, onClick }: TaskCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  const isBug = task.issuetype?.toLowerCase() === 'bug';
  
  // 格式化日期显示
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const today = new Date();
    const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { text: `${Math.abs(diffDays)}天超期`, color: 'text-[#DE350B]', bg: 'bg-[#FFEBE6]' };
    if (diffDays === 0) return { text: '今天', color: 'text-[#FF8B00]', bg: 'bg-[#FFFAE6]' };
    if (diffDays <= 3) return { text: `${diffDays}天后`, color: 'text-[#FF8B00]', bg: 'bg-[#FFFAE6]' };
    return null;
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
              // Fallback: try to open directly
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
      {/* 优化：确保摘要截断不会溢出 */}
      <p className="mb-3 text-sm font-normal text-[#172B4D] line-clamp-2 leading-snug break-words">
        {task.summary}
      </p>

      {/* 日期提示 */}
      {dueInfo && (
        <div className={`mb-2 inline-block rounded px-1.5 py-0.5 text-[10px] ${dueInfo.bg} ${dueInfo.color}`}>
          {dueInfo.text}
        </div>
      )}

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
          {/* 使用 Avatar 组件，支持多种字段格式 */}
          <Avatar 
            name={task.assignee?.name || task.assignee_name || ''} 
            size={24} 
          />
          <span className="max-w-[70px] truncate text-[11px] text-[#5E6C84]">
            {/* 健壮性：支持 assignee.name 或 assignee_name */}
            {task.assignee?.name || task.assignee_name || '未分配'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default TaskCard;
