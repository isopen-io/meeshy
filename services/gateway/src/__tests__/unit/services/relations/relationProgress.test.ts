/**
 * LE PROGRÈS D'UN LIEN (#13932) : la série hebdomadaire et la Connaissance, lues
 * d'UN seul balayage de l'agrégat. L'éligibilité PERMET, elle n'élève jamais.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { loadRelationProgress } from '../../../../services/relations/relationProgress';
import { pairInteractionStore } from '../../../helpers/pair-interaction-store';

const LOW = '5f0000000000000000000001';
const HIGH = '5f0000000000000000000002';
const NOW = new Date('2026-10-31T10:00:00Z'); // samedi, W44

const weekRow = (daysAgo: number) => ({
  id: `dd${String(daysAgo).padStart(22, '0')}`,
  userLowId: LOW,
  userHighId: HIGH,
  day: new Date(Date.UTC(2026, 9, 31 - daysAgo)),
  byLowMessage: 1,
  byHighMessage: 1,
});

const weeks = (count: number) => Array.from({ length: count }, (_, i) => weekRow(i === 0 ? 1 : i * 7 + 5));

describe('loadRelationProgress', () => {
  it('un Ami qui échange depuis quatre semaines est éligible à Proche', async () => {
    const store = pairInteractionStore({ days: weeks(4) });

    const progress = await loadRelationProgress(store.prisma, {
      userA: HIGH, userB: LOW, level: 'FRIEND', levelSince: null, now: NOW,
    });

    expect(progress.series).toMatchObject({ activeWeeks: 4, needed: 4, eligibleFor: 'CLOSE' });
  });

  it('ne crée ni ne modifie rien : lire le progrès n’élève jamais', async () => {
    const store = pairInteractionStore({ days: weeks(12), relations: [{
      id: 'aa0000000000000000000099', userLowId: LOW, userHighId: HIGH, grantedByLow: 'CLOSE', grantedByHigh: 'CLOSE',
      levelSince: new Date('2026-07-01T00:00:00Z'), origin: 'request', transitions: [],
    }] });
    const before = store.relations();

    const progress = await loadRelationProgress(store.prisma, {
      userA: LOW, userB: HIGH, level: 'CLOSE', levelSince: new Date('2026-07-01T00:00:00Z'), now: NOW,
    });

    expect(progress.series.eligibleFor).toBe('BLOOD');
    expect(store.relations()).toEqual(before);
    expect(store.days()).toHaveLength(12);
  });

  it('une série brisée ne baisse rien : zéro semaine, le niveau reste celui que l’appelant porte', async () => {
    const store = pairInteractionStore({ days: [weekRow(30)] });

    const progress = await loadRelationProgress(store.prisma, {
      userA: LOW, userB: HIGH, level: 'CLOSE', levelSince: new Date('2026-01-01T00:00:00Z'), now: NOW,
    });

    expect(progress.series).toMatchObject({ activeWeeks: 0, needed: 12, eligibleFor: null });
  });

  it('dit ce qui manque à la Connaissance pour une paire qui n’en est pas une', async () => {
    const store = pairInteractionStore({ days: [{ ...weekRow(0), byLowMessage: 12, byHighMessage: 12 }] });

    const progress = await loadRelationProgress(store.prisma, {
      userA: LOW, userB: HIGH, level: 'PUBLIC', levelSince: null, now: NOW,
    });

    expect(progress.acquaintance.met).toBe(false);
    expect(progress.acquaintance.missing).toEqual(['reaction', 'postView', 'audio']);
  });

  it('ne lit que la paire demandée', async () => {
    const other = { ...weekRow(1), userLowId: '5f0000000000000000000007', userHighId: '5f0000000000000000000008', id: 'dd9' };
    const store = pairInteractionStore({ days: [other] });

    const progress = await loadRelationProgress(store.prisma, {
      userA: LOW, userB: HIGH, level: 'FRIEND', levelSince: null, now: NOW,
    });

    expect(progress.series.activeWeeks).toBe(0);
  });
});
