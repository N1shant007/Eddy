import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@eddy/rules': fileURLToPath(new URL('../../packages/rules/src/index.ts', import.meta.url)) } },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8788' } },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: { output: { manualChunks: { konva: ['konva', 'react-konva'], supabase: ['@supabase/supabase-js'], react: ['react', 'react-dom'] } } },
  },
});
