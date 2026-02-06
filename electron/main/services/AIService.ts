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
 * AI 服务类
 * 管理多模型配置文件的增删改查和连接测试
 */
export class AIService {
  private static readonly STORAGE_KEY = 'ai_profiles';

  /**
   * 获取所有 AI Profiles
   */
  getProfiles(): AIProfile[] {
    try {
      const data = settingsDB.get(AIService.STORAGE_KEY);
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
      
      settingsDB.set(AIService.STORAGE_KEY, JSON.stringify(profiles));
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
   * 生成报告（使用激活的 Profile）
   */
  async generateReport(prompt: string): Promise<{
    success: boolean;
    content?: string;
    error?: string;
  }> {
    const profile = this.getActiveProfile();
    
    if (!profile) {
      return { success: false, error: 'No active AI profile configured' };
    }

    try {
      const client = axios.create({
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
        timeout: 120000,
      });

      const response = await client.post(
        `${profile.baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          model: profile.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        },
        {
          headers: {
            'Authorization': `Bearer ${profile.apiKey}`,
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
