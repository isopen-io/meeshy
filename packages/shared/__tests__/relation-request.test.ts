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
