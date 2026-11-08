/**
 * Ce qui fait d'une Connaissance une Connaissance AUTOMATIQUE (#14406, contre-audit
 * #14464 N1 à N4) : la CAUSE de ses derniers passages, jamais l'`origin` de la ligne.
 * Témoins du contre-audit, repris tels quels : chacun lit l'ÉTAT du lien après coup,
 * en passant par les VRAIS écrivains (startCooldown, recordLevel, lowerGrant).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { evaluateAutoAcquaintance, revisitAutoAcquaintancesOnPrivacyWrite } from '../../../../services/relations/autoAcquaintance';
import { lowerGrant, recordLevel, startCooldown, recordFriendship, type UserRelationDb } from '../../../../services/relations/userRelationWriter';
import { pairInteractionStore } from '../../../helpers/pair-interaction-store';

const LOW = '5f0000000000000000000001';
const HIGH = '5f0000000000000000000002';
const NOW = new Date('2026-10-31T10:00:00Z');
const ADULT = new Date('1990-01-01T00:00:00Z');
const qualifying = { Message: 4, Reaction: 2, PostView: 2, Audio: 2 };
const dayRow = () => ({
  id: 'dd0000000000000000000001', userLowId: LOW, userHighId: HIGH, day: new Date(Date.UTC(2026, 9, 31)),
  ...Object.fromEntries(Object.entries(qualifying).map(([k, v]) => [`byLow${k}`, v])),
  ...Object.fromEntries(Object.entries(qualifying).map(([k, v]) => [`byHigh${k}`, v])),
});
const user = (id: string) => ({ id, birthDate: ADULT, blockedUserIds: [] });

function world(relations: unknown[] = []) {
  const prefs: { userId: string; privacy: Record<string, unknown> }[] = [];
  const store = pairInteractionStore({ days: [dayRow()] as never, users: [user(LOW), user(HIGH)] as never, relations: relations as never, preferences: prefs as never });
  const prisma = store.prisma as unknown as Record<string, unknown>;
  // préférences MUTABLES : on rejoue le geste « couper / rallumer »
  const table: Record<string, Record<string, unknown>> = {};
  (prisma as { userPreferences: unknown }).userPreferences = {
    findMany: async (args: { where: { userId: { in: string[] } } }) =>
      args.where.userId.in.filter((id) => table[id]).map((id) => ({ userId: id, privacy: table[id] })),
  };
  const notify = jest.fn(async () => undefined);
  const db = store.prisma as unknown as UserRelationDb;
  return {
    store, db, notify,
    setPref: (id: string, value: boolean) => { table[id] = { autoAcquaintance: value }; },
    evaluate: () => evaluateAutoAcquaintance({ prisma: store.prisma as never, notify, now: () => NOW }, { userA: LOW, userB: HIGH }),
    revisit: (id: string) => revisitAutoAcquaintancesOnPrivacyWrite(store.prisma as never, { userId: id, now: () => NOW }),
    row: () => store.relations()[0] as Record<string, unknown>,
  };
}

describe('N1 — une Connaissance AUTOMATIQUE née sur une ligne d’origine « request » n’échappe pas au refus', () => {
  it('demande refusée (ligne PUBLIC/PUBLIC origin request), puis Connaissance automatique, puis refus : le lien est défait', async () => {
    const w = world();
    await startCooldown(w.db, { userId: HIGH, otherId: LOW, until: new Date('2026-11-30T00:00:00Z'), at: new Date('2026-10-01T00:00:00Z') });
    expect(w.row()).toMatchObject({ origin: 'request', grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC' });

    expect(await w.evaluate()).toBe('raised');
    expect(w.row()).toMatchObject({ grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE', origin: 'request' });

    w.setPref(LOW, false);
    await w.revisit(LOW);
    expect({ low: w.row().grantedByLow, high: w.row().grantedByHigh }).toEqual({ low: 'PUBLIC', high: 'PUBLIC' });

    expect(await w.evaluate()).toBe('opted-out');
    expect({ low: w.row().grantedByLow, high: w.row().grantedByHigh }).toEqual({ low: 'PUBLIC', high: 'PUBLIC' });
  });
});

describe('N2 — le retrait « système » ne touche jamais un niveau CHOISI', () => {
  it('née toute seule, montée en Ami par demande, puis chacun redescend à Connaissance : le refus ne doit pas l’effacer', async () => {
    const w = world();
    expect(await w.evaluate()).toBe('created');
    await recordFriendship(w.db, { userA: LOW, userB: HIGH, origin: 'request', at: new Date('2026-10-31T11:00:00Z') });
    await lowerGrant(w.db, { actorId: LOW, otherId: HIGH, level: 'ACQUAINTANCE', at: new Date('2026-10-31T12:00:00Z'), cooldownUntil: new Date('2026-12-01T00:00:00Z') });
    await lowerGrant(w.db, { actorId: HIGH, otherId: LOW, level: 'ACQUAINTANCE', at: new Date('2026-10-31T12:30:00Z'), cooldownUntil: new Date('2026-12-01T00:00:00Z') });
    expect(w.row()).toMatchObject({ grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE', origin: 'auto-acquaintance' });

    w.setPref(LOW, false);
    await w.revisit(LOW);
    const afterRefusal = [w.row().grantedByLow, w.row().grantedByHigh];
    w.setPref(LOW, true);
    await w.evaluate();
    const afterReenable = [w.row().grantedByLow, w.row().grantedByHigh];

    expect({ afterRefusal, afterReenable }).toEqual({ afterRefusal: ['ACQUAINTANCE', 'ACQUAINTANCE'], afterReenable: ['ACQUAINTANCE', 'ACQUAINTANCE'] });
  });

  it('une demande de Connaissance ACCEPTÉE après le retrait survit aux évaluations suivantes', async () => {
    const w = world();
    expect(await w.evaluate()).toBe('created');
    w.setPref(LOW, false);
    await w.revisit(LOW);
    expect(w.row()).toMatchObject({ grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC' });

    // HIGH demande la Connaissance, LOW (celle qui refuse l'AUTOMATIQUE) accepte : consentement explicite.
    await recordLevel(w.db, { userA: HIGH, userB: LOW, level: 'ACQUAINTANCE', origin: 'request', at: new Date('2026-10-31T13:00:00Z') });
    expect(w.row()).toMatchObject({ grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE' });

    await w.evaluate();
    expect([w.row().grantedByLow, w.row().grantedByHigh]).toEqual(['ACQUAINTANCE', 'ACQUAINTANCE']);
  });
});

describe('RG-07 — couper puis rallumer ne relève pas une baisse volontaire de l’AUTRE', () => {
  it('HIGH sort volontairement ; LOW coupe puis rallume : HIGH reste sorti', async () => {
    const w = world();
    expect(await w.evaluate()).toBe('created');
    await lowerGrant(w.db, { actorId: HIGH, otherId: LOW, level: 'PUBLIC', at: new Date('2026-10-31T11:00:00Z'), cooldownUntil: new Date('2026-12-01T00:00:00Z') });
    w.setPref(LOW, false);
    await w.revisit(LOW);
    await w.evaluate();
    w.setPref(LOW, true);
    await w.evaluate();
    expect([w.row().grantedByLow, w.row().grantedByHigh]).toEqual(['ACQUAINTANCE', 'PUBLIC']);
  });
});

describe('N4 — couper puis rallumer ne renotifie pas l’autre', () => {
  it('trois allers-retours ⇒ l’autre n’a reçu « X est maintenant une Connaissance » qu’une fois, à la naissance', async () => {
    const w = world();
    await w.evaluate();
    for (let i = 0; i < 3; i += 1) {
      w.setPref(LOW, false);
      await w.revisit(LOW);
      w.setPref(LOW, true);
      await w.evaluate();
    }
    const toHigh = (w.notify.mock.calls as unknown as [{ recipientId: string }][]).filter(([n]) => n.recipientId === HIGH).length;
    expect(toHigh).toBe(1);
  });
});
