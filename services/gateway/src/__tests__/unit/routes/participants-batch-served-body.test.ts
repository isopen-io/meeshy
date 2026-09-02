/**
 * #4557 — **le corps SERVI d'un lot d'ajout**, pas l'objet que le handler pose.
 *
 * `participants-batch-add.test.ts`, son aîné, appelle le gestionnaire avec un
 * DOUBLE de `reply` et un `sendSuccess` mocké : il atteste l'objet qu'on
 * passe, jamais l'octet qui part. Or c'est précisément entre les deux que
 * `fast-json-stringify` opère — il **retire en silence toute clé qu'aucun
 * schéma ne nomme**, et un tableau de verdicts dont les éléments seraient
 * `{ type: 'object' }` NU sortirait en `[{},{},{}]`.
 *
 * Le verdict par personne n'a de valeur que s'il ATTEINT le client (leçon du
 * cycle 122 : « qui AFFICHE ce que le résolveur élit ? »). Un lot dont les
 * refus sont rognés à la sérialisation rend au web exactement ce qu'il avait
 * avant — un succès muet — pendant que la passerelle croit l'avoir corrigé.
 *
 * Ce fichier monte donc la VRAIE route sur une VRAIE instance Fastify, avec
 * son schéma de réponse de production, et lit `res.json()`.
 *
 * **Ce que la mesure a trouvé** : `outcome` passe (il est déclaré), mais
 * `participantId` — produit par `admitOneParticipant`, typé dans
 * `ParticipantAdmissionVerdict`, et ASSERTÉ par l'aîné — n'était nommé par
 * aucun schéma et ne quittait donc jamais la passerelle. L'aîné le « prouvait »
 * en restant du bon côté du sérialiseur.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockResolveConversationId = jest.fn<any>();

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../utils/participant-lookup-cache', () => ({
  invalidateParticipantLookup: jest.fn<any>(),
}));

jest.mock('../../../services/conversations/joinSystemMessage', () => ({
  postJoinSystemMessage: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock('../../../socketio/emitConversationMemberCount', () => ({
  emitConversationMemberCountEvent: jest.fn<any>(),
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>(),
    }),
  },
}));

// `utils/response` n'est PAS mocké : c'est lui qui compose l'enveloppe que le
// schéma va filtrer. Le mocker rendrait ce fichier identique à son aîné.

import Fastify, { type FastifyInstance } from 'fastify';
import {
  registerParticipantWriteRoutes,
  MAX_PARTICIPANTS_PER_CALL,
} from '../../../routes/conversations/participants-writes';

const CONV_ID = '507f1f77bcf86cd799439011';
const ACTOR = '507f1f77bcf86cd799439022';
const NOUVEAU_A = '507f1f77bcf86cd799439033';
const NOUVEAU_B = '507f1f77bcf86cd799439044';
const DEJA_MEMBRE = '507f1f77bcf86cd799439055';
const BANNI = '507f1f77bcf86cd799439066';
const REVENANT = '507f1f77bcf86cd799439077';
const INCONNU = '507f1f77bcf86cd799439099';

function ligne(over: Record<string, unknown>) {
  return {
    conversationId: CONV_ID, role: 'member', isActive: true, bannedAt: null,
    joinedAt: new Date('2026-01-01'), type: 'user',
    permissions: { canSendMessages: true }, ...over,
  } as Record<string, unknown>;
}

function rowsMatching(rows: any[], where: any) {
  return rows.filter((row) => {
    if (where?.conversationId !== undefined && where.conversationId !== row.conversationId) return false;
    if (where?.isActive !== undefined && where.isActive !== row.isActive) return false;
    if (where?.type !== undefined && where.type !== row.type) return false;
    if (where?.NOT?.userId !== undefined && where.NOT.userId === row.userId) return false;
    if (typeof where?.userId === 'string' && where.userId !== row.userId) return false;
    if (where?.userId?.notIn && where.userId.notIn.includes(row.userId)) return false;
    return true;
  });
}

/** Monte la VRAIE route sur une VRAIE app — schéma de réponse compris. */
async function monterApp(actorRole: string = 'admin'): Promise<{
  app: FastifyInstance; prisma: any;
}> {
  const rows: any[] = [
    ligne({ id: 'p-actor', userId: ACTOR, role: actorRole }),
    ligne({ id: 'p-membre', userId: DEJA_MEMBRE }),
    ligne({ id: 'p-banni', userId: BANNI, isActive: false, bannedAt: new Date('2026-02-01') }),
    ligne({ id: 'p-revenant', userId: REVENANT, isActive: false }),
  ];
  const connus = new Set([ACTOR, DEJA_MEMBRE, BANNI, REVENANT, NOUVEAU_A, NOUVEAU_B]);
  const compte = (id: string) => ({
    id, username: 'u', displayName: 'U', firstName: null, lastName: null,
    avatar: null, systemLanguage: 'fr',
  });

  const prisma: any = {
    conversation: {
      findUnique: jest.fn<any>(async () => ({
        id: CONV_ID, type: 'group', title: 'T', createdAt: new Date('2025-01-01'),
        isActive: true, closedAt: null,
      })),
    },
    participant: {
      findFirst: jest.fn<any>(async (a: any) => rowsMatching(rows, a?.where)[0] ?? null),
      findMany: jest.fn<any>(async (a: any) => rowsMatching(rows, a?.where)),
      create: jest.fn<any>(async (a: any) => {
        const cree = { ...ligne(a?.data), id: `created-${a?.data?.userId}` };
        rows.push(cree);
        return cree;
      }),
      update: jest.fn<any>(async (a: any) => ({ id: a?.where?.id, ...a?.data })),
    },
    user: {
      findFirst: jest.fn<any>(async (a: any) => (connus.has(a?.where?.id) ? compte(a.where.id) : null)),
      findUnique: jest.fn<any>(async (a: any) => (connus.has(a?.where?.id) ? compte(a.where.id) : null)),
    },
    message: { create: jest.fn<any>(async (a: any) => ({ id: 'sys', ...a?.data })) },
  };

  const emit = jest.fn<any>();
  const chainable: any = { emit };
  chainable.to = jest.fn<any>(() => chainable);
  chainable.except = jest.fn<any>(() => chainable);

  const app = Fastify({ logger: false });
  (app as any).prisma = prisma;
  (app as any).notificationService = {
    createAddedToConversationNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberJoinedNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
  };
  (app as any).socketIOHandler = {
    getManager: jest.fn<any>().mockReturnValue({
      getIO: jest.fn<any>().mockReturnValue(chainable),
      joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
      broadcastMessage: jest.fn<any>().mockResolvedValue(undefined),
    }),
  };

  const requiredAuth = async (req: any) => {
    req.authContext = {
      type: 'user', userId: ACTOR, isAuthenticated: true,
      registeredUser: { id: ACTOR, role: 'USER' },
    };
  };

  registerParticipantWriteRoutes(app as any, prisma, requiredAuth);
  await app.ready();
  return { app, prisma };
}

async function poster(app: FastifyInstance, payload: unknown) {
  return app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/participants`, payload: payload as never });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveConversationId.mockResolvedValue(CONV_ID);
});

describe('#4557 — les cinq verdicts ATTEIGNENT le client', () => {
  it('les quatre issues du critère de fin sortent du sérialiseur, chacune sous son nom', async () => {
    const { app } = await monterApp();
    try {
      const res = await poster(app, { userIds: [NOUVEAU_A, REVENANT, DEJA_MEMBRE, BANNI, INCONNU] });

      expect(res.statusCode).toBe(200);
      // `res.json()` — l'octet servi, pas l'objet posé. C'est toute la
      // différence avec l'aîné.
      const corps = res.json();
      expect(corps.data.results.map((r: any) => r.outcome)).toEqual([
        'new', 'rejoin', 'already-member', 'banned', 'not-found',
      ]);
      expect(corps.data.results.map((r: any) => r.userId)).toEqual([
        NOUVEAU_A, REVENANT, DEJA_MEMBRE, BANNI, INCONNU,
      ]);
    } finally {
      await app.close();
    }
  });

  it('un verdict n’est pas un objet VIDE — la garde qui rougit sur `items: { type: "object" }` nu', async () => {
    const { app } = await monterApp();
    try {
      const corps = (await poster(app, { userIds: [NOUVEAU_A] })).json();

      // Sans les `properties` déclarées, fast-json-stringify servirait `[{}]`
      // : un tableau de la bonne LONGUEUR, vide de tout ce qui le rend utile.
      expect(Object.keys(corps.data.results[0]).sort()).toEqual(['outcome', 'participantId', 'userId']);
    } finally {
      await app.close();
    }
  });

  it('`participantId` est SERVI pour une admission — produit, typé, et longtemps rogné', async () => {
    const { app } = await monterApp();
    try {
      const corps = (await poster(app, { userIds: [NOUVEAU_A] })).json();

      expect(corps.data.results[0].participantId).toBe(`created-${NOUVEAU_A}`);
    } finally {
      await app.close();
    }
  });

  it('et il est ABSENT d’un refus — un refus n’a pas de ligne à nommer', async () => {
    const { app } = await monterApp();
    try {
      const corps = (await poster(app, { userIds: [DEJA_MEMBRE] })).json();

      expect(corps.data.results[0].participantId).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});

describe('#4557 — un refus n’emporte pas les autres', () => {
  it('un refus au MILIEU du lot laisse passer ceux d’avant ET ceux d’après', async () => {
    const { app, prisma } = await monterApp();
    try {
      const res = await poster(app, { userIds: [NOUVEAU_A, BANNI, NOUVEAU_B] });

      // Le témoin central de l'issue : un `Promise.all` côté client rejetait au
      // premier échec, et une boucle serveur qui relaierait le refus ferait
      // exactement la même chose une couche plus bas.
      expect(res.statusCode).toBe(200);
      const corps = res.json();
      expect(corps.success).toBe(true);
      expect(corps.data.results.map((r: any) => r.outcome)).toEqual(['new', 'banned', 'new']);
      // Ceux d'APRÈS le refus sont écrits : c'est ce qu'un `throw` au tour 2
      // ferait disparaître sans qu'aucune assertion de longueur ne le voie.
      expect(prisma.participant.create).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });

  it('le décompte servi DIT le refus partiel, il ne le tait pas', async () => {
    const { app } = await monterApp();
    try {
      const corps = (await poster(app, { userIds: [NOUVEAU_A, DEJA_MEMBRE, NOUVEAU_B] })).json();

      expect(corps.data.message).toContain('2/3');
    } finally {
      await app.close();
    }
  });
});

describe('#4557 — ce qui n’est PAS un verdict par personne', () => {
  it('un rang insuffisant refuse la REQUÊTE — jamais cinquante verdicts identiques', async () => {
    const { app, prisma } = await monterApp('member');
    try {
      const res = await poster(app, { userIds: [NOUVEAU_A, NOUVEAU_B] });

      expect(res.statusCode).toBe(403);
      expect(res.json().data).toBeUndefined();
      expect(prisma.participant.create).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it(`un lot de ${MAX_PARTICIPANTS_PER_CALL + 1} est refusé par le SCHÉMA, et rien n’est écrit`, async () => {
    const { app, prisma } = await monterApp();
    try {
      const trop = Array.from({ length: MAX_PARTICIPANTS_PER_CALL + 1 }, (_, i) => `u${i}`);

      const res = await poster(app, { userIds: trop });

      expect(res.statusCode).toBe(400);
      expect(prisma.participant.create).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
