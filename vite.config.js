import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // 禁用 crossorigin，避免 WKWebView 加载本地 file:// 时 CORS 失败
    modulePreload: { polyfill: false },
  }
});
