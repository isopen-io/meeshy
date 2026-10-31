/**
 * Témoins de l'audit adversarial du lot rel-compteurs (#13932).
 *
 * Chaque témoin lit l'ÉTAT obtenu (le lien, ce que le rattrapage a créé), jamais
 * un appel de service simulé.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { evaluateAutoAcquaintance } from '../../../../services/relations/autoAcquaintance';
import { runRelationCatchUp } from '../../../../services/relations/relationCatchUp';
import { pairInteractionStore } from '../../../helpers/pair-interaction-store';

const LOW = '5f0000000000000000000001';
const HIGH = '5f0000000000000000000002';
const NOW = new Date('2026-10-31T10:00:00Z');
const ADULT = new Date('1990-01-01T00:00:00Z');
const MINOR = new Date('2012-01-01T00:00:00Z');

const qualifying = {
  byLowMessage: 4, byLowReaction: 2, byLowPostView: 2, byLowAudio: 2,
  byHighMessage: 4, byHighReaction: 2, byHighPostView: 2, byHighAudio: 2,
};

const autoAcquaintance = {
  id: 'aa0000000000000000000099', userLowId: LOW, userHighId: HIGH, grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE',
  levelSince: new Date('2026-10-20T00:00:00Z'), origin: 'auto-acquaintance', transitions: [],
};

describe('audit — la Connaissance automatique ne survit pas à un âge déclaré après coup', () => {
  it('née entre deux âges inconnus, elle est défaite quand l’un déclare être mineur face à un majeur', async () => {
    const store = pairInteractionStore({
      days: [{ id: 'dd0000000000000000000001', userLowId: LOW, userHighId: HIGH, day: new Date(Date.UTC(2026, 9, 31)), ...qualifying }],
      users: [
        { id: LOW, birthDate: MINOR, blockedUserIds: [] },
        { id: HIGH, birthDate: ADULT, blockedUserIds: [] },
      ],
      relations: [autoAcquaintance],
    });

    await evaluateAutoAcquaintance({ prisma: store.prisma, now: () => NOW }, { userA: LOW, userB: HIGH });

    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC' });
  });
});

describe('audit — le rattrapage n’affame aucune paire au-delà de son plafond', () => {
  it('une paire qualifiante dont la ligne a le plus grand id finit par être évaluée', async () => {
    const PAIRS = 20_001;
    const others = Array.from({ length: PAIRS - 1 }, (_, i) => `6f${String(i).padStart(22, '0')}`);
    const filler = others.map((other, i) => ({
      id: `dd${String(i).padStart(22, '0')}`,
      userLowId: LOW,
      userHighId: other,
      day: new Date(Date.UTC(2026, 9, 31)),
      byLowMessage: 1,
    }));
    const lastPairHigh = `7f${'0'.repeat(22)}`;
    const store = pairInteractionStore({
      days: [
        ...filler,
        { id: `dz${'9'.repeat(22)}`, userLowId: HIGH, userHighId: lastPairHigh, day: new Date(Date.UTC(2026, 9, 31)), ...qualifying },
      ],
      users: [
        { id: HIGH, birthDate: ADULT, blockedUserIds: [] },
        { id: lastPairHigh, birthDate: ADULT, blockedUserIds: [] },
      ],
    });

    await runRelationCatchUp({ prisma: store.prisma, now: () => NOW });
    await runRelationCatchUp({ prisma: store.prisma, now: () => NOW });

    expect(store.relations().map((r) => [r.userLowId, r.userHighId])).toEqual([[HIGH, lastPairHigh]]);
  }, 60_000);
});
