import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const PAGES_BASE = '/ascii-motion-carousel/';

export default defineConfig(({ mode }) => ({
  // GitHub Pages sirve el proyecto bajo /ascii-motion-carousel/.
  // El servidor de desarrollo conserva la raíz para no romper el flujo local.
  base: mode === 'production' ? PAGES_BASE : '/',
  plugins: [react()],
  build: { rolldownOptions: { output: {
    assetFileNames: asset => asset.names.includes('LICENSE') ? 'licenses/DejaVu-LICENSE.txt' : 'assets/[name]-[hash][extname]',
  } } },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
}));
