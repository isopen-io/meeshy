/**
 * Contre-audit #14464, troisième passe (tête 6deedcf26c). Lignes HÉRITÉES : leurs
 * passages ont la forme exacte qu'écrit `origin/main` (aucune `cause`).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { evaluateAutoAcquaintance, revisitAutoAcquaintancesOnPrivacyWrite } from '../../../../services/relations/autoAcquaintance';
import { pairInteractionStore } from '../../../helpers/pair-interaction-store';

import { lowerGrant, recordLevel, type UserRelationDb } from '../../../../services/relations/userRelationWriter';

const LOW = '5f0000000000000000000001';
const HIGH = '5f0000000000000000000002';
const NOW = new Date('2026-11-02T10:00:00Z');
const ADULT = new Date('1990-01-01T00:00:00Z');
const qualifying = { Message: 4, Reaction: 2, PostView: 2, Audio: 2 };
const dayRow = () => ({
  id: 'dd0000000000000000000001', userLowId: LOW, userHighId: HIGH, day: new Date(Date.UTC(2026, 10, 2)),
  ...Object.fromEntries(Object.entries(qualifying).map(([k, v]) => [`byLow${k}`, v])),
  ...Object.fromEntries(Object.entries(qualifying).map(([k, v]) => [`byHigh${k}`, v])),
});
const user = (id: string) => ({ id, birthDate: ADULT, blockedUserIds: [] });
const at = (iso: string) => new Date(iso);

function world(relations: unknown[]) {
  const store = pairInteractionStore({ days: [dayRow()] as never, users: [user(LOW), user(HIGH)] as never, relations: relations as never });
  const table: Record<string, Record<string, unknown>> = {};
  (store.prisma as unknown as { userPreferences: unknown }).userPreferences = {
    findMany: async (args: { where: { userId: { in: string[] } } }) =>
      args.where.userId.in.filter((id) => table[id]).map((id) => ({ userId: id, privacy: table[id] })),
  };
  const notify = jest.fn(async () => undefined);
  return {
    setPref: (id: string, value: boolean) => { table[id] = { autoAcquaintance: value }; },
    evaluate: () => evaluateAutoAcquaintance({ prisma: store.prisma as never, notify, now: () => NOW }, { userA: LOW, userB: HIGH }),
    revisit: (id: string) => revisitAutoAcquaintancesOnPrivacyWrite(store.prisma as never, { userId: id, now: () => NOW }),
    grants: () => { const r = store.relations()[0] as Record<string, unknown>; return [r.grantedByLow, r.grantedByHigh]; },
  };
}

describe('N8 — hérité : un passage sans cause qui suit une baisse n’est jamais automatique', () => {
  it('née toute seule (main), HIGH sort, puis LOW demande la Connaissance et HIGH accepte : le refus de LOW ne doit pas effacer ce choix', async () => {
    // Forme exacte écrite par main : createRow(auto), lowerGrant(HIGH→PUBLIC), recordLevel(ACQUAINTANCE) qui ne relève que HIGH.
    const w = world([{
      id: 'rr0000000000000000000001', userLowId: LOW, userHighId: HIGH, origin: 'auto-acquaintance',
      grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE', levelSince: at('2026-10-20T00:00:00Z'),
      cooldownLowUntil: at('2026-11-14T00:00:00Z'),
      transitions: [
        { actorId: LOW, from: 'PUBLIC', to: 'ACQUAINTANCE', at: at('2026-10-05T03:00:00Z') },
        { actorId: HIGH, from: 'PUBLIC', to: 'ACQUAINTANCE', at: at('2026-10-05T03:00:00Z') },
        { actorId: HIGH, from: 'ACQUAINTANCE', to: 'PUBLIC', at: at('2026-10-15T12:00:00Z') },
        { actorId: HIGH, from: 'PUBLIC', to: 'ACQUAINTANCE', at: at('2026-10-20T00:00:00Z') },
      ],
    }]);

    w.setPref(LOW, false);
    await w.revisit(LOW);
    const afterRefusal = w.grants();
    w.setPref(LOW, true);
    await w.evaluate();
    const afterReenable = w.grants();

    expect({ afterRefusal, afterReenable }).toEqual({
      afterRefusal: ['ACQUAINTANCE', 'ACQUAINTANCE'],
      afterReenable: ['ACQUAINTANCE', 'ACQUAINTANCE'],
    });
  });
});


describe('N8, contrôle — le même parcours écrit par CE lot (cause posée) est sain', () => {
  it('née toute seule, HIGH sort, LOW demande, HIGH accepte, LOW refuse : le lien reste', async () => {
    const store = pairInteractionStore({ days: [dayRow()] as never, users: [user(LOW), user(HIGH)] as never, relations: [] as never });
    const table: Record<string, Record<string, unknown>> = {};
    (store.prisma as unknown as { userPreferences: unknown }).userPreferences = {
      findMany: async (args: { where: { userId: { in: string[] } } }) =>
        args.where.userId.in.filter((id) => table[id]).map((id) => ({ userId: id, privacy: table[id] })),
    };
    const db = store.prisma as unknown as UserRelationDb;
    expect(await evaluateAutoAcquaintance({ prisma: store.prisma as never, now: () => NOW }, { userA: LOW, userB: HIGH })).toBe('created');
    await lowerGrant(db, { actorId: HIGH, otherId: LOW, level: 'PUBLIC', at: at('2026-11-02T11:00:00Z'), cooldownUntil: at('2026-12-02T00:00:00Z') });
    await recordLevel(db, { userA: LOW, userB: HIGH, level: 'ACQUAINTANCE', origin: 'request', at: at('2026-11-02T12:00:00Z') });
    table[LOW] = { autoAcquaintance: false };
    await revisitAutoAcquaintancesOnPrivacyWrite(store.prisma as never, { userId: LOW, now: () => NOW });
    const r = store.relations()[0] as Record<string, unknown>;
    expect([r.grantedByLow, r.grantedByHigh]).toEqual(['ACQUAINTANCE', 'ACQUAINTANCE']);
  });
});
