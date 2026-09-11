/**
 * #6080 — **la conversation directe née d'une amitié acceptée n'ouvre plus une
 * table de droits FERMÉE.**
 *
 * `conversationDirecte` (`routes/directory/friend-requests-core.ts`) écrivait
 * un littéral à la main pour les DEUX participants :
 * `canSendVideos: false, canSendAudios: false`. Depuis #5151,
 * `MessagingService` refuse une pièce jointe dont le droit de TYPE vaut
 * explicitement `false` — deux amis ne pouvaient donc s'envoyer ni vidéo, ni
 * message vocal, ni document dans le fil que leur amitié venait de créer.
 *
 * Le témoin lit l'objet passé à `conversation.create`, jamais la réponse : la
 * table de droits ne ressort d'aucune charge servie, et une assertion sur la
 * réponse resterait verte quelle que soit la table écrite.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));
jest.mock('../../../../utils/withMutationLog', () => {
  class MutationResultGone extends Error {}
  return { withMutationLog: jest.fn(async (args: any) => args.op()), MutationResultGone };
});
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: async () => new Map(),
  }),
}));

import { directoryFriendRequestsRoutes } from '../../../../routes/directory/friend-requests';
import { FOUNDING_MEMBER_PERMISSIONS } from '../../../../services/participantRights';

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
      delete: jest.fn<any>(async () => ({})),
      findMany: jest.fn<any>(async () => []),
      create: jest.fn<any>(async () => ({ id: FR_ID })),
    },
    conversation: {
      // Aucune conversation directe préexistante : l'acceptation en CRÉE une,
      // et c'est cette création qui porte la table de droits.
      findFirst: jest.fn<any>(async () => null),
      create: jest.fn<any>(async () => ({ id: 'convid00000000000000001', identifier: 'abc', type: 'direct' })),
    },
  };
}

async function accepter() {
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
    body: JSON.stringify({ action: 'accept' }),
  });
  await app.close();

  expect(res.statusCode).toBe(200);
  expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
  const data = (prisma.conversation.create.mock.calls[0] as any[])[0].data;
  return data.participants.create as Array<{ userId: string; permissions: Record<string, boolean> }>;
}

describe("#6080 — la conversation directe d'une amitié acceptée naît OUVERTE", () => {
  it('écrit la table du site unique, champ par champ, pour les DEUX participants', async () => {
    const lignes = await accepter();

    expect(lignes).toHaveLength(2);
    for (const ligne of lignes) {
      // `toEqual` et non `toMatchObject` : un droit EN PLUS serait une
      // divergence de table, pas un supplément.
      expect(ligne.permissions).toEqual({ ...FOUNDING_MEMBER_PERMISSIONS });
    }
  });

  it('ouvre VIDÉO et AUDIO — les deux droits que la garde #5151 lisait à `false`', async () => {
    const [premier, second] = await accepter();

    expect(premier.permissions.canSendVideos).toBe(true);
    expect(premier.permissions.canSendAudios).toBe(true);
    expect(premier.permissions.canSendFiles).toBe(true);
    expect(second.permissions.canSendVideos).toBe(true);
    expect(second.permissions.canSendAudios).toBe(true);
  });

  it("n'ouvre RIEN d'autre : position et liens restent fermés", async () => {
    const [premier] = await accepter();

    expect(premier.permissions.canSendLocations).toBe(false);
    expect(premier.permissions.canSendLinks).toBe(false);
  });

  it("garde l'historique OUVERT — un fondateur n'a pas d'avant à se cacher", async () => {
    // Le site n'écrivait pas `canViewHistory` : le défaut de schéma (`true`)
    // s'appliquait, et `historyFloorFor` rendait un plancher `null`. Écrire
    // `false` ici ferait passer ce plancher à `joinedAt` sans qu'aucun besoin
    // produit ne le demande.
    const [premier] = await accepter();

    expect(premier.permissions.canViewHistory).toBe(true);
  });
});
