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

  test('l’échéance et la précision servies l’emportent : une prolongation faite ailleurs n’est pas défaite ici', async () => {
    const world = worldWith(storedOf({ [AMI]: { precision: 'exact', until: T0 + HOUR / 4 } }), servedOf([AMI, 'city', T0 + 8 * HOUR]));
    await world.center.sync();
    expect(world.center.entry(AMI)).toEqual({ precision: 'city', until: T0 + 8 * HOUR });
  });

  test('un ajout d’ici dont l’accusé s’est perdu et que le serveur ne sert pas sort de la liste : dans le doute, on montre moins', async () => {
    const world = worldWith(storedOf({}), servedOf());
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'unconfirmed' }));
    await world.center.share({ userId: AMI, precision: 'exact', durationMinutes: 60 });
    expect(world.center.entry(AMI)).not.toBeNull();
    await world.center.sync();
    expect(world.center.entry(AMI)).toBeNull();
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

describe('l’appareil qui REÇOIT la liste d’un autre ne publie jamais sa propre position', () => {
  const recu = () => {
    const world = worldWith(storedOf({}), servedOf([AMI, 'exact', T0 + HOUR / 2], [AUTRE, 'city', T0 + HOUR]));
    return world;
  };

  test('à l’échéance d’une personne, il la retire de SA liste sans rien envoyer : la passerelle tient l’échéance', async () => {
    const world = recu();
    await world.center.sync();
    await world.advance(HOUR / 2 + 2_000);
    expect(world.center.entry(AMI)).toBeNull();
    expect(world.center.entry(AUTRE)).not.toBeNull();
    expect(world.starts).toEqual([]);
    expect(world.stops()).toBe(0);
    expect(world.source.prompts).toBe(0);
    expect(world.source.following).toBe(0);
  });

  test('rechargé, il ne se remet pas à suivre la position', async () => {
    const memory = new Map<string, string>();
    const world = makeWorld({ memory, served: servedOf([AMI, 'exact', T0 + HOUR]) });
    await world.center.sync();
    const reloaded = makeWorld({ memory, served: servedOf([AMI, 'exact', T0 + HOUR]) });
    await reloaded.advance(0);
    expect(reloaded.center.entry(AMI)).not.toBeNull();
    expect(reloaded.source.following).toBe(0);
  });

  test('« Arrêter » d’ici part (intention explicite), sans se mettre ensuite à suivre la position', async () => {
    const world = recu();
    await world.center.sync();
    expect(await world.center.stopSharing(AMI)).toBeNull();
    expect(world.starts.at(-1)?.recipients.map((r) => r.userId)).toEqual([AUTRE]);
    expect(world.source.following).toBe(0);
  });

  test('partager d’ici en fait l’appareil qui publie : il suit sa position', async () => {
    const world = recu();
    await world.center.sync();
    await world.center.share({ userId: TROISIEME, precision: 'city', durationMinutes: 60 });
    expect(world.source.following).toBe(1);
  });

  test('un onglet qui publiait déjà reste celui qui publie quand il relit SON propre partage', async () => {
    const world = worldWith(storedOf({}), servedOf());
    await world.center.share({ userId: AMI, precision: 'exact', durationMinutes: 60 });
    world.server.served = servedOf([AMI, 'exact', T0 + HOUR]);
    await world.center.sync();
    expect(world.source.following).toBe(1);
  });
});

/**
 * UN SEUL APPAREIL PUBLIE (#18580, #18714) : celui du dernier « Partager ». La passerelle nomme ce démarrage (`startedAt`)
 * dans l'accusé et dans la relecture ; un onglet dont l'accusé portait un AUTRE démarrage que celui servi cède : il garde
 * « Arrêter » à un geste, mais sa position ne part plus. Aucune horloge n'est comparée : une échéance, une précision ou
 * une liste seule venues d'ailleurs ne changent pas qui publie.
 */
describe('l’appareil qui publiait cède quand un autre partage à son tour', () => {
  const MOI = '2026-01-01T00:00:00.000Z';
  const AUTRE_APPAREIL = '2026-01-01T00:00:05.000Z';
  const servedFrom = (startedAt: string | undefined, ...recipients: ReadonlyArray<readonly [string, 'exact' | 'neighborhood' | 'city', number]>) => ({ ...servedOf(...recipients), ...(startedAt === undefined ? {} : { startedAt }) });
  const publiant = async () => {
    const world = worldWith(storedOf({}), servedOf());
    world.startQueue.push(async () => ({ kind: 'started', expiresAt: T0 + HOUR, startedAt: MOI }));
    await world.center.share({ userId: AMI, precision: 'exact', durationMinutes: 60 });
    expect(world.source.following).toBe(1);
    return world;
  };

  test('un autre démarrage servi : il cesse de suivre sa position, et aucun relevé ne part plus', async () => {
    const world = await publiant();
    const sent = world.updates.length;
    world.server.served = servedFrom(AUTRE_APPAREIL, [AMI, 'exact', T0 + HOUR], [AUTRE, 'city', T0 + HOUR]);
    await world.center.sync();
    expect(world.source.following).toBe(0);
    expect(world.center.entry(AUTRE)).not.toBeNull();
    world.source.listener?.(PARIS);
    expect(world.updates.length).toBe(sent);
    expect(world.memory.get('roster.received')).toBe('1');
  });

  test('le même destinataire repartagé ailleurs, liste identique : il cède aussi', async () => {
    const world = await publiant();
    world.server.served = servedFrom(AUTRE_APPAREIL, [AMI, 'exact', T0 + HOUR]);
    await world.center.sync();
    expect(world.source.following).toBe(0);
  });

  test('son propre démarrage relu, l’échéance servie décalée de dix minutes (horloge de l’appareil) : il publie toujours', async () => {
    const world = await publiant();
    world.server.served = servedFrom(MOI, [AMI, 'exact', T0 + HOUR + 600_000]);
    await world.center.sync();
    expect(world.source.following).toBe(1);
  });

  test('une précision abaissée ou une personne retirée par une liste seule d’ailleurs : il publie toujours', async () => {
    const world = worldWith(storedOf({}), servedOf());
    world.startQueue.push(async () => ({ kind: 'started', expiresAt: T0 + HOUR, startedAt: MOI }));
    world.startQueue.push(async () => ({ kind: 'started', expiresAt: T0 + HOUR, startedAt: MOI }));
    await world.center.share({ userId: AMI, precision: 'exact', durationMinutes: 60 });
    await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    world.server.served = servedFrom(MOI, [AMI, 'city', T0 + HOUR]);
    await world.center.sync();
    expect(world.center.entry(AUTRE)).toBeNull();
    expect(world.source.following).toBe(1);
  });

  test('un accusé perdu : le démarrage servi est pris pour le sien, il publie toujours', async () => {
    const world = worldWith(storedOf({}), servedOf());
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'unconfirmed' }));
    await world.center.share({ userId: AMI, precision: 'exact', durationMinutes: 60 });
    world.server.served = servedFrom(MOI, [AMI, 'exact', T0 + HOUR]);
    await world.center.sync();
    expect(world.source.following).toBe(1);
    world.server.served = servedFrom(AUTRE_APPAREIL, [AMI, 'exact', T0 + HOUR]);
    await world.center.sync();
    expect(world.source.following).toBe(0);
  });

  test('une passerelle qui ne nomme pas le démarrage : rien ne change, il publie toujours', async () => {
    const world = await publiant();
    world.server.served = servedOf([AMI, 'exact', T0 + HOUR], [AUTRE, 'city', T0 + HOUR]);
    await world.center.sync();
    expect(world.source.following).toBe(1);
  });

  test('rechargé après avoir cédé, il ne se remet pas à suivre sa position', async () => {
    const world = await publiant();
    world.server.served = servedFrom(AUTRE_APPAREIL, [AMI, 'exact', T0 + HOUR]);
    await world.center.sync();
    const reloaded = makeWorld({ memory: world.memory, served: world.server.served });
    await reloaded.advance(0);
    expect(reloaded.source.following).toBe(0);
  });

  test('deux onglets du même navigateur sont UN appareil : le « Partager » de l’un ne fait pas céder l’autre, ni taire le premier au rechargement', async () => {
    const memory = new Map<string, string>();
    const a = makeWorld({ memory, served: servedOf() });
    a.startQueue.push(async () => ({ kind: 'started', expiresAt: T0 + HOUR, startedAt: MOI }));
    await a.center.share({ userId: AMI, precision: 'exact', durationMinutes: 60 });
    const b = makeWorld({ memory, served: servedOf() });
    b.startQueue.push(async () => ({ kind: 'started', expiresAt: T0 + HOUR, startedAt: AUTRE_APPAREIL }));
    await b.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    a.server.served = servedFrom(AUTRE_APPAREIL, [AMI, 'exact', T0 + HOUR], [AUTRE, 'city', T0 + HOUR]);
    await a.center.sync();
    expect(a.source.following).toBe(1);
    const reloaded = makeWorld({ memory, served: a.server.served });
    await reloaded.advance(0);
    await reloaded.center.sync();
    expect(reloaded.source.following).toBe(1);
  });

  test('un démarrage avec position refusé après coup (panne passerelle) : inconnu, le démarrage servi est pris pour le sien', async () => {
    const world = await publiant();
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'unavailable' }));
    await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    world.server.served = servedFrom(AUTRE_APPAREIL, [AMI, 'exact', T0 + HOUR], [AUTRE, 'city', T0 + HOUR]);
    await world.center.sync();
    expect(world.source.following).toBe(1);
  });

  test('« Partager » d’ici après avoir cédé en refait l’appareil qui publie', async () => {
    const world = await publiant();
    world.server.served = servedFrom(AUTRE_APPAREIL, [AMI, 'exact', T0 + HOUR]);
    await world.center.sync();
    await world.center.share({ userId: TROISIEME, precision: 'city', durationMinutes: 60 });
    expect(world.source.following).toBe(1);
  });
});

describe('deux onglets du même navigateur qui partage', () => {
  test('le recalage d’un second onglet ne fait pas taire celui qui publie', async () => {
    const memory = new Map<string, string>();
    const publie = makeWorld({ memory, served: servedOf() });
    await publie.center.share({ userId: AMI, precision: 'exact', durationMinutes: 60 });
    const second = makeWorld({ memory, granted: false, served: servedOf([AMI, 'exact', T0 + HOUR]) });
    await second.center.sync();
    publie.center.refresh();
    expect(publie.source.following).toBe(1);
    expect(memory.has('roster.received')).toBe(false);
  });
});
