import { describe, expect, test } from 'bun:test';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { gloryLadder } from '@meeshy/shared/utils/game/glory';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';

import {
  achievementMoment,
  flameMoment,
  levelHundredMoment,
  meeshMoment,
  photoMomentFromCard,
  photoMomentOfEmblemV2,
  photoMomentsOfTransition,
  rankMoment,
  startMoment,
  tierMoment,
  treasuryMoment,
} from './moments';

/**
 * LES MOMENTS QUI SE PHOTOGRAPHIENT (#9382) — conception, partie VI :
 * photo de départ, nouveau rang ou division, nouveau palier, Prestige, première
 * Meesh, chaque 10e, chaque édition or ou prisme, palier du trésor, Flamme à
 * 7, 30, 100 et 365 jours. Chaque moment a une identité STABLE : proposer deux
 * fois la même photo (un « plus tard » puis un retour) est impossible.
 */

const view = (patch: Parameters<typeof gameBlockFixture>[0] = {}): EngagementWithGame => ({
  ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE),
  game: gameBlockFixture(patch),
});
const gameOf = (v: EngagementWithGame) => {
  if (v.game === undefined) throw new Error('bloc game attendu');
  return v.game;
};

describe('un succès révélé se photographie (#7742)', () => {
  test('le moment porte la clé du succès, son titre dans la langue du lecteur et un kicker', () => {
    const moment = achievementMoment('achievement.first_voice');
    expect(moment.id).toBe('achievement:achievement.first_voice');
    expect(moment.emblem).toEqual({ kind: 'achievement', key: 'achievement.first_voice' });
    expect(moment.kicker).toBe('Succès débloqué');
    expect(moment.title.length).toBeGreaterThan(0);
    expect(moment.title).not.toBe(moment.kicker);
  });

  test('un succès dont la rareté est mesurée la dit dans la ligne du dessus, sans changer d’identité', () => {
    const moment = achievementMoment('achievement.first_voice', 'epic');
    expect(moment.emblem).toEqual({ kind: 'achievement', key: 'achievement.first_voice', rarity: 'epic' });
    expect(moment.kicker).toBe('Succès débloqué · Épique');
    expect(moment.id).toBe(achievementMoment('achievement.first_voice').id);
    expect(achievementMoment('achievement.first_voice', null).emblem).toEqual({ kind: 'achievement', key: 'achievement.first_voice' });
  });

  test('deux succès sont deux moments, un même succès toujours le même', () => {
    expect(achievementMoment('achievement.editor').id).not.toBe(achievementMoment('achievement.first_voice').id);
    expect(achievementMoment('achievement.editor')).toEqual(achievementMoment('achievement.editor'));
  });
});

describe('chaque moment porte son identité, son emblème et ses mots', () => {
  test('le départ', () => {
    expect(startMoment()).toEqual({ id: 'start', emblem: { kind: 'start' }, kicker: 'Premiers pas', title: 'Mon départ sur Meeshy' });
  });

  test('un rang, division comprise', () => {
    const moment = rankMoment({ rank: 'voix', division: 2 });
    expect(moment.id).toBe('rank:voix:2');
    expect(moment.emblem).toEqual({ kind: 'rank', rank: 'voix', division: 2, mythic: null });
    expect(moment.kicker).toBe('Nouveau rang');
    expect(moment.title).toBe('Voix II');
  });

  test('une autre division est un autre moment', () => {
    expect(rankMoment({ rank: 'voix', division: 1 }).id).not.toBe(rankMoment({ rank: 'voix', division: 2 }).id);
  });

  test('un palier de niveau', () => {
    const moment = tierMoment({ tier: 'lueur', level: 10 });
    expect(moment.id).toBe('tier:lueur');
    expect(moment.title).toBe('Palier Lueur');
    expect(moment.kicker).toBe('Niveau 10');
  });

  test('le niveau 100 et ses Prestiges', () => {
    expect(levelHundredMoment(0).id).toBe('level-100:0');
    expect(levelHundredMoment(0).title).toBe('Niveau 100');
    expect(levelHundredMoment(2).title).toBe('Prestige 2');
  });

  test('la première Meesh, une Meesh numérotée, une Meesh en or', () => {
    expect(meeshMoment({ number: 1, edition: 'silver' }).title).toBe('Ma première Meesh');
    expect(meeshMoment({ number: 20, edition: 'silver' }).title).toBe('Meesh n° 20');
    expect(meeshMoment({ number: 100, edition: 'gold' }).title).toBe('Meesh n° 100 · or');
    expect(meeshMoment({ number: 1000, edition: 'prism' }).title.replace(/\s/g, ' ')).toBe('Meesh n° 1 000 · prisme');
    expect(meeshMoment({ number: 20, edition: 'silver' }).id).toBe('meesh:20');
  });

  test('un palier du trésor', () => {
    expect(treasuryMoment('escarcelle').title).toBe('Escarcelle');
    expect(treasuryMoment('escarcelle').id).toBe('treasury:escarcelle');
  });

  test('la Flamme à 7, 30, 100 ou 365 jours : le seuil franchi fait l’identité', () => {
    expect(flameMoment(7).id).toBe('flame:7');
    expect(flameMoment(8).id).toBe('flame:7');
    expect(flameMoment(30).emblem).toEqual({ kind: 'flame', form: 'brasier', days: 30 });
    expect(flameMoment(365).title).toBe('365 jours de Flamme');
  });
});

describe('photoMomentFromCard — la carte du guide sait quel moment elle propose', () => {
  const game = gameBlockFixture({ glory: 1700, score: 10 * 11 * 11, balance: 12, mintedLifetime: 1 });

  test('nouveau rang', () => {
    expect(photoMomentFromCard('new-rank', game)?.id).toBe(`rank:${game.glory.rank}:${game.glory.division}`);
  });
  test('nouveau palier', () => {
    expect(photoMomentFromCard('new-tier', game)?.id).toBe('tier:lueur');
  });
  test('première Meesh : celle qui vient d’être frappée porte le numéro précédent', () => {
    expect(photoMomentFromCard('first-mint', game)?.id).toBe('meesh:1');
  });
  test('palier du trésor', () => {
    expect(photoMomentFromCard('treasury-tier', game)?.id).toBe('treasury:escarcelle');
  });
  test('niveau 100', () => {
    expect(photoMomentFromCard('level-100', gameBlockFixture({ score: 10 * 100 * 100 }))?.id).toBe('level-100:0');
  });
  test('un moment qui ne se photographie pas rend null', () => {
    expect(photoMomentFromCard('flame-at-risk', game)).toBeNull();
    expect(photoMomentFromCard('price-rises', game)).toBeNull();
  });
  test('un état qui n’a pas le moment (pas de palier de trésor) rend null', () => {
    expect(photoMomentFromCard('treasury-tier', gameBlockFixture({ balance: 0 }))).toBeNull();
  });
});

describe('photoMomentsOfTransition — ce qui se propose APRÈS la célébration', () => {
  test('rien n’a changé : rien', () => {
    const v = view();
    expect(photoMomentsOfTransition(v, v)).toEqual([]);
  });

  test('la Flamme franchit 7 jours', () => {
    const moments = photoMomentsOfTransition(view({ streak: 6 }), view({ streak: 7 }));
    expect(moments.map((m) => m.id)).toEqual(['flame:7']);
  });

  test('la Flamme qui avance sans franchir de seuil : rien', () => {
    expect(photoMomentsOfTransition(view({ streak: 8 }), view({ streak: 9 }))).toEqual([]);
  });

  test('la première Meesh, la dixième, la centième en or', () => {
    const minted = (n: number) =>
      photoMomentsOfTransition(view({ mintedLifetime: n - 1 }), view({ mintedLifetime: n })).map((m) => m.id);
    expect(minted(1)).toEqual(['meesh:1']);
    expect(minted(10)).toEqual(['meesh:10']);
    expect(minted(100)).toEqual(['meesh:100']);
    expect(minted(1000)).toEqual(['meesh:1000']);
  });

  test('une Meesh ordinaire ne se propose pas', () => {
    expect(photoMomentsOfTransition(view({ mintedLifetime: 3 }), view({ mintedLifetime: 4 }))).toEqual([]);
  });

  test('un rang gagné, un palier franchi, un palier du trésor', () => {
    const echoIV = gloryLadder().find((step) => step.rank === 'echo' && step.division5 === 4)!.minGlory;
    const gained = photoMomentsOfTransition(view({ glory: echoIV - 1 }), view({ glory: echoIV }));
    expect(gained.map((m) => m.kicker)).toContain('Nouveau rang');
    expect(gained.map((m) => m.title)).toContain('Écho IV');
    expect(photoMomentsOfTransition(view({ score: 10 * 9 * 9 + 5 }), view({ score: 10 * 10 * 10 })).map((m) => m.id)).toContain('tier:lueur');
    expect(photoMomentsOfTransition(view({ balance: 9 }), view({ balance: 10 })).map((m) => m.id)).toContain('treasury:escarcelle');
  });

  test('le Mythe se photographie avec sa place, et son blason porte son émission (#9636)', () => {
    const moment = rankMoment({ rank: 'mythe', division: null, mythic: { number: 5, edition: 8 } });
    expect(moment.title).toBe('Mythe n° 5');
    expect(moment.emblem).toEqual({ kind: 'rank', rank: 'mythe', division: null, mythic: { number: 5, edition: 8 } });
  });

  test('une baisse ne se photographie pas', () => {
    expect(photoMomentsOfTransition(view({ score: 10 * 10 * 10 }), view({ score: 10 * 9 * 9 }))).toEqual([]);
  });

  test('un ancien serveur : rien', () => {
    const legacy = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
    expect(photoMomentsOfTransition(legacy, view())).toEqual([]);
    expect(gameOf(view()).level.level).toBeGreaterThan(0);
  });
});

/**
 * LES MOMENTS PHOTO DE LA VAGUE 2 (#9481) — trophée, montée de ligue, saison
 * terminée, Prestige : les quatre que la loi range parmi les photos
 * (`photoMomentOfGuideEvent`). Une première ligue, une descente, une saison
 * inachevée et un tampon ne se photographient pas.
 */
describe('les moments photo de la vague 2', () => {
  const base = (): EngagementWithGame => ({ ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE), game: gameBlockWithExtrasFixture() });
  const onGame = (patch: (game: NonNullable<EngagementWithGame['game']>) => NonNullable<EngagementWithGame['game']>): EngagementWithGame => {
    const v = base();
    return v.game === undefined ? v : { ...v, game: patch(v.game) };
  };

  test('un trophée : l’identité de la loi, la coupe nommée, la ligne « Nouveau trophée »', () => {
    const moment = photoMomentOfEmblemV2({ kind: 'trophy', trophyKey: 'trophy.league-cup.2026-10-26.jade.gold' });
    expect(moment.id).toBe('trophy:trophy.league-cup.2026-10-26.jade.gold');
    expect(moment.kicker).toBe('Nouveau trophée');
    expect(moment.title).toBe('Coupe d’or — ligue Jade, semaine du 26 octobre');
  });

  test('une montée de ligue, une saison, un Prestige', () => {
    expect(photoMomentOfEmblemV2({ kind: 'league-up', league: 'saphir', weekKey: '2026-11-09' })).toMatchObject({ id: 'league-up:2026-11-09:saphir', kicker: 'Montée de ligue', title: 'Ligue Saphir' });
    expect(photoMomentOfEmblemV2({ kind: 'season', season: 1 })).toMatchObject({ id: 'season:1', kicker: 'Saison terminée', title: 'Saison 1' });
    expect(photoMomentOfEmblemV2({ kind: 'prestige', number: 2 })).toMatchObject({ id: 'prestige:2', kicker: 'Nouveau Prestige', title: 'Prestige 2' });
  });

  test('un trophée reçu pendant que l’écran est ouvert se propose', () => {
    const next = onGame((g) => (g.trophies === undefined ? g : { ...g, trophies: { items: [...g.trophies.items, { key: 'trophy.season-cup.1', awardedAt: '2026-11-09T10:00:00.000Z' }], order: g.trophies.order } }));
    expect(photoMomentsOfTransition(base(), next).map((m) => m.id)).toEqual(['trophy:trophy.season-cup.1']);
  });

  test('un tampon d’Atlas ne se photographie pas', () => {
    const next = onGame((g) => (g.atlas === undefined ? g : { ...g, atlas: { ...g.atlas, stamped: 5, stamps: [...g.atlas.stamps, { language: 'ja', stampedOn: '2026-11-09' }] } }));
    expect(photoMomentsOfTransition(base(), next)).toEqual([]);
  });

  test('un Prestige ne se propose QU’UNE fois : la carte du trophée remplace celle du niveau 100', () => {
    const next = onGame((g) => ({ ...g, level: { ...g.level, prestige: g.level.prestige + 1 } }));
    expect(photoMomentsOfTransition(base(), next).map((m) => m.id)).toEqual(['prestige:1']);
  });

  test('le Prestige se lit du niveau (vague 1) : un ancien serveur le célèbre aussi, par la carte du trophée', () => {
    const before = view();
    const next: EngagementWithGame = before.game === undefined ? before : { ...before, game: { ...before.game, level: { ...before.game.level, prestige: before.game.level.prestige + 1 } } };
    expect(photoMomentsOfTransition(before, next).map((m) => m.id)).toEqual(['prestige:1']);
  });

  test('une entrée du carnet écrite hier se relit dans la langue d’aujourd’hui : le titre se déduit de l’emblème', () => {
    const moment = photoMomentOfEmblemV2({ kind: 'prestige', number: 3 });
    expect(moment.emblem).toEqual({ kind: 'prestige', number: 3 });
  });
});
