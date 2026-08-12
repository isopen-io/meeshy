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
        'types/role-types.ts',
        'types/status-types.ts',
        'types/conversation.ts',
        'types/delivery-queue.ts',
        'types/attachment-audio.ts',
        'types/audio-transcription.ts',
        'types/audio-effects-timeline.ts',
        'types/attachment-transcription.ts',
        'types/translated-audio.ts',
        'types/notification.ts',
        'types/preferences/notification.ts',
        'types/preferences/video.ts',
        'types/preferences/audio.ts',
        'types/preferences/privacy.ts',
        'types/preferences/message.ts',
        'types/preferences/document.ts',
        'types/preferences/application.ts',
        // types/post.ts intentionally excluded: file contains only TypeScript interfaces/type aliases
        // which emit no executable JavaScript. Coverage would show 0/0 (no lines to cover).
        // The smoke test in __tests__/types/post.test.ts verifies the module loads without error.
        'types/reaction.ts',
        'types/attachment.ts',
      ],
      exclude: ['**/*.d.ts', '**/index.ts', '**/signal-store-interface.ts'],
      // vitest 4's rewritten coverage remapper (ast-v8-to-istanbul) does not honor
      // `/* v8 ignore next */` comment hints (verified: they are silently dropped,
      // not a source/test regression). Thresholds are set to the real measured
      // baseline under vitest 4.1.10 + @vitest/coverage-v8 4.1.10 with a small margin.
      thresholds: {
        branches: 94,
        functions: 93,
        lines: 98,
        statements: 98,
      },
    },
  },
});
