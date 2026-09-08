import { describe, expect, test } from 'bun:test';

import { languageBand, mountsBottomLine } from './meta';

const BASE = { hasTranslation: false, isVeiled: false, isLastInGroup: false, hasReactions: false } as const;

describe('mountsBottomLine', () => {
  test('rien a dire : ni traduction ni reaction -> aucune ligne', () => {
    expect(mountsBottomLine(BASE)).toBe(false);
  });

  test('traduction + dernier du groupe + non voile -> ligne (drapeaux)', () => {
    expect(mountsBottomLine({ ...BASE, hasTranslation: true, isLastInGroup: true })).toBe(true);
  });

  test('traduction mais PAS le dernier du groupe -> aucun drapeau (#3919)', () => {
    expect(mountsBottomLine({ ...BASE, hasTranslation: true, isLastInGroup: false })).toBe(false);
  });

  test('traduction + dernier du groupe + VOILE -> aucun drapeau en clair', () => {
    expect(mountsBottomLine({ ...BASE, hasTranslation: true, isLastInGroup: true, isVeiled: true })).toBe(false);
  });

  test('reaction seule, sans traduction -> la ligne monte quand meme', () => {
    expect(mountsBottomLine({ ...BASE, hasReactions: true })).toBe(true);
  });

  test('reaction sur un message VOILE -> la ligne monte (hors voile, parite bulle)', () => {
    expect(mountsBottomLine({ ...BASE, hasReactions: true, isVeiled: true, isLastInGroup: false })).toBe(true);
  });

  test('traduction + dernier du groupe + reaction -> une seule ligne (les deux causes cumulent)', () => {
    expect(
      mountsBottomLine({ ...BASE, hasTranslation: true, isLastInGroup: true, hasReactions: true }),
    ).toBe(true);
  });

  test('isVeiled: true (vue unique sans flou, D-23) + traduction + dernier -> aucun drapeau', () => {
    expect(mountsBottomLine({ ...BASE, hasTranslation: true, isLastInGroup: true, isVeiled: true })).toBe(false);
  });
});

describe('languageBand — la bande suit le Prisme, langue servie exclue', () => {
  test('TÉMOIN DE RANG (leçon 261) : la bande ne montre pas la langue servie et montre l’original EN TÊTE', () => {
    expect(
      languageBand({
        preferredLanguages: ['fr', 'en'],
        originalLanguage: 'en',
        translations: ['fr'],
        servedLanguage: 'fr',
      }),
    ).toEqual(['en']);
  });

  test('rang AUTRE que le premier : la langue servie est exclue même au rang 2', () => {
    expect(
      languageBand({
        preferredLanguages: ['fr', 'en'],
        originalLanguage: 'de',
        translations: ['en'],
        servedLanguage: 'en',
      }),
    ).toEqual(['de']);
  });

  test('rang 1 SANS traduction : pas de drapeau inerte (question 4)', () => {
    expect(
      languageBand({
        preferredLanguages: ['fr', 'en'],
        originalLanguage: 'en',
        translations: [],
        servedLanguage: 'en',
      }),
    ).toEqual([]);
  });

  test('rangs 2-4 gardés par la traduction, ordre du prisme jamais l’ordre des traductions', () => {
    expect(
      languageBand({
        preferredLanguages: ['fr', 'en', 'es'],
        originalLanguage: 'de',
        translations: ['es'],
        servedLanguage: 'es',
      }),
    ).toEqual(['de']);

    expect(
      languageBand({
        preferredLanguages: ['fr', 'en', 'es'],
        originalLanguage: 'de',
        translations: ['fr', 'es'],
        servedLanguage: 'fr',
      }),
    ).toEqual(['de', 'es']);
  });

  test('dédoublonnage : l’original déjà dans le prisme n’apparaît qu’une fois', () => {
    expect(
      languageBand({
        preferredLanguages: ['fr', 'en'],
        originalLanguage: 'fr',
        translations: ['en'],
        servedLanguage: 'en',
      }),
    ).toEqual(['fr']);
  });
});
