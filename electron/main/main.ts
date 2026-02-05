import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase, closeDatabase, settingsDB, tasksDB, workLogsDB } from './db/schema';
import { registerDatabaseIPCs } from './ipc/database';
import { registerJiraIPCs } from './ipc/jira';

// ESM 中 __dirname 替代方案
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 保持全局窗口引用，防止被垃圾回收
let mainWindow: BrowserWindow | null = null;

/**
 * 创建主窗口
 */
function createMainWindow(): void {
  console.log('[Main] Creating main window...');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false, // 等待加载完成后再显示
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
    darkTheme: true,
  });

  // 加载应用内容
  if (process.env.VITE_DEV_SERVER_URL) {
    // 开发模式：加载 Vite 开发服务器
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式：加载构建后的文件
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // 窗口关闭时清理引用
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * 应用准备就绪
 */
app.whenReady().then(() => {
  console.log('[Main] App is ready');

  // 初始化数据库（在创建窗口之前）
  try {
    getDatabase();
    console.log('[Main] Database initialized successfully');
  } catch (error) {
    console.error('[Main] Failed to initialize database:', error);
    app.quit();
    return;
  }

  // 注册 IPC 处理器
  registerDatabaseIPCs();
  registerJiraIPCs();

  // 创建主窗口
  createMainWindow();

  // macOS: 点击 dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

/**
 * 应用即将退出
 */
app.on('will-quit', () => {
  console.log('[Main] App is quitting, closing database...');
  closeDatabase();
});

/**
 * 所有窗口关闭时退出应用（Windows/Linux）
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 安全考虑：防止新窗口创建
app.on('web-contents-created', (_, contents) => {
  contents.on('new-window', (event) => {
    event.preventDefault();
  });
});
