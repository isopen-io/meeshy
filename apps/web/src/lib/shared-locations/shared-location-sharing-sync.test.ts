import { describe, expect, test } from 'bun:test';

import { AMI, AUTRE, HOUR, makeWorld, PARIS, T0 } from '@/test-support/shared-location-sharing-world';

import { encodeSharedLocationRoster, encodeSharedLocationWithdrawals, rosterOps } from './shared-location-roster';

/**
 * **PLUSIEURS APPAREILS, UN PARTAGE** (#18389) : la passerelle ne connaît qu'un partage par
 * compte, et c'est lui qui fait foi. L'onglet relit ce qu'elle sert et s'y recale — un retrait
 * fait ailleurs s'applique ici, un ajout fait ailleurs n'est plus effacé par la liste périmée
 * de cet onglet —, en gardant SES retraits en attente, qui gagnent toujours.
 */

const TROISIEME = 'd'.repeat(24);
const iso = (ms: number): string => new Date(ms).toISOString();
const servedOf = (...recipients: ReadonlyArray<readonly [string, 'exact' | 'neighborhood' | 'city', number]>) => ({
  recipients: recipients.map(([userId, precision, until]) => ({ userId, precision, expiresAt: iso(until) })),
  expiresAt: recipients.length === 0 ? null : iso(Math.max(...recipients.map(([, , until]) => until))),
});
const storedOf = (entries: Record<string, { precision: 'exact' | 'neighborhood' | 'city'; until: number }>, withdrawals: Record<string, number> = {}) => ({
  roster: encodeSharedLocationRoster({ entries, withdrawals }),
  withdrawals: encodeSharedLocationWithdrawals({ entries, withdrawals }),
});
const worldWith = (stored: ReturnType<typeof storedOf>, served: ReturnType<typeof servedOf> | null) => {
  const memory = new Map<string, string>();
  if (stored.withdrawals !== null) memory.set('roster.withdrawals', stored.withdrawals);
  return makeWorld({ stored: stored.roster, memory, served });
};

describe('l’onglet se recale sur le partage servi', () => {
  test('une personne retirée sur un autre appareil sort d’ici aussi, et de la liste gardée', async () => {
    const world = worldWith(storedOf({ [AMI]: { precision: 'exact', until: T0 + HOUR }, [AUTRE]: { precision: 'city', until: T0 + HOUR } }), servedOf([AUTRE, 'city', T0 + HOUR]));
    await world.center.sync();
    expect(world.center.entry(AMI)).toBeNull();
    expect(world.center.entry(AUTRE)).toEqual({ precision: 'city', until: T0 + HOUR });
    expect(rosterOps.entry(world.stored(), AMI)).toBeNull();
  });

  test('une personne ajoutée sur un autre appareil apparaît ici : « Arrêter » est à un geste, et rien ne part', async () => {
    const world = worldWith(storedOf({ [AMI]: { precision: 'exact', until: T0 + HOUR } }), servedOf([AMI, 'exact', T0 + HOUR], [TROISIEME, 'neighborhood', T0 + HOUR / 2]));
    await world.center.sync();
    expect(world.center.entry(TROISIEME)).toEqual({ precision: 'neighborhood', until: T0 + HOUR / 2 });
    expect(world.starts).toEqual([]);
    expect(world.stops()).toBe(0);
  });

  test('l’ajout fait ailleurs survit au prochain partage d’ici : la liste publiée le contient', async () => {
    const world = worldWith(storedOf({ [AMI]: { precision: 'exact', until: T0 + HOUR } }), servedOf([AMI, 'exact', T0 + HOUR], [TROISIEME, 'city', T0 + HOUR]));
    await world.center.sync();
    await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    expect(world.starts.at(-1)?.recipients.map((r) => r.userId)).toEqual([AMI, AUTRE, TROISIEME].sort());
  });

  test('un retrait EN ATTENTE ici gagne : la personne que le serveur sert encore n’est pas rajoutée', async () => {
    const world = worldWith(storedOf({ [AUTRE]: { precision: 'city', until: T0 + HOUR } }, { [AMI]: T0 + 8 * HOUR }), servedOf([AMI, 'exact', T0 + HOUR], [AUTRE, 'city', T0 + HOUR]));
    await world.center.sync();
    expect(world.center.entry(AMI)).toBeNull();
    expect(rosterOps.isWithdrawalPending(world.center.store.getState().roster, AMI)).toBe(true);
  });

  test('un retrait en attente que le serveur ne sert déjà plus est soldé', async () => {
    const world = worldWith(storedOf({ [AUTRE]: { precision: 'city', until: T0 + HOUR } }, { [AMI]: T0 + 8 * HOUR }), servedOf([AUTRE, 'city', T0 + HOUR]));
    await world.center.sync();
    expect(rosterOps.hasPendingWithdrawals(world.center.store.getState().roster)).toBe(false);
  });

  test('la plus proche des deux échéances gagne, et la précision est celle que le serveur sert', async () => {
    const world = worldWith(storedOf({ [AMI]: { precision: 'exact', until: T0 + HOUR / 4 } }), servedOf([AMI, 'city', T0 + HOUR]));
    await world.center.sync();
    expect(world.center.entry(AMI)).toEqual({ precision: 'city', until: T0 + HOUR / 4 });
  });

  test('plus aucun partage servi : la liste se vide et la position n’est plus suivie', async () => {
    const world = worldWith(storedOf({}), servedOf());
    await world.center.share({ userId: AMI, precision: 'exact', durationMinutes: 60 });
    expect(world.source.following).toBe(1);
    world.server.served = servedOf();
    await world.center.sync();
    expect(world.center.entry(AMI)).toBeNull();
    expect(world.source.following).toBe(0);
    expect(world.memory.has('roster')).toBe(false);
  });

  test('un partage démarré ailleurs ne fait pas suivre la position d’ICI : un seul appareil publie', async () => {
    const world = worldWith(storedOf({}), servedOf([AMI, 'exact', T0 + HOUR]));
    await world.center.sync();
    expect(world.center.entry(AMI)).not.toBeNull();
    expect(world.source.following).toBe(0);
    world.source.listener?.(PARIS);
    expect(world.updates).toEqual([]);
  });

  test('une relecture qui n’a rien rendu (hors ligne, passerelle d’avant) ne change rien', async () => {
    const world = worldWith(storedOf({ [AMI]: { precision: 'exact', until: T0 + HOUR } }), null);
    await world.center.sync();
    expect(world.server.reads).toBe(1);
    expect(world.center.entry(AMI)).toEqual({ precision: 'exact', until: T0 + HOUR });
  });

  test('une relecture revenue après le changement de compte n’adopte rien', async () => {
    const world = worldWith(storedOf({ [AMI]: { precision: 'exact', until: T0 + HOUR } }), servedOf());
    world.account.current = null;
    await world.center.sync();
    expect(world.memory.has('roster')).toBe(true);
  });

  test('une personne servie déjà échue n’est pas reprise', async () => {
    const world = worldWith(storedOf({}), servedOf([AMI, 'exact', T0 - 1]));
    await world.center.sync();
    expect(world.center.entry(AMI)).toBeNull();
  });
});
