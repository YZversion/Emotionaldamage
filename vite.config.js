import { defineConfig } from 'vite';

const zhipuProxy = {
  '/api/zhipu': {
    target: 'https://open.bigmodel.cn',
    changeOrigin: true,
    secure: true,
    rewrite: path => path.replace(/^\/api\/zhipu/, ''),
  },
};

export default defineConfig({
  root: '.',
  base: './',
  server: {
    open: true,
    port: 3000,
    proxy: zhipuProxy,
  },
  preview: {
    port: 3000,
    proxy: zhipuProxy,
  },
  build: {
    outDir: 'dist',
  },
});
