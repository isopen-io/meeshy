import { renderHook } from '@testing-library/react';
import { usePostTranslation, usePreferredLanguage } from '@/hooks/use-post-translation';

const mockConfig: {
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage: string | undefined;
  autoTranslateEnabled: boolean;
} = {
  systemLanguage: 'fr',
  regionalLanguage: 'en',
  customDestinationLanguage: undefined,
  autoTranslateEnabled: true,
};

jest.mock('@/stores/language-store', () => ({
  useLanguageStore: (selector: (s: unknown) => unknown) =>
    selector({ userLanguageConfig: mockConfig }),
}));

describe('usePostTranslation', () => {
  it('returns original content when language matches', () => {
    const { result } = renderHook(() =>
      usePostTranslation('Bonjour', 'fr', {}),
    );

    expect(result.current.displayContent).toBe('Bonjour');
    expect(result.current.isTranslated).toBe(false);
    expect(result.current.preferredLanguage).toBe('fr');
  });

  it('returns translation when available for preferred language', () => {
    const translations = {
      fr: { text: 'Bonjour le monde', translationModel: 'nllb', createdAt: '2026-01-01' },
    };

    const { result } = renderHook(() =>
      usePostTranslation('Hello world', 'en', translations),
    );

    expect(result.current.displayContent).toBe('Bonjour le monde');
    expect(result.current.isTranslated).toBe(true);
  });

  it('falls back to regional language translation', () => {
    const translations = {
      en: { text: 'Hello world', translationModel: 'nllb', createdAt: '2026-01-01' },
    };

    const { result } = renderHook(() =>
      usePostTranslation('Hola mundo', 'es', translations),
    );

    expect(result.current.displayContent).toBe('Hello world');
    expect(result.current.isTranslated).toBe(true);
  });

  it('returns original when no translation matches', () => {
    const translations = {
      ja: { text: 'こんにちは', translationModel: 'nllb' },
    };

    const { result } = renderHook(() =>
      usePostTranslation('Hola mundo', 'es', translations),
    );

    expect(result.current.displayContent).toBe('Hola mundo');
    expect(result.current.isTranslated).toBe(false);
  });

  it('handles null/undefined content gracefully', () => {
    const { result } = renderHook(() =>
      usePostTranslation(null, null, null),
    );

    expect(result.current.displayContent).toBe('');
    expect(result.current.isTranslated).toBe(false);
  });

  it('handles empty translations object', () => {
    const { result } = renderHook(() =>
      usePostTranslation('Hello', 'en', {}),
    );

    expect(result.current.displayContent).toBe('Hello');
    expect(result.current.isTranslated).toBe(false);
  });
});

describe('usePreferredLanguage', () => {
  it('returns systemLanguage', () => {
    const { result } = renderHook(() => usePreferredLanguage());
    expect(result.current).toBe('fr');
  });
});

describe('resolvePreferredLanguage fallbacks', () => {
  const saved = { ...mockConfig };
  const originalLanguage = navigator.language;

  function setNavigatorLanguage(value: string) {
    Object.defineProperty(navigator, 'language', { value, configurable: true });
  }

  afterEach(() => {
    Object.assign(mockConfig, saved);
    setNavigatorLanguage(originalLanguage);
  });

  it('uses regionalLanguage when systemLanguage is empty', () => {
    mockConfig.systemLanguage = '';

    const { result } = renderHook(() => usePostTranslation('hello', 'es', {}));

    expect(result.current.preferredLanguage).toBe('en');
    expect(result.current.displayContent).toBe('hello');
    expect(result.current.isTranslated).toBe(false);
  });

  it('uses customDestinationLanguage when both systemLanguage and regionalLanguage are empty', () => {
    mockConfig.systemLanguage = '';
    mockConfig.regionalLanguage = '';
    mockConfig.customDestinationLanguage = 'pt';

    const { result } = renderHook(() => usePostTranslation('hello', 'es', {}));

    expect(result.current.preferredLanguage).toBe('pt');
  });

  // Prisme étendu 2026-05-26 — deviceLocale intervient en 4e priorité, jamais
  // en remplacement des préférences in-app. Aligné sur la résolution des
  // messages (resolveUserPreferredLanguage) via la source de vérité partagée.
  it('uses the device locale (4th priority) when no in-app preference is set', () => {
    mockConfig.systemLanguage = '';
    mockConfig.regionalLanguage = '';
    mockConfig.customDestinationLanguage = undefined;
    setNavigatorLanguage('pt-BR');

    const { result } = renderHook(() => usePostTranslation('hello', 'es', {}));

    expect(result.current.preferredLanguage).toBe('pt');
  });

  it('never lets the device locale override an in-app systemLanguage', () => {
    mockConfig.systemLanguage = 'fr';
    setNavigatorLanguage('en-US');

    const { result } = renderHook(() => usePostTranslation('hello', 'es', {}));

    expect(result.current.preferredLanguage).toBe('fr');
  });

  it('falls back to fr when all preferences and the device locale are absent', () => {
    mockConfig.systemLanguage = '';
    mockConfig.regionalLanguage = '';
    mockConfig.customDestinationLanguage = undefined;
    setNavigatorLanguage('');

    const { result } = renderHook(() => usePostTranslation('hello', 'es', {}));

    expect(result.current.preferredLanguage).toBe('fr');
  });
});

describe('findTranslation edge cases', () => {
  it('does not use translation with empty text', () => {
    const translations = { fr: { text: '' } };

    const { result } = renderHook(() =>
      usePostTranslation('Hola', 'es', translations),
    );

    // text is falsy → no match → fall back to original
    expect(result.current.displayContent).toBe('Hola');
    expect(result.current.isTranslated).toBe(false);
  });
});

// Cycle 120 — le Prisme des POSTS est la TROISIÈME famille de résolveurs (après
// l'aperçu de liste et l'audio), et le web en était le client non conforme : il
// résolvait le RANG 1 (`resolveUserLanguage`) puis retombait à la main sur
// `regionalLanguage`. Les rangs 3 (`customDestinationLanguage`) et 4
// (`deviceLocale`) n'étaient jamais consultés pour CHERCHER une traduction.
//
// Les témoins préexistants ne pouvaient pas tomber : ceux qui exercent les rangs
// 3/4 passent tous `{}` comme carte de traductions — ils n'attestent que le
// calcul de `preferredLanguage`, jamais la RECHERCHE. C'est la forme « fixture »
// de « un témoin qui ne peut pas tomber » (leçon 261), déplacée d'un cran.
//
// Jumeaux qui portent déjà la règle : `APIPost.resolveTranslation`
// (packages/MeeshySDK/.../Models/PostModels.swift) et
// `LanguageResolver.preferredTranslation` (apps/android/core/model/.../lang/).
describe('Prisme ORDONNÉ des posts — parité iOS/Android', () => {
  const saved = { ...mockConfig };
  const originalLanguage = navigator.language;

  function setNavigatorLanguage(value: string) {
    Object.defineProperty(navigator, 'language', { value, configurable: true });
  }

  afterEach(() => {
    Object.assign(mockConfig, saved);
    setNavigatorLanguage(originalLanguage);
  });

  // Prisme ['fr','pt'] : le rang 1 n'est pas servi, le rang 3 l'est. Un
  // résolveur ordonné descend jusqu'à `pt` ; celui du web s'arrêtait après
  // `regionalLanguage` (vide) et rendait l'original espagnol.
  it('sert une traduction au rang 3 (customDestinationLanguage)', () => {
    mockConfig.regionalLanguage = '';
    mockConfig.customDestinationLanguage = 'pt';
    setNavigatorLanguage('');

    const translations = { pt: { text: 'Olá mundo' } };

    const { result } = renderHook(() =>
      usePostTranslation('Hola mundo', 'es', translations),
    );

    expect(result.current.displayContent).toBe('Olá mundo');
    expect(result.current.isTranslated).toBe(true);
  });

  // Cas NOMINAL, pas un cas limite : tout lecteur dont l'appareil n'est pas dans
  // sa langue applicative a un prisme d'au moins deux langues (règle 2 du
  // Prisme). Même forme que le défaut audio du cycle 119.
  it('sert une traduction au rang 4 (locale appareil)', () => {
    mockConfig.regionalLanguage = '';
    mockConfig.customDestinationLanguage = undefined;
    setNavigatorLanguage('en-US');

    const translations = { en: { text: 'Hello world' } };

    const { result } = renderHook(() =>
      usePostTranslation('Hola mundo', 'es', translations),
    );

    expect(result.current.displayContent).toBe('Hello world');
    expect(result.current.isTranslated).toBe(true);
  });

  // Les deux côtés de la comparaison ont des producteurs différents : les prefs
  // du lecteur sortent minusculées de `resolveUserLanguagesOrdered`, les clés de
  // la carte viennent du pipeline de traduction. iOS et Android minusculent les
  // DEUX côtés ; le web faisait un accès par clé exacte.
  it('matche la clé de traduction sans distinction de casse', () => {
    const translations = { FR: { text: 'Bonjour le monde' } };

    const { result } = renderHook(() =>
      usePostTranslation('Hello world', 'en', translations),
    );

    expect(result.current.displayContent).toBe('Bonjour le monde');
    expect(result.current.isTranslated).toBe(true);
  });

  // Règle 3 du Prisme, gelée dans la direction OPPOSÉE : la langue d'origine
  // concourt à son RANG. Au rang 1 elle gagne — une réécriture naïve en « je
  // descends le prisme et je cherche une traduction » rendrait 'Hello world'.
  it("laisse l'original gagner quand il occupe le rang 1", () => {
    const translations = { en: { text: 'Hello world' } };

    const { result } = renderHook(() =>
      usePostTranslation('Bonjour le monde', 'fr', translations),
    );

    expect(result.current.displayContent).toBe('Bonjour le monde');
    expect(result.current.isTranslated).toBe(false);
  });

  // …et elle PERD à un rang inférieur : original anglais (rang 2), traduction
  // française disponible (rang 1) ⇒ « Bonjour », jamais « Hello ». C'est
  // l'exemple littéral de /CLAUDE.md § Règles critiques du Prisme #3.
  it("ne laisse pas l'original court-circuiter depuis un rang inférieur", () => {
    const translations = { fr: { text: 'Bonjour le monde' } };

    const { result } = renderHook(() =>
      usePostTranslation('Hello world', 'en', translations),
    );

    expect(result.current.displayContent).toBe('Bonjour le monde');
    expect(result.current.isTranslated).toBe(true);
  });
});

// Cycle 126 — les trois sources comparées (langues du lecteur, langue d'origine,
// clés de la carte) doivent être canonicalisées par la MÊME SSOT
// (`normalizeLanguageForDedup` : casse repliée ET région strippée), jamais un
// simple `.toLowerCase()`. `findTranslation` rapprochait les codes par
// `.trim().toLowerCase()` : un code région-tagué (`en-US`, `pt-BR`) — produit
// par le pipeline de traduction ou par un message écrit avant la
// canonicalisation au write-boundary — ne réduisait jamais à son rang du prisme.
// Défaut mesuré nommé par le résolveur partagé (conversation-helpers.ts:182-196),
// que ce hook réécrivait à la main au lieu de le consommer.
describe('Prisme — codes région-tagués (parité normalizeLanguageForDedup)', () => {
  const saved = { ...mockConfig };
  const originalLanguage = navigator.language;

  function setNavigatorLanguage(value: string) {
    Object.defineProperty(navigator, 'language', { value, configurable: true });
  }

  afterEach(() => {
    Object.assign(mockConfig, saved);
    setNavigatorLanguage(originalLanguage);
  });

  // La langue d'origine est au RANG 1 mais région-taguée (`en-US`). Le résolveur
  // ORDONNÉ doit la reconnaître à son rang et laisser l'original gagner. Une
  // comparaison `'en-us' === 'en'` échoue et le hook servait la traduction
  // française d'un rang inférieur — la rétrogradation exacte du Prisme #3.
  it("laisse l'original gagner quand sa langue est région-taguée (en-US) au rang 1", () => {
    mockConfig.systemLanguage = 'en';
    mockConfig.regionalLanguage = 'fr';
    mockConfig.customDestinationLanguage = undefined;
    setNavigatorLanguage('en-US');

    const translations = { fr: { text: 'Bonjour le monde' } };

    const { result } = renderHook(() =>
      usePostTranslation('Hello world', 'en-US', translations),
    );

    expect(result.current.displayContent).toBe('Hello world');
    expect(result.current.isTranslated).toBe(false);
  });

  // La CLÉ de la carte est région-taguée (`pt-BR`) et le lecteur préfère `pt`.
  // La descente doit matcher via la forme canonique — un accès par clé
  // minusculée (`pt-br`) manque `pt` et retombait sur l'original anglais.
  it('matche une clé de traduction région-taguée (pt-BR) contre une préférence pt', () => {
    mockConfig.systemLanguage = 'pt';
    mockConfig.regionalLanguage = '';
    mockConfig.customDestinationLanguage = undefined;
    setNavigatorLanguage('en-US');

    const translations = { 'pt-BR': { text: 'Olá mundo' } };

    const { result } = renderHook(() =>
      usePostTranslation('Hello world', 'en', translations),
    );

    expect(result.current.displayContent).toBe('Olá mundo');
    expect(result.current.isTranslated).toBe(true);
  });
});
