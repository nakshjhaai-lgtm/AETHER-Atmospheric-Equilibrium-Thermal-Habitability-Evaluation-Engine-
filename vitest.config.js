import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    exclude: [],
    coverage: {
      provider: 'v8',
      include: ['js/solvers/**', 'js/models/**', 'js/schema/**'],
      exclude: ['js/workers/**', 'js/visualization/**']
    }
  }
});
