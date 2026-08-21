/**
 * Constat 22 (F7c, rattrapage revue Opus) — `PostCard`/`PostDetail` résolvent
 * le libellé du bouton 🔇 (B3.6) via `useI18n('components')` → `t('mute', …)` /
 * `t('unmute', …)`. Ces clés n'existaient dans AUCUN des 4 catalogues
 * `components.json` : `use-i18n.ts`'s `t()` retombe alors sur le FALLBACK en
 * dur (`'Mute'`/`'Unmute'`) — anglais dans les 4 locales, y compris fr/es/pt.
 * (`StoryViewer.tsx` utilise `useI18n('common')`, où `common.mute` existe
 * déjà correctement — ce site-là n'est pas concerné.)
 *
 * Même mécanique de scope que `lentille-i18n-keys.test.ts` : `useI18n(ns)`
 * charge `${ns}.json` puis, si le JSON porte une clé racine `ns`, descend
 * dedans avant toute résolution (`hooks/use-i18n.ts`, `loadTranslations`).
 */

const LOCALES = ['en', 'fr', 'es', 'pt'] as const;

/** Reproduit `useI18n`'s `loadTranslations` extraction: `data[ns] ?? data`. */
const scopeToNamespace = (data: Record<string, unknown>, namespace: string): Record<string, unknown> =>
  (namespace in data ? (data[namespace] as Record<string, unknown>) : data);

const loadScopedComponents = (locale: string): Record<string, unknown> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const data = require(`@/locales/${locale}/components.json`);
  return scopeToNamespace(data.default ?? data, 'components');
};

describe('components namespace — mute/unmute keys (constat 22)', () => {
  // Mêmes libellés que `common.mute`/`common.unmute` (StoryViewer, déjà
  // correct) — le cliquet accents français exige les accents, jamais un
  // repli ASCII.
  const EXPECTED: Record<(typeof LOCALES)[number], { mute: string; unmute: string }> = {
    en: { mute: 'Mute', unmute: 'Unmute' },
    fr: { mute: 'Couper le son', unmute: 'Activer le son' },
    es: { mute: 'Silenciar', unmute: 'Activar sonido' },
    pt: { mute: 'Silenciar', unmute: 'Ativar som' },
  };

  LOCALES.forEach((locale) => {
    it(`[${locale}] 'mute' resolves under the real 'components' scope — not the English fallback`, () => {
      const ns = loadScopedComponents(locale);
      expect(ns.mute).toBe(EXPECTED[locale].mute);
    });

    it(`[${locale}] 'unmute' resolves under the real 'components' scope — not the English fallback`, () => {
      const ns = loadScopedComponents(locale);
      expect(ns.unmute).toBe(EXPECTED[locale].unmute);
    });
  });
});
