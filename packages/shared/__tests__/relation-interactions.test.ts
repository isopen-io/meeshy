import { describe, expect, it } from 'vitest';
import {
  PAIR_INTERACTION_NATURES,
  acquaintanceProgress,
  activeWeekStreak,
  pairDayColumn,
  pairDayFromRow,
  relationSeriesProgress,
  type PairDay,
  type PairInteractionNature,
  type SideCounts,
} from '../utils/relation-interactions';
import { RELATION_THRESHOLDS, relationThresholdsFor } from '../utils/relation-levels';
import { addUtcDays, utcDayKey } from '../utils/iso-week';

const NOW = new Date('2026-10-31T10:00:00Z'); // samedi, semaine ISO 2026-W44

const side = (counts: Partial<Record<PairInteractionNature, number>> = {}): SideCounts =>
  Object.fromEntries(PAIR_INTERACTION_NATURES.map((n) => [n, counts[n] ?? 0])) as SideCounts;

const dayAt = (daysAgo: number, low: Partial<Record<PairInteractionNature, number>>, high: Partial<Record<PairInteractionNature, number>>): PairDay => ({
  day: utcDayKey(addUtcDays(NOW, -daysAgo)),
  low: side(low),
  high: side(high),
});

const qualifying = { message: 4, reaction: 2, postView: 2, audio: 2 }; // 10

describe('pairDayColumn / pairDayFromRow — les dix-huit colonnes', () => {
  it('nomme la colonne par côté et par nature', () => {
    expect(pairDayColumn('low', 'message')).toBe('byLowMessage');
    expect(pairDayColumn('high', 'storyReply')).toBe('byHighStoryReply');
    expect(pairDayColumn('low', 'postView')).toBe('byLowPostView');
  });

  it('relit une ligne : colonne absente ou illisible = zéro', () => {
    const day = pairDayFromRow({ day: '2026-10-31', byLowMessage: 3, byHighAudio: 'x', byHighCall: -2 });
    expect(day.low.message).toBe(3);
    expect(day.high.audio).toBe(0);
    expect(day.high.call).toBe(0);
    expect(day.low.share).toBe(0);
  });
});

describe('acquaintanceProgress — la Connaissance automatique (D-1 : une semaine glissante)', () => {
  const thresholds = RELATION_THRESHOLDS;

  it('est tenue quand chaque sens a 10 interactions dont un message, une réaction, une vue de post et un audio', () => {
    const progress = acquaintanceProgress({ days: [dayAt(0, qualifying, qualifying)], now: NOW, thresholds });
    expect(progress.met).toBe(true);
    expect(progress.missing).toEqual([]);
  });

  it('exige les dix interactions DANS CHAQUE SENS : un sens à neuf ne suffit pas', () => {
    const nine = { message: 3, reaction: 2, postView: 2, audio: 2 };
    const progress = acquaintanceProgress({ days: [dayAt(0, qualifying, nine)], now: NOW, thresholds });
    expect(progress.met).toBe(false);
    expect(progress.high.total).toBe(9);
  });

  it('nomme ce qui manque dans le sens le plus pauvre : sans audio, « audio » manque', () => {
    const noAudio = { message: 6, reaction: 2, postView: 2 };
    const progress = acquaintanceProgress({ days: [dayAt(0, qualifying, noAudio)], now: NOW, thresholds });
    expect(progress.met).toBe(false);
    expect(progress.missing).toEqual(['audio']);
  });

  it('un sens inactif manque de tout : aucun accès à sens unique', () => {
    const progress = acquaintanceProgress({ days: [dayAt(0, qualifying, {})], now: NOW, thresholds });
    expect(progress.met).toBe(false);
    expect(progress.missing).toEqual(['message', 'reaction', 'postView', 'audio']);
  });

  it('somme les jours de la semaine glissante : sept jours UTC, aujourd’hui compris', () => {
    const days = [dayAt(6, { message: 4, reaction: 2 }, { message: 4, reaction: 2 }), dayAt(0, { postView: 2, audio: 2 }, { postView: 2, audio: 2 })];
    expect(acquaintanceProgress({ days, now: NOW, thresholds }).met).toBe(true);
  });

  it('ignore le jour qui a quitté la fenêtre (il y a sept jours) et le futur', () => {
    const old = dayAt(7, qualifying, qualifying);
    const future = dayAt(-1, qualifying, qualifying);
    expect(acquaintanceProgress({ days: [old, future], now: NOW, thresholds }).met).toBe(false);
  });

  it('les appels, commentaires, partages, réponses et mentions comptent dans le total sans remplacer les natures requises', () => {
    const rich = { message: 1, reaction: 1, postView: 1, audio: 1, comment: 3, share: 1, storyReply: 1, mention: 1 };
    expect(acquaintanceProgress({ days: [dayAt(0, rich, rich)], now: NOW, thresholds }).met).toBe(true);
    const noPostView = { message: 1, reaction: 1, audio: 1, comment: 7 };
    const progress = acquaintanceProgress({ days: [dayAt(0, noPostView, noPostView)], now: NOW, thresholds });
    expect(progress.met).toBe(false);
    expect(progress.missing).toEqual(['postView']);
  });

  it('suit le seuil de la config : le staging abaisse à trois', () => {
    const light = { message: 1, reaction: 1, postView: 1, audio: 1 };
    expect(acquaintanceProgress({ days: [dayAt(0, light, light)], now: NOW, thresholds }).met).toBe(false);
    expect(acquaintanceProgress({ days: [dayAt(0, light, light)], now: NOW, thresholds: relationThresholdsFor('staging') }).met).toBe(true);
  });
});

describe('activeWeekStreak — des semaines actives d’affilée', () => {
  const both = { message: 1 };
  const weekDay = (weeksAgo: number) => dayAt(weeksAgo * 7 + 5, both, both); // un mardi de la semaine concernée

  it('compte les semaines pleines consécutives, la semaine en cours comprise quand elle est active', () => {
    const days = [dayAt(1, both, both), weekDay(1), weekDay(2)];
    expect(activeWeekStreak({ days, now: NOW })).toBe(3);
  });

  it('la semaine en cours, pas encore active, ne casse pas la série', () => {
    expect(activeWeekStreak({ days: [weekDay(1), weekDay(2), weekDay(3)], now: NOW })).toBe(3);
  });

  it('une semaine manquée remet la série à zéro (la série courante recommence au-delà du trou)', () => {
    expect(activeWeekStreak({ days: [dayAt(1, both, both), weekDay(2), weekDay(3)], now: NOW })).toBe(1);
    expect(activeWeekStreak({ days: [weekDay(2), weekDay(3)], now: NOW })).toBe(0);
  });

  it('une semaine où un seul côté a interagi n’est pas active : chacun doit avoir agi', () => {
    expect(activeWeekStreak({ days: [dayAt(1, both, {}), weekDay(1)], now: NOW })).toBe(1);
    const split = [dayAt(1, both, {}), dayAt(2, {}, both)];
    expect(activeWeekStreak({ days: split, now: NOW })).toBe(1);
  });

  it('additionne les jours d’une même semaine ISO : chacun peut avoir agi un jour différent', () => {
    expect(activeWeekStreak({ days: [dayAt(6, both, {}), dayAt(1, {}, both)], now: NOW })).toBe(0);
    expect(activeWeekStreak({ days: [dayAt(5, both, {}), dayAt(1, {}, both)], now: NOW })).toBe(1);
  });

  it('ne compte pas les semaines antérieures à notBefore (le Sang se compte depuis Proche)', () => {
    const days = [dayAt(1, both, both), weekDay(1), weekDay(2), weekDay(3)];
    const since = new Date('2026-10-12T00:00:00Z'); // lundi de W42
    expect(activeWeekStreak({ days, now: NOW, notBefore: since })).toBe(3);
    const midweek = new Date('2026-10-14T00:00:00Z'); // mercredi de W42 : W42 n'est plus une semaine entière
    expect(activeWeekStreak({ days, now: NOW, notBefore: midweek })).toBe(2);
  });
});

describe('relationSeriesProgress — éligible, jamais élevé', () => {
  const both = { message: 1 };
  const streakOf = (weeks: number): PairDay[] =>
    Array.from({ length: weeks }, (_, i) => dayAt(i * 7 + (i === 0 ? 1 : 5), both, both));
  const thresholds = RELATION_THRESHOLDS;

  it('Ami avec quatre semaines actives d’affilée : éligible à Proche', () => {
    const progress = relationSeriesProgress({ days: streakOf(4), now: NOW, level: 'FRIEND', levelSince: null, thresholds });
    expect(progress).toMatchObject({ activeWeeks: 4, needed: 4, eligibleFor: 'CLOSE' });
  });

  it('trois semaines ne suffisent pas', () => {
    const progress = relationSeriesProgress({ days: streakOf(3), now: NOW, level: 'FRIEND', levelSince: null, thresholds });
    expect(progress).toMatchObject({ activeWeeks: 3, needed: 4, eligibleFor: null });
  });

  it('Connaissance avec quatre semaines : pas éligible (cran par cran, il faut d’abord être Ami)', () => {
    const progress = relationSeriesProgress({ days: streakOf(4), now: NOW, level: 'ACQUAINTANCE', levelSince: null, thresholds });
    expect(progress.eligibleFor).toBeNull();
  });

  it('Proche : le Sang demande douze semaines entières depuis l’entrée en Proche', () => {
    const days = streakOf(12);
    const longAgo = new Date('2026-07-01T00:00:00Z');
    const progress = relationSeriesProgress({ days, now: NOW, level: 'CLOSE', levelSince: longAgo, thresholds });
    expect(progress).toMatchObject({ activeWeeks: 12, needed: 12, eligibleFor: 'BLOOD' });
  });

  it('Proche : douze semaines dont quatre AVANT l’entrée en Proche = huit seulement', () => {
    const days = streakOf(12);
    const enteredAt = new Date('2026-09-07T00:00:00Z'); // lundi de W37 ; la série courante court depuis W33
    const progress = relationSeriesProgress({ days, now: NOW, level: 'CLOSE', levelSince: enteredAt, thresholds });
    expect(progress.activeWeeks).toBe(8);
    expect(progress.eligibleFor).toBeNull();
  });

  it('Proche sans date d’entrée lisible : fail-closed, aucune éligibilité au Sang', () => {
    const progress = relationSeriesProgress({ days: streakOf(14), now: NOW, level: 'CLOSE', levelSince: null, thresholds });
    expect(progress.eligibleFor).toBeNull();
  });

  it('au Sang, rien à viser : le niveau atteint est conservé et aucune éligibilité ne s’invente', () => {
    const progress = relationSeriesProgress({ days: [], now: NOW, level: 'BLOOD', levelSince: new Date('2026-01-01T00:00:00Z'), thresholds });
    expect(progress).toMatchObject({ activeWeeks: 0, needed: null, eligibleFor: null });
  });

  it('une semaine manquée n’abaisse aucun niveau : le résultat ne parle que d’éligibilité', () => {
    const progress = relationSeriesProgress({ days: [dayAt(20, both, both)], now: NOW, level: 'CLOSE', levelSince: new Date('2026-01-01T00:00:00Z'), thresholds });
    expect(progress.activeWeeks).toBe(0);
    expect(Object.keys(progress).sort()).toEqual(['activeWeeks', 'eligibleFor', 'needed']);
  });

  it('suit la config : le staging abaisse Proche à une semaine', () => {
    const progress = relationSeriesProgress({
      days: streakOf(1), now: NOW, level: 'FRIEND', levelSince: null, thresholds: relationThresholdsFor('staging'),
    });
    expect(progress.eligibleFor).toBe('CLOSE');
  });
});
