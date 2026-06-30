/**
 * Regression guard for the conversation-domain i18n keys consumed without a
 * resilient fallback (iteration 72w).
 *
 * Context: `useI18n(ns)` extracts `data[ns]` from `<ns>.json`, then `t(key)`
 * returns the raw key string when the path is missing. Three conversation
 * components previously relied on the dead `t(key) || 'fallback'` form, and
 * `ConversationLayout` pointed at a key (`messageRestored`) that does NOT exist
 * directly under the `conversations` namespace — so the toast rendered the raw
 * key. These tests assert each key resolves to a real string in all 4 locales.
 */

const LOCALES = ['en', 'fr', 'es', 'pt'] as const;

const resolve = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object' && segment in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);

const loadNamespace = (locale: string, namespace: string): Record<string, unknown> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const data = require(`@/locales/${locale}/${namespace}.json`);
  return (data[namespace] ?? data) as Record<string, unknown>;
};

describe('conversations namespace i18n keys (iter 72w)', () => {
  const KEYS = [
    'conversationDetails.searchParticipants',
    'conversationDetails.searchOrAddParticipants',
    'conversationHeader.settings',
    'bubbleStream.messageRestored',
  ];

  LOCALES.forEach((locale) => {
    const ns = loadNamespace(locale, 'conversations');
    KEYS.forEach((key) => {
      it(`[${locale}] resolves "${key}" to a non-empty string`, () => {
        const value = resolve(ns, key);
        expect(typeof value).toBe('string');
        expect((value as string).trim().length).toBeGreaterThan(0);
      });
    });
  });

  it('does NOT expose a bare "messageRestored" key under the namespace root (would mask the bug)', () => {
    LOCALES.forEach((locale) => {
      const ns = loadNamespace(locale, 'conversations');
      expect(ns.messageRestored).toBeUndefined();
    });
  });
});

describe('modals namespace identifier-status keys (iter 72w)', () => {
  const KEYS = [
    'createConversationModal.conversationDetails.checkingIdentifier',
    'createConversationModal.conversationDetails.identifierTaken',
    'createConversationModal.conversationDetails.identifierAvailable',
  ];

  LOCALES.forEach((locale) => {
    const ns = loadNamespace(locale, 'modals');
    KEYS.forEach((key) => {
      it(`[${locale}] resolves "${key}" to a non-empty string`, () => {
        const value = resolve(ns, key);
        expect(typeof value).toBe('string');
        expect((value as string).trim().length).toBeGreaterThan(0);
      });
    });
  });
});
