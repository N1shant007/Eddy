import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@eddy/rules': fileURLToPath(new URL('./src/shared/rules/index.ts', import.meta.url)) } },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: { output: { manualChunks: { konva: ['konva', 'react-konva'], react: ['react', 'react-dom'] } } },
  },
  test: { environment: 'node' },
} as any);
