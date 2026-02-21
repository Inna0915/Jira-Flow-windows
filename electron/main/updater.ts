import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import { ipcMain, BrowserWindow, app } from 'electron';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// 更新状态类型
type UpdateStatus = 
  | 'idle' 
  | 'checking' 
  | 'available' 
  | 'latest' 
  | 'downloading' 
  | 'ready' 
  | 'error';

// 当前更新状态
let currentStatus: UpdateStatus = 'idle';
let updateInfo: UpdateInfo | null = null;
let downloadProgress: number = 0;
let errorMessage: string = '';

/**
 * 向所有渲染进程发送更新状态
 */
function sendStatusToWindows(status: UpdateStatus, data?: Record<string, unknown>) {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach(window => {
    if (!window.isDestroyed()) {
      window.webContents.send('updater:status', { status, ...data });
    }
  });
}

/**
 * 向所有渲染进程发送下载进度
 */
function sendProgressToWindows(progress: number) {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach(window => {
    if (!window.isDestroyed()) {
      window.webContents.send('updater:progress', { percent: progress });
    }
  });
}

/**
 * 向所有渲染进程发送错误信息
 */
function sendErrorToWindows(message: string) {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach(window => {
    if (!window.isDestroyed()) {
      window.webContents.send('updater:error', { message });
    }
  });
}

/**
 * 初始化自动更新器
 */
export function initUpdater(): void {
  // 只在打包后的应用中使用自动更新
  if (!app.isPackaged) {
    console.log('[Updater] 开发模式，自动更新已禁用');
    return;
  }

  console.log('[Updater] 初始化自动更新器');

  // 配置自动更新器
  autoUpdater.autoDownload = false; // 用户确认后才下载
  autoUpdater.allowPrerelease = false; // 只获取稳定版本
  autoUpdater.fullChangelog = false;

  // ===== 事件监听器 =====

  // 正在检查更新
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] 正在检查更新...');
    currentStatus = 'checking';
    sendStatusToWindows('checking');
  });

  // 有新版本可用
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log('[Updater] 发现新版本:', info.version);
    currentStatus = 'available';
    updateInfo = info;
    sendStatusToWindows('available', { 
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  // 没有新版本（已是最新）
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    console.log('[Updater] 已是最新版本:', info.version);
    currentStatus = 'latest';
    sendStatusToWindows('latest', { version: info.version });
  });

  // 下载进度
  autoUpdater.on('download-progress', (progressObj: ProgressInfo) => {
    const percent = Math.round(progressObj.percent);
    downloadProgress = percent;
    console.log(`[Updater] 下载进度: ${percent}%`);
    sendProgressToWindows(percent);
  });

  // 更新下载完成
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.log('[Updater] 更新下载完成:', info.version);
    currentStatus = 'ready';
    sendStatusToWindows('ready', { version: info.version });
  });

  // 错误处理
  autoUpdater.on('error', (err: Error) => {
    console.error('[Updater] 更新错误:', err.message);
    currentStatus = 'error';
    errorMessage = err.message;
    sendErrorToWindows(err.message);
  });

  // ===== IPC 处理器 =====

  // 检查更新
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) {
      return { 
        success: false, 
        error: '开发模式下无法检查更新',
        isDev: true,
      };
    }

    try {
      await autoUpdater.checkForUpdates();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : '检查更新失败';
      console.error('[Updater] 检查更新失败:', message);
      return { success: false, error: message };
    }
  });

  // 开始下载更新
  ipcMain.handle('updater:start-download', async () => {
    if (!app.isPackaged) {
      return { 
        success: false, 
        error: '开发模式下无法下载更新',
        isDev: true,
      };
    }

    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : '下载更新失败';
      console.error('[Updater] 下载更新失败:', message);
      return { success: false, error: message };
    }
  });

  // 退出并安装更新
  ipcMain.handle('updater:quit-and-install', () => {
    if (!app.isPackaged) {
      return { 
        success: false, 
        error: '开发模式下无法安装更新',
        isDev: true,
      };
    }

    console.log('[Updater] 退出并安装更新');
    // 立即退出并安装，isSilent=true 表示不提示用户
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  });

  // 获取当前状态
  ipcMain.handle('updater:get-status', () => {
    return {
      success: true,
      status: currentStatus,
      version: updateInfo?.version,
      progress: downloadProgress,
      error: errorMessage,
      isDev: !app.isPackaged,
    };
  });

  // 应用启动后延迟检查更新（避免启动时立即检查影响性能）
  setTimeout(() => {
    if (app.isPackaged) {
      console.log('[Updater] 启动后自动检查更新');
      autoUpdater.checkForUpdates().catch(err => {
        console.error('[Updater] 自动检查更新失败:', err.message);
      });
    }
  }, 30000); // 30 秒后检查
}

/**
 * 获取自动更新器实例（用于外部访问）
 */
export function getAutoUpdater() {
  return autoUpdater;
}
