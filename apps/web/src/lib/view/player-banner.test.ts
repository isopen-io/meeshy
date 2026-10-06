import { beforeAll, describe, expect, test } from 'bun:test';

import type { GameBlockFacts } from '@meeshy/shared/utils/game/game-block';

import { gameBlockFixture, gameBlockWithExtrasFixture, gameExtrasFactsFixture } from '@/lib/api/game-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { playerBannerLabel, playerBannerModel } from './player-banner';

/**
 * LA BANNIÈRE DU JOUEUR (#9494) — SEULEMENT CE QUI EXISTE. Le modèle ne pose
 * un élément que quand sa donnée existe : jamais un zéro, un tiret ou une case
 * vide. Un nouveau joueur n'a que son anneau et sa jauge.
 */
beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});

const NEWCOMER: Partial<GameBlockFacts> = {
  score: 12,
  glory: 0,
  balance: 0,
  mintedLifetime: 0,
  streak: 0,
  freezes: 0,
  lastActiveDay: null,
  debitablePoints: 12,
};

describe('seulement ce qui existe', () => {
  test('un nouveau joueur : l’anneau et la jauge, rien d’autre', () => {
    const model = playerBannerModel(gameBlockFixture(NEWCOMER));
    expect(model.level).toBeGreaterThanOrEqual(1);
    expect(model.nextLevel).toBe(model.level + 1);
    expect(model.pointsToNext).toBeGreaterThan(0);
    expect({ meeshes: model.meeshes, rank: model.rank, league: model.league, flame: model.flame }).toEqual({ meeshes: null, rank: null, league: null, flame: null });
  });

  test('les Meeshes paraissent dès la première gardée', () => {
    expect(playerBannerModel(gameBlockFixture({ ...NEWCOMER, balance: 1 })).meeshes).toBe(1);
  });

  test('le rang paraît dès la première Gloire', () => {
    const model = playerBannerModel(gameBlockFixture({ ...NEWCOMER, glory: 1 }));
    expect(model.rank).not.toBeNull();
    expect({ ...model, rank: null }).toEqual({ ...playerBannerModel(gameBlockFixture(NEWCOMER)), rank: null });
  });

  test('la Flamme paraît quand elle brûle, et seulement alors', () => {
    const lit = playerBannerModel(gameBlockFixture({ ...NEWCOMER, streak: 23, lastActiveDay: '2026-10-05' }));
    expect(lit.flame?.days).toBe(23);
    const out = playerBannerModel(gameBlockFixture({ ...NEWCOMER, streak: 0, broken: { streak: 6, lastActiveDay: '2026-10-03' } }));
    expect(out.flame).toBeNull();
  });

  test('la ligue paraît avec le consentement et un groupe : sa gemme et la place', () => {
    const model = playerBannerModel(gameBlockWithExtrasFixture());
    expect(model.league?.league).toBe('jade');
    expect(model.league?.place).toBeGreaterThanOrEqual(1);
  });

  test('sans consentement, aucune ligue — même avec un groupe', () => {
    const model = playerBannerModel(gameBlockWithExtrasFixture({}, { league: { ...gameBlockWithExtrasLeague(), consented: false } }));
    expect(model.league).toBeNull();
  });

  test('au sommet, plus de niveau suivant ni de points manquants', () => {
    const top = playerBannerModel(gameBlockFixture({ ...NEWCOMER, score: 50_000_000, debitablePoints: 50_000_000 }));
    expect(top.level).toBe(100);
    expect({ nextLevel: top.nextLevel, pointsToNext: top.pointsToNext }).toEqual({ nextLevel: null, pointsToNext: null });
  });
});

describe('ce que lit le lecteur d’écran — une phrase complète', () => {
  test('fr : le nouveau joueur, son niveau, son palier et sa marche vers le suivant', () => {
    const model = playerBannerModel(gameBlockFixture(NEWCOMER));
    expect(playerBannerLabel(model, 'fr')).toMatch(/^Niveau \d+, Étincelle, \d+ % vers le \d+$/);
  });

  test('fr : tout ce qui existe, dans l’ordre de la bannière', () => {
    const model = playerBannerModel(gameBlockWithExtrasFixture({ balance: 12, streak: 23, glory: 620 }));
    expect(playerBannerLabel(model, 'fr')).toMatch(/^Niveau \d+, \p{L}+, \d+ % vers le \d+, 12 Meeshes, [\p{L} ]+, ligue Jade \d+(re|e), Flamme 23 jours$/u);
  });

  test('en : l’ordinal anglais de la place', () => {
    const model = playerBannerModel(gameBlockWithExtrasFixture({ balance: 12, streak: 23 }));
    expect(playerBannerLabel(model, 'en')).toMatch(/^Level \d+, .*, Jade league \d+(st|nd|rd|th), Flame 23 days$/);
  });

  test('aucune langue ne laisse une clé nue, un paramètre en clair ou un « undefined »', () => {
    const model = playerBannerModel(gameBlockWithExtrasFixture({ balance: 12, streak: 23 }));
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const label = playerBannerLabel(model, language);
      expect({ language, defect: /game\.|\{\w+\}|undefined|NaN/.test(label) }).toEqual({ language, defect: false });
    }
  });
});

function gameBlockWithExtrasLeague() {
  return gameExtrasFactsFixture().league;
}
