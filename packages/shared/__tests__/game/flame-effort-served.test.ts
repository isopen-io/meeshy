/**
 * Le rallumage par l'effort se DIT (#20471, tranche 2 de #17371) : le bloc `flame` porte, tant que la Flamme éteinte
 * peut encore se rallumer par deux rêves complets, combien en manquent et jusqu'à quand.
 */

import { describe, it, expect } from 'vitest';
import { servedEffortRelight } from '../../utils/game/flame-effort';
import { buildGameBlock, type GameBlockFacts } from '../../utils/game/game-block';
import { parseEffortRelight, parseGameBlock } from '../../types/game';

const broken = { brokenLastDay: '2026-10-02', streakBeforeBreak: 12 };

describe('servedEffortRelight — ce que le bloc dit du rallumage par l’effort', () => {
  it('le premier jour de la fenêtre : deux rêves manquent, il reste demain', () => {
    expect(servedEffortRelight({ ...broken, today: '2026-10-04', dreamDays: [] })).toEqual({
      dreamsDone: 0,
      dreamsNeeded: 2,
      closesOn: '2026-10-05',
      daysLeft: 1,
    });
  });

  it('le dernier jour de la fenêtre : il reste aujourd’hui', () => {
    expect(servedEffortRelight({ ...broken, today: '2026-10-05', dreamDays: ['2026-10-04'] })).toEqual({
      dreamsDone: 1,
      dreamsNeeded: 2,
      closesOn: '2026-10-05',
      daysLeft: 0,
    });
  });

  it('se tait quand la Flamme n’est pas éteinte, sans série, la fenêtre fermée ou le rallumage déjà gagné', () => {
    expect(servedEffortRelight({ ...broken, today: '2026-10-03', dreamDays: [] })).toBeNull();
    expect(servedEffortRelight({ brokenLastDay: null, streakBeforeBreak: 0, today: '2026-10-04', dreamDays: [] })).toBeNull();
    expect(servedEffortRelight({ ...broken, today: '2026-10-06', dreamDays: [] })).toBeNull();
    expect(servedEffortRelight({ ...broken, today: '2026-10-05', dreamDays: ['2026-10-04', '2026-10-05'] })).toBeNull();
  });
});

const facts = (over: Partial<GameBlockFacts> = {}): GameBlockFacts => ({
  userId: 'u1',
  today: '2026-10-04',
  score: 1_000,
  levelRecord: 8,
  prestige: 0,
  glory: 0,
  mythic: false,
  mintedLifetime: 0,
  missionsDone: 3,
  flameRecord: 12,
  debitablePoints: 1_000,
  balance: 0,
  streak: 12,
  lastActiveDay: '2026-10-02',
  broken: { streak: 12, lastActiveDay: '2026-10-02' },
  freezes: 0,
  lastRelightDay: null,
  missions: [],
  rerollsUsedToday: 0,
  chestClaimed: false,
  chestReward: null,
  guideSeen: [],
  ...over,
});

describe('le bloc `flame` porte le rallumage par l’effort', () => {
  it('le sert, validé par le contrat, quand la passerelle a lu les rêves d’après la rupture', () => {
    const block = buildGameBlock(facts({ effortDreamDays: ['2026-10-03'] }));
    expect(block.flame.status).toBe('out');
    expect(parseGameBlock(block)?.flame.effortRelight).toEqual({ dreamsDone: 1, dreamsNeeded: 2, closesOn: '2026-10-05', daysLeft: 1 });
  });

  it('ne compte que les rêves d’après la rupture, et la journée de la Flamme', () => {
    const block = buildGameBlock(facts({ today: '2026-10-05', flameToday: '2026-10-04', effortDreamDays: ['2026-10-02', '2026-10-04'] }));
    expect(block.flame.effortRelight).toEqual({ dreamsDone: 1, dreamsNeeded: 2, closesOn: '2026-10-05', daysLeft: 1 });
  });

  it('ne part pas quand la passerelle ne l’a pas lu (serveur antérieur), ni quand rien n’est à rallumer', () => {
    expect('effortRelight' in buildGameBlock(facts()).flame).toBe(false);
    expect('effortRelight' in buildGameBlock(facts({ broken: null, lastActiveDay: '2026-10-04', effortDreamDays: [] })).flame).toBe(false);
  });
});

describe('parseEffortRelight — un client lit le champ sans croire une forme fausse', () => {
  it('rend le champ servi', () => {
    expect(parseEffortRelight({ dreamsDone: 1, dreamsNeeded: 2, closesOn: '2026-10-05', daysLeft: 0 })).toEqual({
      dreamsDone: 1,
      dreamsNeeded: 2,
      closesOn: '2026-10-05',
      daysLeft: 0,
    });
  });

  it('rend `null` devant un serveur antérieur ou une forme illisible', () => {
    expect(parseEffortRelight(undefined)).toBeNull();
    expect(parseEffortRelight({ dreamsDone: 'un', dreamsNeeded: 2, closesOn: '2026-10-05', daysLeft: 0 })).toBeNull();
  });

  it('une forme illisible tombe seule, sans emporter le bloc', () => {
    const block = buildGameBlock(facts());
    const served = parseGameBlock({ ...block, flame: { ...block.flame, effortRelight: { dreamsDone: -1 } } });
    expect(served).not.toBeNull();
    expect(served?.flame.effortRelight).toBeUndefined();
  });
});
