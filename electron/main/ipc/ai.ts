import { ipcMain } from 'electron';
import { 
  aiService, 
  AIProfile, 
  AIProvider, 
  PROVIDER_TEMPLATES,
  PromptTemplate 
} from '../services/AIService';

/**
 * 注册 AI 相关的 IPC 处理器
 */
export function registerAIIPCs(): void {
  console.log('[IPC] Registering AI IPC handlers...');

  // ==================== Profile 管理 ====================

  /**
   * 获取所有 AI Profiles
   */
  ipcMain.handle('ai:get-profiles', () => {
    try {
      const profiles = aiService.getProfiles();
      return { success: true, data: profiles };
    } catch (error) {
      console.error('[IPC] ai:get-profiles error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 保存所有 AI Profiles
   */
  ipcMain.handle('ai:save-profiles', (_, profiles: AIProfile[]) => {
    try {
      const result = aiService.saveProfiles(profiles);
      return result;
    } catch (error) {
      console.error('[IPC] ai:save-profiles error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 添加新的 AI Profile
   */
  ipcMain.handle('ai:add-profile', (_, profile: Omit<AIProfile, 'id'>) => {
    try {
      const result = aiService.addProfile(profile);
      return result;
    } catch (error) {
      console.error('[IPC] ai:add-profile error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 更新 AI Profile
   */
  ipcMain.handle('ai:update-profile', (_, profileId: string, updates: Partial<AIProfile>) => {
    try {
      const result = aiService.updateProfile(profileId, updates);
      return result;
    } catch (error) {
      console.error('[IPC] ai:update-profile error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 删除 AI Profile
   */
  ipcMain.handle('ai:delete-profile', (_, profileId: string) => {
    try {
      const result = aiService.deleteProfile(profileId);
      return result;
    } catch (error) {
      console.error('[IPC] ai:delete-profile error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 设置激活的 Profile
   */
  ipcMain.handle('ai:set-active-profile', (_, profileId: string) => {
    try {
      const result = aiService.setActiveProfile(profileId);
      return result;
    } catch (error) {
      console.error('[IPC] ai:set-active-profile error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 获取当前激活的 Profile
   */
  ipcMain.handle('ai:get-active-profile', () => {
    try {
      const profile = aiService.getActiveProfile();
      return { success: true, data: profile };
    } catch (error) {
      console.error('[IPC] ai:get-active-profile error:', error);
      return { success: false, error: String(error) };
    }
  });

  // ==================== Prompt Template 管理 ====================

  /**
   * 获取所有 Prompt Templates
   */
  ipcMain.handle('ai:get-templates', () => {
    try {
      const templates = aiService.getTemplates();
      return { success: true, data: templates };
    } catch (error) {
      console.error('[IPC] ai:get-templates error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 保存所有 Prompt Templates
   */
  ipcMain.handle('ai:save-templates', (_, templates: PromptTemplate[]) => {
    try {
      const result = aiService.saveTemplates(templates);
      return result;
    } catch (error) {
      console.error('[IPC] ai:save-templates error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 添加新的 Prompt Template
   */
  ipcMain.handle('ai:add-template', (_, template: Omit<PromptTemplate, 'id'>) => {
    try {
      const result = aiService.addTemplate(template);
      return result;
    } catch (error) {
      console.error('[IPC] ai:add-template error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 更新 Prompt Template
   */
  ipcMain.handle('ai:update-template', (_, templateId: string, updates: Partial<PromptTemplate>) => {
    try {
      const result = aiService.updateTemplate(templateId, updates);
      return result;
    } catch (error) {
      console.error('[IPC] ai:update-template error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 删除 Prompt Template
   */
  ipcMain.handle('ai:delete-template', (_, templateId: string) => {
    try {
      const result = aiService.deleteTemplate(templateId);
      return result;
    } catch (error) {
      console.error('[IPC] ai:delete-template error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 重置为默认模板
   */
  ipcMain.handle('ai:reset-templates', () => {
    try {
      const result = aiService.resetTemplatesToDefault();
      if (result.success) {
        const templates = aiService.getTemplates();
        return { success: true, data: templates };
      }
      return result;
    } catch (error) {
      console.error('[IPC] ai:reset-templates error:', error);
      return { success: false, error: String(error) };
    }
  });

  // ==================== AI 连接与报告生成 ====================

  /**
   * 测试 AI 连接
   */
  ipcMain.handle('ai:test-connection', async (_, config: { baseUrl: string; apiKey: string; model: string }) => {
    try {
      const result = await aiService.testConnection(config);
      return result;
    } catch (error) {
      console.error('[IPC] ai:test-connection error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 生成报告
   * @param logs 工作日志列表
   * @param systemPrompt 系统提示词
   * @param profileId 可选，指定使用的 Profile ID（不传则使用激活的 Profile）
   */
  ipcMain.handle('ai:generate-report', async (_, 
    logs: Array<{ task_key: string; summary: string; source: string; log_date: string }>,
    systemPrompt: string,
    profileId?: string
  ) => {
    try {
      // 如果指定了 profileId，查找对应的 profile
      let profile = null;
      if (profileId) {
        const profiles = aiService.getProfiles();
        profile = profiles.find(p => p.id === profileId) || null;
      }
      
      const result = await aiService.generateReport(logs, systemPrompt, profile);
      return result;
    } catch (error) {
      console.error('[IPC] ai:generate-report error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 获取 Provider 预设模板
   */
  ipcMain.handle('ai:get-provider-templates', () => {
    try {
      return { success: true, data: PROVIDER_TEMPLATES };
    } catch (error) {
      console.error('[IPC] ai:get-provider-templates error:', error);
      return { success: false, error: String(error) };
    }
  });

  console.log('[IPC] AI IPC handlers registered');
}
