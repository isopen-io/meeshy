/**
 * LE RATTRAPAGE (#13932) : idempotent et rejouable — deux passes = même état.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { runRelationCatchUp } from '../../../../services/relations/relationCatchUp';
import { pairInteractionStore } from '../../../helpers/pair-interaction-store';

const A = '5f0000000000000000000001';
const B = '5f0000000000000000000002';
const C = '5f0000000000000000000003';
const D = '5f0000000000000000000004';
const NOW = new Date('2026-10-31T10:00:00Z');
const ADULT = new Date('1990-01-01T00:00:00Z');

const qualifyingRow = (low: string, high: string, daysAgo = 0) => ({
  id: `dd${low.slice(-2)}${high.slice(-2)}${daysAgo}`.padEnd(24, '0'),
  userLowId: low,
  userHighId: high,
  day: new Date(Date.UTC(2026, 9, 31 - daysAgo)),
  byLowMessage: 4, byLowReaction: 2, byLowPostView: 2, byLowAudio: 2,
  byHighMessage: 4, byHighReaction: 2, byHighPostView: 2, byHighAudio: 2,
});

const users = [A, B, C, D].map((id) => ({ id, birthDate: ADULT, blockedUserIds: [] as string[] }));

describe('runRelationCatchUp — toutes les paires actives de la semaine glissante', () => {
  it('crée la Connaissance des paires qui tiennent les seuils et laisse les autres', async () => {
    const store = pairInteractionStore({
      days: [qualifyingRow(A, B), { ...qualifyingRow(C, D), byHighAudio: 0 }],
      users,
    });

    const report = await runRelationCatchUp({ prisma: store.prisma, now: () => NOW });

    expect(report).toMatchObject({ pairs: 2, created: 1 });
    expect(store.relations().map((r) => [r.userLowId, r.userHighId])).toEqual([[A, B]]);
  });

  it('deux passes = même état : la seconde ne crée, ne relève ni ne prévient rien', async () => {
    const notices: string[] = [];
    const store = pairInteractionStore({ days: [qualifyingRow(A, B), qualifyingRow(C, D)], users });
    const deps = {
      prisma: store.prisma,
      now: () => NOW,
      notify: async (n: { recipientId: string }) => {
        notices.push(n.recipientId);
      },
    };

    await runRelationCatchUp(deps);
    const afterFirst = store.relations();
    const second = await runRelationCatchUp(deps);

    expect(store.relations()).toEqual(afterFirst);
    expect(second).toMatchObject({ pairs: 2, created: 0, raised: 0, cancelled: 0 });
    expect(notices).toHaveLength(4);
  });

  it('lit chaque paire UNE fois, même quand elle a plusieurs jours actifs', async () => {
    const store = pairInteractionStore({ days: [qualifyingRow(A, B, 0), qualifyingRow(A, B, 1), qualifyingRow(A, B, 2)], users });

    const report = await runRelationCatchUp({ prisma: store.prisma, now: () => NOW });

    expect(report.pairs).toBe(1);
  });

  it('ignore les jours hors de la fenêtre : une paire qui ne parle plus n’est pas réévaluée', async () => {
    const store = pairInteractionStore({ days: [qualifyingRow(A, B, 9)], users });

    const report = await runRelationCatchUp({ prisma: store.prisma, now: () => NOW });

    expect(report.pairs).toBe(0);
    expect(store.relations()).toHaveLength(0);
  });

  it('isole l’échec d’une paire : les autres sont traitées', async () => {
    const store = pairInteractionStore({ days: [qualifyingRow(A, B), qualifyingRow(C, D)], users: users.filter((u) => u.id !== A) });

    const report = await runRelationCatchUp({ prisma: store.prisma, now: () => NOW });

    expect(report).toMatchObject({ pairs: 2, created: 1 });
  });

  it('défait en silence la Connaissance automatique d’une paire désormais bloquée', async () => {
    const auto = {
      id: 'aa0000000000000000000099', userLowId: A, userHighId: B, grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE',
      levelSince: new Date('2026-10-20T00:00:00Z'), origin: 'auto-acquaintance', transitions: [],
    };
    const store = pairInteractionStore({
      days: [qualifyingRow(A, B)],
      users: users.map((u) => (u.id === A ? { ...u, blockedUserIds: [B] } : u)),
      relations: [auto],
    });

    const report = await runRelationCatchUp({ prisma: store.prisma, now: () => NOW });

    expect(report.cancelled).toBe(1);
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC' });
  });

  it('saute sans l’évaluer une paire déjà au moins Connaissance par une demande : rien ne peut y changer', async () => {
    const friends = {
      id: 'aa0000000000000000000098', userLowId: A, userHighId: B, grantedByLow: 'FRIEND', grantedByHigh: 'CLOSE',
      levelSince: new Date('2026-10-20T00:00:00Z'), origin: 'request', transitions: [],
    };
    const store = pairInteractionStore({ days: [qualifyingRow(A, B), qualifyingRow(C, D)], users, relations: [friends] });

    const report = await runRelationCatchUp({ prisma: store.prisma, now: () => NOW });

    expect(report).toMatchObject({ pairs: 2, skipped: 1, created: 1 });
    expect(store.relations().map((r) => [r.userLowId, r.grantedByLow, r.grantedByHigh])).toEqual([
      [A, 'FRIEND', 'CLOSE'],
      [C, 'ACQUAINTANCE', 'ACQUAINTANCE'],
    ]);
  });
});
