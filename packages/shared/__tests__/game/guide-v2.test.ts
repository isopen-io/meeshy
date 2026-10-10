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
  type GuideEventV2,
} from '../../utils/game/guide-v2.js';
import { GUIDE_ACTIONS, GUIDE_MOMENT_KEYS, GUIDE_MOMENT_PRIORITY } from '../../utils/game/guide.js';
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
];

describe('les moments de la vague 2', () => {
  it('couvrent les neuf moments de la conception, sans toucher aux treize premiers', () => {
    expect([...GUIDE_MOMENT_KEYS_V2].sort()).toEqual(events.map((e) => e.kind).sort());
    expect(GUIDE_MOMENT_KEYS).toHaveLength(13);
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
