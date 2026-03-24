import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true
      }
    }
  }
});