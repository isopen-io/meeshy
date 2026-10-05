import { describe, expect, test } from 'bun:test';

import { scriptedGateway } from '@/test-support/scripted-transport';

import {
  decodeLanguageStats,
  decodeLanguagesTimeline,
  decodeTranslationAccuracy,
  loadLanguageStats,
  loadLanguagesTimeline,
  loadTranslationAccuracy,
} from './admin-languages';

const statsPayload = (extra: Readonly<Record<string, unknown>> = {}) => ({
  topLanguages: [
    { language: 'fr', messageCount: 700, userCount: 40, percentage: 70 },
    { language: 'en', messageCount: 300, userCount: 25, percentage: 30 },
  ],
  languagePairs: [{ from: 'fr', to: 'en', translationCount: 250, avgConfidence: 0.93 }],
  usersByLanguage: { en: 25, fr: 40 },
  growth: { fr: 12, en: 100 },
  period: '30d',
  totalMessages: 1000,
  totalLanguages: 2,
  ...extra,
});

describe('decodeLanguageStats', () => {
  test('forme figée : langues, paires, comptes par langue, totaux', () => {
    expect(decodeLanguageStats(statsPayload())).toEqual({
      languages: [
        { code: 'fr', messageCount: 700, userCount: 40, percentage: 70, growth: 12 },
        { code: 'en', messageCount: 300, userCount: 25, percentage: 30, growth: 100 },
      ],
      pairs: [{ from: 'fr', to: 'en', translationCount: 250, avgConfidence: 0.93 }],
      usersByLanguage: [
        { code: 'fr', count: 40 },
        { code: 'en', count: 25 },
      ],
      totalMessages: 1000,
      totalLanguages: 2,
    });
  });

  test('une croissance négative est lue ; une croissance absente est null — jamais 0 %', () => {
    const stats = decodeLanguageStats(statsPayload({ growth: { fr: -8 } }));
    expect(stats?.languages.map((row) => row.growth)).toEqual([-8, null]);
  });

  test('une langue sans code ou sans compte est écartée, jamais réparée', () => {
    const stats = decodeLanguageStats(statsPayload({ topLanguages: [{ messageCount: 5, userCount: 1, percentage: 5 }, { language: 'es', messageCount: 'x', userCount: 1, percentage: 5 }] }));
    expect(stats?.languages).toEqual([]);
  });

  test('envoie la période ET la limite', async () => {
    const { deps, calls } = scriptedGateway({ 'GET /api/v1/admin/languages/stats?period=7d&limit=10': { ok: true, data: statsPayload() } });
    expect((await loadLanguageStats({ ...deps, period: '7d', limit: 10 })).ok).toBe(true);
    expect(calls().map((call) => call.path)).toEqual(['/api/v1/admin/languages/stats?period=7d&limit=10']);
  });

  test('une charge illisible — ni objet ni même un tableau — échoue à status 0', async () => {
    for (const data of ['x', [], null]) {
      const { deps } = scriptedGateway({ 'GET /api/v1/admin/languages/stats?period=30d&limit=10': { ok: true, data } });
      expect(await loadLanguageStats({ ...deps, period: '30d', limit: 10 })).toEqual({ ok: false, status: 0, error: 'Langues illisible' });
    }
  });
});

describe('decodeLanguagesTimeline — des clés dynamiques, un jour réel', () => {
  test('sépare la date des langues et ne garde que des comptes', () => {
    expect(decodeLanguagesTimeline([{ date: '2026-09-29', fr: 5, en: 2 }, { date: '2026-09-30' }])).toEqual([
      { date: '2026-09-29', counts: { fr: 5, en: 2 } },
      { date: '2026-09-30', counts: {} },
    ]);
  });

  test('une entrée qui n’est pas un compte est écartée ; un jour sans vraie date aussi', () => {
    expect(decodeLanguagesTimeline([{ date: '2026-09-29', fr: 'x', en: -1, es: 3 }, { date: 'hier', fr: 3 }])).toEqual([
      { date: '2026-09-29', counts: { es: 3 } },
    ]);
  });

  test('ce qui n’est pas une liste est illisible', async () => {
    expect(decodeLanguagesTimeline({ date: '2026-09-29' })).toBeNull();
    const { deps, calls } = scriptedGateway({ 'GET /api/v1/admin/languages/timeline?period=30d': { ok: true, data: [] } });
    expect(await loadLanguagesTimeline({ ...deps, period: '30d' })).toEqual({ ok: true, data: [] });
    expect(calls()).toHaveLength(1);
  });
});

describe('decodeTranslationAccuracy — l’autre échelle : 0–100', () => {
  test('forme figée ; la qualité reste le code servi', () => {
    expect(decodeTranslationAccuracy([{ from: 'fr', to: 'en', avgConfidence: 93, translationCount: 250, quality: 'excellent' }])).toEqual([
      { from: 'fr', to: 'en', translationCount: 250, avgConfidence: 93, quality: 'excellent' },
    ]);
  });

  test('une paire sans qualité garde une qualité null', () => {
    expect(decodeTranslationAccuracy([{ from: 'fr', to: 'en', avgConfidence: 0, translationCount: 3 }])?.[0]?.quality).toBeNull();
  });

  test('envoie la limite', async () => {
    const { deps, calls } = scriptedGateway({ 'GET /api/v1/admin/languages/translation-accuracy?limit=10': { ok: true, data: [] } });
    expect(await loadTranslationAccuracy({ ...deps, limit: 10 })).toEqual({ ok: true, data: [] });
    expect(calls()).toHaveLength(1);
  });

  test('ce qui n’est pas une liste est illisible', async () => {
    expect(decodeTranslationAccuracy(null)).toBeNull();
    const { deps } = scriptedGateway({ 'GET /api/v1/admin/languages/translation-accuracy?limit=10': { ok: true, data: { x: 1 } } });
    expect(await loadTranslationAccuracy({ ...deps, limit: 10 })).toEqual({ ok: false, status: 0, error: 'Précision des traductions illisible' });
  });
});
