import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      // Include all tested modules
      include: [
        'utils/**/*.ts',
        'encryption/crypto-adapter.ts',
        'encryption/encryption-utils.ts',
        'encryption/encryption-service.ts',
        'encryption/signal/signal-types.ts',
        'types/encryption.ts',
        'types/status-types.ts',
        'types/conversation.ts',
      ],
      exclude: ['**/*.d.ts', '**/index.ts', '**/signal-store-interface.ts'],
      thresholds: {
        branches: 95,
        functions: 84,
        lines: 97,
        statements: 97,
      },
    },
  },
});
