import { describe, it, expect } from 'vitest';
import { SERVER_EVENTS } from '../types/socketio-events';
import { parseRequestLevel, relationRungAfter } from '../types/relation';
import { evaluateRelationRequest } from '../utils/relation-request';

const NOW = new Date('2026-10-31T12:00:00Z');
const DAY = 86_400_000;

const request = (overrides: Partial<Parameters<typeof evaluateRelationRequest>[0]> = {}) =>
  evaluateRelationRequest({
    targetLevel: 'FRIEND',
    currentLevel: 'ACQUAINTANCE',
    eligibleFor: null,
    cooldownUntil: null,
    now: NOW,
    ...overrides,
  });

describe('rel-demandes — l’échelle des crans', () => {
  it('chaque niveau n’ouvre que le cran suivant', () => {
    expect(relationRungAfter('PUBLIC')).toBe('ACQUAINTANCE');
    expect(relationRungAfter('COMMUNITY')).toBe('ACQUAINTANCE');
    expect(relationRungAfter('ACQUAINTANCE')).toBe('FRIEND');
    expect(relationRungAfter('FRIEND')).toBe('CLOSE');
    expect(relationRungAfter('CLOSE')).toBe('BLOOD');
    expect(relationRungAfter('BLOOD')).toBeNull();
  });

  it('seuls Connaissance, Ami, Proche et Sang se demandent — jamais Public, Communauté ni Atome', () => {
    expect(parseRequestLevel('ACQUAINTANCE')).toBe('ACQUAINTANCE');
    expect(parseRequestLevel('BLOOD')).toBe('BLOOD');
    expect(parseRequestLevel('PUBLIC')).toBeNull();
    expect(parseRequestLevel('COMMUNITY')).toBeNull();
    expect(parseRequestLevel('ATOM')).toBeNull();
    expect(parseRequestLevel('close')).toBeNull();
    expect(parseRequestLevel(undefined)).toBeNull();
  });
});

describe('rel-demandes — la loi d’une demande', () => {
  it('accepte le cran suivant quand rien ne s’y oppose', () => {
    expect(request()).toEqual({ allowed: true });
  });

  it('refuse un saut de niveau : Connaissance -> Proche', () => {
    expect(request({ targetLevel: 'CLOSE' })).toEqual({ allowed: false, code: 'RELATION_PHASE_SKIP' });
  });

  it('refuse de redemander un niveau déjà atteint ou de redescendre par une demande', () => {
    expect(request({ targetLevel: 'ACQUAINTANCE' })).toEqual({ allowed: false, code: 'RELATION_PHASE_SKIP' });
    expect(request({ targetLevel: 'FRIEND', currentLevel: 'FRIEND' })).toEqual({ allowed: false, code: 'RELATION_PHASE_SKIP' });
  });

  it('Public -> Ami est un saut : l’ancien « demande d’ami » sans niveau n’échappe plus à la loi', () => {
    expect(request({ currentLevel: 'PUBLIC' })).toEqual({ allowed: false, code: 'RELATION_PHASE_SKIP' });
    expect(request({ currentLevel: 'PUBLIC', targetLevel: 'ACQUAINTANCE' })).toEqual({ allowed: true });
  });

  it('Proche exige l’éligibilité Proche, Sang l’éligibilité Sang', () => {
    expect(request({ currentLevel: 'FRIEND', targetLevel: 'CLOSE' })).toEqual({ allowed: false, code: 'RELATION_NOT_ELIGIBLE' });
    expect(request({ currentLevel: 'FRIEND', targetLevel: 'CLOSE', eligibleFor: 'CLOSE' })).toEqual({ allowed: true });
    expect(request({ currentLevel: 'CLOSE', targetLevel: 'BLOOD', eligibleFor: 'CLOSE' })).toEqual({ allowed: false, code: 'RELATION_NOT_ELIGIBLE' });
    expect(request({ currentLevel: 'CLOSE', targetLevel: 'BLOOD', eligibleFor: 'BLOOD' })).toEqual({ allowed: true });
  });

  it('un cool-down en cours refuse la demande, un cool-down échu ou égal à maintenant la laisse passer', () => {
    expect(request({ cooldownUntil: new Date(NOW.getTime() + DAY) })).toEqual({ allowed: false, code: 'RELATION_COOLDOWN' });
    expect(request({ cooldownUntil: NOW })).toEqual({ allowed: true });
    expect(request({ cooldownUntil: new Date(NOW.getTime() - DAY) })).toEqual({ allowed: true });
  });

  it('le saut se dit avant le cool-down, le cool-down avant l’éligibilité', () => {
    const future = new Date(NOW.getTime() + DAY);
    expect(request({ targetLevel: 'CLOSE', cooldownUntil: future })).toEqual({ allowed: false, code: 'RELATION_PHASE_SKIP' });
    expect(request({ currentLevel: 'FRIEND', targetLevel: 'CLOSE', cooldownUntil: future })).toEqual({ allowed: false, code: 'RELATION_COOLDOWN' });
  });
});

describe('rel-demandes — les événements du lien', () => {
  it('quatre noms entity:action-word, à tirets, côté serveur', () => {
    expect(SERVER_EVENTS.RELATION_LEVEL_RAISED).toBe('relation:level-raised');
    expect(SERVER_EVENTS.RELATION_RITUAL_STARTED).toBe('relation:ritual-started');
    expect(SERVER_EVENTS.RELATION_RITUAL_PROGRESS).toBe('relation:ritual-progress');
    expect(SERVER_EVENTS.RELATION_RITUAL_COMPLETED).toBe('relation:ritual-completed');
  });

  it('aucun événement de baisse n’existe', () => {
    const names = Object.values(SERVER_EVENTS).filter((name) => name.startsWith('relation:'));
    expect(names.filter((name) => /lower|drop|down|exit|left/.test(name))).toEqual([]);
  });
});

describe('rel-demandes — rompre une demande acceptée', () => {
  it('Proche et Sang retombent d’un cran, Ami et Connaissance quittent le cercle', async () => {
    const { relationLevelBelow } = await import('../types/relation');
    expect(relationLevelBelow('BLOOD')).toBe('CLOSE');
    expect(relationLevelBelow('CLOSE')).toBe('FRIEND');
    expect(relationLevelBelow('FRIEND')).toBe('PUBLIC');
    expect(relationLevelBelow('ACQUAINTANCE')).toBe('PUBLIC');
  });

  it('une demande retient le lien si elle vise le même cran ou un cran au-dessus', async () => {
    const { requestLevelSustains } = await import('../types/relation');
    expect(requestLevelSustains('FRIEND', 'FRIEND')).toBe(true);
    expect(requestLevelSustains('CLOSE', 'FRIEND')).toBe(true);
    expect(requestLevelSustains('ACQUAINTANCE', 'FRIEND')).toBe(false);
  });
});

describe('rel-demandes — depuis quand le lien est à son niveau', () => {
  const at = (day: number) => new Date(Date.UTC(2026, 8, day));

  it('lit la date de MONTÉE, jamais celle d’une baisse suivie d’une remontée', async () => {
    const { relationEntryDate } = await import('../types/relation');
    const transitions = [
      { actorId: 'a', from: 'PUBLIC', to: 'FRIEND', at: at(1) },
      { actorId: 'b', from: 'PUBLIC', to: 'FRIEND', at: at(2) },
      { actorId: 'a', from: 'FRIEND', to: 'ACQUAINTANCE', at: at(10) },
      { actorId: 'a', from: 'ACQUAINTANCE', to: 'FRIEND', at: at(20) },
    ] as const;

    expect(relationEntryDate(transitions.map((t) => ({ ...t })), 'FRIEND')).toEqual(at(2));
  });

  it('attend le plus tardif des deux : le niveau effectif n’est atteint que quand les deux y sont', async () => {
    const { relationEntryDate } = await import('../types/relation');
    const transitions = [
      { actorId: 'a', from: 'PUBLIC' as const, to: 'CLOSE' as const, at: at(3) },
      { actorId: 'b', from: 'PUBLIC' as const, to: 'CLOSE' as const, at: at(9) },
    ];

    expect(relationEntryDate(transitions, 'CLOSE')).toEqual(at(9));
  });

  it('ne dit rien quand l’historique ne dit rien', async () => {
    const { relationEntryDate } = await import('../types/relation');
    expect(relationEntryDate([], 'FRIEND')).toBeNull();
  });
});

describe('rel-demandes — les cas partagés avec les miroirs Swift et Kotlin', () => {
  it('rejoue packages/shared/fixtures/relation-request-cases.json à l’identique', async () => {
    const cases = (await import('../fixtures/relation-request-cases.json')).default as Array<{
      id: string;
      input: { targetLevel: 'ACQUAINTANCE' | 'FRIEND' | 'CLOSE' | 'BLOOD'; currentLevel: Parameters<typeof relationRungAfter>[0]; eligibleFor: 'CLOSE' | 'BLOOD' | null; cooldownUntil: string | null; now: string };
      expected: unknown;
    }>;

    expect(cases.length).toBeGreaterThanOrEqual(16);
    cases.forEach(({ id, input, expected }) => {
      const verdict = evaluateRelationRequest({
        ...input,
        cooldownUntil: input.cooldownUntil === null ? null : new Date(input.cooldownUntil),
        now: new Date(input.now),
      });
      expect({ id, verdict }).toEqual({ id, verdict: expected });
    });
  });
});
