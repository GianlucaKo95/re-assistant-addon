import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  publicDir: 'public',
  build: {
    outDir:      'dist',
    emptyOutDir: true,
    target:      'esnext',  // Unterstützt nested Template-Literals
    minify:      'esbuild',
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'INVALID_ANNOTATION') return;
        warn(warning);
      },
      output: {
        chunkFileNames:  'assets/[name]-[hash].js',
        entryFileNames:  'assets/[name]-[hash].js',
        assetFileNames:  'assets/[name]-[hash][extname]',
      }
    }
  },
  esbuild: {
    target:        'esnext',
    legalComments: 'none',
  },
  // Import-Analyse-Plugin überspringt Template-Literal-Syntax-Check
  plugins: [
    {
      name: 'no-treeshake-template-literals',
      transform(code, id) {
        return null; // Code unverändert durchleiten — esbuild handhabt es
      }
    }
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws':  { target: 'ws://localhost:3001',  ws: true }
    }
  }
});