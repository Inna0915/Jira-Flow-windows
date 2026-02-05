import { useEffect, useState } from 'react';
import { KanbanBoard } from './components/KanbanBoard';
import { SettingsPanel } from './components/SettingsPanel';

function App() {
  const [activeTab, setActiveTab] = useState<'board' | 'settings'>('board');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // 检查 Electron API 是否可用
    if (window.electronAPI) {
      console.log('[App] Electron API is ready');
      setIsReady(true);
    } else {
      console.error('[App] Electron API not found');
    }
  }, []);

  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-gray-400">正在初始化...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-900 text-gray-100">
      {/* 顶部标题栏 - 支持拖拽 */}
      <div className="electron-drag flex h-12 items-center border-b border-gray-800 bg-gray-900/95 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-blue-400">Jira Flow</span>
          <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-500">v1.0.0</span>
        </div>
        <div className="ml-auto flex items-center gap-4 electron-no-drag">
          <button
            onClick={() => setActiveTab('board')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'board'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
          >
            看板
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
          >
            设置
          </button>
        </div>
      </div>

      {/* 主内容区域 */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'board' ? <KanbanBoard /> : <SettingsPanel />}
      </main>
    </div>
  );
}

export default App;
