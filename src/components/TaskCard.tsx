import { useState, useRef, useEffect } from 'react';
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
 * 支持编辑：
 * - 故事点（点击数字徽章编辑）
 * - 截止日期（点击日期徽章编辑）
 */
export function TaskCard({ task, onClick, onUpdate }: TaskCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  // 编辑状态
  const [editingStoryPoints, setEditingStoryPoints] = useState(false);
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [tempStoryPoints, setTempStoryPoints] = useState<string>(task.storyPoints?.toString() || '');
  const [tempDueDate, setTempDueDate] = useState<string>(task.dueDate || '');
  const [isSaving, setIsSaving] = useState(false);
  
  const storyPointsInputRef = useRef<HTMLInputElement>(null);
  const dueDateInputRef = useRef<HTMLInputElement>(null);
  
  const isBug = task.issuetype?.toLowerCase() === 'bug';
  
  // 自动聚焦输入框
  useEffect(() => {
    if (editingStoryPoints && storyPointsInputRef.current) {
      storyPointsInputRef.current.focus();
      storyPointsInputRef.current.select();
    }
  }, [editingStoryPoints]);
  
  useEffect(() => {
    if (editingDueDate && dueDateInputRef.current) {
      dueDateInputRef.current.focus();
    }
  }, [editingDueDate]);

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
  
  // 保存故事点
  const saveStoryPoints = async () => {
    const value = tempStoryPoints.trim() === '' ? null : parseFloat(tempStoryPoints);
    
    // 验证输入
    if (value !== null && (isNaN(value) || value < 0)) {
      setTempStoryPoints(task.storyPoints?.toString() || '');
      setEditingStoryPoints(false);
      return;
    }
    
    // 如果没有变化，直接关闭
    if (value === task.storyPoints || (value === null && !task.storyPoints)) {
      setEditingStoryPoints(false);
      return;
    }
    
    setIsSaving(true);
    
    try {
      // 调用 Jira API 更新
      const result = await window.electronAPI.jira.updateIssue(task.key, {
        storyPoints: value,
      });
      
      if (result.success) {
        // 更新本地状态
        onUpdate?.(task, { storyPoints: value });
      } else {
        // 失败时恢复原值
        setTempStoryPoints(task.storyPoints?.toString() || '');
        console.error('[TaskCard] Failed to update story points:', result.error);
      }
    } catch (error) {
      console.error('[TaskCard] Error updating story points:', error);
      setTempStoryPoints(task.storyPoints?.toString() || '');
    } finally {
      setIsSaving(false);
      setEditingStoryPoints(false);
    }
  };
  
  // 保存截止日期
  const saveDueDate = async () => {
    const value = tempDueDate.trim() === '' ? null : tempDueDate;
    
    // 如果没有变化，直接关闭
    if (value === task.dueDate) {
      setEditingDueDate(false);
      return;
    }
    
    setIsSaving(true);
    
    try {
      // 调用 Jira API 更新
      const result = await window.electronAPI.jira.updateIssue(task.key, {
        dueDate: value,
      });
      
      if (result.success) {
        // 更新本地状态
        onUpdate?.(task, { dueDate: value });
      } else {
        // 失败时恢复原值
        setTempDueDate(task.dueDate || '');
        console.error('[TaskCard] Failed to update due date:', result.error);
      }
    } catch (error) {
      console.error('[TaskCard] Error updating due date:', error);
      setTempDueDate(task.dueDate || '');
    } finally {
      setIsSaving(false);
      setEditingDueDate(false);
    }
  };
  
  // 处理键盘事件
  const handleStoryPointsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveStoryPoints();
    } else if (e.key === 'Escape') {
      setTempStoryPoints(task.storyPoints?.toString() || '');
      setEditingStoryPoints(false);
    }
  };
  
  const handleDueDateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveDueDate();
    } else if (e.key === 'Escape') {
      setTempDueDate(task.dueDate || '');
      setEditingDueDate(false);
    }
  };

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
        ${isSaving ? 'opacity-70' : ''}
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
      {/* 优化：确保摘要截断不会溢出，使用 flex-1 填充剩余空间 */}
      <p className="flex-1 mb-3 text-sm font-normal text-[#172B4D] line-clamp-4 leading-snug break-words overflow-hidden">
        {task.summary}
      </p>

      {/* 日期提示和故事点 */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {/* 故事点编辑 */}
        {editingStoryPoints ? (
          <div 
            className="flex items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={storyPointsInputRef}
              type="number"
              min="0"
              step="0.5"
              value={tempStoryPoints}
              onChange={(e) => setTempStoryPoints(e.target.value)}
              onBlur={saveStoryPoints}
              onKeyDown={handleStoryPointsKeyDown}
              className="w-16 h-7 px-2 text-xs bg-white text-[#172B4D] border-2 border-[#4C9AFF] rounded focus:outline-none focus:ring-2 focus:ring-[#4C9AFF] focus:ring-offset-0 shadow-sm"
              placeholder="-"
            />
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setTempStoryPoints(task.storyPoints?.toString() || '');
              setEditingStoryPoints(true);
            }}
            className={`
              inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium
              transition-colors
              ${task.storyPoints 
                ? 'bg-[#E3FCEF] text-[#006644] hover:bg-[#36B37E] hover:text-white' 
                : 'bg-[#F4F5F7] text-[#5E6C84] hover:bg-[#DFE1E6]'
              }
            `}
            title={task.storyPoints ? `故事点: ${task.storyPoints}` : '点击设置故事点'}
          >
            <Hash className="h-3 w-3" />
            <span>{task.storyPoints ?? '-'}</span>
          </button>
        )}
        
        {/* 截止日期编辑 */}
        {editingDueDate ? (
          <div 
            className="flex items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={dueDateInputRef}
              type="date"
              value={tempDueDate}
              onChange={(e) => setTempDueDate(e.target.value)}
              onBlur={saveDueDate}
              onKeyDown={handleDueDateKeyDown}
              className="w-32 h-7 px-2 text-xs bg-white text-[#172B4D] border-2 border-[#4C9AFF] rounded focus:outline-none focus:ring-2 focus:ring-[#4C9AFF] focus:ring-offset-0 shadow-sm"
            />
          </div>
        ) : dueInfo ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setTempDueDate(task.dueDate || '');
              setEditingDueDate(true);
            }}
            className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] ${dueInfo.bg} ${dueInfo.color} hover:opacity-80 transition-opacity`}
            title={`截止: ${task.dueDate}，点击编辑`}
          >
            <Calendar className="h-3 w-3" />
            <span>{dueInfo.text}</span>
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setTempDueDate(task.dueDate || '');
              setEditingDueDate(true);
            }}
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] bg-[#F4F5F7] text-[#5E6C84] hover:bg-[#DFE1E6] transition-colors"
            title="点击设置截止日期"
          >
            <Calendar className="h-3 w-3" />
            <span>未设置</span>
          </button>
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
