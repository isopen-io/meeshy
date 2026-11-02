import { describe, expect, test } from 'bun:test';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { gloryLadder } from '@meeshy/shared/utils/game/glory';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { ALL_LEVEL_STEPS, gameBlockFixture, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';

import {
  achievementMoment,
  dayMoment,
  dayOfYear,
  flameMoment,
  levelHundredMoment,
  meeshMoment,
  photoMomentFromCard,
  photoMomentOfEmblemV2,
  momentPlate,
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
    expect(moment.kicker).toBe('Haut fait accompli');
    expect(moment.title.length).toBeGreaterThan(0);
    expect(moment.title).not.toBe(moment.kicker);
  });

  test('un succès dont la rareté est mesurée la dit dans la ligne du dessus, sans changer d’identité', () => {
    const moment = achievementMoment('achievement.first_voice', 'epic');
    expect(moment.emblem).toEqual({ kind: 'achievement', key: 'achievement.first_voice', rarity: 'epic' });
    expect(moment.kicker).toBe('Haut fait accompli · Épique');
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
    expect(moment.title).toBe('Ta lumière en Lueur');
    expect(moment.kicker).toBe('Niveau 10');
  });

  test('le niveau 100 et ses Prestiges', () => {
    expect(levelHundredMoment(0).id).toBe('level-100:0');
    expect(levelHundredMoment(0).title).toBe('Niveau 100');
    expect(levelHundredMoment(2).title).toBe('Renaissance 2');
  });

  test('la première Meesh, une Meesh numérotée, une Meesh en or', () => {
    expect(meeshMoment({ number: 1 }).title).toBe('Ma première Meesh');
    expect(meeshMoment({ number: 20 }).title).toBe('Meesh n° 20');
    expect(meeshMoment({ number: 100 }).title).toBe('Meesh n° 100 · or');
    expect(meeshMoment({ number: 1000 }).title.replace(/\s/g, ' ')).toBe('Meesh n° 1 000 · prisme');
    expect(meeshMoment({ number: 20 }).id).toBe('meesh:20');
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

  test('D17 (#10167) : la ligne du dessus d’une Flamme est la FORME de la loi (`FLAME_FORMS`), jamais l’étiquette du manifeste — 7 flamme, 30 brasier, 100 astre, 365 soleil', () => {
    expect([7, 30, 100, 365].map((days) => flameMoment(days).kicker)).toEqual(['Flamme', 'Brasier', 'Astre', 'Soleil']);
  });

  test('la réalisation du jour (D6, #10167) : identité `day:<AAAA-MM-JJ>`, quantième de l’année en ligne du dessus, l’Offrande ouverte en titre ; une clé illisible n’a pas de moment', () => {
    const moment = dayMoment('2026-10-10');
    expect(moment?.id).toBe('day:2026-10-10');
    expect(moment?.emblem).toEqual({ kind: 'day', dayKey: '2026-10-10' });
    expect(moment?.kicker).toBe('Réalisation du jour · Jour 283');
    expect(moment?.title).toBe('L’Offrande ouverte');
    expect(dayOfYear('2026-01-01')).toBe(1);
    expect(dayOfYear('2024-12-31')).toBe(366);
    expect(dayMoment('2026-13-01')).toBeNull();
    expect(dayMoment('hier')).toBeNull();
  });

  test('une clé en forme de date qui n’en est pas une (`2026-02-30`, `2026-02-29`) n’a pas de moment : `null`, jamais une levée', () => {
    expect(() => dayMoment('2026-02-30')).not.toThrow();
    expect(dayMoment('2026-02-30')).toBeNull();
    expect(dayMoment('2026-02-29')).toBeNull();
    expect(dayMoment('2028-02-29')?.kicker).toBe('Réalisation du jour · Jour 60');
  });
});

describe('momentPlate — ce que la PLAQUE grave quand le cadre lui réserve `plate.1` (L14, #10167)', () => {
  test('un palier du trésor : le compte de Meeshes gardées du palier, accordé', () => {
    expect(momentPlate({ kind: 'treasury', tier: 'bourse' })).toBe('1 Meesh gardée');
    expect(momentPlate({ kind: 'treasury', tier: 'coffre' })).toBe('100 Meeshes gardées');
    expect(momentPlate({ kind: 'treasury', tier: 'reserve' })?.replace(/\s/g, ' ')).toBe('1 000 Meeshes gardées');
  });

  test('la réalisation du jour : la plaque dit ce que la ligne du dessus dit (jour-a n’a pas de ligne du dessus, jour-b n’a pas de plaque)', () => {
    const moment = dayMoment('2026-10-10');
    expect(moment === null ? null : momentPlate(moment.emblem)).toBe('Réalisation du jour · Jour 283');
  });

  test('un Mythe : sa place sur cent ; sans place servie, rien — jamais le « Nº 42 / 100 » d’exemple', () => {
    expect(momentPlate({ kind: 'rank', rank: 'mythe', division: null, mythic: { number: 42, edition: 1 } })).toBe('Nº 42 / 100');
    expect(momentPlate({ kind: 'rank', rank: 'mythe', division: null, mythic: null })).toBeNull();
  });

  test('un moment sans plaque vivante ne grave rien : le palier, la Meesh, la Flamme, le départ, un rang de division', () => {
    expect(momentPlate(tierMoment({ tier: 'comete', level: 60 }).emblem)).toBeNull();
    expect(momentPlate(meeshMoment({ number: 100 }).emblem)).toBeNull();
    expect(momentPlate(flameMoment(30).emblem)).toBeNull();
    expect(momentPlate(startMoment().emblem)).toBeNull();
    expect(momentPlate(rankMoment({ rank: 'ambassadeur', division: 3 }).emblem)).toBeNull();
  });
});

describe('photoMomentFromCard — la carte du guide sait quel moment elle propose', () => {
  const game = gameBlockFixture({ glory: 1700, score: 100 * 11 * 11, balance: 12, mintedLifetime: 1 });

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
    expect(photoMomentFromCard('level-100', gameBlockFixture({ ...ALL_LEVEL_STEPS, score: 100 * 100 * 100, levelRecord: 100 }))?.id).toBe('level-100:0');
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

  // Au niveau 8, la première Meesh (l'étape du 10, #9706) ne fait franchir aucun palier : seule la pièce se propose.
  const AT_8 = 100 * 8 * 8;

  test('la première Meesh, la dixième, la centième en or', () => {
    const minted = (n: number) =>
      photoMomentsOfTransition(view({ score: AT_8, mintedLifetime: n - 1 }), view({ score: AT_8, mintedLifetime: n })).map((m) => m.id);
    expect(minted(1)).toEqual(['meesh:1']);
    expect(minted(10)).toEqual(['meesh:10']);
    expect(minted(100)).toEqual(['meesh:100']);
    expect(minted(1000)).toEqual(['meesh:1000']);
  });

  test('la pièce de la photo se dessine dans la plus haute édition atteinte, et son titre la nomme (#11483)', () => {
    expect(meeshMoment({ number: 247 }).emblem).toEqual({ kind: 'meesh', number: 247, edition: 'gold' });
    expect(meeshMoment({ number: 247 }).title).toBe('Meesh n° 247 · or');
    expect(meeshMoment({ number: 1010 }).emblem).toEqual({ kind: 'meesh', number: 1010, edition: 'prism' });
    expect(meeshMoment({ number: 90 }).title).toBe('Meesh n° 90');
    const tenth = photoMomentsOfTransition(view({ score: AT_8, mintedLifetime: 249 }), view({ score: AT_8, mintedLifetime: 250 })).find((m) => m.id === 'meesh:250');
    expect(tenth?.emblem).toEqual({ kind: 'meesh', number: 250, edition: 'gold' });
  });

  test('une Meesh ordinaire ne se propose pas', () => {
    expect(photoMomentsOfTransition(view({ mintedLifetime: 3 }), view({ mintedLifetime: 4 }))).toEqual([]);
  });

  test('un rang gagné, un palier franchi, un palier du trésor', () => {
    const echoIV = gloryLadder().find((step) => step.rank === 'echo' && step.division5 === 4)!.minGlory;
    const gained = photoMomentsOfTransition(view({ glory: echoIV - 1 }), view({ glory: echoIV }));
    expect(gained.map((m) => m.kicker)).toContain('Nouveau rang');
    expect(gained.map((m) => m.title)).toContain('Écho IV');
    expect(photoMomentsOfTransition(view({ score: 100 * 9 * 9 + 5, levelRecord: 9 }), view({ score: 100 * 10 * 10, levelRecord: 9 })).map((m) => m.id)).toContain('tier:lueur');
    expect(photoMomentsOfTransition(view({ balance: 9 }), view({ balance: 10 })).map((m) => m.id)).toContain('treasury:escarcelle');
  });

  test('le Mythe se photographie avec sa place, et son blason porte son émission (#9636)', () => {
    const moment = rankMoment({ rank: 'mythe', division: null, mythic: { number: 5, edition: 8 } });
    expect(moment.title).toBe('Mythe n° 5');
    expect(moment.emblem).toEqual({ kind: 'rank', rank: 'mythe', division: null, mythic: { number: 5, edition: 8 } });
  });

  test('une baisse ne se photographie pas', () => {
    expect(photoMomentsOfTransition(view({ score: 100 * 10 * 10 }), view({ score: 100 * 9 * 9 }))).toEqual([]);
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
    expect(moment.title).toBe('Coupe d’or — joute Jade, semaine du 26 octobre');
  });

  test('une montée de ligue, une saison, un Prestige', () => {
    expect(photoMomentOfEmblemV2({ kind: 'league-up', league: 'saphir', weekKey: '2026-11-09' })).toMatchObject({ id: 'league-up:2026-11-09:saphir', kicker: 'Cercle gravi', title: 'Joute Saphir' });
    expect(photoMomentOfEmblemV2({ kind: 'season', season: 1 })).toMatchObject({ id: 'season:1', kicker: 'Voyage accompli', title: 'Voyage 1' });
    expect(photoMomentOfEmblemV2({ kind: 'prestige', number: 2 })).toMatchObject({ id: 'prestige:2', kicker: 'Renaissance', title: 'Renaissance 2' });
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

describe('un palier atteint de nouveau après un Prestige se photographie de nouveau (#10911)', () => {
  test('au premier cycle, l’identité d’hier et le titre sans compte', () => {
    const moment = tierMoment({ tier: 'lueur', level: 10 });
    expect(moment.id).toBe('tier:lueur');
    expect(moment.title).not.toContain('×');
  });

  test('dans un cycle neuf, une identité par cycle et le nombre de fois que le palier a été atteint', () => {
    const moment = tierMoment({ tier: 'lueur', level: 10, prestige: 2, times: 3 });
    expect(moment.id).toBe('tier:lueur:2');
    expect(moment.emblem).toEqual({ kind: 'tier', tier: 'lueur', level: 10, prestige: 2, times: 3 });
    expect(moment.title).toBe(`${tierMoment({ tier: 'lueur', level: 10 }).title} ×3`);
  });

  test('la carte du guide et la transition nomment le palier du cycle en cours', () => {
    const after = view({ ...ALL_LEVEL_STEPS, score: 100 * 10 * 10, levelRecord: 9, prestige: 1, pastCycleRecords: [100] });
    expect(photoMomentFromCard('new-tier', gameOf(after))?.id).toBe('tier:lueur:1');
    expect(photoMomentFromCard('new-tier', gameOf(after))?.title).toContain('×2');
    const before = view({ ...ALL_LEVEL_STEPS, score: 100 * 9 * 9 + 5, levelRecord: 9, prestige: 1, pastCycleRecords: [100] });
    expect(photoMomentsOfTransition(before, after).map((m) => m.id)).toContain('tier:lueur:1');
  });
});

