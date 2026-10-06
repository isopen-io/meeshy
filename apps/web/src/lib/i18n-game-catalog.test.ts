import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import {
  formatGameNumber,
  GAME_ORDINAL_BASES,
  gamePluralCategory,
  loadGameCatalog,
  translateGame,
  translateGamePlural,
  type GameCatalog,
} from './i18n-game-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DU JEU (#9379) — même discipline que les autres catalogues par
 * fonctionnalité : le français est la source des clés `game.*`, chaque autre
 * langue en porte EXACTEMENT les mêmes, avec les mêmes paramètres, et aucune
 * valeur n'est vide ni recopiée de sa clé. Le pluriel est une famille de clés
 * choisie par `Intl.PluralRules` : une langue qui a plus de catégories que le
 * français (l'arabe) peut porter des formes en plus, pas en moins.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, GameCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadGameCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

const PLURAL_FORM = /^(.+)\.(zero|one|two|few|many|other)$/;

/** Les formes de pluriel qu'une langue PEUT porter en plus du français : ses catégories CLDR autres que `one` et `other`. */
const extraCategories = (language: InterfaceLanguage): readonly string[] =>
  new Intl.PluralRules(language).resolvedOptions().pluralCategories.filter((category) => category !== 'one' && category !== 'other');

/** Celles d'une famille ORDINALE (« 4th », #9494) : ses catégories ordinales autres que `one` et `other`. */
const extraOrdinalCategories = (language: InterfaceLanguage): readonly string[] =>
  new Intl.PluralRules(language, { type: 'ordinal' }).resolvedOptions().pluralCategories.filter((category) => category !== 'one' && category !== 'other');

describe('chaque langue porte toutes les clés game.* du français', () => {
  test('toutes les clés du français, et seules s’y ajoutent les formes de pluriel de la langue', async () => {
    const french = sorted(Object.keys(await loadGameCatalog('fr')));
    for (const [language, catalog] of await loadAll()) {
      const keys = sorted(Object.keys(catalog));
      expect({ language, missing: french.filter((key) => !keys.includes(key)) }).toEqual({ language, missing: [] });
      const extra = keys.filter((key) => !french.includes(key));
      const allowed = extra.filter((key) => {
        const match = PLURAL_FORM.exec(key);
        const base = match?.[1];
        const category = match?.[2];
        if (base === undefined || category === undefined || !french.includes(`${base}.other`)) return false;
        return (GAME_ORDINAL_BASES as readonly string[]).includes(base) ? extraOrdinalCategories(language).includes(category) : extraCategories(language).includes(category);
      });
      expect({ language, extra }).toEqual({ language, extra: allowed });
    }
  });

  test('chaque valeur est un texte, jamais vide, jamais sa propre clé', async () => {
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        expect({ language, key, identifier: value === key }).toEqual({ language, key, identifier: false });
      }
    }
  });

  test('chaque valeur porte les MÊMES paramètres que le français (une forme `.one` ou `.two` peut taire le nombre)', async () => {
    const french = await loadGameCatalog('fr');
    const frenchOf = (key: string): string => (french as Readonly<Record<string, string>>)[key] ?? (french as Readonly<Record<string, string>>)[key.replace(/\.(zero|one|two|few|many)$/, '.other')] ?? '';
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        const expected = sorted(catalogPlaceholders(frenchOf(key)));
        const actual = sorted(catalogPlaceholders(value));
        const mayDropCount = /\.(one|two|zero)$/.test(key);
        const ok = mayDropCount ? actual.every((name) => expected.includes(name)) : JSON.stringify(actual) === JSON.stringify(expected);
        expect({ language, key, ok, actual, expected }).toEqual({ language, key, ok: true, actual, expected });
      }
    }
  });

  test('chaque base de pluriel porte sa forme `.one` et sa forme `.other` dans toutes les langues', async () => {
    for (const [language, catalog] of await loadAll()) {
      const keys = Object.keys(catalog);
      for (const key of keys.filter((candidate) => candidate.endsWith('.other'))) {
        const base = key.slice(0, -'.other'.length);
        expect({ language, base, one: keys.includes(`${base}.one`) }).toEqual({ language, base, one: true });
      }
    }
  });

  test('les textes affichés sont traduits, pas recopiés du français', async () => {
    const french = await loadGameCatalog('fr');
    const witnesses = ['game.missions.title', 'game.chest.open', 'game.guide.skip_all', 'game.rules.intro', 'game.photo.camera.denied', 'game.flame_panel.title'] as const;
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of witnesses) expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
    }
  });
});

describe('l’arabe — un « +N », un « N / M », une flèche ou un pourcentage ne se retournent pas', () => {
  test('chaque montant signé, fraction, flèche ou pourcentage est dans un isolat LTR', async () => {
    const arabic = await loadGameCatalog('ar');
    for (const [key, value] of Object.entries(arabic)) {
      const bare = value.replace(/⁦[^⁩]*⁩/g, '');
      const found = { signed: /\+(\d|\{)/.test(bare), fraction: /(\d|\})\s*\/\s*(\d|\{)/.test(bare), arrow: bare.includes('→'), percent: /\d\s?%/.test(bare) };
      expect({ key, ...found }).toEqual({ key, signed: false, fraction: false, arrow: false, percent: false });
    }
  });
});

describe('un « +N » ne tombe jamais seul en fin de ligne', () => {
  test('aucune espace sécable devant un montant signé, dans aucune langue', async () => {
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, breakable: /[ \t]⁦?\+[\d{]/.test(value) }).toEqual({ language, key, breakable: false });
      }
    }
  });
});

describe('le pluriel suit les catégories de la langue de l’interface', () => {
  test('français : zéro et un s’accordent au singulier (« 0 point », « 1 point »), deux au pluriel', async () => {
    await loadGameCatalog('fr');
    expect(translateGamePlural('fr', 'game.points', 0)).toBe('0 point');
    expect(translateGamePlural('fr', 'game.points', 1)).toBe('1 point');
    expect(translateGamePlural('fr', 'game.points', 2)).toBe('2 points');
  });

  test('anglais : zéro est un pluriel (« 0 points »)', async () => {
    await loadGameCatalog('en');
    expect(translateGamePlural('en', 'game.points', 0)).toBe('0 points');
    expect(translateGamePlural('en', 'game.points', 1)).toBe('1 point');
  });

  test('arabe : singulier, duel, pluriel de 3 à 10, puis le singulier du compté', async () => {
    await loadGameCatalog('ar');
    expect(translateGamePlural('ar', 'game.days', 1)).toBe('1 يوم');
    expect(translateGamePlural('ar', 'game.days', 2)).toBe('يومان');
    expect(translateGamePlural('ar', 'game.days', 5)).toBe('5 أيام');
    expect(translateGamePlural('ar', 'game.days', 11)).toBe('11 يومًا');
    expect(translateGamePlural('ar', 'game.days', 100)).toBe('100 يومًا');
  });

  test('une forme absente d’une langue retombe sur `.other` (jamais sur une clé nue)', async () => {
    await loadGameCatalog('de');
    expect(gamePluralCategory('de', 3)).toBe('other');
    expect(translateGamePlural('de', 'game.days', 3)).toBe('3 Tage');
  });

  test('le nombre est formaté dans la langue (séparateur des milliers)', async () => {
    expect(formatGameNumber('fr', 1221)).toBe(new Intl.NumberFormat('fr-FR').format(1221));
    expect(formatGameNumber('en', 1221)).toBe('1,221');
    expect(formatGameNumber('de', 1221)).toBe('1.221');
    expect(formatGameNumber('ar', 1221)).toMatch(/^1\D221$/);
  });
});

/**
 * LE PSEUDONYME DE LIGUE — `isValidLeaguePseudonym` accepte le tiret bas : le
 * message qui refuse un pseudonyme énumère ce que la loi accepte, il ne le
 * rétrécit pas.
 */
const UNDERSCORE_WORD: Readonly<Record<InterfaceLanguage, string>> = {
  fr: 'tiret bas',
  en: 'underscore',
  es: 'guion bajo',
  pt: 'sublinhado',
  it: 'trattino basso',
  de: 'Unterstrich',
  ar: 'شرطة سفلية',
};

describe('le refus d’un pseudonyme de ligue cite le tiret bas', () => {
  test.each(['game.league.pseudonym.invalid', 'game.error.league_pseudonym_invalid'] as const)('%s, dans les sept langues', async (key) => {
    for (const [language, catalog] of await loadAll()) {
      expect([language, catalog[key]?.includes(UNDERSCORE_WORD[language])]).toEqual([language, true]);
    }
  });
});

describe('translateGame', () => {
  test('interpole les paramètres', async () => {
    await loadGameCatalog('en');
    expect(translateGame('en', 'game.level.to_next', { points: '12 points', level: '5' })).toBe('12 points more before level 5');
  });
});

describe('suspendForGameCatalog', () => {
  test('un catalogue chargé : rien ne se jette', async () => {
    const { suspendForGameCatalog } = await import('./i18n-game-catalog');
    await loadGameCatalog('fr');
    expect(() => suspendForGameCatalog('fr')).not.toThrow();
  });

  test('un catalogue pas encore chargé : la promesse en cours est jetée, que Suspense rattrape', async () => {
    /* Une COPIE du module, aux caches vides : l'identité de la requête diffère. */
    const specifier = './i18n-game-catalog?fresh=suspense';
    const fresh = (await import(specifier)) as typeof import('./i18n-game-catalog');
    let thrown: unknown;
    try {
      fresh.suspendForGameCatalog('de');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Promise);
    await thrown;
    expect(() => fresh.suspendForGameCatalog('de')).not.toThrow();
  });
});
