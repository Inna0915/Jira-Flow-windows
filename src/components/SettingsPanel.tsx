import { useState, useEffect, useRef } from 'react';
import { User, Upload, X, Check, FolderKanban } from 'lucide-react';
import { toast } from 'sonner';

interface JiraConfig {
  host: string;
  username: string;
  password: string;
  projectKey: string;
}

interface AvatarSettings {
  name: string;
  image: string;
}

interface ObsidianConfig {
  vaultPath: string;
}

export function SettingsPanel() {
  const [jiraConfig, setJiraConfig] = useState<JiraConfig>({
    host: '',
    username: '',
    password: '',
    projectKey: '',
  });
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // 头像设置
  const [avatarName, setAvatarName] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [savedAvatars, setSavedAvatars] = useState<AvatarSettings[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Obsidian 设置
  const [obsidianConfig, setObsidianConfig] = useState<ObsidianConfig>({
    vaultPath: '',
  });

  useEffect(() => {
    loadConfig();
    loadSavedAvatars();
    loadObsidianConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const result = await window.electronAPI.jira.getConfig();
      if (result.success && result.data) {
        const data = result.data;
        setJiraConfig({
          host: data.host,
          username: data.username,
          password: data.password || '',
          projectKey: data.projectKey || '',
        });
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const loadObsidianConfig = async () => {
    try {
      const result = await window.electronAPI.obsidian.getVaultPath();
      if (result.success) {
        setObsidianConfig({ vaultPath: result.data });
      }
    } catch (error) {
      console.error('Failed to load Obsidian config:', error);
    }
  };

  const handleSaveObsidianConfig = async () => {
    try {
      const result = await window.electronAPI.obsidian.setVaultPath(obsidianConfig.vaultPath);
      if (result.success) {
        toast.success('Obsidian Vault 路径已保存');
      } else {
        toast.error('保存失败');
      }
    } catch (error) {
      console.error('Failed to save Obsidian config:', error);
      toast.error('保存失败');
    }
  };

  const loadSavedAvatars = async () => {
    try {
      const result = await window.electronAPI.database.settings.get('saved_avatars');
      if (result.success && result.data) {
        setSavedAvatars(JSON.parse(result.data));
      } else {
        setSavedAvatars([]);
      }
    } catch (error) {
      console.error('Failed to load avatars:', error);
      setSavedAvatars([]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('图片大小不能超过 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setAvatarPreview(result);
    };
    reader.onerror = () => {
      toast.error('读取图片失败');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAvatar = async () => {
    const trimmedName = avatarName.trim();
    if (!trimmedName || !avatarPreview) {
      toast.error('请输入名称并选择图片');
      return;
    }

    try {
      await window.electronAPI.database.settings.set(
        `avatar_${trimmedName}`,
        avatarPreview
      );

      const newAvatar: AvatarSettings = { name: trimmedName, image: avatarPreview };
      const filtered = savedAvatars.filter(a => a.name !== trimmedName);
      const updated = [...filtered, newAvatar];
      
      setSavedAvatars(updated);
      await window.electronAPI.database.settings.set(
        'saved_avatars',
        JSON.stringify(updated)
      );

      setAvatarName('');
      setAvatarPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      toast.success(`头像 "${trimmedName}" 保存成功！`);
    } catch (error) {
      console.error('Failed to save avatar:', error);
      toast.error('保存失败');
    }
  };

  const handleDeleteAvatar = async (name: string) => {
    try {
      await window.electronAPI.database.settings.delete(`avatar_${name}`);
      const updated = savedAvatars.filter(a => a.name !== name);
      setSavedAvatars(updated);
      await window.electronAPI.database.settings.set(
        'saved_avatars',
        JSON.stringify(updated)
      );
      toast.success('头像已删除');
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const handleTestConnection = async () => {
    if (!jiraConfig.host || !jiraConfig.username || !jiraConfig.password) {
      toast.error('请填写所有必填字段');
      return;
    }

    setIsTesting(true);
    const loadingToast = toast.loading('正在测试连接...');

    try {
      const result = await window.electronAPI.jira.testConnection(jiraConfig);
      toast.dismiss(loadingToast);
      
      if (result.success) {
        toast.success(`连接成功！欢迎，${result.user.displayName}`);
      } else {
        toast.error(`连接失败: ${result.error}`);
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(`连接错误: ${error}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!jiraConfig.host || !jiraConfig.username || !jiraConfig.password) {
      toast.error('请填写所有必填字段');
      return;
    }

    setIsSaving(true);
    const loadingToast = toast.loading('正在保存...');
    
    try {
      const result = await window.electronAPI.jira.saveConfig(jiraConfig);
      toast.dismiss(loadingToast);
      
      if (result.success) {
        toast.success('配置保存成功！');
      } else {
        toast.error(`保存失败: ${result.error}`);
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(`保存错误: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    'w-full rounded border border-[#DFE1E6] bg-white px-3 py-2 text-sm text-[#172B4D] placeholder-[#C1C7D0] focus:border-[#4C9AFF] focus:outline-none focus:ring-1 focus:ring-[#4C9AFF]';

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#F4F5F7] p-6">
      <h2 className="mb-6 text-2xl font-bold text-[#172B4D]">设置</h2>

      <div className="mx-auto w-full max-w-3xl space-y-6">
        {/* Jira 配置卡片 */}
        <div className="rounded-lg border border-[#DFE1E6] bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-[#0052CC]/10 text-[#0052CC]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-[#172B4D]">Jira 集成</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#172B4D]">
                Jira 服务器地址 <span className="text-[#FF5630]">*</span>
              </label>
              <input
                type="url"
                value={jiraConfig.host}
                onChange={(e) => setJiraConfig(prev => ({ ...prev, host: e.target.value }))}
                placeholder="https://jira.example.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#172B4D]">
                用户名 <span className="text-[#FF5630]">*</span>
              </label>
              <input
                type="text"
                value={jiraConfig.username}
                onChange={(e) => setJiraConfig(prev => ({ ...prev, username: e.target.value }))}
                placeholder="your.email@company.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#172B4D]">
                密码 / PAT <span className="text-[#FF5630]">*</span>
              </label>
              <input
                type="text"
                value={jiraConfig.password}
                onChange={(e) => setJiraConfig(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Personal Access Token"
                className={inputClass}
              />
            </div>

            <div className="rounded-lg border border-[#DEEBFF] bg-[#F4F8FF] p-4">
              <div className="mb-3 flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-[#0052CC]" />
                <span className="text-sm font-medium text-[#0052CC]">Agile 看板配置（可选）</span>
              </div>
              <p className="mb-3 text-xs text-[#5E6C84]">
                设置项目 Key 以启用 Agile 看板自动检测（如 PROJ-123 中的 PROJ）。留空则使用 JQL 同步。
              </p>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#172B4D]">
                  项目 Key
                </label>
                <input
                  type="text"
                  value={jiraConfig.projectKey}
                  onChange={(e) => setJiraConfig(prev => ({ ...prev, projectKey: e.target.value.toUpperCase() }))}
                  placeholder="PROJ"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-[#5E6C84]">
                  从任务 Key 前缀自动提取，例如 &quot;PROJ-123&quot; 的项目 Key 是 &quot;PROJ&quot;
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleTestConnection}
                disabled={isTesting}
                className="rounded border border-[#DFE1E6] bg-white px-4 py-2 text-sm font-medium text-[#172B4D] hover:bg-[#F4F5F7] disabled:opacity-50"
              >
                {isTesting ? '测试中...' : '测试连接'}
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="rounded bg-[#0052CC] px-4 py-2 text-sm font-medium text-white hover:bg-[#0747A6] disabled:opacity-50"
              >
                {isSaving ? '保存中...' : '保存配置'}
              </button>
            </div>
          </div>
        </div>

        {/* Obsidian 集成配置 */}
        <div className="rounded-lg border border-[#DFE1E6] bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-[#E3FCEF] text-[#006644]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-[#172B4D]">Obsidian 集成</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#172B4D]">
                Vault 路径
              </label>
              <input
                type="text"
                value={obsidianConfig.vaultPath}
                onChange={(e) => setObsidianConfig(prev => ({ ...prev, vaultPath: e.target.value }))}
                placeholder="C:\Users\YourName\Documents\Obsidian Vault"
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-[#5E6C84]">
                设置 Obsidian Vault 的本地路径。完成的任务将自动同步到此目录的 Markdown 文件。
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSaveObsidianConfig}
                className="rounded bg-[#36B37E] px-4 py-2 text-sm font-medium text-white hover:bg-[#2EA36A]"
              >
                保存路径
              </button>
            </div>
          </div>
        </div>

        {/* 头像上传区域 */}
        <div className="rounded-lg border border-[#DFE1E6] bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-[#DEEBFF] text-[#0747A6]">
              <User className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold text-[#172B4D]">头像设置</h3>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-dashed border-[#DFE1E6] bg-[#FAFBFC] p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="mb-1 block text-xs font-medium text-[#5E6C84]">
                    用户名称 <span className="text-[#FF5630]">*</span>
                  </label>
                  <input
                    type="text"
                    value={avatarName}
                    onChange={(e) => setAvatarName(e.target.value)}
                    placeholder="输入 Jira 用户名（如：wangph）"
                    className={inputClass}
                  />
                </div>

                <div className="flex-1 min-w-[200px]">
                  <label className="mb-1 block text-xs font-medium text-[#5E6C84]">
                    选择图片 <span className="text-[#FF5630]">*</span>
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded border border-[#DFE1E6] bg-white px-4 py-2 text-sm text-[#172B4D] hover:bg-[#F4F5F7]"
                  >
                    <Upload className="h-4 w-4" />
                    {avatarPreview ? '更换图片' : '选择图片'}
                  </button>
                </div>

                {avatarPreview && (
                  <div className="flex flex-col items-center gap-2">
                    <img
                      src={avatarPreview}
                      alt="Preview"
                      className="h-14 w-14 rounded-full border-2 border-[#DFE1E6] object-cover"
                    />
                    <button
                      onClick={handleSaveAvatar}
                      className="flex items-center gap-1 rounded bg-[#36B37E] px-3 py-1.5 text-xs text-white hover:bg-[#2EA36A]"
                    >
                      <Check className="h-3 w-3" />
                      保存头像
                    </button>
                  </div>
                )}
              </div>
            </div>

            {savedAvatars.length > 0 && (
              <div>
                <h4 className="mb-3 text-sm font-medium text-[#5E6C84]">已保存的头像 ({savedAvatars.length}个)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {savedAvatars.map((avatar) => (
                    <div
                      key={avatar.name}
                      className="flex flex-col items-center rounded-lg border border-[#DFE1E6] bg-white p-3"
                    >
                      <img
                        src={avatar.image}
                        alt={avatar.name}
                        className="mb-2 h-14 w-14 rounded-full object-cover border border-[#DFE1E6]"
                      />
                      <span className="mb-2 max-w-full truncate text-xs font-medium text-[#172B4D]">
                        {avatar.name}
                      </span>
                      <button
                        onClick={() => handleDeleteAvatar(avatar.name)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#FF5630] hover:bg-[#FFEBE6]"
                      >
                        <X className="h-3 w-3" />
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 应用信息 */}
        <div className="rounded-lg border border-[#DFE1E6] bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-[#172B4D]">关于</h3>
          <div className="space-y-2 text-sm text-[#5E6C84]">
            <p><span className="font-medium">版本:</span> 1.0.0</p>
            <p><span className="font-medium">构建时间:</span> 2026-02-05</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
