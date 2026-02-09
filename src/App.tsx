import { useEffect, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { BookOpen, GitBranch, Bug, Plus } from 'lucide-react';
import { Board } from './components/Board';
import { Settings } from './pages/Settings';
import { Reports } from './pages/Reports';
import { History } from './pages/History';
import { GlobalActionProvider, useGlobalAction } from './contexts/GlobalActionContext';

function AppContent() {
  const [activeTab, setActiveTab] = useState<'board' | 'reports' | 'settings' | 'history'>('board');
  const [isReady, setIsReady] = useState(false);
  const { openCreateTask } = useGlobalAction();

  // 打开外部链接
  const openExternalLink = async (url: string) => {
    try {
      const result = await window.electronAPI.system.openExternal(url);
      if (!result.success) {
        toast.error('打开链接失败', { description: result.error });
      }
    } catch (error) {
      console.error('Failed to open external link:', error);
      toast.error('打开链接失败');
    }
  };

  // Global keyboard shortcut Ctrl+N / Cmd+N
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openCreateTask();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openCreateTask]);

  useEffect(() => {
    if (window.electronAPI) {
      console.log('[App] Electron API is ready');
      setIsReady(true);
    } else {
      console.error('[App] Electron API not found');
      toast.error('Electron API 未找到');
    }
  }, []);

  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F4F5F7]">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[#0052CC] border-t-transparent" />
          <p className="text-[#5E6C84]">正在初始化...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Global Toast Container */}
      <Toaster 
        position="top-center"
        toastOptions={{
          style: {
            background: '#FFFFFF',
            color: '#172B4D',
            border: '1px solid #DFE1E6',
            boxShadow: '0 4px 12px rgba(9, 30, 66, 0.15)',
            borderRadius: '6px',
            fontSize: '14px',
          },
        }}
      />
      
      <div className="flex h-screen flex-col bg-[#F4F5F7]">
        {/* 顶部标题栏 */}
        <div className="electron-drag flex h-12 items-center border-b border-[#DFE1E6] bg-white px-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-[#0052CC]">Jira Flow</span>
            <span className="rounded bg-[#F4F5F7] px-2 py-0.5 text-xs text-[#5E6C84]">v{__APP_VERSION__}</span>
          </div>
          
          {/* 外部链接按钮 */}
          <div className="ml-6 flex items-center gap-2 electron-no-drag">
            <button
              onClick={() => openExternalLink('https://confluence.ykeey.tech/#all-updates')}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[#0052CC] hover:bg-[#F4F5F7] transition-colors"
              title="打开 Confluence"
            >
              <BookOpen className="h-4 w-4" />
              <span>Confluence</span>
            </button>
            <button
              onClick={() => openExternalLink('http://172.18.11.224:7990/dashboard')}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[#0052CC] hover:bg-[#F4F5F7] transition-colors"
              title="打开 Bitbucket"
            >
              <GitBranch className="h-4 w-4" />
              <span>Bitbucket</span>
            </button>
            <button
              onClick={() => openExternalLink('https://jira.ykeey.cn/secure/Dashboard.jspa')}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[#0052CC] hover:bg-[#F4F5F7] transition-colors"
              title="打开 Jira"
            >
              <Bug className="h-4 w-4" />
              <span>Jira</span>
            </button>
          </div>
          
          <div className="ml-auto flex items-center gap-2 electron-no-drag">
            <button
              onClick={() => setActiveTab('board')}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'board'
                  ? 'bg-[#0052CC] text-white'
                  : 'text-[#5E6C84] hover:bg-[#F4F5F7]'
              }`}
            >
              看板
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'reports'
                  ? 'bg-[#0052CC] text-white'
                  : 'text-[#5E6C84] hover:bg-[#F4F5F7]'
              }`}
            >
              日志
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'settings'
                  ? 'bg-[#0052CC] text-white'
                  : 'text-[#5E6C84] hover:bg-[#F4F5F7]'
              }`}
            >
              设置
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-[#0052CC] text-white'
                  : 'text-[#5E6C84] hover:bg-[#F4F5F7]'
              }`}
            >
              历史
            </button>
            
            {/* 新建个人任务按钮 */}
            <div className="h-6 w-px bg-[#DFE1E6] mx-1" />
            <button
              onClick={openCreateTask}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white bg-[#0052CC] hover:bg-[#0747A6] transition-colors"
              title="新建个人任务 (Ctrl+N)"
            >
              <Plus className="h-4 w-4" />
              <span>新建</span>
            </button>
          </div>
        </div>

        {/* 主内容区域 */}
        <main className="flex-1 overflow-hidden">
          {activeTab === 'board' && <Board />}
          {activeTab === 'reports' && <Reports />}
          {activeTab === 'settings' && <Settings />}
          {activeTab === 'history' && <History />}
        </main>
      </div>
    </>
  );
}

function App() {
  return (
    <GlobalActionProvider>
      <AppContent />
    </GlobalActionProvider>
  );
}

export default App;
