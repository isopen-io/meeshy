/**
 * C7-UI — garde de CATALOGUE des quatre clés d'accessibilité média du
 * composer web.
 *
 * `useI18n.t(key)` appelé SANS second argument retourne la CLÉ quand elle
 * manque (`apps/web/hooks/use-i18n.ts`) : une clé absente ne casse rien, elle
 * affiche « postComposer.mediaAlt.label » à l'écran. Les tests de
 * `MediaAccessibilityFields` mockent `useI18n` (par construction : ils testent
 * le câblage, pas la traduction), donc AUCUN d'eux ne peut rougir sur une clé
 * manquante — d'où cette garde, qui lit les catalogues réels.
 *
 * Elle vérifie aussi que la valeur DIFFÈRE de la clé : un catalogue qui
 * « contient » la clé en recopiant son chemin passerait sinon au vert tout en
 * affichant exactement la même chose qu'une clé absente.
 */
import fs from 'node:fs';
import path from 'node:path';

const LOCALES = ['en', 'fr', 'es', 'pt'] as const;

const REQUIRED_KEYS = [
  'postComposer.mediaAlt.label',
  'postComposer.mediaAlt.placeholder',
  'postComposer.soundExtraction.label',
  'postComposer.soundExtraction.caption',
] as const;

function loadCommonNamespace(locale: string): Record<string, unknown> {
  const file = path.join(__dirname, '..', '..', '..', 'locales', locale, 'common.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  // `useI18n` déballe la racine homonyme du namespace avant toute résolution
  // (`if (ns in translations) translations = translations[ns]`), donc la garde
  // doit résoudre depuis le MÊME point d'entrée que l'application.
  return (parsed.common ?? parsed) as Record<string, unknown>;
}

function resolve(namespace: Record<string, unknown>, dottedKey: string): unknown {
  return dottedKey.split('.').reduce<unknown>((node, segment) => {
    if (node === null || typeof node !== 'object') return undefined;
    return (node as Record<string, unknown>)[segment];
  }, namespace);
}

describe('web i18n catalogs — media accessibility keys (C7-UI)', () => {
  describe.each(LOCALES)('%s/common.json', (locale) => {
    const namespace = loadCommonNamespace(locale);

    it.each(REQUIRED_KEYS)('defines %s as a non-empty string', (key) => {
      const value = resolve(namespace, key);
      expect(typeof value).toBe('string');
      expect((value as string).trim().length).toBeGreaterThan(0);
    });

    it.each(REQUIRED_KEYS)('does not echo the key path back for %s', (key) => {
      expect(resolve(namespace, key)).not.toBe(key);
    });
  });

  /**
   * Rougit si une locale reçoit une clé que les autres n'ont pas : un
   * catalogue partiel réintroduit exactement le défaut d'origine, mais sur une
   * seule langue — donc invisible à quiconque teste en anglais.
   */
  it('keeps the four keys in lockstep across the four catalogs', () => {
    const shapes = LOCALES.map((locale) => {
      const namespace = loadCommonNamespace(locale);
      return REQUIRED_KEYS.filter((key) => typeof resolve(namespace, key) === 'string');
    });
    shapes.forEach((present) => expect(present).toEqual([...REQUIRED_KEYS]));
  });
});
