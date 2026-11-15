/**
 * Les saisons de huit semaines (#9386) : le calendrier, les 40 étapes, les
 * étoiles gagnées par missions, la rangée Sceau, le règlement final.
 * `docs/product/jeu-meeshy-conception.html` § II.7.
 */

import { describe, it, expect } from 'vitest';
import {
  SEASON_ONE_START,
  SEASON_SEAL_PRICE,
  SEASON_STARS_PER_STEP,
  SEASON_STEPS,
  SEASON_THEME_KEYS,
  SEASON_WEEKS,
  canBuySeal,
  claimSeasonStep,
  isSeasonOpen,
  seasonAt,
  seasonCalendar,
  seasonOfMoment,
  seasonProgress,
  seasonSealReward,
  seasonSettlement,
  seasonStarsForMission,
  seasonStepReward,
  seasonWeek,
  liveSeasonTense,
  seasonTenseAt,
} from '../../utils/game/season.js';
import { GLORY_POINTS } from '../../utils/game/glory.js';
import { leagueWeekKey } from '../../utils/game/league.js';

describe('le calendrier', () => {
  it('ouvre la saison 1 le lundi 2026-12-21 (décision du 2026-10-10, #10014), pour 8 semaines', () => {
    expect(SEASON_ONE_START).toBe('2026-12-21');
    expect(SEASON_WEEKS).toBe(8);
    const s1 = seasonCalendar(1)!;
    expect(s1.startDay).toBe('2026-12-21');
    expect(s1.endDay).toBe('2027-02-14');
    expect(s1.weekKeys).toEqual(['2026-12-21', '2026-12-28', '2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25', '2027-02-01', '2027-02-08']);
  });

  it('ouvre un lundi et ferme un dimanche, sur les semaines de ligue', () => {
    const s1 = seasonCalendar(1)!;
    expect(new Date(`${s1.startDay}T12:00:00Z`).getUTCDay()).toBe(1);
    expect(new Date(`${s1.endDay}T12:00:00Z`).getUTCDay()).toBe(0);
    expect(s1.weekKeys.every((weekKey) => leagueWeekKey(weekKey) === weekKey)).toBe(true);
  });

  it('enchaîne les saisons sans trou ni recouvrement', () => {
    const s1 = seasonCalendar(1)!;
    const s2 = seasonCalendar(2)!;
    expect(s2.startDay).toBe('2027-02-15');
    expect(s2.weekKeys[0]).toBe('2027-02-15');
    expect(s1.endDay < s2.startDay).toBe(true);
    expect(seasonCalendar(3)!.startDay).toBe('2027-04-12');
  });

  it('porte une clé de thème par saison, qui revient en boucle', () => {
    expect(seasonCalendar(1)?.themeKey).toBe(SEASON_THEME_KEYS[0]);
    expect(seasonCalendar(2)?.themeKey).toBe(SEASON_THEME_KEYS[1]);
    expect(seasonCalendar(SEASON_THEME_KEYS.length + 1)?.themeKey).toBe(SEASON_THEME_KEYS[0]);
  });

  it('ne connaît pas de saison avant la première', () => {
    expect(seasonCalendar(0)).toBeNull();
    expect(seasonCalendar(-3)).toBeNull();
    expect(seasonCalendar(Number.NaN)).toBeNull();
  });

  it('ne compte plus le 12 octobre 2026 comme une ouverture de saison', () => {
    expect(seasonAt('2026-10-12')).toBeNull();
    expect(seasonWeek('2026-10-12')).toBeNull();
    expect(seasonAt('2026-12-06')).toBeNull();
    expect(seasonAt('2026-12-07')).toBeNull();
  });

  it('retrouve la saison et la semaine d\'un jour', () => {
    expect(seasonAt('2026-12-20')).toBeNull();
    expect(seasonAt('2026-12-21')).toBe(1);
    expect(seasonAt('2027-02-14')).toBe(1);
    expect(seasonAt('2027-02-15')).toBe(2);
    expect(seasonWeek('2026-12-21')).toBe(1);
    expect(seasonWeek('2026-12-28')).toBe(2);
    expect(seasonWeek('2027-02-14')).toBe(8);
    expect(seasonWeek('2027-02-15')).toBe(1);
    expect(seasonWeek('2026-12-14')).toBeNull();
  });

  it('suit la fermeture hebdomadaire : après le dimanche 20 h, on est dans la semaine suivante', () => {
    expect(seasonOfMoment({ dayKey: '2027-02-14', minuteOfDay: 1199 })).toBe(1);
    expect(seasonOfMoment({ dayKey: '2027-02-14', minuteOfDay: 1200 })).toBe(2);
    expect(seasonOfMoment({ dayKey: '2026-12-20', minuteOfDay: 1199 })).toBeNull();
    expect(seasonOfMoment({ dayKey: '2026-12-20', minuteOfDay: 1200 })).toBe(1);
  });

  it('dit si une saison est encore ouverte à un jour donné', () => {
    expect(isSeasonOpen({ season: 1, dayKey: '2026-10-12' })).toBe(false);
    expect(isSeasonOpen({ season: 1, dayKey: '2027-01-10' })).toBe(true);
    expect(isSeasonOpen({ season: 1, dayKey: '2027-02-15' })).toBe(false);
    expect(isSeasonOpen({ season: 2, dayKey: '2027-02-14' })).toBe(false);
  });
});

describe('les étoiles et les étapes', () => {
  it('compte 40 étapes de 4 étoiles', () => {
    expect(SEASON_STEPS).toBe(40);
    expect(SEASON_STARS_PER_STEP).toBe(4);
  });

  it('gagne des étoiles par missions : 1, 1, 2, 3 — et 5 pour le duo', () => {
    expect(seasonStarsForMission('easy')).toBe(1);
    expect(seasonStarsForMission('medium')).toBe(1);
    expect(seasonStarsForMission('hard')).toBe(2);
    expect(seasonStarsForMission('gold')).toBe(3);
    expect(seasonStarsForMission('duo')).toBe(5);
  });

  it('lit l\'étape sur les étoiles', () => {
    expect(seasonProgress({ stars: 0 })).toMatchObject({ steps: 0, starsToNext: 4, progress: 0, completed: false });
    expect(seasonProgress({ stars: 3 })).toMatchObject({ steps: 0, starsToNext: 1, progress: 0.75 });
    expect(seasonProgress({ stars: 4 })).toMatchObject({ steps: 1, starsToNext: 4, progress: 0 });
    expect(seasonProgress({ stars: 159 })).toMatchObject({ steps: 39, starsToNext: 1, completed: false });
  });

  it('s\'arrête à la 40e étape', () => {
    expect(seasonProgress({ stars: 160 })).toMatchObject({ steps: 40, starsToNext: 0, progress: 1, completed: true });
    expect(seasonProgress({ stars: 9999 })).toMatchObject({ steps: 40, completed: true });
    expect(seasonProgress({ stars: Number.NaN })).toMatchObject({ steps: 0 });
  });
});

describe('les récompenses par étape', () => {
  it('donnent quelque chose à chacune des 40 étapes, gratuitement', () => {
    for (let step = 1; step <= 40; step += 1) expect(seasonStepReward(step)).not.toBeNull();
    expect(seasonStepReward(0)).toBeNull();
    expect(seasonStepReward(41)).toBeNull();
  });

  it('suivent un rythme lisible : des points, un fragment tous les 5, un gel tous les 10, la coupe à 40', () => {
    expect(seasonStepReward(1)).toEqual({ kind: 'points', amount: 100 });
    expect(seasonStepReward(5)).toEqual({ kind: 'fragment', amount: 1 });
    expect(seasonStepReward(10)).toEqual({ kind: 'freeze', amount: 1 });
    expect(seasonStepReward(35)).toEqual({ kind: 'fragment', amount: 1 });
    expect(seasonStepReward(40)).toEqual({ kind: 'season-cup', amount: 1 });
  });

  it('ne donne jamais de Meesh : elles se gagnent par la frappe, pas par la saison', () => {
    const kinds = new Set(Array.from({ length: 40 }, (_, i) => seasonStepReward(i + 1)?.kind));
    expect(kinds.has('meesh' as never)).toBe(false);
  });
});

describe('la rangée Sceau', () => {
  it('coûte 10 Meeshes', () => {
    expect(SEASON_SEAL_PRICE).toBe(10);
  });

  it('pose un cosmétique tous les 4 étapes — dix en tout', () => {
    const steps = Array.from({ length: 40 }, (_, i) => i + 1).filter((step) => seasonSealReward(1, step) !== null);
    expect(steps).toEqual([4, 8, 12, 16, 20, 24, 28, 32, 36, 40]);
    expect(seasonSealReward(1, 4)).toEqual({ cosmeticKey: 'season-1.seal-1' });
    expect(seasonSealReward(2, 40)).toEqual({ cosmeticKey: 'season-2.seal-10' });
    expect(seasonSealReward(1, 5)).toBeNull();
  });

  it('s\'achète une fois par saison, avec assez de Meeshes', () => {
    expect(canBuySeal({ balance: 10, owned: false })).toEqual({ allowed: true });
    expect(canBuySeal({ balance: 9, owned: false })).toEqual({ allowed: false, reason: 'insufficient-balance' });
    expect(canBuySeal({ balance: 99, owned: true })).toEqual({ allowed: false, reason: 'already-owned' });
  });
});

describe('réclamer une étape', () => {
  it('rend la récompense gratuite, et celle du Sceau si on le possède', () => {
    expect(claimSeasonStep({ season: 1, step: 4, stepsReached: 6, claimed: [], sealOwned: false })).toEqual({
      allowed: true,
      reward: { kind: 'points', amount: 100 },
      seal: null,
    });
    expect(claimSeasonStep({ season: 1, step: 4, stepsReached: 6, claimed: [], sealOwned: true })).toEqual({
      allowed: true,
      reward: { kind: 'points', amount: 100 },
      seal: { cosmeticKey: 'season-1.seal-1' },
    });
  });

  it('refuse une étape pas encore atteinte, déjà réclamée, ou hors du parcours', () => {
    expect(claimSeasonStep({ season: 1, step: 7, stepsReached: 6, claimed: [], sealOwned: false })).toEqual({ allowed: false, reason: 'locked' });
    expect(claimSeasonStep({ season: 1, step: 3, stepsReached: 6, claimed: [3], sealOwned: false })).toEqual({ allowed: false, reason: 'already-claimed' });
    expect(claimSeasonStep({ season: 1, step: 0, stepsReached: 6, claimed: [], sealOwned: false })).toEqual({ allowed: false, reason: 'out-of-range' });
    expect(claimSeasonStep({ season: 1, step: 41, stepsReached: 40, claimed: [], sealOwned: false })).toEqual({ allowed: false, reason: 'out-of-range' });
  });
});

describe('le règlement', () => {
  it('rend la coupe, le badge daté et +500 de Gloire au parcours terminé', () => {
    expect(seasonSettlement({ season: 1, stepsReached: 40 })).toEqual({
      completed: true,
      glory: GLORY_POINTS.season,
      cup: true,
      badgeKey: 'season.1',
    });
  });

  it('ne rend rien d\'un parcours inachevé', () => {
    expect(seasonSettlement({ season: 1, stepsReached: 39 })).toEqual({ completed: false, glory: 0, cup: false, badgeKey: null });
  });
});

/**
 * L'ÉTAT D'UNE SAISON À UN MOMENT (#10131) — calculé depuis ses dates SERVIES et l'horloge locale, pour qu'une copie
 * hors ligne « à venir » bascule d'elle-même le jour de l'ouverture. La fermeture du dimanche 20 h ouvre la semaine
 * suivante, comme pour la ligue : la saison 1 (lundi 2026-12-21) est en cours dès le dimanche 20 h.
 */
describe('l’état d’une saison à un moment (#10131)', () => {
  const one = { startDay: '2026-12-21', endDay: '2027-02-14' } as const;

  it('à venir avant la fermeture du dimanche qui la précède, en cours dès 20 h', () => {
    expect(seasonTenseAt(one, { dayKey: '2026-12-20', minuteOfDay: 1199 })).toBe('upcoming');
    expect(seasonTenseAt(one, { dayKey: '2026-12-20', minuteOfDay: 1200 })).toBe('current');
    expect(seasonTenseAt(one, { dayKey: '2026-12-21', minuteOfDay: 0 })).toBe('current');
  });

  it('terminée à la fermeture de sa dernière semaine', () => {
    expect(seasonTenseAt(one, { dayKey: '2027-02-14', minuteOfDay: 1199 })).toBe('current');
    expect(seasonTenseAt(one, { dayKey: '2027-02-14', minuteOfDay: 1200 })).toBe('past');
    expect(seasonTenseAt(one, { dayKey: '2027-06-01', minuteOfDay: 0 })).toBe('past');
  });

  it('une copie « à venir » gardée hors ligne bascule d’elle-même le jour J', () => {
    expect(liveSeasonTense({ served: 'upcoming', ...one }, { dayKey: '2026-12-19', minuteOfDay: 600 })).toBe('upcoming');
    expect(liveSeasonTense({ served: 'upcoming', ...one }, { dayKey: '2026-12-21', minuteOfDay: 600 })).toBe('current');
    expect(liveSeasonTense({ served: 'upcoming', ...one }, { dayKey: '2027-03-01', minuteOfDay: 600 })).toBe('past');
  });

  it('une horloge en retard ne fait jamais reculer l’état servi', () => {
    expect(liveSeasonTense({ served: 'current', ...one }, { dayKey: '2026-12-01', minuteOfDay: 0 })).toBe('current');
    expect(liveSeasonTense({ served: 'past', ...one }, { dayKey: '2027-01-10', minuteOfDay: 600 })).toBe('past');
  });
});
