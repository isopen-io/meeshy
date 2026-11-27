/**
 * #19539 — quand un lien descend sous Ami, ou qu'une amitié est rompue, l'autre cesse
 * aussitôt de voir ma pastille « en ligne » ; un Proche redevenu Ami perd ma dernière
 * connexion. La passerelle pousse, dans la room de chaque lecteur de la paire dont la
 * présence SERVIE a changé, la transition `user:status` que la loi lui sert désormais —
 * la forme d'une transition ordinaire, jamais un événement qui nomme la baisse (RG-07).
 * Un tiers ne reçoit rien ; une présence servie inchangée ne fait rien partir.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

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
  getCacheStore: () => ({ del: async () => undefined, get: async () => null, set: async () => undefined }),
}));

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { relationsRoutes } from '../../../../routes/relations';
import { directoryFriendRequestsRoutes } from '../../../../routes/directory/friend-requests';
import { AUTRE, MOI, NOW, TIERS, buildRelationApp, demande, freezeClock, lien, thawClock, type AppOptions, type TestApp } from '../../../helpers/relation-app';

const VU = new Date(NOW.getTime() - 90_000);
const MOI_EN_LIGNE = { [MOI]: { isOnline: true, lastActiveAt: VU }, [AUTRE]: { isOnline: false, lastActiveAt: null } };

const statuts = (app: TestApp) => app.emissions.filter((e) => e.event === SERVER_EVENTS.USER_STATUS);

const baisser = async (options: AppOptions, level: string) => {
  const app = await buildRelationApp(async (a) => { await a.register(relationsRoutes, { prefix: '/api/v1/relations' }); }, options);
  const res = await app.call('POST', `/api/v1/relations/${AUTRE}/level`, { level });
  await app.close();
  return { res, app };
};

beforeEach(() => freezeClock(NOW));
afterEach(() => thawClock());

describe('#19539 — la baisse rejuge la présence servie dans les deux sens', () => {
  it('sous Ami : l’autre reçoit ma transition hors ligne, sans dernière connexion', async () => {
    const { res, app } = await baisser({ liens: [lien('CLOSE', 'CLOSE')], presence: MOI_EN_LIGNE }, 'ACQUAINTANCE');

    expect(res.status).toBe(200);
    expect(statuts(app)).toEqual([{
      room: `user:${AUTRE}`,
      event: SERVER_EVENTS.USER_STATUS,
      payload: { userId: MOI, username: `U${MOI.slice(-2)}`, isOnline: false, lastActiveAt: null },
    }]);
  });

  it('de Proche à Ami : l’autre me voit encore en ligne, mais ne reçoit plus ma dernière connexion', async () => {
    const { app } = await baisser({ liens: [lien('CLOSE', 'CLOSE')], presence: MOI_EN_LIGNE }, 'FRIEND');

    expect(statuts(app)).toEqual([{
      room: `user:${AUTRE}`,
      event: SERVER_EVENTS.USER_STATUS,
      payload: { userId: MOI, username: `U${MOI.slice(-2)}`, isOnline: true, lastActiveAt: null },
    }]);
  });

  it('la paire entière : je perds aussi la dernière connexion de l’autre, et un tiers ne reçoit rien', async () => {
    const { app } = await baisser({
      liens: [lien('CLOSE', 'CLOSE')],
      presence: { [MOI]: { isOnline: true, lastActiveAt: VU }, [AUTRE]: { isOnline: false, lastActiveAt: VU } },
    }, 'ACQUAINTANCE');

    expect(statuts(app).map((e) => e.room).sort()).toEqual([`user:${AUTRE}`, `user:${MOI}`].sort());
    expect(statuts(app).find((e) => e.room === `user:${MOI}`)?.payload).toEqual({ userId: AUTRE, username: `U${AUTRE.slice(-2)}`, isOnline: false, lastActiveAt: null });
    expect(app.emissions.filter((e) => e.room === `user:${TIERS}`)).toEqual([]);
  });

  it('une présence servie inchangée ne fait rien partir : un Ami hors ligne reste un Ami hors ligne', async () => {
    const { app } = await baisser({ liens: [lien('CLOSE', 'CLOSE')], presence: { [MOI]: { isOnline: false, lastActiveAt: null } } }, 'ACQUAINTANCE');

    expect(statuts(app)).toEqual([]);
  });

  it('une présence que je cachais déjà ne fait rien partir : la baisse ne s’entend pas', async () => {
    const { app } = await baisser({
      liens: [lien('CLOSE', 'CLOSE')],
      presence: MOI_EN_LIGNE,
      privacy: { [MOI]: { showOnlineStatus: false } },
    }, 'ACQUAINTANCE');

    expect(statuts(app)).toEqual([]);
  });
});

describe('#19539 — la rupture d’une amitié acceptée rejuge la présence servie', () => {
  it('l’ancien ami reçoit ma transition hors ligne', async () => {
    const FR = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const app = await buildRelationApp(async (a) => { await a.register(directoryFriendRequestsRoutes, { prefix: '/api/v1/directory' }); }, {
      demandes: [demande(FR, 'accepted', MOI, AUTRE, { targetLevel: 'FRIEND' })],
      liens: [lien('FRIEND', 'FRIEND')],
      presence: MOI_EN_LIGNE,
    });
    const res = await app.call('PATCH', `/api/v1/directory/friend-requests/${FR}`, { action: 'cancel' });
    await app.close();

    expect(res.status).toBe(200);
    expect(statuts(app)).toEqual([{
      room: `user:${AUTRE}`,
      event: SERVER_EVENTS.USER_STATUS,
      payload: { userId: MOI, username: `U${MOI.slice(-2)}`, isOnline: false, lastActiveAt: null },
    }]);
  });
});
