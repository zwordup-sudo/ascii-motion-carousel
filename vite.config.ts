import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { rolldownOptions: { output: {
    assetFileNames: asset => asset.names.includes('LICENSE') ? 'licenses/DejaVu-LICENSE.txt' : 'assets/[name]-[hash][extname]',
  } } },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
