/**
 * LE CONTRAT D'API DES ÉTINCELLES (#10846, #10847, #10848, #10892) — tout est ADDITIF et OPTIONNEL.
 *
 * Un serveur d'avant ne sert pas ces champs, un client publié ignore ceux qu'il ne connaît pas :
 * le bloc `game` d'hier se lit toujours, le bloc d'aujourd'hui se lit en plus.
 */

import { describe, it, expect } from 'vitest';
import { gameBlockSchema, parseGameBlock, userGameProfileResponseSchema, GAME_ERROR_CODES } from '../../types/game.js';
import { buildGameBlock, type GameBlockFacts } from '../../utils/game/game-block.js';
import { drawDailyMissions } from '../../utils/game/missions.js';
import { levelThreshold } from '../../utils/game/levels.js';
import { gloryLadder } from '../../utils/game/glory.js';

const missions = (level: number) =>
  drawDailyMissions({ userId: 'u1', dayKey: '2026-10-16', level, flameDays: 10, treasury: 0 }).missions.map((m, i) => ({
    ...m,
    id: `64b7f0c2a1b2c3d4e5f6a7b${i}`,
    progress: 0,
    completedAt: null,
  }));

const facts = (over: Partial<GameBlockFacts> = {}): GameBlockFacts => ({
  userId: 'u1',
  today: '2026-10-16',
  score: 500,
  levelRecord: 36,
  prestige: 0,
  glory: 2000,
  mythic: false,
  mintedLifetime: 12,
  missionsDone: 3,
  flameRecord: 23,
  debitablePoints: 500,
  balance: 9,
  streak: 10,
  lastActiveDay: '2026-10-16',
  broken: null,
  freezes: 0,
  lastRelightDay: null,
  missions: missions(34),
  rerollsUsedToday: 0,
  chestClaimed: false,
  chestReward: null,
  guideSeen: [],
  ...over,
});

const SPARKS = { pocket: levelThreshold(34) + 10, cycle: levelThreshold(50), lifetime: 9_000_000_000, debt: 0 };

describe('le bloc game sert les étincelles à côté de l\'ancien score', () => {
  const block = buildGameBlock(facts({ sparks: SPARKS, levelMaxLifetime: 52 }));

  it('se valide contre le schéma partagé', () => {
    expect(gameBlockSchema.safeParse(block).success).toBe(true);
    expect(parseGameBlock(block)).not.toBeNull();
  });

  it('level : la poche, le cycle, le total à vie (au-delà d\'un Int32) et le niveau max à vie', () => {
    expect(block.level.sparks).toBe(SPARKS.pocket);
    expect(block.level.sparksCycle).toBe(SPARKS.cycle);
    expect(block.level.sparksLifetime).toBe(9_000_000_000);
    expect(block.level.levelMaxLifetime).toBe(52);
    expect(block.level.ladder?.levelMaxLifetime).toBe(52);
  });

  it('le NIVEAU se lit sur la poche (#10892) : un cumul plus haut ne le relève pas', () => {
    expect(block.level.level).toBe(34);
    expect(block.level.score).toBe(SPARKS.pocket);
    expect(block.level.ladder?.level).toBe(34);
  });

  it('le niveau max à vie ne peut pas être sous le niveau courant ni sous le record du cycle', () => {
    const low = buildGameBlock(facts({ sparks: SPARKS, levelMaxLifetime: 3 }));
    expect(low.level.levelMaxLifetime).toBe(36);
    const absent = buildGameBlock(facts({ sparks: SPARKS }));
    expect(absent.level.levelMaxLifetime).toBe(36);
  });

  it('mint : le prix effectif suit le niveau ACTUEL, avec le prix de rang, le facteur et le niveau lu', () => {
    expect(block.mint.basePrice).toBe(1587);
    expect(block.mint.costLevel).toBe(34);
    expect(block.mint.costFactor).toBe(0.67);
    expect(block.mint.price).toBe(Math.round((1587 * 670) / 1000));
    expect(block.mint.number).toBe(13);
    expect(block.mint.levelAfter).toBe(33);
    expect(block.mint.levelsLost).toBe(1);
  });

  it('mint : canMint se lit sur la poche — vide, il manque ce qui manque', () => {
    expect(block.mint.canMint).toBe(true);
    const poor = buildGameBlock(facts({ sparks: { ...SPARKS, pocket: 500 } }));
    expect(poor.mint.canMint).toBe(false);
    expect(poor.mint.missingPoints).toBe(poor.mint.price - 500);
  });

  it('treasury : chaque réserve dit son état et le rang requis', () => {
    expect(block.treasury.access?.map((a) => a.key)).toEqual(['bourse', 'escarcelle', 'coffret', 'coffre', 'tresor', 'reserve']);
    expect(block.treasury.access?.find((a) => a.key === 'bourse')).toMatchObject({ locked: false, requires: null });
    expect(block.treasury.access?.find((a) => a.key === 'coffre')).toMatchObject({
      locked: true,
      requires: { rank: 'voix', division: 1, division5: 1 },
    });
  });

  it('la dette est servie dans level et mint, et bloque la frappe', () => {
    const indebted = buildGameBlock(facts({ sparks: { ...SPARKS, pocket: 50_000, debt: 300 } }));
    expect(indebted.level.sparksDebt).toBe(300);
    expect(indebted.mint).toMatchObject({ canMint: false, blockedBy: 'debt', sparksDebt: 300, missingPoints: 0 });
    expect(gameBlockSchema.safeParse(indebted).success).toBe(true);
    expect(block.level.sparksDebt).toBe(0);
    expect(block.mint.blockedBy).toBeNull();
  });

  it('mint : une pièce qui entre dans une réserve fermée est annoncée verrouillée, sans manque de points', () => {
    const locked = buildGameBlock(facts({ sparks: { ...SPARKS, pocket: 99_999 }, balance: 99 }));
    expect(locked.mint.canMint).toBe(false);
    expect(locked.mint.missingPoints).toBe(0);
    expect(locked.mint.locked).toMatchObject({ tier: 'coffre', requires: { rank: 'voix', division5: 1 } });
    const voixI = gloryLadder().find((s) => s.rank === 'voix' && s.division5 === 1)!;
    const open = buildGameBlock(facts({ sparks: { ...SPARKS, pocket: 99_999 }, balance: 99, glory: voixI.minGlory }));
    expect(open.mint.canMint).toBe(true);
    expect(open.mint.locked).toBeNull();
  });

  it('le Vent arrière ne souffle pas à 2 niveaux du record, il souffle à 7 ou plus (#10896)', () => {
    expect(block.boosts.tailwind).toBe(1);
    const fallen = buildGameBlock(facts({ sparks: { ...SPARKS, pocket: levelThreshold(29) }, levelRecord: 36 }));
    expect(fallen.level.ladder?.level).toBe(29);
    expect(fallen.boosts.tailwind).toBe(1.25);
  });

  it('après un prestige (cycle vide, niveau max à vie conservé) : niveau 1, tarif réduit, max à vie intact', () => {
    const after = buildGameBlock(
      facts({ sparks: { pocket: 0, cycle: 0, lifetime: 2_000_000, debt: 0 }, levelRecord: 1, prestige: 1, levelMaxLifetime: 100 }),
    );
    expect(after.level.level).toBe(1);
    expect(after.level.sparksLifetime).toBe(2_000_000);
    expect(after.level.levelMaxLifetime).toBe(100);
    expect(after.mint.costLevel).toBe(1);
    expect(after.mint.costFactor).toBe(0.505);
    expect(after.boosts.tailwind).toBe(1);
  });
});

describe('ADDITIF : sans étincelles, le bloc garde exactement la forme d\'hier', () => {
  const legacy = buildGameBlock(facts({ score: levelThreshold(34), debitablePoints: levelThreshold(34) }));

  it('aucun champ neuf n\'apparaît', () => {
    expect(legacy.level).not.toHaveProperty('sparks');
    expect(legacy.level).not.toHaveProperty('sparksLifetime');
    expect(legacy.level).not.toHaveProperty('levelMaxLifetime');
    expect(legacy.level.ladder).not.toHaveProperty('levelMaxLifetime');
    expect(legacy.mint).not.toHaveProperty('costFactor');
    expect(legacy.treasury).not.toHaveProperty('access');
  });

  it('un bloc SANS les champs neufs (serveur antérieur) se lit toujours', () => {
    expect(gameBlockSchema.safeParse(legacy).success).toBe(true);
  });

  it('un bloc AVEC les champs neufs se lit encore avec le schéma d\'avant (les clés inconnues sont ignorées)', () => {
    const wire = JSON.parse(JSON.stringify(buildGameBlock(facts({ sparks: SPARKS, levelMaxLifetime: 52 }))));
    expect(gameBlockSchema.safeParse(wire).success).toBe(true);
    delete wire.level.sparks;
    delete wire.mint.costFactor;
    delete wire.treasury.access;
    expect(gameBlockSchema.safeParse(wire).success).toBe(true);
  });

  it('un bloc sans étincelles sert quand même un niveau borné à 100 pour les clients publiés', () => {
    const big = buildGameBlock(facts({ sparks: { pocket: levelThreshold(640), cycle: levelThreshold(640), lifetime: levelThreshold(640), debt: 0 }, glory: 130_000, missionsDone: 10, flameRecord: 30 }));
    expect(big.level.level).toBe(100);
    expect(big.level.ladder?.level).toBe(640);
    expect(big.level.sparks).toBe(levelThreshold(640));
  });
});

describe('le profil de jeu d\'un autre membre (GET /users/:id/game)', () => {
  const standing = {
    level: 3,
    tier: 'etincelle',
    prestige: 0,
    flame: null,
    rank: 'murmure',
    division: 3,
  } as const;

  it('un standing d\'avant se lit toujours', () => {
    expect(userGameProfileResponseSchema.safeParse({ visible: true, standing, treasury: null }).success).toBe(true);
  });

  it('sert les étincelles et le niveau max à vie, tous optionnels', () => {
    const parsed = userGameProfileResponseSchema.safeParse({
      visible: true,
      standing: {
        ...standing,
        points: 800,
        sparks: 800,
        sparksLifetime: 9_000_000_000,
        levelMaxLifetime: 52,
        ladder: { level: 3, tier: 'etincelle', levelMaxLifetime: 52 },
      },
      treasury: { tier: 'bourse' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.standing?.sparks).toBe(800);
      expect(parsed.data.standing?.sparksLifetime).toBe(9_000_000_000);
      expect(parsed.data.standing?.levelMaxLifetime).toBe(52);
    }
  });
});

describe('le refus typé de la frappe', () => {
  it('a son propre code, jamais un code réemployé', () => {
    expect(GAME_ERROR_CODES.treasuryLocked).toBe('TREASURY_LOCKED');
    const codes = Object.values(GAME_ERROR_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
