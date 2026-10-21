import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/auth': { target: 'http://localhost:3001', changeOrigin: true },
      '/roles': { target: 'http://localhost:3001', changeOrigin: true },
      '/users': { target: 'http://localhost:3002', changeOrigin: true },
      '/audits': { target: 'http://localhost:3003', changeOrigin: true },
      '/ai': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
});
