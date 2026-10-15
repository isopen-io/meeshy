import { describe, expect, test } from 'bun:test';

import type { ConversationStatsParticipant } from '@/lib/api/conversation-stats';

import { activitySeries, languageShares, topParticipants } from './conversation-stats';

/**
 * **LES STATISTIQUES D'UNE CONVERSATION, MISES EN FORME** (#7835) — ce que la
 * feuille de détails dessine depuis la charge de `GET /conversations/:id/stats` :
 * la série d'activité d'une période (7 jours, 30 jours, depuis le début), les
 * participants les plus actifs, et la part de chaque langue.
 */

const participant = (userId: string, messageCount: number, name = userId): ConversationStatsParticipant => ({
  userId,
  name,
  avatar: undefined,
  messageCount,
  wordCount: messageCount * 4,
});

describe('activitySeries — une barre par jour, les jours muets à zéro', () => {
  const daily = [
    { date: '2026-10-01', count: 4 },
    { date: '2026-10-11', count: 2 },
    { date: '2026-10-13', count: 5 },
  ];

  test('7 jours : les sept derniers jours jusqu’à aujourd’hui, dans l’ordre, les absents à zéro', () => {
    expect(activitySeries(daily, 'week', '2026-10-13')).toEqual([
      { date: '2026-10-07', count: 0 },
      { date: '2026-10-08', count: 0 },
      { date: '2026-10-09', count: 0 },
      { date: '2026-10-10', count: 0 },
      { date: '2026-10-11', count: 2 },
      { date: '2026-10-12', count: 0 },
      { date: '2026-10-13', count: 5 },
    ]);
  });

  test('30 jours : trente barres, la plus ancienne il y a 29 jours', () => {
    const series = activitySeries(daily, 'month', '2026-10-13');
    expect(series).toHaveLength(30);
    expect(series[0]).toEqual({ date: '2026-09-14', count: 0 });
    expect(series.find((point) => point.date === '2026-10-01')?.count).toBe(4);
  });

  test('depuis le début : du premier jour connu à aujourd’hui, à travers les fins de mois', () => {
    const series = activitySeries([{ date: '2026-09-29', count: 1 }], 'all', '2026-10-02');
    expect(series.map((point) => point.date)).toEqual(['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });

  test('depuis le début, sur une longue histoire : la série commence au premier jour connu', () => {
    const series = activitySeries(daily, 'all', '2026-10-13');
    expect(series[0]).toEqual({ date: '2026-10-01', count: 4 });
    expect(series).toHaveLength(13);
  });
});

describe('topParticipants', () => {
  test('les dix plus actifs, du plus bavard au plus discret', () => {
    const many = Array.from({ length: 12 }, (_, index) => participant(`u${index}`, index + 1));
    const top = topParticipants(many);
    expect(top).toHaveLength(10);
    expect(top[0]?.userId).toBe('u11');
    expect(top[9]?.userId).toBe('u2');
  });

  test('un participant sans nom n’est pas montré : un identifiant brut n’est pas un nom', () => {
    expect(topParticipants([participant('u1', 3, ''), participant('u2', 1, 'Nour')]).map((entry) => entry.userId)).toEqual(['u2']);
  });
});

describe('languageShares', () => {
  test('la part de chaque langue, en pour cent arrondis, de la plus parlée à la moins parlée', () => {
    expect(
      languageShares([
        { language: 'en', count: 1 },
        { language: 'fr', count: 3 },
      ]),
    ).toEqual([
      { language: 'fr', count: 3, percent: 75 },
      { language: 'en', count: 1, percent: 25 },
    ]);
  });

  test('aucune langue comptée : aucune part', () => {
    expect(languageShares([{ language: 'fr', count: 0 }])).toEqual([]);
  });
});
