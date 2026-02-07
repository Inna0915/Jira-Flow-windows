import { ipcMain } from 'electron';
import { reportsDB } from '../db/schema';
import { v4 as uuidv4 } from 'uuid';

/**
 * 注册报告相关的 IPC 处理器
 * 支持层级：年/季/月/周
 */
export function registerReportIPCs(): void {
  // 保存生成的报告
  ipcMain.handle('report:save', async (_, report: {
    type: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    start_date: string;
    end_date: string;
    content: string;
  }) => {
    try {
      const id = uuidv4();
      reportsDB.save({ id, ...report });
      return { success: true, id };
    } catch (error) {
      console.error('[IPC] Failed to save report:', error);
      return { success: false, error: String(error) };
    }
  });

  // 获取层级报告包（年报+月报 / 季报+月报 / 月报+周报）
  ipcMain.handle('report:get-hierarchy-bundle', async (_, { 
    hierarchy, 
    startDate, 
    endDate 
  }: { 
    hierarchy: 'year' | 'quarter' | 'month' | 'week'; 
    startDate: string; 
    endDate: string;
  }) => {
    try {
      if (hierarchy === 'week') {
        const report = reportsDB.getByDateRange('weekly', startDate, endDate);
        return { 
          success: true, 
          data: { 
            main: report, 
            children: [], 
            hierarchy: 'week' 
          } 
        };
      }
      const bundle = reportsDB.getBundle(hierarchy, startDate, endDate);
      return { success: true, data: bundle };
    } catch (error) {
      console.error('[IPC] Failed to get hierarchy bundle:', error);
      return { success: false, error: String(error) };
    }
  });

  // 获取月度报告包（月报 + 该月所有周报）- 兼容旧接口
  ipcMain.handle('report:get-monthly-bundle', async (_, { monthStart, monthEnd }: {
    monthStart: string;
    monthEnd: string;
  }) => {
    try {
      const result = reportsDB.getMonthlyBundle(monthStart, monthEnd);
      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Failed to get monthly bundle:', error);
      return { success: false, error: String(error) };
    }
  });

  // 获取特定日期范围的报告
  ipcMain.handle('report:get-by-range', async (_, { type, startDate, endDate }: {
    type: string;
    startDate: string;
    endDate: string;
  }) => {
    try {
      const report = reportsDB.getByDateRange(type, startDate, endDate);
      return { success: true, data: report };
    } catch (error) {
      console.error('[IPC] Failed to get report by range:', error);
      return { success: false, error: String(error) };
    }
  });

  // 获取指定类型和日期范围内的所有报告
  ipcMain.handle('report:get-by-type-and-range', async (_, { type, startDate, endDate }: {
    type: string;
    startDate: string;
    endDate: string;
  }) => {
    try {
      const reports = reportsDB.getByTypeAndDateRange(type, startDate, endDate);
      return { success: true, data: reports };
    } catch (error) {
      console.error('[IPC] Failed to get reports by type and range:', error);
      return { success: false, error: String(error) };
    }
  });
}
