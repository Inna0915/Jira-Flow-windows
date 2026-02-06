import { useState, useEffect, useRef } from 'react';
import { 
  User, Upload, X, Check, FolderKanban, 
  Sparkles, Bot, Brain, Cloud, Settings, 
  Plus, Search, Trash2, Eye, EyeOff, 
  ExternalLink, TestTube, CheckCircle2, XCircle,
  ChevronDown, FileText, RotateCcw
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
  custom: <Settings className="h-4 w-4" />,
};

const PROVIDER_COLORS: Record<AIProvider, string> = {
  openai: '#10A37F',
  deepseek: '#4D6BFA',
  moonshot: '#000000',
  qwen: '#1677FF',
  custom: '#5E6C84',
};

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

  // AI Profile 设置
  const [aiProfiles, setAiProfiles] = useState<AIProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [providerTemplates, setProviderTemplates] = useState<Record<AIProvider, ProviderTemplate> | null>(null);
  
  // Profile 表单状态
  const [formData, setFormData] = useState<Partial<AIProfile>>({
    name: '',
    provider: 'moonshot',
    baseUrl: '',
    apiKey: '',
    model: '',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Prompt Template 设置
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  const [templateFormData, setTemplateFormData] = useState<Partial<PromptTemplate>>({
    name: '',
    description: '',
    content: '',
  });

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
        toast.error(`保存失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to save Obsidian config:', error);
      toast.error(`保存失败: ${error}`);
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

  // ===== AI Profile 相关函数 =====
  
  const loadProviderTemplates = async () => {
    try {
      const result = await window.electronAPI.ai.getProviderTemplates();
      if (result.success) {
        setProviderTemplates(result.data);
      }
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
        setAiProfiles(prev => prev.map(p => ({
          ...p,
          isActive: p.id === profileId
        })));
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
        baseUrl: formData.baseUrl,
        apiKey: formData.apiKey,
        model: formData.model,
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

  // ===== Prompt Template 相关函数 =====

  const loadPromptTemplates = async () => {
    try {
      const result = await window.electronAPI.ai.getTemplates();
      if (result.success) {
        const templates = result.data || [];
        setPromptTemplates(templates);
        if (templates.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(templates[0].id);
          setTemplateFormData(templates[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load prompt templates:', error);
      toast.error('加载 Prompt Templates 失败');
    }
  };

  const handleAddTemplate = () => {
    const newTemplate: PromptTemplate = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: '新模板',
      description: '请输入描述',
      content: '你是一个专业的项目经理。请根据以下工作日志生成报告。\n\n工作日志数据：\n{{logs}}\n\n请生成报告：',
    };
    setPromptTemplates(prev => [...prev, newTemplate]);
    setSelectedTemplateId(newTemplate.id);
    setTemplateFormData(newTemplate);
  };

  const handleSaveTemplates = async () => {
    console.log('[Settings] Saving templates:', promptTemplates);
    try {
      // 确保所有模板都有有效的 ID（使用简单的 UUID 生成器）
      const validTemplates = promptTemplates.map(t => ({
        ...t,
        id: t.id || `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      }));
      
      const result = await window.electronAPI.ai.saveTemplates(validTemplates);
      console.log('[Settings] Save result:', result);
      
      if (result.success) {
        toast.success('模板已保存');
        // 更新状态中的 ID（如果有新生成的）
        setPromptTemplates(validTemplates);
        // 重新加载以确认保存成功
        await loadPromptTemplates();
      } else {
        toast.error(result.error || '保存失败');
      }
    } catch (error) {
      console.error('[Settings] Failed to save templates:', error);
      toast.error(`保存模板失败: ${error}`);
    }
  };

  const handleUpdateTemplate = (updates: Partial<PromptTemplate>) => {
    if (!selectedTemplateId) return;
    
    setTemplateFormData(prev => ({ ...prev, ...updates }));
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
      setTemplateFormData(updated.length > 0 ? updated[0] : { name: '', description: '', content: '' });
    }
    
    toast.success('模板已删除（点击保存以生效）');
  };

  const handleResetTemplates = async () => {
    try {
      const result = await window.electronAPI.ai.resetTemplates();
      if (result.success && 'data' in result) {
        setPromptTemplates(result.data);
        setSelectedTemplateId(result.data[0]?.id || null);
        setTemplateFormData(result.data[0] || { name: '', description: '', content: '' });
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
    setTemplateFormData(template);
  };

  const filteredProfiles = aiProfiles.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.provider.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTemplates = promptTemplates.filter(t =>
    t.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
    t.description.toLowerCase().includes(templateSearchQuery.toLowerCase())
  );

  // ===== 头像相关函数 =====

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
      // 1. 保存头像图片到独立 key
      await window.electronAPI.database.settings.set(
        `avatar_${trimmedName}`,
        avatarPreview
      );

      // 2. 更新头像列表
      const newAvatar: AvatarSettings = { name: trimmedName, image: avatarPreview };
      const filtered = savedAvatars.filter(a => a.name !== trimmedName);
      const updated = [...filtered, newAvatar];
      
      // 3. 先更新状态（立即显示）
      setSavedAvatars(updated);
      
      // 4. 保存到数据库
      await window.electronAPI.database.settings.set(
        'saved_avatars',
        JSON.stringify(updated)
      );

      // 5. 重置表单
      setAvatarName('');
      setAvatarPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      console.log('[Avatar] Saved, total avatars:', updated.length);
      toast.success(`头像 "${trimmedName}" 保存成功！`);
    } catch (error) {
      console.error('[Avatar] Failed to save:', error);
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

  const inputClass =
    'w-full rounded border border-[#DFE1E6] bg-white px-3 py-2 text-sm text-[#172B4D] placeholder-[#C1C7D0] focus:border-[#4C9AFF] focus:outline-none focus:ring-1 focus:ring-[#4C9AFF]';

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#F4F5F7] p-6">
      <h2 className="mb-6 text-2xl font-bold text-[#172B4D]">设置</h2>

      <div className="mx-auto w-full max-w-3xl space-y-6">
        {/* ===== AI 配置卡片 ===== */}
        <div className="rounded-lg border border-[#DFE1E6] bg-white shadow-sm overflow-hidden">
          <div className="border-b border-[#DFE1E6] bg-[#FAFBFC] px-6 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-gradient-to-br from-[#0052CC] to-[#00B8D9] text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-[#172B4D]">AI 模型配置</h3>
            </div>
          </div>

          <div className="h-[500px] flex">
            {/* 左侧：Profile 列表 */}
            <div className="w-[280px] border-r border-[#DFE1E6] bg-[#FAFBFC] flex flex-col">
              {/* 搜索和添加 */}
              <div className="p-3 border-b border-[#DFE1E6] space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5E6C84]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索配置..."
                    className="w-full rounded border border-[#DFE1E6] bg-white pl-7 pr-2 py-1.5 text-xs text-[#172B4D] placeholder-[#C1C7D0] focus:border-[#4C9AFF] focus:outline-none"
                  />
                </div>
                <div className="relative">
                  <button
                    onClick={() => setShowAddTemplate(!showAddTemplate)}
                    className="w-full flex items-center justify-center gap-1.5 rounded bg-[#0052CC] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0747A6]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    添加配置
                    <ChevronDown className={`h-3 w-3 transition-transform ${showAddTemplate ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {/* Provider 模板下拉菜单 */}
                  {showAddTemplate && (
                    <div className="absolute top-full left-0 right-0 mt-1 rounded border border-[#DFE1E6] bg-white shadow-lg z-10">
                      {providerTemplates && Object.entries(providerTemplates).map(([key, template]) => (
                        <button
                          key={key}
                          onClick={() => handleAddProfile(key as AIProvider)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-[#172B4D] hover:bg-[#F4F5F7] first:rounded-t last:rounded-b"
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

              {/* Profile 列表 */}
              <div className="flex-1 overflow-y-auto">
                {filteredProfiles.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[#5E6C84]">
                    暂无配置
                  </div>
                ) : (
                  filteredProfiles.map((profile) => (
                    <div
                      key={profile.id}
                      onClick={() => handleSelectProfile(profile)}
                      className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-[#DFE1E6] hover:bg-white ${
                        selectedProfileId === profile.id ? 'bg-white border-l-4 border-l-[#0052CC]' : 'border-l-4 border-l-transparent'
                      }`}
                    >
                      <span style={{ color: PROVIDER_COLORS[profile.provider] }}>
                        {PROVIDER_ICONS[profile.provider]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#172B4D] truncate">
                          {profile.name}
                        </div>
                        <div className="text-[10px] text-[#5E6C84] uppercase">{profile.provider}</div>
                      </div>
                      
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* 激活开关 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetActiveProfile(profile.id);
                          }}
                          className={`w-8 h-4 rounded-full transition-colors ${
                            profile.isActive ? 'bg-[#36B37E]' : 'bg-[#C1C7D0]'
                          }`}
                          title={profile.isActive ? '已激活' : '点击激活'}
                        >
                          <div className={`w-3 h-3 rounded-full bg-white mt-0.5 transition-transform ${
                            profile.isActive ? 'translate-x-4' : 'translate-x-0.5'
                          }`} />
                        </button>
                        
                        {/* 删除按钮 */}
                        <button
                          onClick={(e) => handleDeleteProfile(profile.id, e)}
                          className="p-1 rounded text-[#5E6C84] hover:bg-[#FFEBE6] hover:text-[#DE350B]"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 右侧：详情表单 */}
            <div className="flex-1 p-6 overflow-y-auto">
              {!selectedProfileId ? (
                <div className="h-full flex flex-col items-center justify-center text-[#5E6C84]">
                  <Bot className="h-12 w-12 mb-3 text-[#C1C7D0]" />
                  <p className="text-sm">选择或添加一个 AI 配置</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 表单头部 */}
                  <div className="flex items-center justify-between pb-3 border-b border-[#DFE1E6]">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={formData.name || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="text-lg font-semibold text-[#172B4D] bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                        placeholder="配置名称"
                      />
                      {aiProfiles.find(p => p.id === selectedProfileId)?.isActive && (
                        <span className="rounded bg-[#36B37E] px-2 py-0.5 text-[10px] font-bold text-white">
                          ACTIVE
                        </span>
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
                      className="text-[#5E6C84] hover:text-[#0052CC]"
                      title="查看文档"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>

                  {/* API Key */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[#5E6C84]">
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={formData.apiKey || ''}
                        onChange={(e) => {
                          setFormData(prev => ({ ...prev, apiKey: e.target.value }));
                          setConnectionStatus(null);
                        }}
                        placeholder="sk-..."
                        className={inputClass}
                      />
                      <button
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#5E6C84] hover:text-[#172B4D]"
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Base URL */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[#5E6C84]">
                      Base URL
                    </label>
                    <input
                      type="text"
                      value={formData.baseUrl || ''}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, baseUrl: e.target.value }));
                        setConnectionStatus(null);
                      }}
                      placeholder="https://api.example.com/v1"
                      className={inputClass}
                    />
                  </div>

                  {/* Model */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[#5E6C84]">
                      Model
                    </label>
                    <input
                      type="text"
                      value={formData.model || ''}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, model: e.target.value }));
                        setConnectionStatus(null);
                      }}
                      placeholder="gpt-4o, deepseek-chat, ..."
                      className={inputClass}
                    />
                  </div>

                  {/* 测试连接状态 */}
                  {connectionStatus && (
                    <div className={`flex items-center gap-2 text-sm ${
                      connectionStatus.success ? 'text-[#006644]' : 'text-[#DE350B]'
                    }`}>
                      {connectionStatus.success ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      {connectionStatus.message}
                    </div>
                  )}

                  {/* 操作按钮 */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleTestConnection}
                      disabled={isTestingConnection}
                      className="flex items-center gap-1.5 rounded border border-[#DFE1E6] bg-white px-4 py-2 text-sm font-medium text-[#172B4D] hover:bg-[#F4F5F7] disabled:opacity-50"
                    >
                      <TestTube className={`h-4 w-4 ${isTestingConnection ? 'animate-spin' : ''}`} />
                      {isTestingConnection ? '测试中...' : '测试连接'}
                    </button>
                    <button
                      onClick={handleUpdateProfile}
                      className="rounded bg-[#0052CC] px-4 py-2 text-sm font-medium text-white hover:bg-[#0747A6]"
                    >
                      保存配置
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== Prompt Templates 配置卡片 ===== */}
        <div className="rounded-lg border border-[#DFE1E6] bg-white shadow-sm overflow-hidden">
          <div className="border-b border-[#DFE1E6] bg-[#FAFBFC] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-gradient-to-br from-[#6554C0] to-[#8777D9] text-white">
                  <FileText className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-[#172B4D]">Prompt Templates</h3>
              </div>
              <button
                onClick={handleResetTemplates}
                className="flex items-center gap-1.5 text-xs text-[#5E6C84] hover:text-[#0052CC]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重置为默认
              </button>
            </div>
          </div>

          <div className="h-[500px] flex">
            {/* 左侧：Template 列表 */}
            <div className="w-[280px] border-r border-[#DFE1E6] bg-[#FAFBFC] flex flex-col">
              {/* 搜索和添加 */}
              <div className="p-3 border-b border-[#DFE1E6] space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5E6C84]" />
                  <input
                    type="text"
                    value={templateSearchQuery}
                    onChange={(e) => setTemplateSearchQuery(e.target.value)}
                    placeholder="搜索模板..."
                    className="w-full rounded border border-[#DFE1E6] bg-white pl-7 pr-2 py-1.5 text-xs text-[#172B4D] placeholder-[#C1C7D0] focus:border-[#4C9AFF] focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleAddTemplate}
                  className="w-full flex items-center justify-center gap-1.5 rounded bg-[#6554C0] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#5243AA]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  新建模板
                </button>
              </div>

              {/* Template 列表 */}
              <div className="flex-1 overflow-y-auto">
                {filteredTemplates.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[#5E6C84]">
                    暂无模板
                  </div>
                ) : (
                  filteredTemplates.map((template) => (
                    <div
                      key={template.id}
                      onClick={() => handleSelectTemplate(template)}
                      className={`group flex items-start gap-2 px-3 py-2.5 cursor-pointer border-b border-[#DFE1E6] hover:bg-white ${
                        selectedTemplateId === template.id ? 'bg-white border-l-4 border-l-[#6554C0]' : 'border-l-4 border-l-transparent'
                      }`}
                    >
                      <FileText className="h-4 w-4 text-[#6554C0] mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#172B4D] truncate">
                          {template.name}
                        </div>
                        <div className="text-[10px] text-[#5E6C84] truncate">
                          {template.description}
                        </div>
                      </div>
                      
                      {/* 删除按钮 */}
                      <button
                        onClick={(e) => handleDeleteTemplate(template.id, e)}
                        className="p-1 rounded text-[#5E6C84] hover:bg-[#FFEBE6] hover:text-[#DE350B] opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 右侧：编辑器 */}
            <div className="flex-1 p-6 overflow-y-auto">
              {!selectedTemplateId ? (
                <div className="h-full flex flex-col items-center justify-center text-[#5E6C84]">
                  <FileText className="h-12 w-12 mb-3 text-[#C1C7D0]" />
                  <p className="text-sm">选择或创建一个 Prompt Template</p>
                  <p className="text-xs text-[#8993A4] mt-1">
                    使用 {'{{logs}}'} 作为工作日志的占位符
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 模板名称 */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[#5E6C84]">
                      模板名称
                    </label>
                    <input
                      type="text"
                      value={templateFormData.name || ''}
                      onChange={(e) => handleUpdateTemplate({ name: e.target.value })}
                      placeholder="例如：周报（标准版）"
                      className={inputClass}
                    />
                  </div>

                  {/* 模板描述 */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[#5E6C84]">
                      描述
                    </label>
                    <input
                      type="text"
                      value={templateFormData.description || ''}
                      onChange={(e) => handleUpdateTemplate({ description: e.target.value })}
                      placeholder="简要描述此模板的用途"
                      className={inputClass}
                    />
                  </div>

                  {/* Prompt 内容 */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[#5E6C84]">
                      Prompt 内容
                    </label>
                    <textarea
                      value={templateFormData.content || ''}
                      onChange={(e) => handleUpdateTemplate({ content: e.target.value })}
                      placeholder="输入系统提示词...使用 {{logs}} 作为工作日志的占位符"
                      className={`${inputClass} min-h-[200px] resize-none font-mono text-xs`}
                      rows={10}
                    />
                    <p className="mt-1.5 text-xs text-[#5E6C84]">
                      提示：使用 {'{{logs}}'} 作为占位符，它将被替换为实际的工作日志数据
                    </p>
                  </div>

                  {/* 保存按钮 */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleSaveTemplates}
                      className="rounded bg-[#6554C0] px-4 py-2 text-sm font-medium text-white hover:bg-[#5243AA]"
                    >
                      保存模板
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== Jira 配置卡片 ===== */}
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
                onClick={handleTestJiraConnection}
                disabled={isTesting}
                className="rounded border border-[#DFE1E6] bg-white px-4 py-2 text-sm font-medium text-[#172B4D] hover:bg-[#F4F5F7] disabled:opacity-50"
              >
                {isTesting ? '测试中...' : '测试连接'}
              </button>
              <button
                onClick={handleSaveJiraConfig}
                disabled={isSaving}
                className="rounded bg-[#0052CC] px-4 py-2 text-sm font-medium text-white hover:bg-[#0747A6] disabled:opacity-50"
              >
                {isSaving ? '保存中...' : '保存配置'}
              </button>
            </div>
          </div>
        </div>

        {/* ===== Obsidian 集成配置 ===== */}
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

        {/* ===== 头像上传区域 ===== */}
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

            {/* 已保存的头像列表 */}
            <div className={savedAvatars.length > 0 ? '' : 'hidden'}>
              <h4 className="mb-3 text-sm font-medium text-[#5E6C84]">
                已保存的头像 ({savedAvatars.length}个)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {savedAvatars.map((avatar, index) => (
                  <div
                    key={`${avatar.name}-${index}`}
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
          </div>
        </div>

        {/* ===== 应用信息 ===== */}
        <div className="rounded-lg border border-[#DFE1E6] bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-[#172B4D]">关于</h3>
          <div className="space-y-2 text-sm text-[#5E6C84]">
            <p><span className="font-medium">版本:</span> 1.1.0</p>
            <p><span className="font-medium">构建时间:</span> 2026-02-06</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
