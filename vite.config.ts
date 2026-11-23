import { defineConfig } from 'vitest/config';
export default defineConfig({
  server: { port: Number(process.env.NOVA_VITE_PORT ?? 5173), strictPort: true, proxy: { '/api': 'http://localhost:8790' } },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 600000, hookTimeout: 60000, pool: 'forks' },
});
