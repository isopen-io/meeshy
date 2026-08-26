/**
 * conversation-member-removal.test.ts
 *
 * Deux gestes, une même cible mal adressée.
 *
 * ─── EXPULSER ────────────────────────────────────────────────────────────────
 *
 * `DELETE /conversations/:id/participants/:userId` filtrait sur la seule colonne
 * `userId`. Un visiteur venu par un lien partagé n'a PAS de ligne `User` : son
 * `Participant.userId` est `null`, et sa seule identité est son `Participant.id`.
 * La requête ne matchait donc rien — et comme l'écriture passait par
 * `updateMany`, qui ne trouve aucune ligne SANS échouer, la route répondait
 * **200**. L'interface retirait la personne, aucune diffusion ne partait, et le
 * prochain chargement la ramenait.
 *
 * ─── BANNIR ──────────────────────────────────────────────────────────────────
 *
 * Bannir posait `bannedAt` — ce qui ferme la porte de CETTE personne — et
 * laissait grand ouvert le lien par lequel elle était entrée. Décision produit :
 * bannir sort de la conversation ET invalide ce lien.
 *
 * ─── LE PIÈGE QUE CES TÉMOINS GARDENT ────────────────────────────────────────
 *
 * Les deux événements déclaraient `userId: string` NON nullable chez les trois
 * clients. Émettre `null` pour un anonyme y ferait échouer le décodage de
 * l'événement ENTIER (Swift `Decodable`, kotlinx). D'où `participantId`, TOUJOURS
 * présent : c'est la seule identité qu'un visiteur sans compte possède, et le
 * seul champ sur lequel un client peut retirer la bonne ligne.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const MEMBER_USER_ID = '507f1f77bcf86cd799439002';
const CONV_ID = '507f1f77bcf86cd7994390bb';
const ANON_PARTICIPANT_ID = '507f1f77bcf86cd7994390cc';
const SHARE_LINK_ID = '507f1f77bcf86cd7994390dd';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));
jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args),
  invalidateConversationIdCache: jest.fn(),
}));

jest.mock('../../../utils/participant-lookup-cache', () => ({
  invalidateParticipantLookup: jest.fn(),
}));

jest.mock('../../../socketio/endConversationMembership', () => ({
  endConversationMembership: jest.fn(async () => undefined),
}));

const mockResolveForTargets = jest.fn<any>();
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (...args: unknown[]) => mockResolveForTargets(...args),
  }),
}));

type Emitted = { event: string; payload: any };

function makeIo(emitted: Emitted[]) {
  const chain = (): any => ({
    to: () => chain(),
    emit: (event: string, payload: unknown) => emitted.push({ event, payload: payload as any }),
  });
  return { to: () => chain() };
}

/** Le visiteur de lien partagé : pas de `userId`, un `shareLinkId`. */
const anonymousRow = {
  id: ANON_PARTICIPANT_ID,
  conversationId: CONV_ID,
  userId: null,
  type: 'anonymous',
  displayName: 'ano_john_doe799',
  role: 'member',
  isActive: true,
  leftAt: null,
  bannedAt: null,
  shareLinkId: SHARE_LINK_ID,
};

/** Un membre inscrit ajouté à la main : pas de lien d'entrée à fermer. */
const registeredRow = {
  id: 'p-member',
  conversationId: CONV_ID,
  userId: MEMBER_USER_ID,
  type: 'user',
  displayName: 'Grâce',
  role: 'member',
  isActive: true,
  leftAt: null,
  bannedAt: null,
  shareLinkId: null,
};

function createMockPrisma(targets: Array<Record<string, unknown>>) {
  const participantUpdate = jest.fn(async ({ where }: any) => ({
    ...targets.find((t) => t.id === where.id),
  }));
  const shareLinkUpdate = jest.fn(async () => ({ id: SHARE_LINK_ID, isActive: false }));

  const findFirst = jest.fn(async ({ where }: any) => {
    // L'appelant : administrateur de la conversation.
    if (where.userId === ADMIN_ID) {
      return { id: 'p-admin', userId: ADMIN_ID, role: 'admin', isActive: true, user: { role: 'USER' } };
    }
    // La cible, cherchée sous l'une OU l'autre colonne.
    return (
      targets.find((t) =>
        (where.userId !== undefined && t.userId === where.userId) ||
        (where.id !== undefined && t.id === where.id),
      ) ?? null
    );
  });

  const prisma = {
    participant: {
      findFirst,
      findMany: jest.fn(async () => []),
      update: participantUpdate,
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    conversation: { findUnique: jest.fn(async () => ({ id: CONV_ID, isActive: true, closedAt: null })) },
    conversationShareLink: { update: shareLinkUpdate },
  } as unknown as PrismaClient;

  return { prisma, participantUpdate, shareLinkUpdate };
}

async function buildApp(prisma: PrismaClient, emitted: Emitted[], register: 'participants' | 'ban') {
  const app = Fastify({ logger: false });
  const auth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role: 'USER' },
      hasFullAccess: true,
    };
  };
  (app as unknown as Record<string, unknown>).socketIOHandler = {
    getManager: () => ({ getIO: () => makeIo(emitted), invalidateParticipantCache: jest.fn() }),
  };
  (app as unknown as Record<string, unknown>).notificationService = null;

  if (register === 'participants') {
    const { registerParticipantsRoutes } = await import('../../../routes/conversations/participants');
    registerParticipantsRoutes(app, prisma, auth, auth);
  } else {
    const { registerBanRoutes } = await import('../../../routes/conversations/ban');
    registerBanRoutes(app, prisma, auth, auth);
  }
  await app.ready();
  return app;
}

const call = (app: FastifyInstance, method: 'DELETE' | 'PATCH', url: string) =>
  app.inject({ method, url, headers: { authorization: 'Bearer x' } });

beforeEach(() => {
  mockResolveConversationId.mockReset();
  mockResolveConversationId.mockResolvedValue(CONV_ID);
  mockResolveForTargets.mockReset();
  mockResolveForTargets.mockResolvedValue(new Map());
});

describe('DELETE /conversations/:id/participants/:key — expulser', () => {
  it('sort un visiteur SANS COMPTE désigné par son Participant.id', async () => {
    const emitted: Emitted[] = [];
    const { prisma, participantUpdate } = createMockPrisma([anonymousRow]);
    const app = await buildApp(prisma, emitted, 'participants');

    const res = await call(app, 'DELETE', `/conversations/${CONV_ID}/participants/${ANON_PARTICIPANT_ID}`);

    expect(res.statusCode).toBe(200);
    // L'EFFET, pas le statut : la route répondait déjà 200 sans rien écrire.
    expect(participantUpdate).toHaveBeenCalledTimes(1);
    const written = (participantUpdate.mock.calls[0] as any[])[0];
    expect(written.where).toEqual({ id: ANON_PARTICIPANT_ID });
    expect(written.data).toMatchObject({ isActive: false });
    await app.close();
  });

  it('sort un membre inscrit désigné par son User.id', async () => {
    const emitted: Emitted[] = [];
    const { prisma, participantUpdate } = createMockPrisma([registeredRow]);
    const app = await buildApp(prisma, emitted, 'participants');

    const res = await call(app, 'DELETE', `/conversations/${CONV_ID}/participants/${MEMBER_USER_ID}`);

    expect(res.statusCode).toBe(200);
    expect((participantUpdate.mock.calls[0] as any[])[0].where).toEqual({ id: registeredRow.id });
    await app.close();
  });

  it("répond 404 sur un identifiant qui ne désigne personne, et n'écrit pas", async () => {
    // `updateMany` absorbait ce cas en silence : rien à mettre à jour, 200.
    const emitted: Emitted[] = [];
    const { prisma, participantUpdate } = createMockPrisma([]);
    const app = await buildApp(prisma, emitted, 'participants');

    const res = await call(app, 'DELETE', `/conversations/${CONV_ID}/participants/507f1f77bcf86cd7994390ff`);

    expect(res.statusCode).toBe(404);
    expect(participantUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it("annonce le départ avec le participantId, et un userId NUL pour un visiteur sans compte", async () => {
    const emitted: Emitted[] = [];
    const { prisma } = createMockPrisma([anonymousRow]);
    const app = await buildApp(prisma, emitted, 'participants');

    await call(app, 'DELETE', `/conversations/${CONV_ID}/participants/${ANON_PARTICIPANT_ID}`);

    const left = emitted.find((e) => e.event === SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT);
    expect(left).toBeDefined();
    // `participantId` est la SEULE identité d'un visiteur sans compte — sans lui
    // aucun client ne sait quelle ligne retirer.
    expect(left!.payload.participantId).toBe(ANON_PARTICIPANT_ID);
    expect(left!.payload.userId).toBeNull();
    await app.close();
  });
});

describe('PATCH /conversations/:id/participants/:key/ban — bannir', () => {
  it("ferme le lien par lequel le banni était entré", async () => {
    const emitted: Emitted[] = [];
    const { prisma, shareLinkUpdate } = createMockPrisma([anonymousRow]);
    const app = await buildApp(prisma, emitted, 'ban');

    const res = await call(app, 'PATCH', `/conversations/${CONV_ID}/participants/${ANON_PARTICIPANT_ID}/ban`);

    expect(res.statusCode).toBe(200);
    expect(shareLinkUpdate).toHaveBeenCalledTimes(1);
    expect((shareLinkUpdate.mock.calls[0] as any[])[0]).toMatchObject({
      where: { id: SHARE_LINK_ID },
      data: { isActive: false },
    });
    await app.close();
  });

  it('nomme le lien fermé dans sa réponse', async () => {
    const emitted: Emitted[] = [];
    const { prisma } = createMockPrisma([anonymousRow]);
    const app = await buildApp(prisma, emitted, 'ban');

    const res = await call(app, 'PATCH', `/conversations/${CONV_ID}/participants/${ANON_PARTICIPANT_ID}/ban`);

    expect(JSON.parse(res.body).data.closedShareLinkId).toBe(SHARE_LINK_ID);
    await app.close();
  });

  it("ne touche à aucun lien quand le banni n'est pas venu par un lien", async () => {
    // Un créateur, ou un membre ajouté à la main : il n'y a pas de porte à fermer.
    const emitted: Emitted[] = [];
    const { prisma, shareLinkUpdate } = createMockPrisma([registeredRow]);
    const app = await buildApp(prisma, emitted, 'ban');

    const res = await call(app, 'PATCH', `/conversations/${CONV_ID}/participants/${MEMBER_USER_ID}/ban`);

    expect(res.statusCode).toBe(200);
    expect(shareLinkUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('bannit un visiteur sans compte désigné par son Participant.id', async () => {
    const emitted: Emitted[] = [];
    const { prisma, participantUpdate } = createMockPrisma([anonymousRow]);
    const app = await buildApp(prisma, emitted, 'ban');

    await call(app, 'PATCH', `/conversations/${CONV_ID}/participants/${ANON_PARTICIPANT_ID}/ban`);

    expect((participantUpdate.mock.calls[0] as any[])[0].where).toEqual({ id: ANON_PARTICIPANT_ID });
    expect((participantUpdate.mock.calls[0] as any[])[0].data).toMatchObject({ isActive: false });
    await app.close();
  });

  it('annonce le bannissement avec le participantId et un userId nul', async () => {
    const emitted: Emitted[] = [];
    const { prisma } = createMockPrisma([anonymousRow]);
    const app = await buildApp(prisma, emitted, 'ban');

    await call(app, 'PATCH', `/conversations/${CONV_ID}/participants/${ANON_PARTICIPANT_ID}/ban`);

    const banned = emitted.find((e) => e.event === SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED);
    expect(banned).toBeDefined();
    expect(banned!.payload.participantId).toBe(ANON_PARTICIPANT_ID);
    expect(banned!.payload.userId).toBeNull();
    expect(banned!.payload.closedShareLinkId).toBe(SHARE_LINK_ID);
    await app.close();
  });
});
