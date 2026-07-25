/**
 * Unit tests pour le prisme linguistique des vues (viewed-languages.ts).
 *
 * Meeshy affiche le même message dans autant de langues qu'il y a de lecteurs.
 * « Qui a lu » sans « dans quelle langue » perd la moitié de l'information :
 * l'auteur ignore si son texte a été compris tel qu'il l'a écrit ou à travers
 * une traduction, et laquelle.
 *
 * @see docs/superpowers/specs/2026-07-24-media-views-enrichment-design.md
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  mergeViewedLanguages,
  languageBreakdown,
  MAX_VIEWED_LANGUAGES,
} from '../../../utils/viewed-languages';

describe('mergeViewedLanguages — union', () => {
  it('ajoute une langue à un ensemble vide', () => {
    expect(mergeViewedLanguages([], 'fr')).toEqual(['fr']);
    expect(mergeViewedLanguages(null, 'fr')).toEqual(['fr']);
    expect(mergeViewedLanguages(undefined, 'fr')).toEqual(['fr']);
  });

  it('n\'ajoute pas deux fois la même langue', () => {
    expect(mergeViewedLanguages(['fr'], 'fr')).toEqual(['fr']);
  });

  it('accumule les bascules successives', () => {
    const after = mergeViewedLanguages(mergeViewedLanguages(['fr'], 'en'), 'es');
    expect(after).toEqual(['fr', 'en', 'es']);
  });

  it('préserve l\'ordre d\'apparition — la première est celle résolue d\'emblée', () => {
    expect(mergeViewedLanguages(['en', 'fr'], 'de')).toEqual(['en', 'fr', 'de']);
  });

  it('accepte une liste de langues d\'un coup', () => {
    expect(mergeViewedLanguages(['fr'], ['en', 'es'])).toEqual(['fr', 'en', 'es']);
  });

  it('rend l\'existant inchangé quand rien n\'arrive', () => {
    expect(mergeViewedLanguages(['fr'], null)).toEqual(['fr']);
    expect(mergeViewedLanguages(['fr'], [])).toEqual(['fr']);
  });
});

describe('mergeViewedLanguages — normalisation', () => {
  it('réduit une locale complète à son code de langue', () => {
    // iOS envoie `Locale.current.identifier`, le web un `Accept-Language`.
    expect(mergeViewedLanguages([], 'fr-FR')).toEqual(['fr']);
    expect(mergeViewedLanguages([], 'en_US')).toEqual(['en']);
    expect(mergeViewedLanguages([], 'zh-Hant-HK')).toEqual(['zh']);
  });

  it('ne dédouble pas une langue déjà présente sous une autre forme', () => {
    expect(mergeViewedLanguages(['fr'], 'FR')).toEqual(['fr']);
    expect(mergeViewedLanguages(['fr'], 'fr-CA')).toEqual(['fr']);
  });

  it('préserve les codes 3-lettres supportés sans les tronquer', () => {
    // `bas` (Basaa) tronqué donnerait `ba` (Bachkir) : langue sans rapport.
    expect(mergeViewedLanguages([], 'bas')).toEqual(['bas']);
    expect(mergeViewedLanguages([], 'ewo-CM')).toEqual(['ewo']);
  });

  it('rejette ce qui n\'est pas une langue', () => {
    expect(mergeViewedLanguages([], '')).toEqual([]);
    expect(mergeViewedLanguages([], '  ')).toEqual([]);
    expect(mergeViewedLanguages([], 'f')).toEqual([]);
    expect(mergeViewedLanguages([], '@@@')).toEqual([]);
    expect(mergeViewedLanguages([], 42 as unknown as string)).toEqual([]);
  });

  it('nettoie aussi un existant douteux venu de la base', () => {
    expect(mergeViewedLanguages(['fr-FR', '', 'EN'], null)).toEqual(['fr', 'en']);
  });
});

describe('mergeViewedLanguages — plafond', () => {
  it('borne le nombre de langues retenues', () => {
    const many = Array.from({ length: MAX_VIEWED_LANGUAGES + 5 }, (_, i) =>
      // Codes 2-lettres distincts, valides par construction.
      String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26))
    );
    expect(mergeViewedLanguages([], many)).toHaveLength(MAX_VIEWED_LANGUAGES);
  });

  it('garde les PREMIÈRES apparues, pas les dernières', () => {
    const many = Array.from({ length: MAX_VIEWED_LANGUAGES + 3 }, (_, i) =>
      String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26))
    );
    const merged = mergeViewedLanguages([], many);
    expect(merged[0]).toBe(many[0]);
    expect(merged).not.toContain(many[MAX_VIEWED_LANGUAGES]);
  });
});

describe('languageBreakdown — la répartition que voit l\'auteur', () => {
  it('compte un lecteur par langue', () => {
    expect(
      languageBreakdown([
        { viewedLanguages: ['fr'] },
        { viewedLanguages: ['en'] },
        { viewedLanguages: ['fr'] },
      ])
    ).toEqual([
      { language: 'fr', count: 2 },
      { language: 'en', count: 1 },
    ]);
  });

  it('compte un lecteur dans CHAQUE langue qu\'il a consultée', () => {
    // Il a lu l'original puis basculé sur la traduction : les deux comptent.
    expect(languageBreakdown([{ viewedLanguages: ['fr', 'en'] }])).toEqual([
      { language: 'en', count: 1 },
      { language: 'fr', count: 1 },
    ]);
  });

  it('ne compte pas deux fois un lecteur pour une langue répétée', () => {
    expect(languageBreakdown([{ viewedLanguages: ['fr', 'fr'] }])).toEqual([
      { language: 'fr', count: 1 },
    ]);
  });

  it('classe par nombre décroissant, puis par code pour départager', () => {
    expect(
      languageBreakdown([
        { viewedLanguages: ['es'] },
        { viewedLanguages: ['de'] },
        { viewedLanguages: ['fr'] },
        { viewedLanguages: ['fr'] },
      ])
    ).toEqual([
      { language: 'fr', count: 2 },
      { language: 'de', count: 1 },
      { language: 'es', count: 1 },
    ]);
  });

  it('ignore les entrées sans langue connue', () => {
    expect(
      languageBreakdown([
        { viewedLanguages: [] },
        { viewedLanguages: null as unknown as string[] },
        { viewedLanguages: ['fr'] },
      ])
    ).toEqual([{ language: 'fr', count: 1 }]);
  });

  it('rend une répartition vide quand personne n\'a consulté', () => {
    expect(languageBreakdown([])).toEqual([]);
  });
});
