/**
 * #14924 — les partages du rituel du Sang s'éteignent sur TOUT chemin qui fait tomber le
 * lien sous le Sang : la rupture d'une demande de Sang acceptée et le blocage (le chemin
 * « baisse » est couvert par relation-link-manage.test.ts). Le consentement a été donné à
 * un Sang ; il ne survit pas au lien qui le fondait, ni ne se rallume à la remontée.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn(async () => ({ activationKeyId: async () => 'server-key' })),
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));
jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(async (args: { op: () => unknown }) => args.op()),
}));
jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({ recordActivity: jest.fn(async () => undefined) })),
}));
jest.mock('../../../../services/CacheStore', () => ({
  ...(jest.requireActual('../../../../services/CacheStore') as object),
  getCacheStore: () => ({ del: jest.fn(async () => undefined) }),
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

import { directoryFriendRequestsRoutes } from '../../../../routes/directory/friend-requests';
import { directoryBlocksRoutes } from '../../../../routes/directory/blocks';
import { relationStore } from '../../../helpers/user-relation-store';
import { pairInteractionStore } from '../../../helpers/pair-interaction-store';
import { ritualSharesStore, SHARES_OFF, SHARES_ON } from '../../../helpers/ritual-shares-store';

const PREFIXE = '/api/v1/directory';
const MOI = '507f1f77bcf86cd799439011';
const AUTRE = '507f1f77bcf86cd799439022';
const FR_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ADULT = new Date('1990-01-01T00:00:00Z');
const SANG = { id: 'aa0000000000000000000099', userLowId: MOI, userHighId: AUTRE, grantedByLow: 'BLOOD', grantedByHigh: 'BLOOD', origin: 'request', transitions: [] };
const PARTAGES = [
  { ownerId: MOI, otherId: AUTRE, ...SHARES_ON, bringBlockedAt: null },
  { ownerId: AUTRE, otherId: MOI, ...SHARES_ON, bringBlockedAt: null },
];

const settle = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const authenticate = async (req: object) => {
  Object.assign(req, {
    user: { userId: MOI },
    authContext: { isAuthenticated: true, type: 'user', userId: MOI, registeredUser: { id: MOI, role: 'USER' } },
  });
};

const PROCHE = { ...SANG, grantedByLow: 'CLOSE', grantedByHigh: 'CLOSE' };
const CATEGORIE_PARTAGEE = [
  { ownerId: MOI, otherId: AUTRE, listeningCategoryShared: true },
  { ownerId: AUTRE, otherId: MOI, listeningCategoryShared: true },
];

async function rompreLeSang(niveau: { targetLevel: string; relation: typeof SANG; partages: typeof PARTAGES | typeof CATEGORIE_PARTAGEE } = { targetLevel: 'BLOOD', relation: SANG, partages: PARTAGES }) {
  const links = relationStore({
    friendRequests: [{ id: FR_ID, senderId: AUTRE, receiverId: MOI, status: 'accepted', targetLevel: niveau.targetLevel }],
    relations: [niveau.relation],
  });
  const reglages = ritualSharesStore(niveau.partages);
  const prisma = {
    user: { findUnique: jest.fn(async () => ({ id: MOI, blockedUserIds: [], deactivatedAt: null })), findFirst: jest.fn(async () => null) },
    friendRequest: links.prisma.friendRequest,
    userRelation: links.prisma.userRelation,
    relationFeatureSetting: reglages.relationFeatureSetting,
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('notificationService', {
    emitFriendRequestCancelled: jest.fn(),
    retractFriendRequestNotifications: jest.fn(async () => undefined),
  } as never);
  app.decorate('socialEvents', null as never);
  app.decorate('authenticate', authenticate);
  await app.register(directoryFriendRequestsRoutes, { prefix: PREFIXE });
  await app.ready();
  const res = await app.inject({
    method: 'PATCH', url: `${PREFIXE}/friend-requests/${FR_ID}`,
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'dismiss' }),
  });
  await app.close();
  return { status: res.statusCode, partages: reglages.rows(), liens: links.relations() };
}

async function bloquerLAutre(times = 1, pannes = 0) {
  const store = pairInteractionStore({
    users: [
      { id: MOI, birthDate: ADULT, blockedUserIds: [] },
      { id: AUTRE, birthDate: ADULT, blockedUserIds: [] },
    ] as never,
    relations: [SANG] as never,
  });
  const reglages = ritualSharesStore(PARTAGES);
  const panne = { active: false };
  const enPanne = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => async (...args: A): Promise<R> => {
    if (panne.active) throw new Error('mongo down');
    return fn(...args);
  };
  const relationFeatureSetting = {
    ...reglages.relationFeatureSetting,
    findUnique: enPanne(reglages.relationFeatureSetting.findUnique),
    updateMany: enPanne(reglages.relationFeatureSetting.updateMany),
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', { ...store.prisma, relationFeatureSetting } as never);
  app.decorate('authenticate', authenticate);
  await app.register(directoryBlocksRoutes, { prefix: PREFIXE });
  await app.ready();
  const statuses: number[] = [];
  const apresChaqueAppel: Array<ReturnType<typeof reglages.rows>> = [];
  for (let i = 0; i < times; i += 1) {
    panne.active = i < pannes;
    const res = await app.inject({ method: 'PUT', url: `${PREFIXE}/blocks/${AUTRE}` });
    statuses.push(res.statusCode);
    await settle();
    apresChaqueAppel.push(reglages.rows());
  }
  await app.close();
  return { statuses, partages: reglages.rows(), apresChaqueAppel };
}

const partage = (rows: Array<Record<string, unknown>>, ownerId: string) => rows.find((row) => row.ownerId === ownerId);

describe('#14924 — la rupture d’une demande de Sang acceptée éteint les partages du rituel', () => {
  it('les quatre partages passent à faux dans les DEUX sens ; la date de retrait ne trace que le geste de l’acteur', async () => {
    const { status, partages } = await rompreLeSang();

    expect(status).toBe(200);
    expect(partage(partages, MOI)).toMatchObject({ ...SHARES_OFF, listeningTitleWithdrawnAt: expect.any(Date) });
    expect(partage(partages, AUTRE)).toMatchObject(SHARES_OFF);
    expect(partage(partages, AUTRE)).not.toHaveProperty('listeningTitleWithdrawnAt');
  });

  it('ne touche pas aux blocages de réception (Bring, talkie) : ce ne sont pas des partages', async () => {
    const { partages } = await rompreLeSang();

    expect(partage(partages, MOI)).toHaveProperty('bringBlockedAt', null);
  });
});

describe('#14924 audit — la rupture d’une demande Proche acceptée éteint la catégorie d’écoute, comme la baisse', () => {
  it('le lien retombe à Ami : la catégorie d’écoute s’éteint dans les deux sens, datée chez l’acteur seul', async () => {
    const { status, partages } = await rompreLeSang({ targetLevel: 'CLOSE', relation: PROCHE, partages: CATEGORIE_PARTAGEE });

    expect(status).toBe(200);
    expect(partage(partages, MOI)).toMatchObject({ listeningCategoryShared: false, listeningCategoryWithdrawnAt: expect.any(Date) });
    expect(partage(partages, AUTRE)).toMatchObject({ listeningCategoryShared: false });
    expect(partage(partages, AUTRE)).not.toHaveProperty('listeningCategoryWithdrawnAt');
  });

  it('une rupture du Sang retombe à Proche : la catégorie d’écoute, donnée à un Proche, reste accordée', async () => {
    const { partages } = await rompreLeSang({
      targetLevel: 'BLOOD', relation: SANG, partages: CATEGORIE_PARTAGEE,
    });

    expect(partage(partages, MOI)).toMatchObject({ listeningCategoryShared: true });
    expect(partage(partages, AUTRE)).toMatchObject({ listeningCategoryShared: true });
  });
});

describe('#14924 — le blocage éteint les partages du rituel', () => {
  it('bloquer un Sang éteint les quatre partages dans les deux sens', async () => {
    const { statuses, partages } = await bloquerLAutre();

    expect(statuses).toEqual([200]);
    expect(partage(partages, MOI)).toMatchObject(SHARES_OFF);
    expect(partage(partages, AUTRE)).toMatchObject(SHARES_OFF);
  });

  it('rejoué sur un blocage déjà posé, le retrait converge : un blocage dont le retrait a échoué se solde au rejeu', async () => {
    const { statuses, partages, apresChaqueAppel } = await bloquerLAutre(2, 1);

    expect(statuses).toEqual([200, 200]);
    expect(partage(apresChaqueAppel[0], MOI)).toMatchObject(SHARES_ON);
    expect(partage(apresChaqueAppel[0], AUTRE)).toMatchObject(SHARES_ON);
    expect(partage(partages, MOI)).toMatchObject(SHARES_OFF);
    expect(partage(partages, AUTRE)).toMatchObject(SHARES_OFF);
  });
});
