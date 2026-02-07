import axios, { AxiosError } from 'axios';
import { settingsDB } from '../db/schema';
import https from 'https';

/**
 * AI Provider 类型
 */
export type AIProvider = 'openai' | 'deepseek' | 'moonshot' | 'qwen' | 'custom';

/**
 * AI Profile 数据结构
 */
export interface AIProfile {
  id: string;
  name: string;
  provider: AIProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  isActive: boolean;
}

/**
 * Prompt Template 数据结构
 */
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  type?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  isDefault?: boolean;
}

/**
 * Provider 预设模板
 */
export const PROVIDER_TEMPLATES: Record<AIProvider, { name: string; baseUrl: string; defaultModel: string }> = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
  },
  moonshot: {
    name: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
  },
  qwen: {
    name: 'Qwen (Aliyun)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-turbo',
  },
  custom: {
    name: 'Custom',
    baseUrl: '',
    defaultModel: '',
  },
};

/**
 * 默认 Prompt Templates
 */
export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'tpl-weekly-1',
    name: '周报 (标准版)',
    description: '包含本周进展、下周计划和风险',
    type: 'weekly',
    isDefault: true,
    content: `你是一个专业的项目经理。请根据以下工作日志生成一份周报。

格式要求：Markdown

包含章节：
1. **本周核心产出** (列出已完成的关键任务)
2. **进行中的工作** (进度及预计完成时间)
3. **风险与阻碍**
4. **下周规划**

语气：专业、客观。`,
  },
  {
    id: 'tpl-monthly-1',
    name: '月报 (汇总版)',
    description: '汇总月度工作，关注里程碑',
    type: 'monthly',
    isDefault: true,
    content: `你是一个高级技术负责人。请将以下工作日志汇总为一份月度汇报。

重点关注：
- 重大里程碑的达成
- 关键技术突破
- 整体项目健康度

忽略琐碎的修复细节，只保留高价值产出。

语气：自信、精简。`,
  },
  {
    id: 'tpl-quarterly-1',
    name: '季报 (战略版)',
    description: '季度战略回顾与展望',
    type: 'quarterly',
    isDefault: true,
    content: `你是一个技术总监。请根据以下工作日志生成季度战略报告。

重点关注：
- 季度目标达成情况
- 关键成果与影响
- 团队能力提升
- 下季度战略规划

语气：战略高度、数据驱动。`,
  },
  {
    id: 'tpl-yearly-1',
    name: '年报 (总结版)',
    description: '年度全面总结与规划',
    type: 'yearly',
    isDefault: true,
    content: `你是一个CTO。请根据以下工作日志生成年度总结报告。

重点关注：
- 年度成就回顾
- 技术演进路径
- 团队成长总结
- 来年愿景与目标

语气：鼓舞人心、高瞻远瞩。`,
  },
];

/**
 * AI 服务类
 * 管理多模型配置文件的增删改查和连接测试
 */
export class AIService {
  private static readonly PROFILES_KEY = 'ai_profiles';
  private static readonly TEMPLATES_KEY = 'ai_templates';

  // ==================== Profile 管理 ====================

  /**
   * 获取所有 AI Profiles
   */
  getProfiles(): AIProfile[] {
    try {
      const data = settingsDB.get(AIService.PROFILES_KEY);
      if (!data) return [];
      return JSON.parse(data) as AIProfile[];
    } catch (error) {
      console.error('[AIService] Failed to get profiles:', error);
      return [];
    }
  }

  /**
   * 保存所有 AI Profiles
   */
  saveProfiles(profiles: AIProfile[]): { success: boolean; error?: string } {
    try {
      // 验证：确保只有一个 active profile
      const activeProfiles = profiles.filter(p => p.isActive);
      if (activeProfiles.length > 1) {
        return { success: false, error: '只能有一个激活的配置' };
      }
      
      settingsDB.set(AIService.PROFILES_KEY, JSON.stringify(profiles));
      return { success: true };
    } catch (error) {
      console.error('[AIService] Failed to save profiles:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 获取当前激活的 Profile
   */
  getActiveProfile(): AIProfile | null {
    const profiles = this.getProfiles();
    return profiles.find(p => p.isActive) || null;
  }

  /**
   * 设置指定 Profile 为激活状态
   */
  setActiveProfile(profileId: string): { success: boolean; error?: string } {
    const profiles = this.getProfiles();
    
    // 重置所有激活状态
    profiles.forEach(p => {
      p.isActive = p.id === profileId;
    });
    
    return this.saveProfiles(profiles);
  }

  /**
   * 添加新 Profile
   */
  addProfile(profile: Omit<AIProfile, 'id'>): { success: boolean; profile?: AIProfile; error?: string } {
    try {
      const profiles = this.getProfiles();
      
      // 生成 UUID
      const id = crypto.randomUUID();
      const newProfile: AIProfile = { ...profile, id };
      
      // 如果是第一个 profile，自动设为 active
      if (profiles.length === 0) {
        newProfile.isActive = true;
      }
      
      profiles.push(newProfile);
      
      const result = this.saveProfiles(profiles);
      if (!result.success) {
        return result;
      }
      
      return { success: true, profile: newProfile };
    } catch (error) {
      console.error('[AIService] Failed to add profile:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 更新 Profile
   */
  updateProfile(profileId: string, updates: Partial<AIProfile>): { success: boolean; error?: string } {
    try {
      const profiles = this.getProfiles();
      const index = profiles.findIndex(p => p.id === profileId);
      
      if (index === -1) {
        return { success: false, error: 'Profile not found' };
      }
      
      profiles[index] = { ...profiles[index], ...updates };
      return this.saveProfiles(profiles);
    } catch (error) {
      console.error('[AIService] Failed to update profile:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 删除 Profile
   */
  deleteProfile(profileId: string): { success: boolean; error?: string } {
    try {
      const profiles = this.getProfiles();
      const filtered = profiles.filter(p => p.id !== profileId);
      
      if (filtered.length === profiles.length) {
        return { success: false, error: 'Profile not found' };
      }
      
      // 如果删除的是 active profile，且还有其他 profile，则将第一个设为 active
      const wasActive = profiles.find(p => p.id === profileId)?.isActive;
      if (wasActive && filtered.length > 0) {
        filtered[0].isActive = true;
      }
      
      return this.saveProfiles(filtered);
    } catch (error) {
      console.error('[AIService] Failed to delete profile:', error);
      return { success: false, error: String(error) };
    }
  }

  // ==================== Prompt Template 管理 ====================

  /**
   * 获取所有 Prompt Templates
   * 如果为空，自动初始化默认模板
   */
  getTemplates(): PromptTemplate[] {
    try {
      const data = settingsDB.get(AIService.TEMPLATES_KEY);
      if (!data) {
        // 初始化默认模板
        this.saveTemplates(DEFAULT_PROMPT_TEMPLATES);
        return DEFAULT_PROMPT_TEMPLATES;
      }
      return JSON.parse(data) as PromptTemplate[];
    } catch (error) {
      console.error('[AIService] Failed to get templates:', error);
      return DEFAULT_PROMPT_TEMPLATES;
    }
  }

  /**
   * 保存所有 Prompt Templates
   */
  saveTemplates(templates: PromptTemplate[]): { success: boolean; error?: string } {
    try {
      console.log('[AIService] Saving templates, count:', templates.length);
      const jsonString = JSON.stringify(templates);
      console.log('[AIService] JSON length:', jsonString.length);
      settingsDB.set(AIService.TEMPLATES_KEY, jsonString);
      console.log('[AIService] Templates saved successfully');
      return { success: true };
    } catch (error) {
      console.error('[AIService] Failed to save templates:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 添加新 Template
   */
  addTemplate(template: Omit<PromptTemplate, 'id'>): { success: boolean; template?: PromptTemplate; error?: string } {
    try {
      const templates = this.getTemplates();
      
      const id = crypto.randomUUID();
      const newTemplate: PromptTemplate = { ...template, id };
      
      templates.push(newTemplate);
      
      const result = this.saveTemplates(templates);
      if (!result.success) {
        return result;
      }
      
      return { success: true, template: newTemplate };
    } catch (error) {
      console.error('[AIService] Failed to add template:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 更新 Template
   */
  updateTemplate(templateId: string, updates: Partial<PromptTemplate>): { success: boolean; error?: string } {
    try {
      const templates = this.getTemplates();
      const index = templates.findIndex(t => t.id === templateId);
      
      if (index === -1) {
        return { success: false, error: 'Template not found' };
      }
      
      templates[index] = { ...templates[index], ...updates };
      return this.saveTemplates(templates);
    } catch (error) {
      console.error('[AIService] Failed to update template:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 删除 Template
   */
  deleteTemplate(templateId: string): { success: boolean; error?: string } {
    try {
      const templates = this.getTemplates();
      const filtered = templates.filter(t => t.id !== templateId);
      
      if (filtered.length === templates.length) {
        return { success: false, error: 'Template not found' };
      }
      
      return this.saveTemplates(filtered);
    } catch (error) {
      console.error('[AIService] Failed to delete template:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 重置为默认模板
   */
  resetTemplatesToDefault(): { success: boolean; error?: string } {
    return this.saveTemplates(DEFAULT_PROMPT_TEMPLATES);
  }

  // ==================== AI 连接与报告生成 ====================

  /**
   * 测试 AI 连接
   */
  async testConnection(config: { baseUrl: string; apiKey: string; model: string }): Promise<{
    success: boolean;
    latency?: string;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      // 创建 axios 实例，允许本地自签名证书
      const client = axios.create({
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
        timeout: 30000,
      });

      // 构建 chat completions 请求
      const response = await client.post(
        `${config.baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          model: config.model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 5,
        },
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const latency = Date.now() - startTime;

      if (response.status === 200 && response.data?.choices) {
        return {
          success: true,
          latency: `${latency}ms`,
        };
      }

      return {
        success: false,
        error: 'Invalid response from API',
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      
      if (error instanceof AxiosError) {
        if (error.code === 'ECONNREFUSED') {
          return { success: false, error: 'Connection refused' };
        }
        if (error.code === 'ENOTFOUND') {
          return { success: false, error: 'Host not found' };
        }
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          return { success: false, error: 'Connection timeout' };
        }
        if (error.response) {
          const status = error.response.status;
          const message = error.response.data?.error?.message || error.message;
          
          if (status === 401) {
            return { success: false, error: 'Invalid API key' };
          }
          if (status === 404) {
            return { success: false, error: 'Model not found' };
          }
          return { success: false, error: `API Error (${status}): ${message}` };
        }
        return { success: false, error: error.message };
      }
      
      return { success: false, error: String(error) };
    }
  }

  /**
   * 生成报告
   * @param logs 工作日志列表
   * @param systemPrompt 系统提示词（Prompt Template 内容）
   * @param profile 可选，指定使用的 AI Profile（不传则使用激活的 Profile）
   */
  async generateReport(
    logs: Array<{ task_key: string; summary: string; source: string; log_date: string }>,
    systemPrompt: string,
    profile?: AIProfile | null
  ): Promise<{
    success: boolean;
    content?: string;
    error?: string;
  }> {
    const targetProfile = profile || this.getActiveProfile();
    
    if (!targetProfile) {
      return { success: false, error: 'No AI profile configured' };
    }

    // 构建日志文本
    const logsText = logs.map(log => {
      const prefix = log.source === 'JIRA' ? `[${log.task_key}]` : '[MANUAL]';
      return `- ${log.log_date}: ${prefix} ${log.summary}`;
    }).join('\n');

    // 替换模板变量
    const finalPrompt = systemPrompt.replace(/{{logs}}/g, logsText);

    try {
      const client = axios.create({
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
        timeout: 120000,
      });

      const response = await client.post(
        `${targetProfile.baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          model: targetProfile.model,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: finalPrompt }
          ],
          temperature: 0.7,
        },
        {
          headers: {
            'Authorization': `Bearer ${targetProfile.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 200 && response.data?.choices?.[0]?.message?.content) {
        return {
          success: true,
          content: response.data.choices[0].message.content,
        };
      }

      return { success: false, error: 'Invalid response format' };
    } catch (error) {
      console.error('[AIService] Generate report error:', error);
      if (error instanceof AxiosError) {
        return { success: false, error: error.response?.data?.error?.message || error.message };
      }
      return { success: false, error: String(error) };
    }
  }
}

// 导出单例
export const aiService = new AIService();
