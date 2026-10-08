import { beforeAll, describe, expect, test } from 'bun:test';

import type { GameBlockFacts } from '@meeshy/shared/utils/game/game-block';

import { gameBlockFixture, gameBlockWithExtrasFixture, gameExtrasFactsFixture } from '@/lib/api/game-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { isLargeText, playerBannerLabel, playerBannerModel } from './player-banner';

/**
 * LA BANNIÈRE DU JOUEUR (#9494) — SEULEMENT CE QUI EXISTE. Le modèle ne pose
 * un élément que quand sa donnée existe : jamais un zéro, un tiret ou une case
 * vide. Un nouveau joueur n'a que son anneau et sa jauge.
 */
beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});

/** Un joueur qui n'a que ses premiers points : niveau 3 (le niveau 1 tient jusqu'à ~50 points). */
const NEWCOMER: Partial<GameBlockFacts> = {
  score: 100,
  glory: 0,
  balance: 0,
  mintedLifetime: 0,
  streak: 0,
  freezes: 0,
  lastActiveDay: null,
  debitablePoints: 100,
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

  test('au sommet, plus de niveau suivant ni de points manquants', () => {
    const top = shown({ ...NEWCOMER, score: 50_000_000, debitablePoints: 50_000_000 });
    expect(top.level?.level).toBe(100);
    expect({ nextLevel: top.level?.nextLevel, pointsToNext: top.level?.pointsToNext }).toEqual({ nextLevel: null, pointsToNext: null });
  });
});

describe('ce que lit le lecteur d’écran — une phrase complète', () => {
  test('fr : le nouveau joueur, son niveau, son palier et sa marche vers le suivant', () => {
    const model = shown(NEWCOMER);
    expect(playerBannerLabel(model, 'fr')).toMatch(/^Niveau \d+, Étincelle, \d+ % vers le \d+$/);
  });

  test('fr : au niveau 1, le total de points est dit — il n’y a pas de niveau à lire', () => {
    const model = shown({ ...ZERO, score: 12, debitablePoints: 12 });
    expect(playerBannerLabel(model, 'fr')).toMatch(/^12 points$/);
  });

  test('fr : tout ce qui existe, dans l’ordre de la bannière', () => {
    const model = shownExtras({ balance: 12, streak: 23, glory: 620 });
    expect(playerBannerLabel(model, 'fr')).toMatch(/^Niveau \d+, \p{L}+, \d+ % vers le \d+, 12 Meeshes, [\p{L} ]+, ligue Jade \d+(re|e), Flamme 23 jours$/u);
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
    expect(playerBannerLabel(model, 'en')).toMatch(/^Level \d+, .*, Jade league \d+(st|nd|rd|th), Flame 23 days$/);
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
