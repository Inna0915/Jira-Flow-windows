import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  User, Upload, X, FolderKanban, 
  Sparkles, Bot, Brain, Cloud, Settings as SettingsIcon, 
  Plus, Search, Trash2, Eye, EyeOff, 
  ExternalLink, TestTube, CheckCircle2, XCircle,
  FileText, RotateCcw,
  Gem, Info, Trello, Database
} from 'lucide-react';
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

type AIProvider = 'openai' | 'deepseek' | 'moonshot' | 'qwen' | 'custom';
type TabId = 'ai' | 'templates' | 'jira' | 'obsidian' | 'profile' | 'data' | 'about';

interface AIProfile {
  id: string;
  name: string;
  provider: AIProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  isActive: boolean;
}

interface ProviderTemplate {
  name: string;
  baseUrl: string;
  defaultModel: string;
}

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

const PROVIDER_ICONS: Record<AIProvider, React.ReactNode> = {
  openai: <Brain className="h-4 w-4" />,
  deepseek: <Bot className="h-4 w-4" />,
  moonshot: <Sparkles className="h-4 w-4" />,
  qwen: <Cloud className="h-4 w-4" />,
  custom: <SettingsIcon className="h-4 w-4" />,
};

const PROVIDER_COLORS: Record<AIProvider, string> = {
  openai: '#10A37F',
  deepseek: '#4D6BFA',
  moonshot: '#000000',
  qwen: '#1677FF',
  custom: '#5E6C84',
};

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'ai', label: 'AI 配置', icon: <Bot className="h-5 w-5" /> },
  { id: 'templates', label: '报告模板', icon: <FileText className="h-5 w-5" /> },
  { id: 'jira', label: 'Jira 集成', icon: <Trello className="h-5 w-5" /> },
  { id: 'obsidian', label: 'Obsidian', icon: <Gem className="h-5 w-5" /> },
  { id: 'profile', label: '头像设置', icon: <User className="h-5 w-5" /> },
  { id: 'data', label: '数据设置', icon: <Database className="h-5 w-5" /> },
  { id: 'about', label: '关于', icon: <Info className="h-5 w-5" /> },
];

export function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>('ai');
  
  // Jira Config State
  const [jiraConfig, setJiraConfig] = useState<JiraConfig>({
    host: '',
    username: '',
    password: '',
    projectKey: '',
  });
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [autoSyncInterval, setAutoSyncInterval] = useState<number>(5);
  
  // Avatar State - Pre-fill with saved values
  const [savedAvatars, setSavedAvatars] = useState<AvatarSettings[]>([]);
  const [avatarName, setAvatarName] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Obsidian State
  const [obsidianConfig, setObsidianConfig] = useState<ObsidianConfig>({ vaultPath: '' });

  // AI Profile State
  const [aiProfiles, setAiProfiles] = useState<AIProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [providerTemplates, setProviderTemplates] = useState<Record<AIProvider, ProviderTemplate> | null>(null);
  const [formData, setFormData] = useState<Partial<AIProfile>>({
    name: '', provider: 'moonshot', baseUrl: '', apiKey: '', model: ''
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Prompt Template State
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  
  // Clear Data Dialog State
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  
  const selectedTemplate = useMemo(() => {
    return promptTemplates.find(t => t.id === selectedTemplateId) || null;
  }, [promptTemplates, selectedTemplateId]);

  useEffect(() => {
    loadConfig();
    loadSavedAvatars();
    loadObsidianConfig();
    loadAIProfiles();
    loadProviderTemplates();
    loadPromptTemplates();
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
      const autoSyncResult = await window.electronAPI.database.settings.get('jira_autoSyncInterval');
      if (autoSyncResult.success && autoSyncResult.data) {
        const minutes = parseInt(autoSyncResult.data, 10);
        if (!isNaN(minutes) && minutes >= 1) setAutoSyncInterval(minutes);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const loadObsidianConfig = async () => {
    try {
      const result = await window.electronAPI.obsidian.getVaultPath();
      if (result.success) setObsidianConfig({ vaultPath: result.data });
    } catch (error) {
      console.error('Failed to load Obsidian config:', error);
    }
  };

  const loadSavedAvatars = async () => {
    try {
      const result = await window.electronAPI.database.settings.get('saved_avatars');
      if (result.success && result.data) {
        const avatars = JSON.parse(result.data) as AvatarSettings[];
        setSavedAvatars(avatars);
        // Pre-fill with the first saved avatar if exists
        if (avatars.length > 0) {
          const firstAvatar = avatars[0];
          setAvatarName(firstAvatar.name);
          setAvatarPreview(firstAvatar.image);
        }
      } else {
        setSavedAvatars([]);
      }
    } catch (error) {
      console.error('Failed to load avatars:', error);
      setSavedAvatars([]);
    }
  };

  const loadProviderTemplates = async () => {
    try {
      const result = await window.electronAPI.ai.getProviderTemplates();
      if (result.success) setProviderTemplates(result.data);
    } catch (error) {
      console.error('Failed to load provider templates:', error);
    }
  };

  const loadAIProfiles = async () => {
    try {
      const result = await window.electronAPI.ai.getProfiles();
      if (result.success) {
        const profiles = result.data || [];
        setAiProfiles(profiles);
        if (profiles.length > 0 && !selectedProfileId) {
          setSelectedProfileId(profiles[0].id);
          setFormData(profiles[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load AI profiles:', error);
      toast.error('加载 AI 配置失败');
    }
  };

  const loadPromptTemplates = async () => {
    try {
      const result = await window.electronAPI.ai.getTemplates();
      if (result.success) {
        const templates = result.data || [];
        setPromptTemplates(templates);
        if (templates.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(templates[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load prompt templates:', error);
      toast.error('加载 Prompt Templates 失败');
    }
  };

  // ===== AI Profile Handlers =====
  const handleAddProfile = async (provider: AIProvider) => {
    if (!providerTemplates) return;
    const template = providerTemplates[provider];
    const newProfile: Omit<AIProfile, 'id'> = {
      name: template.name,
      provider,
      baseUrl: template.baseUrl,
      apiKey: '',
      model: template.defaultModel,
      isActive: aiProfiles.length === 0,
    };
    try {
      const result = await window.electronAPI.ai.addProfile(newProfile);
      if (result.success && 'profile' in result) {
        setAiProfiles(prev => [...prev, result.profile]);
        setSelectedProfileId(result.profile.id);
        setFormData(result.profile);
        setShowAddTemplate(false);
        toast.success('配置已添加');
      } else if (!result.success && 'error' in result) {
        toast.error(result.error || '添加失败');
      }
    } catch (error) {
      toast.error('添加配置失败');
    }
  };

  const handleUpdateProfile = async () => {
    if (!selectedProfileId) return;
    try {
      const result = await window.electronAPI.ai.updateProfile(selectedProfileId, formData);
      if (result.success) {
        setAiProfiles(prev => prev.map(p => 
          p.id === selectedProfileId ? { ...p, ...formData } as AIProfile : p
        ));
        toast.success('配置已保存');
      } else {
        toast.error(result.error || '保存失败');
      }
    } catch (error) {
      toast.error('保存配置失败');
    }
  };

  const handleDeleteProfile = async (profileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await window.electronAPI.ai.deleteProfile(profileId);
      if (result.success) {
        const updated = aiProfiles.filter(p => p.id !== profileId);
        setAiProfiles(updated);
        if (selectedProfileId === profileId) {
          setSelectedProfileId(updated.length > 0 ? updated[0].id : null);
          setFormData(updated.length > 0 ? updated[0] : { name: '', provider: 'moonshot', baseUrl: '', apiKey: '', model: '' });
        }
        toast.success('配置已删除');
      } else {
        toast.error(result.error || '删除失败');
      }
    } catch (error) {
      toast.error('删除配置失败');
    }
  };

  const handleSetActiveProfile = async (profileId: string) => {
    try {
      const result = await window.electronAPI.ai.setActiveProfile(profileId);
      if (result.success) {
        setAiProfiles(prev => prev.map(p => ({ ...p, isActive: p.id === profileId })));
        toast.success('已切换激活配置');
      } else {
        toast.error(result.error || '切换失败');
      }
    } catch (error) {
      toast.error('切换配置失败');
    }
  };

  const handleTestConnection = async () => {
    if (!formData.baseUrl || !formData.apiKey || !formData.model) {
      toast.error('请填写 Base URL、API Key 和 Model');
      return;
    }
    setIsTestingConnection(true);
    setConnectionStatus(null);
    try {
      const result = await window.electronAPI.ai.testConnection({
        baseUrl: formData.baseUrl, apiKey: formData.apiKey, model: formData.model
      });
      if (result.success) {
        setConnectionStatus({ success: true, message: `连接成功 (${result.latency})` });
        toast.success(`连接成功 (${result.latency})`);
      } else {
        setConnectionStatus({ success: false, message: result.error || '连接失败' });
        toast.error(result.error || '连接失败');
      }
    } catch (error) {
      setConnectionStatus({ success: false, message: '测试连接出错' });
      toast.error('测试连接出错');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSelectProfile = (profile: AIProfile) => {
    setSelectedProfileId(profile.id);
    setFormData(profile);
    setConnectionStatus(null);
  };

  // ===== Prompt Template Handlers =====
  const handleAddTemplate = () => {
    const newTemplate: PromptTemplate = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: '新模板',
      description: '请输入描述',
      content: '你是一个专业的项目经理。请根据以下工作日志生成报告。\n\n工作日志数据：\n{{logs}}\n\n请生成报告：',
    };
    setPromptTemplates(prev => [...prev, newTemplate]);
    setSelectedTemplateId(newTemplate.id);
  };

  const handleSaveTemplates = async () => {
    try {
      const validTemplates = promptTemplates.map(t => ({
        ...t,
        id: t.id || `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      }));
      const result = await window.electronAPI.ai.saveTemplates(validTemplates);
      if (result.success) {
        toast.success('模板已保存');
        setPromptTemplates(validTemplates);
        await loadPromptTemplates();
      } else {
        toast.error(result.error || '保存失败');
      }
    } catch (error) {
      toast.error(`保存模板失败: ${error}`);
    }
  };

  const handleUpdateTemplate = (updates: Partial<PromptTemplate>) => {
    if (!selectedTemplateId) return;
    setPromptTemplates(prev => prev.map(t => 
      t.id === selectedTemplateId ? { ...t, ...updates } as PromptTemplate : t
    ));
  };

  const handleDeleteTemplate = (templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = promptTemplates.filter(t => t.id !== templateId);
    setPromptTemplates(updated);
    if (selectedTemplateId === templateId) {
      setSelectedTemplateId(updated.length > 0 ? updated[0].id : null);
    }
    toast.success('模板已删除（点击保存以生效）');
  };

  const handleResetTemplates = async () => {
    try {
      const result = await window.electronAPI.ai.resetTemplates();
      if (result.success && 'data' in result) {
        setPromptTemplates(result.data);
        setSelectedTemplateId(result.data[0]?.id || null);
        toast.success('已重置为默认模板');
      } else if (!result.success && 'error' in result) {
        toast.error(result.error || '重置失败');
      }
    } catch (error) {
      toast.error('重置模板失败');
    }
  };

  const handleSelectTemplate = (template: PromptTemplate) => {
    setSelectedTemplateId(template.id);
  };

  const filteredProfiles = aiProfiles.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.provider.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTemplates = promptTemplates.filter(t =>
    t.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
    t.description.toLowerCase().includes(templateSearchQuery.toLowerCase())
  );

  // ===== Avatar Handlers =====
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
    reader.onload = (event) => setAvatarPreview(event.target?.result as string);
    reader.onerror = () => toast.error('读取图片失败');
    reader.readAsDataURL(file);
  };

  const handleSaveAvatar = async () => {
    const trimmedName = avatarName.trim();
    if (!trimmedName || !avatarPreview) {
      toast.error('请输入名称并选择图片');
      return;
    }
    try {
      await window.electronAPI.database.settings.set(`avatar_${trimmedName}`, avatarPreview);
      const newAvatar: AvatarSettings = { name: trimmedName, image: avatarPreview };
      const filtered = savedAvatars.filter(a => a.name !== trimmedName);
      const updated = [...filtered, newAvatar];
      setSavedAvatars(updated);
      await window.electronAPI.database.settings.set('saved_avatars', JSON.stringify(updated));
      toast.success(`头像 "${trimmedName}" 保存成功！`);
    } catch (error) {
      toast.error('保存失败');
    }
  };

  const handleClearAvatar = () => {
    setAvatarName('');
    setAvatarPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ===== Data Management Handlers =====
  const handleClearData = () => {
    setIsClearDialogOpen(true);
  };

  const handleConfirmClearData = async () => {
    try {
      const result = await window.electronAPI.database.tasks.clearAll();
      if (result.success) {
        toast.success(`数据已清空。共移除 ${result.data?.deletedCount || 0} 个任务。`);
        setIsClearDialogOpen(false);
        // 刷新页面以更新状态
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        toast.error(`清空失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('[Settings] Failed to clear data:', error);
      toast.error('清空数据时发生错误');
    }
  };

  // ===== Jira Handlers =====
  const handleTestJiraConnection = async () => {
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

  const handleAutoSyncIntervalChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (isNaN(value) || value < 1) {
      toast.error('自动同步间隔至少为 1 分钟');
      return;
    }
    if (value > 60) {
      toast.error('自动同步间隔最大为 60 分钟');
      return;
    }
    setAutoSyncInterval(value);
    try {
      await window.electronAPI.database.settings.set('jira_autoSyncInterval', String(value));
      toast.success(`自动同步间隔已设置为 ${value} 分钟`);
    } catch (error) {
      toast.error('保存自动同步设置失败');
    }
  };

  const handleSaveJiraConfig = async () => {
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

  // ===== Obsidian Handlers =====
  const handleSaveObsidianConfig = async () => {
    try {
      const result = await window.electronAPI.obsidian.setVaultPath(obsidianConfig.vaultPath);
      if (result.success) {
        toast.success('Obsidian Vault 路径已保存');
      } else {
        toast.error(`保存失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      toast.error(`保存失败: ${error}`);
    }
  };

  const inputClass = 'w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  // ===== Render Content Sections =====
  const renderAIContent = () => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-xl font-semibold text-gray-900">AI 模型配置</h2>
        <p className="text-sm text-gray-500 mt-1">配置多个 AI 模型，用于生成工作报告</p>
      </div>
      <div className="h-[calc(100vh-280px)] min-h-[400px] flex">
        {/* Left: Profile List */}
        <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col">
          <div className="p-3 border-b border-gray-200 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索配置..."
                className="w-full rounded border border-gray-300 bg-white pl-8 pr-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="relative">
              <button
                onClick={() => setShowAddTemplate(!showAddTemplate)}
                className="w-full flex items-center justify-center gap-1.5 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                添加配置
              </button>
              {showAddTemplate && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded border border-gray-200 bg-white shadow-lg z-10">
                  {providerTemplates && Object.entries(providerTemplates).map(([key, template]) => (
                    <button
                      key={key}
                      onClick={() => handleAddProfile(key as AIProvider)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <span style={{ color: PROVIDER_COLORS[key as AIProvider] }}>
                        {PROVIDER_ICONS[key as AIProvider]}
                      </span>
                      {template.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredProfiles.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">暂无配置</div>
            ) : (
              filteredProfiles.map((profile) => (
                <div
                  key={profile.id}
                  onClick={() => handleSelectProfile(profile)}
                  className={`group flex items-center gap-2 px-3 py-3 cursor-pointer border-b border-gray-100 hover:bg-white ${
                    selectedProfileId === profile.id ? 'bg-white border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent'
                  }`}
                >
                  <span style={{ color: PROVIDER_COLORS[profile.provider] }}>
                    {PROVIDER_ICONS[profile.provider]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{profile.name}</div>
                    <div className="text-xs text-gray-500 uppercase">{profile.provider}</div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSetActiveProfile(profile.id); }}
                      className={`w-8 h-4 rounded-full transition-colors ${profile.isActive ? 'bg-green-500' : 'bg-gray-300'}`}
                      title={profile.isActive ? '已激活' : '点击激活'}
                    >
                      <div className={`w-3 h-3 rounded-full bg-white mt-0.5 transition-transform ${profile.isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                    <button
                      onClick={(e) => handleDeleteProfile(profile.id, e)}
                      className="p-1 rounded text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        {/* Right: Details Form */}
        <div className="flex-1 p-6 overflow-y-auto">
          {!selectedProfileId ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <Bot className="h-12 w-12 mb-3" />
              <p className="text-sm">选择或添加一个 AI 配置</p>
            </div>
          ) : (
            <div className="space-y-5 max-w-xl">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="text-lg font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                    placeholder="配置名称"
                  />
                  {aiProfiles.find(p => p.id === selectedProfileId)?.isActive && (
                    <span className="rounded bg-green-500 px-2 py-0.5 text-xs font-bold text-white">ACTIVE</span>
                  )}
                </div>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    const docs: Record<AIProvider, string> = {
                      openai: 'https://platform.openai.com/docs',
                      deepseek: 'https://platform.deepseek.com/docs',
                      moonshot: 'https://platform.moonshot.cn/docs',
                      qwen: 'https://help.aliyun.com/document_detail/611472.html',
                      custom: '#',
                    };
                    window.open(docs[formData.provider as AIProvider] || '#', '_blank');
                  }}
                  className="text-gray-400 hover:text-blue-600"
                  title="查看文档"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={formData.apiKey || ''}
                    onChange={(e) => { setFormData(prev => ({ ...prev, apiKey: e.target.value })); setConnectionStatus(null); }}
                    placeholder="sk-..."
                    className={inputClass}
                  />
                  <button onClick={() => setShowApiKey(!showApiKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Base URL</label>
                <input
                  type="text"
                  value={formData.baseUrl || ''}
                  onChange={(e) => { setFormData(prev => ({ ...prev, baseUrl: e.target.value })); setConnectionStatus(null); }}
                  placeholder="https://api.example.com/v1"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Model</label>
                <input
                  type="text"
                  value={formData.model || ''}
                  onChange={(e) => { setFormData(prev => ({ ...prev, model: e.target.value })); setConnectionStatus(null); }}
                  placeholder="gpt-4o, deepseek-chat, ..."
                  className={inputClass}
                />
              </div>
              {connectionStatus && (
                <div className={`flex items-center gap-2 text-sm ${connectionStatus.success ? 'text-green-600' : 'text-red-600'}`}>
                  {connectionStatus.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {connectionStatus.message}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleTestConnection}
                  disabled={isTestingConnection}
                  className="flex items-center gap-1.5 rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <TestTube className={`h-4 w-4 ${isTestingConnection ? 'animate-spin' : ''}`} />
                  {isTestingConnection ? '测试中...' : '测试连接'}
                </button>
                <button onClick={handleUpdateProfile} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  保存配置
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderTemplatesContent = () => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Prompt Templates</h2>
          <p className="text-sm text-gray-500 mt-1">自定义 AI 生成报告的提示词模板</p>
        </div>
        <button onClick={handleResetTemplates} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600">
          <RotateCcw className="h-4 w-4" />
          重置为默认
        </button>
      </div>
      <div className="h-[calc(100vh-280px)] min-h-[400px] flex">
        {/* Left: Template List */}
        <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col">
          <div className="p-3 border-b border-gray-200 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={templateSearchQuery}
                onChange={(e) => setTemplateSearchQuery(e.target.value)}
                placeholder="搜索模板..."
                className="w-full rounded border border-gray-300 bg-white pl-8 pr-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button onClick={handleAddTemplate} className="w-full flex items-center justify-center gap-1.5 rounded bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700">
              <Plus className="h-4 w-4" />
              新建模板
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredTemplates.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">暂无模板</div>
            ) : (
              filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  onClick={() => handleSelectTemplate(template)}
                  className={`group flex items-start gap-2 px-3 py-3 cursor-pointer border-b border-gray-100 hover:bg-white ${
                    selectedTemplateId === template.id ? 'bg-white border-l-4 border-l-purple-600' : 'border-l-4 border-l-transparent'
                  }`}
                >
                  <FileText className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{template.name}</div>
                    <div className="text-xs text-gray-500 truncate">{template.description}</div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteTemplate(template.id, e)}
                    className="p-1 rounded text-gray-400 hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
        {/* Right: Editor */}
        <div className="flex-1 p-6 overflow-y-auto">
          {!selectedTemplate ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <FileText className="h-12 w-12 mb-3" />
              <p className="text-sm">选择或创建一个 Prompt Template</p>
              <p className="text-xs text-gray-400 mt-1">使用 {'{{logs}}'} 作为工作日志的占位符</p>
            </div>
          ) : (
            <div className="space-y-5 max-w-2xl">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">模板名称</label>
                <input
                  type="text"
                  value={selectedTemplate?.name || ''}
                  onChange={(e) => handleUpdateTemplate({ name: e.target.value })}
                  placeholder="例如：周报（标准版）"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">描述</label>
                <input
                  type="text"
                  value={selectedTemplate?.description || ''}
                  onChange={(e) => handleUpdateTemplate({ description: e.target.value })}
                  placeholder="简要描述此模板的用途"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Prompt 内容</label>
                <textarea
                  value={selectedTemplate?.content || ''}
                  onChange={(e) => handleUpdateTemplate({ content: e.target.value })}
                  placeholder="输入系统提示词...使用 {{logs}} 作为工作日志的占位符"
                  className={`${inputClass} min-h-[200px] resize-none font-mono text-sm`}
                  rows={10}
                />
                <p className="mt-1.5 text-xs text-gray-500">提示：使用 {'{{logs}}'} 作为占位符，它将被替换为实际的工作日志数据</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleSaveTemplates} className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
                  保存模板
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderJiraContent = () => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <h2 className="text-2xl font-semibold text-gray-900 mb-2">Jira 集成</h2>
      <p className="text-gray-500 mb-6">配置 Jira 服务器连接信息，同步任务数据</p>
      
      <div className="space-y-5 max-w-xl">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Jira 服务器地址 <span className="text-red-500">*</span></label>
          <input
            type="url"
            value={jiraConfig.host}
            onChange={(e) => setJiraConfig(prev => ({ ...prev, host: e.target.value }))}
            placeholder="https://jira.example.com"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">用户名 <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={jiraConfig.username}
            onChange={(e) => setJiraConfig(prev => ({ ...prev, username: e.target.value }))}
            placeholder="your.email@company.com"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">密码 / PAT <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={jiraConfig.password}
            onChange={(e) => setJiraConfig(prev => ({ ...prev, password: e.target.value }))}
            placeholder="Personal Access Token"
            className={inputClass}
          />
        </div>
        
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-5">
          <div className="mb-3 flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">Agile 看板配置（可选）</span>
          </div>
          <p className="mb-4 text-sm text-blue-700">
            设置项目 Key 以启用 Agile 看板自动检测（如 PROJ-123 中的 PROJ）。留空则使用 JQL 同步。
          </p>
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">项目 Key</label>
            <input
              type="text"
              value={jiraConfig.projectKey}
              onChange={(e) => setJiraConfig(prev => ({ ...prev, projectKey: e.target.value.toUpperCase() }))}
              placeholder="PROJ"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">自动同步间隔（分钟）</label>
            <input
              type="number"
              min={1}
              max={60}
              value={autoSyncInterval}
              onChange={handleAutoSyncIntervalChange}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-500">看板将每隔指定分钟数自动进行增量同步。最小 1 分钟，默认 5 分钟。</p>
          </div>
        </div>
        
        <div className="flex gap-3 pt-4">
          <button
            onClick={handleTestJiraConnection}
            disabled={isTesting}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {isTesting ? '测试中...' : '测试连接'}
          </button>
          <button
            onClick={handleSaveJiraConfig}
            disabled={isSaving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderObsidianContent = () => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <h2 className="text-2xl font-semibold text-gray-900 mb-2">Obsidian 集成</h2>
      <p className="text-gray-500 mb-6">配置 Obsidian Vault 路径，自动同步完成的任务</p>
      
      <div className="space-y-5 max-w-xl">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Vault 路径</label>
          <input
            type="text"
            value={obsidianConfig.vaultPath}
            onChange={(e) => setObsidianConfig(prev => ({ ...prev, vaultPath: e.target.value }))}
            placeholder="C:\Users\YourName\Documents\Obsidian Vault"
            className={inputClass}
          />
          <p className="mt-1.5 text-sm text-gray-500">设置 Obsidian Vault 的本地路径。完成的任务将自动同步到此目录的 Markdown 文件。</p>
        </div>
        <div className="flex gap-3 pt-4">
          <button onClick={handleSaveObsidianConfig} className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
            保存路径
          </button>
        </div>
      </div>
    </div>
  );

  const renderProfileContent = () => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">个人信息设置</h2>
      
      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* LEFT: Avatar Preview (Big & Centered) */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-32 h-32 rounded-full border-4 border-gray-50 shadow-inner overflow-hidden bg-gray-100 flex items-center justify-center">
            {avatarPreview ? (
              <img src={avatarPreview} alt="头像预览" className="w-full h-full object-cover" />
            ) : (
              <User className="w-12 h-12 text-gray-300" />
            )}
          </div>
          <span className="text-xs text-gray-400">预览</span>
        </div>

        {/* RIGHT: Form Fields */}
        <div className="flex-1 space-y-6 max-w-lg">
          {/* Username Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Jira 用户名 / Key</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={avatarName}
                onChange={(e) => setAvatarName(e.target.value)}
                placeholder="例如: wangph"
                className={`${inputClass} pl-9`}
              />
            </div>
            <p className="text-xs text-gray-500">
              输入您的 Jira 用户名以匹配任务头像（需与 Jira 保持一致）。
            </p>
          </div>

          {/* Image Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">头像图片</label>
            <input 
              ref={fileInputRef} 
              type="file" 
              accept="image/*" 
              onChange={handleFileSelect} 
              className="hidden" 
            />
            <div className="flex gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 rounded border border-dashed border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
              >
                <Upload className="w-4 h-4" />
                {avatarPreview ? '更换图片...' : '选择图片...'}
              </button>
              {avatarPreview && (
                <button
                  onClick={handleClearAvatar}
                  className="flex items-center justify-center gap-2 rounded border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                  title="清空"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500">支持格式: JPG, PNG, GIF。最大 2MB。</p>
          </div>

          {/* Save Action */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveAvatar}
                disabled={!avatarName.trim() || !avatarPreview}
                className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                保存设置
              </button>
              {savedAvatars.length > 0 && (
                <span className="text-xs text-gray-500">
                  已保存 {savedAvatars.length} 个头像
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAboutContent = () => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">关于</h2>
      <div className="space-y-4 text-sm text-gray-600 max-w-xl">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-white text-2xl font-bold">
            JF
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Jira Flow</h3>
            <p className="text-gray-500">个人任务工作流</p>
          </div>
        </div>
        <div className="pt-4 border-t border-gray-100 space-y-2">
          <p><span className="font-medium text-gray-900">版本:</span> 1.2.0</p>
          <p><span className="font-medium text-gray-900">构建时间:</span> 2026-02-06</p>
          <p><span className="font-medium text-gray-900">技术栈:</span> Electron + React + TypeScript + TailwindCSS</p>
        </div>
      </div>
    </div>
  );

  const renderDataContent = () => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">数据管理</h2>
      <p className="text-gray-500 mb-6">管理本地数据库和缓存设置</p>

      <div className="border border-red-200 rounded-lg p-6 bg-red-50/30">
        <h3 className="text-lg font-medium text-gray-900 mb-2">清理本地缓存</h3>
        <p className="text-sm text-gray-600 mb-4">
          清除本地数据库中所有已下载的任务和 Sprint 数据。此操作不会影响 Jira 上的任何数据。
        </p>
        <button
          onClick={handleClearData}
          className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
        >
          清空所有数据
        </button>
      </div>

      {/* Custom Confirmation Modal */}
      {isClearDialogOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[400px] p-6 border border-gray-100">
            {/* Header */}
            <h3 className="text-lg font-bold text-gray-900 mb-3">确认清空数据?</h3>
            
            {/* Body */}
            <p className="text-sm text-gray-600 mb-6">
              此操作将移除本地所有缓存的任务数据，您需要重新同步。确定要继续吗？
            </p>
            
            {/* Footer */}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setIsClearDialogOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmClearData}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'ai': return renderAIContent();
      case 'templates': return renderTemplatesContent();
      case 'jira': return renderJiraContent();
      case 'obsidian': return renderObsidianContent();
      case 'profile': return renderProfileContent();
      case 'data': return renderDataContent();
      case 'about': return renderAboutContent();
      default: return renderAIContent();
    }
  };

  return (
    <div className="flex h-screen bg-[#F4F5F7] overflow-hidden">
      {/* Left Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <h1 className="text-lg font-bold text-gray-900">设置</h1>
        </div>
        <nav className="flex-1 py-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-5 py-3 text-sm font-medium cursor-pointer transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-100 border-r-4 border-transparent'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

export default Settings;
