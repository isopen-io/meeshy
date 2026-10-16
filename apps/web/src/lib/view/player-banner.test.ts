import { beforeAll, describe, expect, test } from 'bun:test';

import type { GameBlockFacts } from '@meeshy/shared/utils/game/game-block';

import { ALL_LEVEL_STEPS, gameBlockFixture, gameBlockWithExtrasFixture, gameExtrasFactsFixture } from '@/lib/api/game-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { isLargeText, playerBannerLabel, playerBannerModel, playerBannerPieceLabels } from './player-banner';

/**
 * LA BANNIÈRE DU JOUEUR (#9494) — SEULEMENT CE QUI EXISTE. Le modèle ne pose
 * un élément que quand sa donnée existe : jamais un zéro, un tiret ou une case
 * vide. Un nouveau joueur n'a que son anneau et sa jauge.
 */
beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});

/** Un joueur qui n'a que ses premiers points : niveau 3 (le niveau 1 tient jusqu'à 399 points, #9706). */
const NEWCOMER: Partial<GameBlockFacts> = {
  score: 1000,
  levelRecord: null,
  glory: 0,
  balance: 0,
  mintedLifetime: 0,
  streak: 0,
  freezes: 0,
  lastActiveDay: null,
  debitablePoints: 1000,
};

/** Tout à zéro : niveau 1, aucun point, aucune Meesh, aucune Gloire, aucune Flamme. */
const ZERO: Partial<GameBlockFacts> = { ...NEWCOMER, score: 0, debitablePoints: 0 };

const shown = (facts: Partial<GameBlockFacts>) => {
  const model = playerBannerModel(gameBlockFixture(facts));
  if (model === null) throw new Error('un bandeau était attendu');
  return model;
};

describe('seulement ce qui a du sens (#9536)', () => {
  test('toutes les données du jeu à zéro : AUCUN bandeau', () => {
    expect(playerBannerModel(gameBlockFixture(ZERO))).toBeNull();
  });

  test('pas de points : pas de total de points, même avec une Meesh gardée', () => {
    const model = shown({ ...ZERO, balance: 1 });
    expect(model.points).toBeNull();
    expect(model.meeshes).toBe(1);
  });

  test('des points : le total paraît', () => {
    expect(shown({ ...ZERO, score: 12, debitablePoints: 12 }).points).toBe(12);
  });

  test('niveau 1 : aucun détail de niveau (ni anneau, ni jauge), mais les points restent dits', () => {
    const model = shown({ ...ZERO, score: 12, debitablePoints: 12 });
    expect(model.level).toBeNull();
    expect(model.points).toBe(12);
  });

  test('au-delà du niveau 1 : l’anneau et la jauge vers le niveau suivant', () => {
    const { level } = shown(NEWCOMER);
    expect(level?.level).toBeGreaterThan(1);
    expect(level?.nextLevel).toBe((level?.level ?? 0) + 1);
    expect(level?.pointsToNext).toBeGreaterThan(0);
  });

  test('un nouveau joueur : l’anneau, la jauge et ses points — rien d’autre', () => {
    const model = shown(NEWCOMER);
    expect({ meeshes: model.meeshes, rank: model.rank, league: model.league, flame: model.flame }).toEqual({ meeshes: null, rank: null, league: null, flame: null });
  });

  test('pas de Meeshes : pas de Meeshes ; elles paraissent dès la première gardée', () => {
    expect(shown(NEWCOMER).meeshes).toBeNull();
    expect(shown({ ...NEWCOMER, balance: 1 }).meeshes).toBe(1);
  });

  test('pas de Gloire : pas de blason ; il paraît dès la première Gloire', () => {
    expect(shown(NEWCOMER).rank).toBeNull();
    const model = shown({ ...NEWCOMER, glory: 1 });
    expect(model.rank).not.toBeNull();
    expect({ ...model, rank: null }).toEqual({ ...shown(NEWCOMER), rank: null });
  });

  test('pas de Flamme : pas de Flamme ; elle paraît quand elle brûle, et seulement alors', () => {
    expect(shown(NEWCOMER).flame).toBeNull();
    const lit = shown({ ...NEWCOMER, streak: 23, lastActiveDay: '2026-10-05' });
    expect(lit.flame?.days).toBe(23);
    const out = shown({ ...NEWCOMER, streak: 0, broken: { streak: 6, lastActiveDay: '2026-10-03' } });
    expect(out.flame).toBeNull();
  });

  test('pas de ligue : pas de ligue ; avec le consentement et un groupe, sa gemme et la place', () => {
    expect(shown(NEWCOMER).league).toBeNull();
    const model = playerBannerModel(gameBlockWithExtrasFixture());
    expect(model?.league?.league).toBe('jade');
    expect(model?.league?.place).toBeGreaterThanOrEqual(1);
  });

  test('sans consentement, aucune ligue — même avec un groupe', () => {
    const model = playerBannerModel(gameBlockWithExtrasFixture({}, { league: { ...gameBlockWithExtrasLeague(), consented: false } }));
    expect(model?.league).toBeNull();
  });

  test('une seule donnée suffit à porter le bandeau : la Flamme seule', () => {
    const model = shown({ ...ZERO, streak: 3, lastActiveDay: '2026-10-05' });
    expect(model.flame?.days).toBe(3);
    expect({ level: model.level, points: model.points, meeshes: model.meeshes, rank: model.rank }).toEqual({ level: null, points: null, meeshes: null, rank: null });
  });

  test('au plafond du rang, plus de niveau suivant ni de points manquants, et le rang qui l’ouvre (#9688)', () => {
    const top = shown({ ...NEWCOMER, ...ALL_LEVEL_STEPS, score: 50_000_000, debitablePoints: 50_000_000, levelRecord: 499 });
    expect(top.level?.level).toBe(499);
    expect({ nextLevel: top.level?.nextLevel, pointsToNext: top.level?.pointsToNext, opener: top.level?.opener }).toEqual({ nextLevel: null, pointsToNext: null, opener: 'ambassadeur' });
    expect(playerBannerLabel(top, 'fr')).toContain('Ambassadeur ouvre la suite');
  });
});

describe('ce que lit le lecteur d’écran — une phrase complète', () => {
  test('fr : le nouveau joueur, son niveau, son palier et sa marche vers le suivant', () => {
    const model = shown(NEWCOMER);
    expect(playerBannerLabel(model, 'fr')).toMatch(/^Niveau \d+, Braise, \d+ % vers le \d+$/);
  });

  test('fr : au niveau 1, le total de points est dit — il n’y a pas de niveau à lire', () => {
    const model = shown({ ...ZERO, score: 12, debitablePoints: 12 });
    expect(playerBannerLabel(model, 'fr')).toMatch(/^12 étincelles$/);
  });

  test('fr : tout ce qui existe, dans l’ordre de la bannière', () => {
    const model = shownExtras({ balance: 12, streak: 23, glory: 620 });
    expect(playerBannerLabel(model, 'fr')).toMatch(/^Niveau \d+, \p{L}+, \d+ % vers le \d+, 12 Meeshes, [\p{L} ]+, ligue Jade \d+(re|e), Flamme 23 jours, Trophées : \d+, Missions du jour : \d+ sur \d+, Saison : \d+ étoiles$/u);
  });

  test('le rang : la division V..I et la place du Mythe, dites et dessinées (#9636)', () => {
    const model = shownExtras({ glory: 620 });
    expect(model.rank).toEqual({ rank: 'murmure', division: 4, mythic: null });
    expect(playerBannerLabel(model, 'fr')).toContain('Murmure IV');
    const mythe = shownExtras({ glory: 1_000_000, mythic: true, mythicSeat: { number: 18, edition: 22 } });
    expect(mythe.rank).toEqual({ rank: 'mythe', division: null, mythic: { number: 18, edition: 22 } });
    expect(playerBannerLabel(mythe, 'fr')).toContain('Mythe n° 18');
  });

  test('en : l’ordinal anglais de la place', () => {
    const model = shownExtras({ balance: 12, streak: 23 });
    expect(playerBannerLabel(model, 'en')).toMatch(/^Level \d+, .*, Jade league \d+(st|nd|rd|th), Flame 23 days, Trophies: \d+, Daily missions: \d+ of \d+, Season: \d+ stars$/);
  });

  test('aucune langue ne laisse une clé nue, un paramètre en clair ou un « undefined »', () => {
    const model = shownExtras({ balance: 12, streak: 23 });
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const label = playerBannerLabel(model, language);
      expect({ language, defect: /game\.|\{\w+\}|undefined|NaN/.test(label) }).toEqual({ language, defect: false });
    }
  });
});

function shownExtras(facts: Partial<GameBlockFacts>) {
  const model = playerBannerModel(gameBlockWithExtrasFixture(facts));
  if (model === null) throw new Error('un bandeau était attendu');
  return model;
}

function gameBlockWithExtrasLeague() {
  return gameExtrasFactsFixture().league;
}

/**
 * AUX TRÈS GRANDES TAILLES DE TEXTE (#9494) — « au-delà de la taille XXL, la
 * jauge passe sous l'anneau ». Sur iOS, XXL grossit le texte de 21/17 et
 * xxxLarge de 23/17 ; le web lit la taille de la racine : 16 px est le texte
 * ordinaire, et le seuil tombe entre XXL et xxxLarge.
 */
describe('isLargeText', () => {
  test('le texte ordinaire et jusqu’à XXL : la jauge reste à côté de l’anneau', () => {
    expect(isLargeText(16)).toBe(false);
    expect(isLargeText(16 * (21 / 17))).toBe(false);
  });

  test('au-delà de XXL : la jauge passe sous l’anneau', () => {
    expect(isLargeText(16 * (23 / 17))).toBe(true);
    expect(isLargeText(32)).toBe(true);
  });

  test('une taille illisible ne casse rien : disposition ordinaire', () => {
    expect(isLargeText(Number.NaN)).toBe(false);
    expect(isLargeText(0)).toBe(false);
  });
});

/**
 * LES PIÈCES DU BANDEAU (porteur 2026-10-16) : s'ajoutent les trophées, la mission du jour et la saison — SEULEMENT quand
 * ils existent. Et les points du bandeau sont la POCHE d'étincelles, pas la base du niveau.
 */
describe('les étincelles du bandeau sont la poche', () => {
  test('avec les étincelles servies, le total montré est la poche — le niveau, lui, se lit sur le cycle', () => {
    const model = shown({ ...ZERO, score: 0, debitablePoints: 0, glory: 2000, sparks: { pocket: 40, cycle: 5000, lifetime: 9000, debt: 0 } });
    expect(model.points).toBe(40);
    expect(model.level?.level).toBeGreaterThan(1);
  });

  test('sans les étincelles (ancien serveur), l\'ancien score fait foi', () => {
    expect(shown({ ...ZERO, score: 12, debitablePoints: 12 }).points).toBe(12);
  });
});

describe('trophées, mission du jour et saison', () => {
  test('rien à zéro : aucune de ces trois pièces', () => {
    const model = shown(NEWCOMER);
    expect(model.trophies).toBeNull();
    expect(model.missions).toBeNull();
    expect(model.season).toBeNull();
  });

  test('des trophées : leur nombre', () => {
    const game = gameBlockWithExtrasFixture(NEWCOMER, { trophies: [{ key: 'trophy.prestige.1', awardedAt: '2026-11-01T00:00:00.000Z' }] });
    expect(playerBannerModel(game)?.trophies).toBe(game.trophies?.items.length);
    expect((playerBannerModel(game)?.trophies ?? 0) > 0).toBe(true);
  });

  test('des missions du jour ouvertes : combien sont faites sur combien', () => {
    const game = gameBlockWithExtrasFixture({ ...NEWCOMER, levelRecord: 9 });
    const model = playerBannerModel(game);
    expect(game.missions.unlocked).toBe(true);
    expect(model?.missions).toEqual({ done: game.missions.items.filter((m) => m.completedAt !== null).length, total: game.missions.items.length });
  });

  test('missions verrouillées : pas de pièce', () => {
    const game = gameBlockFixture({ ...ZERO, score: 12, debitablePoints: 12 });
    expect(game.missions.unlocked).toBe(false);
    expect(playerBannerModel(game)?.missions ?? null).toBeNull();
  });

  test('une saison ouverte : les étoiles gagnées', () => {
    const game = gameBlockWithExtrasFixture(NEWCOMER, { season: { stars: 25, claimedSteps: [1], sealOwned: false } });
    expect(game.season).not.toBeNull();
    expect(playerBannerModel(game)?.season).toEqual({ stars: game.season?.stars ?? 0 });
  });

  test('l\'étiquette lue dit chacune de ces pièces', () => {
    const game = gameBlockWithExtrasFixture({ ...NEWCOMER, levelRecord: 9 }, { trophies: [{ key: 'trophy.prestige.1', awardedAt: '2026-11-01T00:00:00.000Z' }], season: { stars: 25, claimedSteps: [], sealOwned: false } });
    const model = playerBannerModel(game);
    expect(model).not.toBeNull();
    const label = playerBannerLabel(model!, 'fr');
    expect(label).toContain('Trophées');
    expect(label).toContain('Saison');
  });
});

describe('un nom accessible par pièce', () => {
  test('chaque pièce présente a son nom ; une pièce absente n\'en a pas', () => {
    const game = gameBlockWithExtrasFixture({ ...NEWCOMER, glory: 2000, levelRecord: 9, balance: 12, streak: 23 }, { trophies: [{ key: 'trophy.prestige.1', awardedAt: '2026-11-01T00:00:00.000Z' }] });
    const labels = playerBannerPieceLabels(playerBannerModel(game)!, 'fr');
    expect(Object.entries(labels).filter(([piece, label]) => ['level', 'sparks', 'meesh', 'rank', 'trophies', 'missions'].includes(piece) && (label ?? '').length === 0).map(([piece]) => piece)).toEqual([]);
    const bare = playerBannerPieceLabels(playerBannerModel(gameBlockFixture(NEWCOMER))!, 'fr');
    expect(bare.meesh).toBeNull();
    expect(bare.rank).toBeNull();
    expect(bare.trophies).toBeNull();
  });

  test('les noms disent la pièce : le niveau et son palier, les étincelles et la marche vers le suivant', () => {
    const labels = playerBannerPieceLabels(playerBannerModel(gameBlockFixture(NEWCOMER))!, 'fr');
    expect(labels.level).toMatch(/^Niveau \d+, /);
    expect(labels.sparks).toContain('Étincelles');
    expect(labels.sparks).toMatch(/vers le/);
  });
});
