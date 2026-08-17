/**
 * WF-113 — clés i18n `focal.*` (MÊME patron que `lentille-i18n-keys.test.ts`,
 * REV-1 réserve 12b) : `useI18n('conversations')` descend dans
 * `data.conversations` avant toute résolution de chemin (`hooks/use-i18n.ts`).
 */

const LOCALES = ['en', 'fr', 'es', 'pt'] as const;

const scopeToNamespace = (data: Record<string, unknown>, namespace: string): Record<string, unknown> =>
  (namespace in data ? (data[namespace] as Record<string, unknown>) : data);

const resolve = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object' && segment in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);

const loadScopedConversations = (locale: string): Record<string, unknown> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const data = require(`@/locales/${locale}/conversations.json`);
  return scopeToNamespace(data.default ?? data, 'conversations');
};

// Parité 2026-08-17 — chaque libellé neuf de la rangée plate est ATTEIGNABLE
// dans les quatre locales (sinon le repli en dur du code deviendrait la
// version « officielle » d'un mot d'interface, dans une seule langue).
const FOCAL_KEYS = [
  'focal.row.you',
  'focal.row.emptyContent',
  'focal.row.forwarded',
  'focal.row.edited',
  'focal.row.translated',
  'focal.row.openProfile',
  'focal.row.callSummary',
  'focal.row.attachments',
];

describe('focal namespace i18n keys — reachable via useI18n(\'conversations\')', () => {
  LOCALES.forEach((locale) => {
    const ns = loadScopedConversations(locale);

    FOCAL_KEYS.forEach((key) => {
      it(`[${locale}] t('${key}') resolves to a non-empty string`, () => {
        const value = resolve(ns, key);
        expect(typeof value).toBe('string');
        expect((value as string).trim().length).toBeGreaterThan(0);
      });
    });
  });

  it('does NOT expose "focal" at the raw file root', () => {
    LOCALES.forEach((locale) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const raw = require(`@/locales/${locale}/conversations.json`);
      const data = raw.default ?? raw;
      expect(data.focal).toBeUndefined();
    });
  });
});
