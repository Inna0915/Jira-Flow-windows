import { useEffect } from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { TaskCard } from './TaskCard';
import type { BoardTask, SwimlaneType } from '../stores/boardStore';
import { BOARD_COLUMNS } from '../stores/boardStore';

interface SwimlaneProps {
  id: SwimlaneType;
  title: string;
  isCollapsed: boolean;
  onToggle: () => void;
  getTasksForColumn: (columnId: string) => BoardTask[];
  onTaskClick: (task: BoardTask) => void;
  visibleColumns: string[];
  columnWidthClass?: string;
}

export function Swimlane({ 
  id, 
  title, 
  isCollapsed, 
  onToggle, 
  getTasksForColumn,
  onTaskClick,
  visibleColumns,
  columnWidthClass = 'flex-1 min-w-[280px] max-w-[400px] flex-shrink-0 border-r border-[#DFE1E6]'
}: SwimlaneProps) {
  // 过滤可见列
  const columns = BOARD_COLUMNS.filter(col => visibleColumns.includes(col.id));
  
  // 计算此泳道的总任务数（仅可见列）
  const totalTasks = columns.reduce(
    (sum, col) => sum + getTasksForColumn(col.id).length, 
    0
  );

  // 根据泳道类型设置颜色和样式
  const getHeaderStyles = () => {
    switch (id) {
      case 'overdue':
        return {
          bg: 'bg-[#FFEBE6]',
          border: 'border-[#FF5630]/20',
          text: 'text-[#DE350B]',
          badge: 'bg-white text-[#DE350B]',
        };
      case 'onSchedule':
        return {
          bg: 'bg-[#E6FCFF]',
          border: 'border-[#00B8D9]/20',
          text: 'text-[#006644]',
          badge: 'bg-white text-[#006644]',
        };
      case 'others':
      default:
        return {
          bg: 'bg-[#F4F5F7]',
          border: 'border-[#DFE1E6]',
          text: 'text-[#42526E]',
          badge: 'bg-white text-[#42526E]',
        };
    }
  };

  const styles = getHeaderStyles();

  // 如果任务数为 0，默认折叠
  useEffect(() => {
    if (totalTasks === 0 && !isCollapsed) {
      onToggle();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalTasks, isCollapsed]);

  return (
    <div className={`mb-3 rounded-lg border ${styles.border} bg-white shadow-sm inline-block min-w-full`}>
      {/* 泳道头部 - 使用和内容完全相同的 flex 结构 */}
      <div className="flex flex-row">
        {/* 第一个列：标题和折叠按钮 */}
        <div className={`${columnWidthClass} px-4 py-2.5 ${styles.bg} ${styles.text}`}>
          <button
            onClick={onToggle}
            className="flex w-full items-center justify-between transition-colors hover:opacity-90"
          >
            <div className="flex items-center gap-2">
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              <span className="text-xs font-bold uppercase tracking-wider">{title}</span>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${styles.badge}`}>
              {totalTasks}
            </span>
          </button>
        </div>
        
        {/* 其余列：空的占位，保持宽度对齐 */}
        {columns.slice(1).map((column) => (
          <div 
            key={column.id} 
            className={`${columnWidthClass} px-4 py-2.5 ${styles.bg}`}
          />
        ))}
      </div>

      {/* 泳道内容 */}
      {!isCollapsed && (
        <div className="flex flex-row">
          {columns.map((column) => {
            const tasks = getTasksForColumn(column.id);
            const droppableId = `${id}:${column.id}`;

            return (
              <Droppable droppableId={droppableId} key={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`
                      ${columnWidthClass}
                      min-h-[200px] p-2
                      ${snapshot.isDraggingOver ? 'bg-[#DEEBFF]/50' : 'bg-white'}
                    `}
                  >
                    {/* 任务列表 */}
                    <div className="space-y-2 min-h-[180px]">
                      {tasks.length === 0 ? (
                        <div className="flex h-full min-h-[180px] items-center justify-center">
                          <span className="text-[10px] text-[#C1C7D0]">-</span>
                        </div>
                      ) : (
                        tasks.map((task, index) => (
                          <Draggable
                            key={task.key}
                            draggableId={task.key}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={snapshot.isDragging ? 'opacity-50' : ''}
                                style={{
                                  ...provided.draggableProps.style,
                                }}
                              >
                                <TaskCard task={task} onClick={onTaskClick} />
                              </div>
                            )}
                          </Draggable>
                        ))
                      )}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Swimlane;
