import { useState, useEffect } from 'react';

interface JiraConfig {
  baseUrl: string;
  username: string;
  password: string;
}

export function SettingsPanel() {
  const [jiraConfig, setJiraConfig] = useState<JiraConfig>({
    baseUrl: '',
    username: '',
    password: '',
  });
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // 加载已保存的配置
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const result = await window.electronAPI.jira.getConfig();
      if (result.success && result.data) {
        const data = result.data as { baseUrl: string; username: string };
        setJiraConfig((prev) => ({
          ...prev,
          baseUrl: data.baseUrl,
          username: data.username,
        }));
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const handleTestConnection = async () => {
    if (!jiraConfig.baseUrl || !jiraConfig.username || !jiraConfig.password) {
      setTestResult({ success: false, message: '请填写所有必填字段' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await window.electronAPI.jira.testConnection(jiraConfig);
      if (result.success) {
        const data = result.data as { displayName: string };
        setTestResult({
          success: true,
          message: `连接成功！欢迎，${data.displayName}`,
        });
      } else {
        setTestResult({
          success: false,
          message: `连接失败: ${result.error}`,
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `连接错误: ${error}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!jiraConfig.baseUrl || !jiraConfig.username || !jiraConfig.password) {
      alert('请填写所有必填字段');
      return;
    }

    setIsSaving(true);
    try {
      const result = await window.electronAPI.jira.saveConfig(jiraConfig);
      if (result.success) {
        alert('配置保存成功！');
      } else {
        alert(`保存失败: ${result.error}`);
      }
    } catch (error) {
      alert(`保存错误: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div className="flex h-full flex-col p-6">
      <h2 className="mb-6 text-xl font-semibold text-gray-100">设置</h2>

      <div className="mx-auto w-full max-w-2xl space-y-6">
        {/* Jira 配置卡片 */}
        <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600/20 text-blue-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-100">Jira 集成</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Jira 服务器地址 <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={jiraConfig.baseUrl}
                onChange={(e) =>
                  setJiraConfig((prev) => ({ ...prev, baseUrl: e.target.value }))
                }
                placeholder="https://jira.example.com"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-gray-500">例如: https://jira.company.com</p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                用户名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={jiraConfig.username}
                onChange={(e) =>
                  setJiraConfig((prev) => ({ ...prev, username: e.target.value }))
                }
                placeholder="your.email@company.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                密码 / PAT <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={jiraConfig.password}
                onChange={(e) =>
                  setJiraConfig((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="Personal Access Token 或密码"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-gray-500">
                建议使用 Personal Access Token (PAT) 以获得更好的安全性
              </p>
            </div>

            {/* 测试结果提示 */}
            {testResult && (
              <div
                className={`rounded-md border p-3 text-sm ${
                  testResult.success
                    ? 'border-green-700 bg-green-900/20 text-green-400'
                    : 'border-red-700 bg-red-900/20 text-red-400'
                }`}
              >
                {testResult.message}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleTestConnection}
                disabled={isTesting}
                className="rounded-md border border-gray-600 bg-transparent px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-gray-100 disabled:opacity-50"
              >
                {isTesting ? '测试中...' : '测试连接'}
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? '保存中...' : '保存配置'}
              </button>
            </div>
          </div>
        </div>

        {/* 应用信息 */}
        <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-6">
          <h3 className="mb-4 text-lg font-medium text-gray-100">关于</h3>
          <div className="space-y-2 text-sm text-gray-400">
            <p>
              <span className="text-gray-500">版本:</span> 1.0.0
            </p>
            <p>
              <span className="text-gray-500">构建时间:</span> 2026-02-05
            </p>
            <p className="pt-2 text-xs">
              Jira Flow - 本地优先的开发者工作台，用于同步 Jira 任务、管理看板和生成工作报告。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
