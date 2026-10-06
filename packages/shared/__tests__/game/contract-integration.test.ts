/**
 * LE CONTRAT D'INTÉGRATION DU JEU (#9489, #9481, #9490) — ce que les clients
 * lisaient en tolérant ou gardaient en mémoire est désormais DÉCLARÉ :
 *  - les raretés mesurées des succès, dans le bloc `game` ;
 *  - la lecture des réglages du jeu (`GET /me/game/privacy`) ;
 *  - le profil de jeu d'un AUTRE membre (`GET /users/:userId/game`) ;
 *  - la préférence serveur des notifications du jeu.
 * Tout est ADDITIF et OPTIONNEL : un ancien serveur ne le sert pas, un ancien
 * client ignore les clés qu'il ne connaît pas.
 */

import { describe, it, expect } from 'vitest';
import { GAME_INTEGRATION_ROUTES, GAME_INTEGRATION_ROUTE_METHODS, GAME_ROUTES, GAME_ROUTE_METHODS, gameUserGamePath } from '../../types/game-routes.js';
import {
  gameAchievementRaritiesSchema,
  gameBlockSchema,
  gameSettingsResponseSchema,
  parseGameBlock,
  userGameProfileResponseSchema,
} from '../../types/game.js';
import { buildGameBlock } from '../../utils/game/game-block.js';
import { drawDailyMissions } from '../../utils/game/missions.js';
import type { GameBlockFacts } from '../../utils/game/game-block.js';

const baseFacts = (): GameBlockFacts => ({
  userId: 'me',
  today: '2026-10-14',
  score: 12_180,
  levelRecord: 36,
  prestige: 0,
  glory: 2000,
  mythic: false,
  mintedLifetime: 12,
  debitablePoints: 12_180,
  balance: 14,
  streak: 12,
  lastActiveDay: '2026-10-14',
  broken: null,
  freezes: 1,
  lastRelightDay: null,
  missions: drawDailyMissions({ userId: 'me', dayKey: '2026-10-14', level: 34, flameDays: 12, treasury: 14 }).missions.map((m, i) => ({
    ...m,
    id: `64b7f0c2a1b2c3d4e5f6a7b${i}`,
    progress: 0,
    completedAt: null,
  })),
  rerollsUsedToday: 0,
  chestClaimed: false,
  chestReward: null,
  guideSeen: [],
});

describe('les raretés des succès dans le bloc game', () => {
  const rarities = {
    'achievement.first_content': { rarity: 'common', holders: 900, population: 1000 },
    'achievement.rare_one': { rarity: 'legendary', holders: 20, population: 1000 },
  };

  it('se lisent à côté des sept extensions, entrée par entrée', () => {
    const parsed = parseGameBlock({ ...buildGameBlock(baseFacts()), achievementRarities: rarities });
    expect(parsed?.achievementRarities).toEqual(rarities);
  });

  it('restent absentes d’un serveur antérieur : le bloc est lu sans elles', () => {
    expect(parseGameBlock(buildGameBlock(baseFacts()))?.achievementRarities).toBeUndefined();
  });

  it('tombent SEULES quand elles sont illisibles — le bloc survit', () => {
    const parsed = parseGameBlock({ ...buildGameBlock(baseFacts()), achievementRarities: { a: { rarity: 'divine', holders: 1, population: 1 } } });
    expect(parsed).not.toBeNull();
    expect(parsed?.achievementRarities).toBeUndefined();
  });

  it('ne servent JAMAIS une rareté nulle : sous le seuil, l’entrée est absente (fail-closed)', () => {
    expect(gameAchievementRaritiesSchema.safeParse({ a: { rarity: null, holders: 3, population: 1000 } }).success).toBe(false);
  });

  it('sont ignorées d’un ANCIEN client, qui ne connaît pas la clé', () => {
    const old = gameBlockSchema.omit({ achievementRarities: true });
    const parsed = old.safeParse({ ...buildGameBlock(baseFacts()), achievementRarities: rarities });
    expect(parsed.success).toBe(true);
    expect(parsed.data && Object.keys(parsed.data)).not.toContain('achievementRarities');
  });
});

describe('la table d\'intégration', () => {
  it('est À PART : GAME_ROUTES garde ses 21 entrées, comparées par les miroirs hors TypeScript', () => {
    expect(Object.keys(GAME_ROUTES)).toHaveLength(21);
    expect(Object.keys(GAME_INTEGRATION_ROUTES)).toEqual(['settings', 'userGame']);
    expect(Object.keys(GAME_ROUTES)).not.toContain('settings');
    expect(Object.keys(GAME_ROUTES)).not.toContain('userGame');
  });
});

describe('la lecture des réglages du jeu', () => {
  it('a sa propre clé de route, sur le chemin de l’écriture, en lecture', () => {
    expect(GAME_INTEGRATION_ROUTES.settings).toBe('/me/game/privacy');
    expect(GAME_INTEGRATION_ROUTES.settings).toBe(GAME_ROUTES.privacy);
    expect(GAME_INTEGRATION_ROUTE_METHODS.settings).toBe('GET');
    expect(GAME_ROUTE_METHODS.privacy).toBe('PUT');
  });

  it('porte les deux interrupteurs et les quatre visibilités', () => {
    const settings = {
      gameHidden: false,
      friendsLeagueOptOut: true,
      visibility: { showcase: 'friends', rank: 'friends', treasury: 'me', atlas: 'me' },
    };
    expect(gameSettingsResponseSchema.parse(settings)).toEqual(settings);
  });

  it('refuse une visibilité inconnue', () => {
    expect(
      gameSettingsResponseSchema.safeParse({ gameHidden: false, friendsLeagueOptOut: false, visibility: { showcase: 'all', rank: 'x', treasury: 'me', atlas: 'me' } }).success,
    ).toBe(false);
  });
});

describe('le profil de jeu d’un autre membre', () => {
  it('a sa route : GET /users/:userId/game', () => {
    expect(GAME_INTEGRATION_ROUTES.userGame).toBe('/users/:userId/game');
    expect(GAME_INTEGRATION_ROUTE_METHODS.userGame).toBe('GET');
    expect(gameUserGamePath('u9')).toBe('/users/u9/game');
  });

  it('dit une fermeture par `visible: false` et deux blocs nuls — jamais une erreur', () => {
    const closed = { visible: false, standing: null, treasury: null };
    expect(userGameProfileResponseSchema.parse(closed)).toEqual(closed);
  });

  it('sert le niveau, le palier, le rang, les étoiles et la forme de la Flamme — jamais un compte exact', () => {
    const open = {
      visible: true,
      standing: { level: 34, tier: 'rayon', prestige: 2, flame: 'brasier', rank: 'conteur', division: 2 },
      treasury: { tier: 'coffret' },
    };
    expect(userGameProfileResponseSchema.parse(open)).toEqual(open);
  });

  it('sert aux AMIS ses points et le nombre de ses trophées, en plus du reste (#9541) — optionnels, un ancien serveur n\'en sert pas', () => {
    const friend = {
      visible: true,
      standing: { level: 34, tier: 'rayon', prestige: 2, flame: 'brasier', rank: 'legende', division: 1, points: 12_180, trophyCount: 14 },
      treasury: null,
    };
    expect(userGameProfileResponseSchema.parse(friend)).toEqual(friend);
    const old = { visible: true, standing: { level: 34, tier: 'rayon', prestige: 2, flame: null, rank: 'conteur', division: 2 }, treasury: null };
    expect(userGameProfileResponseSchema.parse(old)).toEqual(old);
    expect(userGameProfileResponseSchema.safeParse({ ...friend, standing: { ...friend.standing, points: -1 } }).success).toBe(false);
  });

  it('retire, par construction, tout champ que le contrat ne déclare pas', () => {
    const leaky = {
      visible: true,
      standing: { level: 3, tier: 'etincelle', prestige: 0, flame: null, rank: 'murmure', division: 3, glory: 4321, streak: 12 },
      treasury: { tier: null, held: 77 },
    };
    const parsed = userGameProfileResponseSchema.parse(leaky);
    expect(parsed.standing).not.toHaveProperty('glory');
    expect(parsed.standing).not.toHaveProperty('streak');
    expect(parsed.treasury).not.toHaveProperty('held');
  });

  it('Mythe n’a pas de division', () => {
    const mythe = { visible: true, standing: { level: 100, tier: 'galaxie', prestige: 5, flame: 'soleil', rank: 'mythe', division: null }, treasury: null };
    expect(userGameProfileResponseSchema.safeParse(mythe).success).toBe(true);
  });
});
