import { beforeAll, describe, expect, test } from 'bun:test';

import type { LanguageDay } from '@/lib/api/admin-languages';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import {
  OTHERS_KEY,
  accuracyConfidenceText,
  accuracyQuality,
  foldLanguageTimeline,
  growthView,
  pairConfidenceText,
  pairLabel,
} from './languages-view';

beforeAll(async () => {
  await Promise.all([loadAdminInterfaceCatalog('fr'), loadAdminInterfaceCatalog('en'), loadAdminInterfaceCatalog('ar')]);
});

describe('pairLabel — la paire se lit « français → anglais », jamais « fr → en »', () => {
  test('nomme les deux langues dans la langue d’interface', () => {
    expect(pairLabel('fr', 'en', 'fr')).toBe('français → anglais');
    expect(pairLabel('fr', 'en', 'en')).toBe('French → English');
  });

  test('une langue inconnue se dit en mots, le code n’est pas peint', () => {
    expect(pairLabel('unknown', 'en', 'fr')).not.toContain('unknown');
  });

  test('en arabe, la flèche regarde dans le sens de la lecture', () => {
    expect(pairLabel('fr', 'en', 'ar')).toContain('←');
  });
});

describe('les DEUX échelles de confiance — le piège du lot', () => {
  test('les paires de la période sont en PART (0–1) : 0,93 se lit 93 %', () => {
    expect(pairConfidenceText(0.93, 'fr')).toBe(new Intl.NumberFormat('fr', { style: 'percent' }).format(0.93));
  });

  test('la précision est en POURCENTAGE (0–100) : 93 se lit 93 %, pas 9 300 %', () => {
    expect(accuracyConfidenceText(93, 'fr')).toBe(new Intl.NumberFormat('fr', { style: 'percent' }).format(0.93));
  });

  test('la même confiance servie dans les deux échelles se lit pareil', () => {
    expect(pairConfidenceText(0.87, 'en')).toBe(accuracyConfidenceText(87, 'en'));
  });

  test('zéro n’est pas une confiance nulle : « Non mesurée »', () => {
    expect(pairConfidenceText(0, 'fr')).toBe('Non mesurée');
    expect(accuracyConfidenceText(0, 'fr')).toBe('Non mesurée');
  });
});

describe('accuracyQuality', () => {
  test('nomme la qualité servie avec son ton d’état', () => {
    expect(accuracyQuality({ avgConfidence: 95, quality: 'excellent' }, 'fr')).toMatchObject({ label: 'Excellente', tone: 'success' });
    expect(accuracyQuality({ avgConfidence: 60, quality: 'fair' }, 'fr')).toMatchObject({ label: 'Moyenne', tone: 'warning' });
    expect(accuracyQuality({ avgConfidence: 30, quality: 'poor' }, 'fr')).toMatchObject({ label: 'Mauvaise', tone: 'danger' });
  });

  test('« mauvaise » servie sans aucune mesure n’est PAS affichée comme une mauvaise traduction', () => {
    expect(accuracyQuality({ avgConfidence: 0, quality: 'poor' }, 'fr')).toMatchObject({ label: 'Non mesurée', tone: 'neutral' });
  });

  test('une qualité inconnue se dit « Non reconnu »', () => {
    expect(accuracyQuality({ avgConfidence: 80, quality: 'legendary' }, 'fr').label).toBe('Non reconnu');
  });
});

describe('growthView — le sens se lit au signe et au glyphe, pas à la couleur', () => {
  test('une hausse, une baisse, une stabilité', () => {
    expect(growthView(12, 'en')).toEqual({ text: '+12%', tone: 'success', glyph: 'trendUp' });
    expect(growthView(-8, 'en')).toMatchObject({ tone: 'warning', glyph: 'trendDown' });
    expect(growthView(-8, 'en')?.text).toMatch(/8%$/);
    expect(growthView(0, 'en')).toEqual({ text: '0%', tone: 'neutral', glyph: 'minus' });
  });

  test('aucune donnée : pas de « 0 % » fabriqué', () => {
    expect(growthView(null, 'fr')).toBeNull();
  });
});

const day = (date: string, counts: Readonly<Record<string, number>>): LanguageDay => ({ date, counts });

describe('foldLanguageTimeline — les langues principales, puis « Autres »', () => {
  const days = [
    day('2026-09-28', { fr: 10, en: 5, es: 2, de: 1 }),
    day('2026-09-29', { fr: 8, en: 6, es: 3, it: 1 }),
    day('2026-09-30', { fr: 9, en: 4, pt: 1 }),
  ];

  test('garde les N langues de plus fort total, dans l’ordre du total, et somme le reste par jour', () => {
    const folded = foldLanguageTimeline(days, 2);

    expect(folded.dates).toEqual(['2026-09-28', '2026-09-29', '2026-09-30']);
    expect(folded.series.map((series) => series.key)).toEqual(['fr', 'en', OTHERS_KEY]);
    expect(folded.series[0]?.points).toEqual([10, 8, 9]);
    expect(folded.series[1]?.points).toEqual([5, 6, 4]);
    expect(folded.series[2]).toEqual({ key: OTHERS_KEY, points: [3, 4, 1], total: 8 });
  });

  test('« Autres » conserve le total : rien ne se perd dans le repli', () => {
    const folded = foldLanguageTimeline(days, 2);
    const grand = days.flatMap((entry) => Object.values(entry.counts)).reduce((sum, value) => sum + value, 0);
    expect(folded.series.reduce((sum, series) => sum + series.total, 0)).toBe(grand);
  });

  test('sans langue à regrouper, « Autres » n’existe pas', () => {
    expect(foldLanguageTimeline([day('2026-09-30', { fr: 3, en: 1 })], 3).series.map((series) => series.key)).toEqual(['fr', 'en']);
  });

  test('à égalité de total, l’ordre alphabétique — la chronologie ne se redessine pas différemment à chaque lecture', () => {
    const tied = foldLanguageTimeline([day('2026-09-30', { pt: 2, es: 2, de: 2 })], 2);
    expect(tied.series.map((series) => series.key)).toEqual(['de', 'es', OTHERS_KEY]);
  });

  test('une langue sans aucun message n’est ni nommée ni regroupée', () => {
    expect(foldLanguageTimeline([day('2026-09-30', { fr: 3, en: 0 })], 3).series.map((series) => series.key)).toEqual(['fr']);
  });

  test('aucun jour : aucune série', () => {
    expect(foldLanguageTimeline([], 3)).toEqual({ dates: [], series: [] });
  });
});
