import { Settings, Layout, RefreshCw } from 'lucide-react';

interface HeaderProps {
  activeTab: 'board' | 'settings';
  onTabChange: (tab: 'board' | 'settings') => void;
  onSync?: () => void;
  isSyncing?: boolean;
}

export function Header({ activeTab, onTabChange, onSync, isSyncing }: HeaderProps) {
  return (
    <header className="electron-drag flex h-14 items-center justify-between border-b border-gray-800 bg-gray-900/95 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Layout className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-100">Jira Flow</h1>
          <p className="text-xs text-gray-500">本地开发者工作台</p>
        </div>
      </div>

      <div className="electron-no-drag flex items-center gap-2">
        {activeTab === 'board' && onSync && (
          <button
            onClick={onSync}
            disabled={isSyncing}
            className="flex items-center gap-2 rounded-md bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700 hover:text-gray-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? '同步中' : '同步'}
          </button>
        )}

        <div className="mx-2 h-6 w-px bg-gray-700" />

        <button
          onClick={() => onTabChange('board')}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === 'board'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
          }`}
        >
          <Layout className="h-4 w-4" />
          看板
        </button>

        <button
          onClick={() => onTabChange('settings')}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === 'settings'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
          }`}
        >
          <Settings className="h-4 w-4" />
          设置
        </button>
      </div>
    </header>
  );
}
