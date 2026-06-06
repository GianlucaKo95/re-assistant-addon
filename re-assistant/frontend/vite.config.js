import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',           // Relative Pfade — funktioniert mit HA Ingress
  publicDir: 'public',
  build: {
    outDir:     'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        chunkFileNames:  'assets/[name]-[hash].js',
        entryFileNames:  'assets/[name]-[hash].js',
        assetFileNames:  'assets/[name]-[hash][extname]',
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws':  { target: 'ws://localhost:3001',  ws: true }
    }
  }
});
