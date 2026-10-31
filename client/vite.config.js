import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// 在部分 Windows 环境中，esbuild 无法删除系统临时目录中的文件。
// 把临时目录固定到项目内，构建更稳定，也方便容器与沙箱环境。
const tempDir = path.join(root, '..', '.tmp');
fs.mkdirSync(tempDir, { recursive: true });
process.env.TMP = tempDir;
process.env.TEMP = tempDir;

export default defineConfig({
  root,
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
      '/uploads': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
  build: {
    outDir: path.join(root, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
