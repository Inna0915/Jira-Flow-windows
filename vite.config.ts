import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { copyFileSync, mkdirSync, existsSync, readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main Process entry file
        entry: 'electron/main/main.ts',
        onstart({ startup }) {
          // 复制 preload 脚本（不经过打包，保持原始 CommonJS 格式）
          const preloadSrc = path.join(__dirname, 'electron/preload/preload.cjs');
          const preloadDir = path.join(__dirname, 'dist-electron/preload');
          const preloadDest = path.join(preloadDir, 'preload.js');
          
          if (!existsSync(preloadDir)) {
            mkdirSync(preloadDir, { recursive: true });
          }
          copyFileSync(preloadSrc, preloadDest);
          console.log('[preload] Copied preload.cjs to dist-electron/preload/preload.js');
          
          if (process.env.VSCODE_DEBUG) {
            console.log('[startup] Electron App');
          } else {
            startup();
          }
        },
        vite: {
          build: {
            sourcemap: true,
            minify: process.env.NODE_ENV === 'production',
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['better-sqlite3', 'electron-store'],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  clearScreen: false,
});
