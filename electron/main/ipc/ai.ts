import { ipcMain } from 'electron';
import { aiService, AIProfile, AIProvider, PROVIDER_TEMPLATES } from '../services/AIService';

/**
 * 注册 AI 相关的 IPC 处理器
 */
export function registerAIIPCs(): void {
  console.log('[IPC] Registering AI IPC handlers...');

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
   */
  ipcMain.handle('ai:generate-report', async (_, prompt: string) => {
    try {
      const result = await aiService.generateReport(prompt);
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
