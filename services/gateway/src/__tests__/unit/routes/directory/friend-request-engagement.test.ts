/**
 * #8959 — accepter une amitié crédite `social.friendship` aux DEUX parties,
 * chacune avec l'AUTRE pour cible : l'opération paie une fois par personne.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

// Directive porteur du 2026-11-01 : une conversation naît chiffrée au repos,
// sous une clé obtenue avant sa création.
jest.mock('../../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn(async () => ({ activationKeyId: async () => 'server-key' })),
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));
jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(async (args: any) => args.op()),
}));
const recordActivity = jest.fn<any>(async () => undefined);
jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn<any>().mockImplementation(() => ({ recordActivity })),
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: async () => new Map(),
  }),
}));

import { directoryFriendRequestsRoutes } from '../../../../routes/directory/friend-requests';

const PREFIXE = '/api/v1/directory';
const MOI = '507f1f77bcf86cd799439011';
const AUTRE = '507f1f77bcf86cd799439022';
const FR_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

const PARTIE = {
  id: AUTRE, username: 'alice', firstName: 'Alice', lastName: 'A', displayName: 'Alice', avatar: null,
  isOnline: false, lastActiveAt: null,
};

function prismaDouble() {
  return {
    user: {
      // #13933 — « l'un a-t-il bloqué l'autre ? », relu avant d'accepter (`isBlockedBetween`).
      findFirst: jest.fn<any>(async () => null),
      findUnique: jest.fn<any>(async (args: any) =>
        args?.where?.id === MOI
          ? { id: MOI, blockedUserIds: [], displayName: 'Moi', username: 'moi', deactivatedAt: null }
          : { id: AUTRE, blockedUserIds: [], displayName: 'Alice', username: 'alice', deactivatedAt: null }
      ),
    },
    friendRequest: {
      findFirst: jest.fn<any>(async () => null),
      findUnique: jest.fn<any>(async (args: any) =>
        args?.select
          ? { id: FR_ID, senderId: AUTRE, receiverId: MOI, status: 'pending' }
          : { id: FR_ID, senderId: AUTRE, receiverId: MOI, status: 'accepted', sender: PARTIE, receiver: PARTIE }
      ),
      update: jest.fn<any>(async () => ({ id: FR_ID, senderId: AUTRE, receiverId: MOI, status: 'accepted', sender: PARTIE, receiver: PARTIE })),
      deleteMany: jest.fn<any>(async () => ({ count: 1 })),
      findMany: jest.fn<any>(async () => []),
      create: jest.fn<any>(async () => ({ id: FR_ID })),
    },
    // Depuis les crans (#13933), accepter rejuge la demande sur le lien de la paire, même
    // sans niveau visé : les deux sont déjà Connaissances, le cran qui précède Ami.
    userRelation: {
      findUnique: jest.fn<any>(async () => ({
        id: 'aa0000000000000000000099', userLowId: MOI, userHighId: AUTRE,
        grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE', transitions: [],
      })),
      findMany: jest.fn<any>(async () => []),
      updateMany: jest.fn<any>(async () => ({ count: 1 })),
    },
    pairInteractionDay: { findMany: jest.fn<any>(async () => []) },
    conversation: {
      // Aucune conversation directe préexistante : l'acceptation en CRÉE une,
      // et c'est cette création qui porte la table de droits.
      findFirst: jest.fn<any>(async () => null),
      create: jest.fn<any>(async () => ({ id: 'convid00000000000000001', identifier: 'abc', type: 'direct' })),
    },
  };
}

async function trancher(action: 'accept' | 'reject') {
  const prisma = prismaDouble();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('notificationService', null);
  app.decorate('socialEvents', null);
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: MOI };
    req.authContext = { isAuthenticated: true, type: 'user', userId: MOI, registeredUser: { id: MOI, role: 'USER' } };
  });
  await app.register(directoryFriendRequestsRoutes, { prefix: PREFIXE });
  await app.ready();

  const res = await app.inject({
    method: 'PATCH',
    url: `${PREFIXE}/friend-requests/${FR_ID}`,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  await app.close();

  return res.statusCode;
}

describe('#8959 — une amitié acceptée crédite `social.friendship` par personne', () => {
  it("crédite chaque partie avec l'autre pour cible", async () => {
    recordActivity.mockClear();

    expect(await trancher('accept')).toBe(200);

    expect(recordActivity).toHaveBeenCalledTimes(2);
    expect(recordActivity).toHaveBeenCalledWith(AUTRE, 'social.friendship', { targetId: MOI });
    expect(recordActivity).toHaveBeenCalledWith(MOI, 'social.friendship', { targetId: AUTRE });
  });

  it('ne crédite rien sur un refus', async () => {
    recordActivity.mockClear();

    await trancher('reject');

    expect(recordActivity).not.toHaveBeenCalled();
  });
});
