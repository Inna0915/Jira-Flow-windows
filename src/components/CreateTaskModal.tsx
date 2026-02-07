import { useState, useEffect } from 'react';
import { X, Plus, Calendar, AlertCircle, Check, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { BOARD_COLUMNS } from '../stores/boardStore';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  task?: any | null; // 编辑模式传入的任务
}

type Priority = 'High' | 'Medium' | 'Low';

// 个人任务可选的初始列（排除已完成和归档的列）
const AVAILABLE_COLUMNS = BOARD_COLUMNS.filter(
  col => !['RESOLVED', 'DONE', 'CLOSED'].includes(col.id)
);

export function CreateTaskModal({ isOpen, onClose, onSave, task }: CreateTaskModalProps) {
  const isEditMode = !!task;
  const [summary, setSummary] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [initialColumn, setInitialColumn] = useState('FUNNEL');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 编辑模式下初始化表单
  useEffect(() => {
    if (task) {
      setSummary(task.summary || '');
      setPriority((task.priority as Priority) || 'Medium');
      setDueDate(task.due_date || '');
      setDescription(task.description || '');
      setInitialColumn(task.mapped_column || 'FUNNEL');
    } else {
      setSummary('');
      setPriority('Medium');
      setDueDate('');
      setDescription('');
      setInitialColumn('FUNNEL');
    }
  }, [task]);

  const handleClose = () => {
    setSummary('');
    setPriority('Medium');
    setDueDate('');
    setDescription('');
    setInitialColumn('FUNNEL');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!summary.trim()) {
      toast.error('请输入任务标题');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditMode && task) {
        // 编辑模式
        const result = await window.electronAPI.task.updatePersonal(task.key, {
          summary: summary.trim(),
          priority,
          due_date: dueDate || '',
          description: description.trim(),
        });

        if (result.success) {
          toast.success('任务更新成功');
          onSave();
          handleClose();
        } else {
          toast.error(result.error || '更新失败');
        }
      } else {
        // 创建模式
        const result = await window.electronAPI.task.createPersonal({
          summary: summary.trim(),
          priority,
          dueDate: dueDate || undefined,
          description: description.trim() || undefined,
          initialColumn,
        });

        if (result.success) {
          toast.success('任务创建成功');
          onSave();
          handleClose();
        } else {
          toast.error(result.error || '创建失败');
        }
      }
    } catch (error) {
      console.error('Failed to save task:', error);
      toast.error(isEditMode ? '更新任务失败' : '创建任务失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-[500px] max-w-[90vw] max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-100 rounded-lg">
              <Plus className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isEditMode ? '编辑个人任务' : '创建个人任务'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Summary */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              任务标题 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="需要做点什么?"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-900 placeholder-gray-400"
              autoFocus
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              优先级
            </label>
            <div className="flex gap-3">
              {(['High', 'Medium', 'Low'] as Priority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-all ${
                    priority === p
                      ? p === 'High'
                        ? 'bg-red-50 border-red-300 text-red-700'
                        : p === 'Medium'
                        ? 'bg-yellow-50 border-yellow-300 text-yellow-700'
                        : 'bg-green-50 border-green-300 text-green-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {p === 'High' && <AlertCircle className="w-4 h-4 inline mr-1.5" />}
                  {p === 'High' ? '高' : p === 'Medium' ? '中' : '低'}
                </button>
              ))}
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              截止日期
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-900"
              />
            </div>
          </div>

          {/* Initial Column - 仅在创建模式显示 */}
          {!isEditMode && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                初始列
              </label>
              <div className="relative">
                <LayoutGrid className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  value={initialColumn}
                  onChange={(e) => setInitialColumn(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-900 bg-white appearance-none cursor-pointer"
                >
                  {AVAILABLE_COLUMNS.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              描述 <span className="text-gray-400 font-normal">（可选）</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="添加更多细节..."
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-900 placeholder-gray-400 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !summary.trim()}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {isEditMode ? '保存中...' : '创建中...'}
                </>
              ) : (
                <>
                  {isEditMode ? (
                    <>
                      <Check className="w-4 h-4" />
                      保存修改
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      创建任务
                    </>
                  )}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
