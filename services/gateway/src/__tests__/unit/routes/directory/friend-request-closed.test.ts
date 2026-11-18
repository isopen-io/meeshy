/**
 * #19362 — « accepter les demandes de connexion » fermé : une NOUVELLE demande
 * (aucun lien d'au moins Connaissance) est refusée 409 `CONTACT_REQUESTS_CLOSED`,
 * sans ligne ni notification ; une montée entre personnes liées reste permise.
 * Les témoins lisent l'ÉTAT obtenu, sur un cercle autre que le premier.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));
jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(async (args: { op: () => unknown }) => args.op()),
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

import { directoryFriendRequestsRoutes } from '../../../../routes/directory/friend-requests';
import { AUTRE, MOI, NOW, buildRelationApp, freezeClock, lien, thawClock, type AppOptions } from '../../../helpers/relation-app';

const PREFIXE = '/api/v1/directory';
const FERME = { [AUTRE]: { allowContactRequests: false } };

const envoyer = async (body: Record<string, unknown>, options: AppOptions = {}) => {
  const app = await buildRelationApp(async (a) => { await a.register(directoryFriendRequestsRoutes, { prefix: PREFIXE }); }, options);
  const res = await app.call('POST', `${PREFIXE}/friend-requests`, { receiverId: AUTRE, ...body });
  await app.close();
  return { ...res, store: app.store, notifier: app.notifier };
};

beforeEach(() => freezeClock(NOW));
afterEach(() => thawClock());

describe('#19362 — demandes fermées', () => {
  it.each([['Ami', 'FRIEND'], ['Connaissance', 'ACQUAINTANCE'], ['sans niveau', undefined]])(
    'depuis Public vers une cible fermée (%s) : 409 CONTACT_REQUESTS_CLOSED, aucune ligne, aucune notification',
    async (_nom, targetLevel) => {
      const { status, body, store, notifier } = await envoyer(targetLevel ? { targetLevel } : {}, { privacy: FERME });

      expect(status).toBe(409);
      expect(body.code).toBe('CONTACT_REQUESTS_CLOSED');
      expect(store.friendRequests()).toHaveLength(0);
      expect(notifier.createFriendRequestNotification).not.toHaveBeenCalled();
      expect(notifier.emitFriendRequestNew).not.toHaveBeenCalled();
    },
  );

  it('le refus ne dit rien d’autre que son code : ni niveau, ni réglage, ni ligne', async () => {
    const { body } = await envoyer({ targetLevel: 'FRIEND' }, { privacy: FERME });

    expect(body.success).toBe(false);
    expect(body.data).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/allowContactRequests|PUBLIC|currentLevel/);
  });

  it('Connaissance -> Ami vers une cible fermée : la montée reste permise', async () => {
    const { status, store } = await envoyer({ targetLevel: 'FRIEND' }, { privacy: FERME, liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')] });

    expect(status).toBe(201);
    expect(store.friendRequests()[0]).toMatchObject({ senderId: MOI, receiverId: AUTRE, targetLevel: 'FRIEND' });
  });

  it('le réglage de l’ÉMETTEUR ne retient pas sa propre demande', async () => {
    const { status } = await envoyer({ targetLevel: 'FRIEND' }, { privacy: { [MOI]: { allowContactRequests: false } } });

    expect(status).toBe(201);
  });

  it('ouvert explicitement ou absent : la demande depuis Public part (ancien comportement)', async () => {
    const ouvert = await envoyer({ targetLevel: 'FRIEND' }, { privacy: { [AUTRE]: { allowContactRequests: true } } });
    const absent = await envoyer({ targetLevel: 'FRIEND' });

    expect(ouvert.status).toBe(201);
    expect(absent.status).toBe(201);
  });
});
