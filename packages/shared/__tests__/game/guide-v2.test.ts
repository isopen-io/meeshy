/**
 * Les moments de guide de la vague 2 (#9384 à #9389) : ligue, saison, trophée,
 * Prestige, Atlas — et les moments photo qui en découlent. La loi ne dit rien
 * en toutes lettres ; les clients localisent.
 */

import { describe, it, expect } from 'vitest';
import {
  GUIDE_ACTIONS_V2,
  GUIDE_MOMENT_KEYS_V2,
  GUIDE_MOMENT_PRIORITY_ALL,
  chooseGuideMomentAny,
  guideMomentV2,
  guideSeenKeyV2,
  type GuideEventV2,
} from '../../utils/game/guide-v2.js';
import { flameGoalNextSeenKey } from '../../utils/game/flame-goal.js';
import { GUIDE_ACTIONS, GUIDE_MOMENT_KEYS, GUIDE_MOMENT_PRIORITY } from '../../utils/game/guide.js';
import { FLAME_FREEZE_GIFT_SEEN_KEY } from '../../utils/game/flame.js';
import { photoMomentId, photoMomentOfGuideEvent } from '../../utils/game/photo-moments.js';

const events: readonly GuideEventV2[] = [
  { kind: 'league-first', league: 'quartz', pointsToPromotion: 120 },
  { kind: 'league-promoted', from: 'quartz', to: 'ambre', rank: 3, weekKey: '2026-10-12' },
  { kind: 'league-relegated', from: 'ambre', to: 'quartz', pointsToPromotion: 80, weekKey: '2026-10-19' },
  { kind: 'season-start', season: 1, themeKey: 'language:fr', steps: 40 },
  { kind: 'season-end', season: 1, stepsReached: 40, completed: true, gloryGained: 500 },
  { kind: 'trophy', trophyKey: 'trophy.prestige.1' },
  { kind: 'prestige', prestige: 1, gloryGained: 1000 },
  { kind: 'atlas-stamp', language: 'ja', stamped: 4, total: 89 },
  { kind: 'flame-freeze-gift', freezes: 1 },
  { kind: 'offering-kept', easedDays: 3 },
  { kind: 'flame-goal-reached', target: 7, next: 14 },
];

describe('les moments de la vague 2', () => {
  it('couvrent les onze moments de la conception, sans toucher aux douze premiers', () => {
    expect([...GUIDE_MOMENT_KEYS_V2].sort()).toEqual(events.map((e) => e.kind).sort());
    expect(GUIDE_MOMENT_KEYS).toHaveLength(12);
    expect(GUIDE_MOMENT_KEYS_V2.some((key) => (GUIDE_MOMENT_KEYS as readonly string[]).includes(key))).toBe(false);
  });

  it('ajoutent leurs actions à la suite, sans retirer ni renommer aucune des actions actuelles', () => {
    expect(GUIDE_ACTIONS_V2.some((action) => (GUIDE_ACTIONS as readonly string[]).includes(action))).toBe(false);
    expect([...GUIDE_ACTIONS_V2].sort()).toEqual(['see-atlas', 'see-league', 'see-season', 'see-trophies']);
  });

  it('rendent clé, locuteur, humeur, données, action et présentation', () => {
    expect(guideMomentV2(events[1]!, [])).toEqual({
      key: 'league-promoted',
      speaker: 'mee',
      mood: 'cheer',
      data: { from: 'quartz', to: 'ambre', rank: 3, weekKey: '2026-10-12' },
      action: 'see-league',
      presentation: 'full',
    });
  });

  it('fait parler Mee à la première ligue et à la montée, Meo à la descente', () => {
    expect(guideMomentV2(events[0]!, []).speaker).toBe('mee');
    expect(guideMomentV2(events[1]!, []).speaker).toBe('mee');
    const down = guideMomentV2(events[2]!, []);
    expect(down.speaker).toBe('meo');
    expect(down.mood).toBe('calm');
  });

  it('réunit Mee et Meo pour la saison, le trophée et le Prestige', () => {
    for (const index of [3, 4, 5, 6]) expect(guideMomentV2(events[index]!, []).speaker).toBe('duo');
  });

  it('est fier d\'une saison terminée, calme d\'une saison inachevée', () => {
    expect(guideMomentV2(events[4]!, []).mood).toBe('proud');
    expect(guideMomentV2({ kind: 'season-end', season: 1, stepsReached: 12, completed: false, gloryGained: 0 }, []).mood).toBe('calm');
  });

  it('montre en entier la première fois, en version courte ensuite', () => {
    expect(guideMomentV2(events[7]!, []).presentation).toBe('full');
    expect(guideMomentV2(events[7]!, ['atlas-stamp']).presentation).toBe('short');
  });
});

describe('le choix d\'une seule carte', () => {
  it('range les vingt et un moments dans un ordre qui contient tous les moments, anciens et nouveaux', () => {
    expect([...GUIDE_MOMENT_PRIORITY_ALL].sort()).toEqual([...GUIDE_MOMENT_KEYS, ...GUIDE_MOMENT_KEYS_V2].sort());
  });

  it('garde l\'ordre relatif des moments actuels', () => {
    const kept = GUIDE_MOMENT_PRIORITY_ALL.filter((key) => (GUIDE_MOMENT_KEYS as readonly string[]).includes(key));
    expect(kept).toEqual([...GUIDE_MOMENT_PRIORITY]);
  });

  it('place le Prestige et le trophée avant tout, juste après un nouveau rang', () => {
    const chosen = chooseGuideMomentAny([{ kind: 'atlas-stamp', language: 'ja', stamped: 1, total: 89 }, { kind: 'prestige', prestige: 1, gloryGained: 1000 }, { kind: 'first-level', level: 2, pointsToNext: 50 }], []);
    expect(chosen?.key).toBe('prestige');
  });

  it('préfère un moment inédit à un moment déjà vu', () => {
    const chosen = chooseGuideMomentAny([events[1]!, events[7]!], ['league-promoted']);
    expect(chosen?.key).toBe('atlas-stamp');
  });

  it('ne rend rien sans événement', () => {
    expect(chooseGuideMomentAny([], [])).toBeNull();
  });
});

describe('les moments photo', () => {
  it('proposent la photo d\'un trophée, d\'une montée de ligue, d\'une saison terminée et du Prestige', () => {
    expect(photoMomentOfGuideEvent(events[5]!)).toEqual({ kind: 'trophy', trophyKey: 'trophy.prestige.1' });
    expect(photoMomentOfGuideEvent(events[1]!)).toEqual({ kind: 'league-up', league: 'ambre', weekKey: '2026-10-12' });
    expect(photoMomentOfGuideEvent(events[4]!)).toEqual({ kind: 'season', season: 1 });
    expect(photoMomentOfGuideEvent(events[6]!)).toEqual({ kind: 'prestige', number: 1 });
  });

  it('ne photographie ni une descente, ni une première ligue, ni une saison inachevée, ni un tampon', () => {
    expect(photoMomentOfGuideEvent(events[0]!)).toBeNull();
    expect(photoMomentOfGuideEvent(events[2]!)).toBeNull();
    expect(photoMomentOfGuideEvent(events[3]!)).toBeNull();
    expect(photoMomentOfGuideEvent(events[7]!)).toBeNull();
    expect(photoMomentOfGuideEvent({ kind: 'season-end', season: 1, stepsReached: 3, completed: false, gloryGained: 0 })).toBeNull();
  });

  it('donnent une identité stable : un « plus tard » puis un retour ne propose jamais deux fois la même photo', () => {
    expect(photoMomentId({ kind: 'trophy', trophyKey: 'trophy.prestige.1' })).toBe('trophy:trophy.prestige.1');
    expect(photoMomentId({ kind: 'league-up', league: 'ambre', weekKey: '2026-10-12' })).toBe('league-up:2026-10-12:ambre');
    expect(photoMomentId({ kind: 'season', season: 2 })).toBe('season:2');
    expect(photoMomentId({ kind: 'prestige', number: 3 })).toBe('prestige:3');
  });
});

describe('le moment « Une Veilleuse t\'est offerte » (#20169)', () => {
  const gift: GuideEventV2 = { kind: 'flame-freeze-gift', freezes: 1 };

  it('porte la clé « vue » que la passerelle garde, pour ne se dire qu\'une fois', () => {
    expect(guideMomentV2(gift, []).key).toBe(FLAME_FREEZE_GIFT_SEEN_KEY);
  });

  it('fait parler Meo, gardienne de la Flamme, et mène à la Flamme', () => {
    expect(guideMomentV2(gift, [])).toEqual({
      key: 'flame-freeze-gift',
      speaker: 'meo',
      mood: 'cheer',
      data: { freezes: 1 },
      action: 'see-flame',
      presentation: 'full',
    });
  });

  it('passe après la Flamme à risque, avant une montée de ligue', () => {
    const rank = (key: string): number => (GUIDE_MOMENT_PRIORITY_ALL as readonly string[]).indexOf(key);
    expect(rank('flame-freeze-gift')).toBe(rank('flame-at-risk') + 1);
    expect(rank('flame-freeze-gift')).toBeLessThan(rank('league-promoted'));
    expect(chooseGuideMomentAny([{ kind: 'atlas-stamp', language: 'ja', stamped: 1, total: 89 }, gift], [])?.key).toBe('flame-freeze-gift');
  });

  it('ne se photographie pas', () => {
    expect(photoMomentOfGuideEvent(gift)).toBeNull();
  });
});

describe('le moment « Les aïeux t\'ont gardé ton Offrande » (#20327, #17373)', () => {
  const kept: GuideEventV2 = { kind: 'offering-kept', easedDays: 3 };

  it('fait parler Mee, qui accueille, et mène à la fiche du Rêve où l\'Offrande s\'ouvre', () => {
    expect(guideMomentV2(kept, [])).toEqual({
      key: 'offering-kept',
      speaker: 'mee',
      mood: 'cheer',
      data: { easedDays: 3 },
      action: 'see-missions',
      presentation: 'full',
    });
    expect(guideMomentV2(kept, ['offering-kept']).presentation).toBe('short');
  });

  it('accueille avant de parler de la Flamme éteinte, et passe devant le retour de la vague 1', () => {
    const rank = (key: string): number => (GUIDE_MOMENT_PRIORITY_ALL as readonly string[]).indexOf(key);
    expect(rank('offering-kept')).toBe(rank('flame-out') - 1);
    expect(rank('offering-kept')).toBeGreaterThan(rank('season-end'));
    const opening = [{ kind: 'flame-out', lostDays: 0, relightPrice: 100, canRelight: true } as const, { kind: 'return-after-absence', daysAway: 9 } as const, kept];
    expect(chooseGuideMomentAny(opening, [])?.key).toBe('offering-kept');
    expect(chooseGuideMomentAny(opening, ['offering-kept', 'flame-out', 'return-after-absence'])?.key).toBe('offering-kept');
  });

  it('ne se photographie pas', () => {
    expect(photoMomentOfGuideEvent(kept)).toBeNull();
  });
});

describe('le moment « Tes aïeux saluent ta Flamme » (#20546, #20548)', () => {
  const reached: GuideEventV2 = { kind: 'flame-goal-reached', target: 7, next: 14 };

  it('fait parler Mee et Meo ensemble, fiers, et mène à la Flamme où la marche suivante se choisit', () => {
    expect(guideMomentV2(reached, [])).toEqual({
      key: 'flame-goal-reached',
      speaker: 'duo',
      mood: 'proud',
      data: { target: 7, next: 14 },
      action: 'see-flame',
      presentation: 'full',
    });
  });

  it('se dit « vu » par la clé de l\'objectif atteint, celle que la carte de la Flamme lit aussi', () => {
    expect(guideSeenKeyV2(reached)).toBe(flameGoalNextSeenKey(7));
    expect(guideSeenKeyV2({ kind: 'flame-goal-reached', target: 30, next: 100 })).toBe('flame-goal-next-30');
    expect(guideMomentV2(reached, [flameGoalNextSeenKey(7)]).presentation).toBe('short');
    expect(guideMomentV2(reached, ['flame-goal-reached']).presentation).toBe('full');
  });

  it('garde la clé de chaque autre moment : son genre', () => {
    for (const event of events.filter((e) => e.kind !== 'flame-goal-reached')) expect(guideSeenKeyV2(event)).toBe(event.kind);
    expect(guideSeenKeyV2({ kind: 'flame-at-risk', days: 3 })).toBe('flame-at-risk');
  });

  it('passe après la Veilleuse offerte, avant une montée de ligue', () => {
    const rank = (key: string): number => (GUIDE_MOMENT_PRIORITY_ALL as readonly string[]).indexOf(key);
    expect(rank('flame-goal-reached')).toBe(rank('flame-freeze-gift') + 1);
    expect(rank('flame-goal-reached')).toBeLessThan(rank('league-promoted'));
  });

  it('un objectif déjà salué cède la place à un moment inédit, et se redit en court s\'il est seul', () => {
    const stamp: GuideEventV2 = { kind: 'atlas-stamp', language: 'ja', stamped: 1, total: 89 };
    expect(chooseGuideMomentAny([stamp, reached], [])?.key).toBe('flame-goal-reached');
    expect(chooseGuideMomentAny([stamp, reached], [flameGoalNextSeenKey(7)])?.key).toBe('atlas-stamp');
    expect(chooseGuideMomentAny([reached], [flameGoalNextSeenKey(7)])?.presentation).toBe('short');
  });

  it('ne se photographie pas : la Flamme a ses propres formes', () => {
    expect(photoMomentOfGuideEvent(reached)).toBeNull();
  });
});
