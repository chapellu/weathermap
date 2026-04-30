import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    proxy: {
      '/auth': { target: 'http://localhost:3000', changeOrigin: false },
      '/weather': { target: 'http://localhost:3000', changeOrigin: false },
      '/me': { target: 'http://localhost:3000', changeOrigin: false },
      '/admin': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
});
