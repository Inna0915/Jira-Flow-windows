import { useEffect, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { Board } from './components/Board';
import { Settings } from './pages/Settings';
import { Reports } from './pages/Reports';

function App() {
  const [activeTab, setActiveTab] = useState<'board' | 'reports' | 'settings'>('board');
  const [isReady, setIsReady] = useState(false);

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
            <span className="rounded bg-[#F4F5F7] px-2 py-0.5 text-xs text-[#5E6C84]">v1.2.0</span>
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
          </div>
        </div>

        {/* 主内容区域 */}
        <main className="flex-1 overflow-hidden">
          {activeTab === 'board' && <Board />}
          {activeTab === 'reports' && <Reports />}
          {activeTab === 'settings' && <Settings />}
        </main>
      </div>
    </>
  );
}

export default App;
