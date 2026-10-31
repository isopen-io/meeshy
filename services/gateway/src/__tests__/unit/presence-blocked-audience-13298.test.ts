/**
 * #13298 — un blocage, dans un sens OU dans l'autre, coupe la présence.
 *
 * `acceptedFriendIds()` est l'audience de `user:status`
 * (`MeeshySocketIOManager._broadcastUserStatus` → `presenceStatusEmissions`)
 * et la portée `?onlineOnly=` (`onlineOnlyScope`). Une amitié acceptée PUIS
 * bloquée reste en base (rompre l'amitié est une décision produit ouverte) :
 * c'est donc la lecture qui la retire, en lot, sans requête par ami.
 *
 * `resolveForPresenceEvent()` est la porte de `presence:snapshot` : un
 * ÉVÉNEMENT poussé, où la décision de couper le lien l'emporte même pour
 * ADMIN/BIGBOSS — la règle que `_broadcastUserStatus` applique déjà par
 * `.except()`. `resolveForTargets` (les lectures REST) garde, lui, le
 * privilège administrateur intact.
 *
 * Le double ÉVALUE les clauses (`matchesMongoWhere`) sur un monde en mémoire.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { PresenceVisibilityService } from '../../services/PresenceVisibilityService';
import type { PrivacyPreferences } from '../../services/PrivacyPreferencesService';
import { matchesMongoWhere, type MongoDocument } from '../helpers/mongo-where';
import { PRIVACY_PREFERENCES_DEFAULTS } from '../../config/user-preferences-defaults';

const SUJET = 'sujet';
const AMIE = 'amie';
const JE_BLOQUE = 'je-bloque';
const ME_BLOQUE = 'me-bloque';

type Monde = {
  readonly users: ReadonlyArray<{ id: string; blockedUserIds: string[]; deactivatedAt: Date | null }>;
  readonly amities: ReadonlyArray<{ senderId: string; receiverId: string; status: string }>;
};

const prefs = (): PrivacyPreferences => ({ ...PRIVACY_PREFERENCES_DEFAULTS, showOnlineStatus: true, showLastSeen: true });

function monde(): Monde {
  return {
    users: [
      { id: SUJET, blockedUserIds: [JE_BLOQUE], deactivatedAt: null },
      { id: AMIE, blockedUserIds: [], deactivatedAt: null },
      { id: JE_BLOQUE, blockedUserIds: [], deactivatedAt: null },
      { id: ME_BLOQUE, blockedUserIds: [SUJET], deactivatedAt: null },
    ],
    amities: [
      { senderId: SUJET, receiverId: AMIE, status: 'accepted' },
      { senderId: JE_BLOQUE, receiverId: SUJET, status: 'accepted' },
      { senderId: SUJET, receiverId: ME_BLOQUE, status: 'accepted' },
    ],
  };
}

function service(m: Monde) {
  const prisma = {
    user: {
      findMany: jest.fn(async ({ where, select }: { where?: MongoDocument; select?: Record<string, boolean> }) =>
        m.users
          .filter((row) => matchesMongoWhere(row as unknown as MongoDocument, where))
          .map((row) => (select?.deactivatedAt ? { id: row.id, deactivatedAt: row.deactivatedAt } : { id: row.id }))),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => m.users.find((row) => row.id === where.id) ?? null),
      findFirst: jest.fn(async ({ where }: { where?: MongoDocument }) =>
        m.users.find((row) => matchesMongoWhere(row as unknown as MongoDocument, where)) ?? null),
    },
    userRelation: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
    friendRequest: {
      findMany: jest.fn(async ({ where }: { where?: MongoDocument }) =>
        m.amities.filter((row) => matchesMongoWhere(row as unknown as MongoDocument, where))),
      findFirst: jest.fn(async ({ where }: { where?: MongoDocument }) =>
        m.amities.find((row) => matchesMongoWhere(row as unknown as MongoDocument, where)) ?? null),
    },
  };
  const privacy = {
    getPreferences: async () => prefs(),
    getPreferencesForUsers: async (arr: Array<{ id: string }>) => new Map(arr.map(({ id }) => [id, prefs()])),
  };
  return { prisma, svc: new PresenceVisibilityService(prisma as never, privacy as never) };
}

const VISIBLE = { showOnline: true, showLastSeenTimestamp: true };
const MASQUE = { showOnline: false, showLastSeenTimestamp: false };

describe('#13298 — acceptedFriendIds : l’audience de user:status exclut tout bloqué', () => {
  it('l’ami accepté puis bloqué par le sujet ne reçoit plus ses transitions', async () => {
    const { svc } = service(monde());
    expect((await svc.acceptedFriendIds(SUJET)).has(JE_BLOQUE)).toBe(false);
  });

  it('l’ami accepté qui a bloqué le sujet ne les reçoit pas non plus', async () => {
    const { svc } = service(monde());
    expect((await svc.acceptedFriendIds(SUJET)).has(ME_BLOQUE)).toBe(false);
  });

  it('l’ami non bloqué reste dans l’audience', async () => {
    const { svc } = service(monde());
    expect(await svc.acceptedFriendIds(SUJET)).toEqual(new Set([AMIE]));
  });

  it('réciproquement : le bloqué n’a pas le sujet dans SON audience', async () => {
    const { svc } = service(monde());
    expect((await svc.acceptedFriendIds(JE_BLOQUE)).has(SUJET)).toBe(false);
    expect((await svc.acceptedFriendIds(ME_BLOQUE)).has(SUJET)).toBe(false);
  });

  it('le coût ne dépend pas du nombre d’amis : une lecture d’amitiés, deux de blocage', async () => {
    const { svc, prisma } = service(monde());
    await svc.acceptedFriendIds(SUJET);
    expect(prisma.friendRequest.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('#13350 — la relation de blocage déjà lue par l’appelant n’est pas relue, et filtre toujours', async () => {
    const { svc, prisma } = service(monde());
    const audience = await svc.acceptedFriendIds(SUJET, { blockRelated: new Set([JE_BLOQUE, ME_BLOQUE]) });
    expect(audience).toEqual(new Set([AMIE]));
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('#13298 — resolveForPresenceEvent : presence:snapshot ne part ni vers ni depuis un bloqué', () => {
  it('un lecteur ordinaire : l’ami bloqué (chaque sens) est masqué, l’ami libre visible', async () => {
    const { svc } = service(monde());
    const carte = await svc.resolveForPresenceEvent({ userId: SUJET, role: 'USER' }, [AMIE, JE_BLOQUE, ME_BLOQUE]);
    expect(carte.get(AMIE)).toEqual(VISIBLE);
    expect(carte.get(JE_BLOQUE)).toEqual(MASQUE);
    expect(carte.get(ME_BLOQUE)).toEqual(MASQUE);
  });

  it('un ADMIN bloqué ou bloqueur ne reçoit pas la présence de l’autre dans l’instantané', async () => {
    const { svc } = service(monde());
    const carte = await svc.resolveForPresenceEvent({ userId: SUJET, role: 'ADMIN' }, [AMIE, JE_BLOQUE, ME_BLOQUE, 'inconnu']);
    expect(carte.get(JE_BLOQUE)).toEqual(MASQUE);
    expect(carte.get(ME_BLOQUE)).toEqual(MASQUE);
    expect(carte.get(AMIE)).toEqual(VISIBLE);
    expect(carte.get('inconnu')).toEqual(VISIBLE);
  });

  it('resolveForTargets (lecture REST) garde le privilège ADMIN intact — le filtre est propre à l’événement', async () => {
    const { svc } = service(monde());
    const carte = await svc.resolveForTargets({ userId: SUJET, role: 'ADMIN' }, [JE_BLOQUE]);
    expect(carte.get(JE_BLOQUE)).toEqual(VISIBLE);
  });
});
