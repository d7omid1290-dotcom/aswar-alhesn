import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { lanServer } from './server/vite-lan';

export default defineConfig({
  plugins: [react(), tailwindcss(), lanServer()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: { output: { manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : id.includes('node_modules/xlsx') ? 'xlsx' : undefined) } },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
