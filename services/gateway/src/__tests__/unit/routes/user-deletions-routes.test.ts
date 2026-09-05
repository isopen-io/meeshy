/**
 * Route tests — user-deletions routes
 *
 * Covers all 7 routes via Fastify inject:
 *   DELETE /api/conversations/:conversationId/delete-for-me
 *   POST   /api/conversations/:conversationId/restore-for-me
 *   POST   /api/conversations/:conversationId/clear-history
 *   DELETE /api/messages/:messageId/delete-for-me
 *   POST   /api/messages/:messageId/restore-for-me
 *   DELETE /api/messages/bulk/delete-for-me
 *   GET    /api/user/deleted-conversations
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { findFirstHonouringWhere } from '../../helpers/find-first-honouring-where';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(
    () =>
      async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        const token = request.headers['authorization'];
        if (!token) {
          await reply.code(401).send({ success: false, error: 'Unauthorized' });
          return;
        }
        (request as unknown as Record<string, unknown>).authContext = {
          type: 'registered',
          userId: USER_ID,
          hasFullAccess: true,
        };
      }
  ),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// ─── Import under test ────────────────────────────────────────────────────────

import userDeletionsRoutes from '../../../routes/user-deletions';

// ─── Constants ───────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const MSG_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const AUTH = { authorization: 'Bearer token' };

// ─── Prisma factories ─────────────────────────────────────────────────────────

type PrismaParticipant = {
  id: string;
  userId: string;
  conversationId: string;
  isActive: boolean;
  // #4332 — champs consultés par `performConversationDeleteForMe` (le rôle,
  // pour la branche créateur) et par le NOUVEAU `restore-for-me` (`deletedForMe`
  // + la conversation englobante, pour refuser de restaurer dans une
  // conversation FERMÉE). Absents avant ce lot, où `participant.findFirst`
  // ne servait que la vérification d'appartenance de `clear-history`.
  role?: string;
  deletedForMe?: Date | null;
  conversation?: { isActive: boolean };
};
type PrismaConvPref = {
  id: string;
  userId: string;
  conversationId: string;
  clearHistoryBefore: Date | null;
  conversation?: {
    id: string;
    identifier: string;
    title: string | null;
    type: string;
    avatar: string | null;
    lastMessageAt: Date | null;
  };
};
type PrismaMessage = {
  id: string;
  conversationId: string;
  content: string;
  conversation: { participants: PrismaParticipant[] };
};
type PrismaMessageDeletion = {
  userId: string;
  messageId: string;
  deletedAt: Date;
  message: { conversationId: string };
};

const ACTIVE_PARTICIPANT: PrismaParticipant = {
  id: 'part-1',
  userId: USER_ID,
  conversationId: CONV_ID,
  isActive: true,
  role: 'member',
  // Par défaut « déjà supprimé pour soi, conversation encore active » : c'est
  // l'état qu'exige le chemin heureux de `restore-for-me` (partagé par
  // `beforeAll`), et un `deletedForMe` non nul est sans effet sur les DEUX
  // autres routes qui lisent ce mock (`delete-for-me` ne le regarde jamais,
  // `clear-history` ne teste que la vérité de l'objet).
  deletedForMe: new Date('2024-01-01'),
  conversation: { isActive: true },
};

// Ligne que `GET /api/user/deleted-conversations` lit désormais via
// `prisma.participant.findMany` — miroir exact de l'ancien `DELETED_PREF`
// (même sous-objet `conversation`), colonne différente (#4332).
const DELETED_PARTICIPANT = {
  conversationId: CONV_ID,
  deletedForMe: new Date('2024-01-01'),
  conversation: {
    id: CONV_ID,
    identifier: 'conv-123',
    title: 'Test Conv',
    type: 'direct',
    avatar: null,
    lastMessageAt: new Date('2024-01-15'),
  },
};

const MESSAGE: PrismaMessage = {
  id: MSG_ID,
  conversationId: CONV_ID,
  content: 'hello',
  conversation: { participants: [ACTIVE_PARTICIPANT] },
};

const DELETED_PREF: PrismaConvPref = {
  id: 'pref-1',
  userId: USER_ID,
  conversationId: CONV_ID,
  clearHistoryBefore: null,
  conversation: {
    id: CONV_ID,
    identifier: 'conv-123',
    title: 'Test Conv',
    type: 'direct',
    avatar: null,
    lastMessageAt: new Date('2024-01-15'),
  },
};

type PrismaOpts = {
  participantFindFirst?: PrismaParticipant | null | Error;
  // #4332 — l'écrivain de `delete-for-me` (branche non-créateur) et de
  // `restore-for-me` : les deux flippent `isActive`/`deletedForMe` sur la
  // MÊME ligne participant, jamais `UserConversationPreferences`.
  participantUpdate?: PrismaParticipant | Error;
  // #4332 — source de `GET /api/user/deleted-conversations`, qui lisait
  // AUPARAVANT `userConversationPreferences.findMany` (`convPrefFindMany`
  // ci-dessous, conservé pour `clear-history` mais plus consulté par cette
  // liste).
  participantFindMany?: Array<typeof DELETED_PARTICIPANT> | Error;
  convPrefFindUnique?: PrismaConvPref | null | Error;
  convPrefUpsert?: PrismaConvPref | Error;
  messageFindUnique?: PrismaMessage | null | Error;
  msgDeletionFindUnique?: PrismaMessageDeletion | null | Error;
  msgDeletionUpsert?: PrismaMessageDeletion | Error;
  msgDeletionDelete?: object | Error;
  msgFindMany?: Array<{ id: string; conversationId: string }> | Error;
  convPrefFindMany?: PrismaConvPref[] | Error;
  notificationFindMany?: Array<{ id: string; userId: string }> | Error;
};

// Use explicit key presence check so null is a valid mock return value
// (null ?? default would silently substitute the default, breaking "not found" tests)
function opt<T>(val: T | undefined, fallback: T): T {
  return val === undefined ? fallback : val;
}

function resolve<T>(v: T | Error): jest.Mock {
  return v instanceof Error ? jest.fn().mockRejectedValue(v) : jest.fn().mockResolvedValue(v);
}

function makePrisma(opts: PrismaOpts = {}) {
  // `message.conversationId` n'est pas décoratif : la diffusion du retour en
  // vue en a besoin (les caches clients sont indexés par conversation), et la
  // route le lit sur CETTE ligne, la dernière avant sa suppression.
  const DEFAULT_MSG_DELETION = {
    userId: USER_ID,
    messageId: MSG_ID,
    deletedAt: new Date(),
    message: { conversationId: CONV_ID },
  };

  return {
    participant: {
      findFirst: resolve(opt(opts.participantFindFirst, ACTIVE_PARTICIPANT)),
      update: resolve(opt(opts.participantUpdate, { ...ACTIVE_PARTICIPANT, isActive: false })),
      findMany: resolve(opt(opts.participantFindMany, [DELETED_PARTICIPANT])),
    },
    userConversationPreferences: {
      findUnique: resolve(opt(opts.convPrefFindUnique, DELETED_PREF)),
      upsert: resolve(opt(opts.convPrefUpsert, DELETED_PREF)),
      findMany: resolve(opt(opts.convPrefFindMany, [DELETED_PREF])),
    },
    message: {
      findUnique: resolve(opt(opts.messageFindUnique, MESSAGE)),
      findMany: resolve(opt(opts.msgFindMany, [{ id: MSG_ID, conversationId: CONV_ID }])),
    },
    userMessageDeletion: {
      findUnique: resolve(opt(opts.msgDeletionFindUnique, DEFAULT_MSG_DELETION)),
      upsert: resolve(opt(opts.msgDeletionUpsert, DEFAULT_MSG_DELETION)),
      delete: resolve(opt(opts.msgDeletionDelete, {})),
    },
    // La cloche : masquer un message pour soi doit aussi retirer la
    // notification qui en détient une COPIE de l'extrait. Le défaut est « une
    // notification à retirer », pour que le câblage se voie.
    notification: {
      findMany: resolve(opt(opts.notificationFindMany, [{ id: 'notif-1', userId: USER_ID }])),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    '$transaction': jest.fn().mockResolvedValue(undefined),
  };
}

async function buildApp(opts: PrismaOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma(opts) as unknown);
  await app.register(userDeletionsRoutes);
  await app.ready();
  return app;
}

// ─── DELETE /api/conversations/:conversationId/delete-for-me ─────────────────

describe('DELETE /api/conversations/:conversationId/delete-for-me', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 when member deletes their conversation', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/conversations/${CONV_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    // #4332 — cette route délègue désormais à `performConversationDeleteForMe`
    // (la logique de la route canonique) : la charge n'est plus `{ message }`
    // mais `{ conversationId, deletedAt }`, identique aux deux adresses.
    expect(body.data.conversationId).toBe(CONV_ID);
    expect(body.data.deletedAt).toEqual(expect.any(String));
  });

  it('returns 401 when no auth header provided', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/conversations/${CONV_ID}/delete-for-me`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when user is not a member', async () => {
    // #4332 — l'alias délègue à `performConversationDeleteForMe`, qui lève
    // `ConversationDeleteForMeNotAParticipantError` (404), le même verdict
    // que la route canonique. Avant ce lot cette route portait sa PROPRE
    // vérification et répondait 403 : deux adresses pour le même geste ne
    // doivent plus diverger sur ce qu'elles répondent, pas seulement sur ce
    // qu'elles écrivent.
    const appNotMember = await buildApp({ participantFindFirst: null });
    const res = await appNotMember.inject({
      method: 'DELETE',
      url: `/api/conversations/${CONV_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    await appNotMember.close();
  });

  it('returns 500 on database error', async () => {
    const appErr = await buildApp({ participantFindFirst: new Error('db crash') });
    const res = await appErr.inject({
      method: 'DELETE',
      url: `/api/conversations/${CONV_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('returns 500 when the participant update fails after membership check', async () => {
    // #4332 — repointé : le geste écrit désormais `participant.update`
    // (`deletedForMe`/`isActive`), plus `userConversationPreferences.upsert`.
    const appErr = await buildApp({ participantUpdate: new Error('update failed') });
    const res = await appErr.inject({
      method: 'DELETE',
      url: `/api/conversations/${CONV_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('annonce sa dépréciation vers la route canonique /api/v1 (#4332)', async () => {
    // `depreciee()` — RFC 9745 (`Deprecation`) + RFC 5829 (`Link
    // rel="successor-version"`) — sans `Sunset` : le retrait est gouverné
    // par le compteur d'accès (#4275), jamais posé à la main ici.
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/conversations/${CONV_ID}/delete-for-me`,
      headers: AUTH,
    });
    // 2026-08-30 en epoch. Deux lots ont converge sur cette route : le mien
    // datait l'annonce du 29, le lot voisin du 30 -- c'est la sienne qui tient,
    // l'annonce partant reellement ce jour-la. La valeur reste ECRITE en dur
    // plutot que derivee de la constante : un temoin qui recalcule ce qu'il
    // mesure ne mesure plus rien.
    expect(res.headers['deprecation']).toBe('@1788048000');
    expect(res.headers['link']).toBe(
      `</api/v1/conversations/${CONV_ID}/delete-for-me>; rel="successor-version"`
    );
    // Ce temoin exigeait l'ABSENCE de Sunset ; la version retenue en pose un, et
    // c'est la bonne : sa date n'est pas une habitude mais une MESURE -- aucun
    // des trois clients n'appelle cette adresse, verifie par grep. Affirmer la
    // date exacte est de plus un temoin plus fort qu'affirmer une absence : une
    // fenetre de retrait qui glisserait en silence ferait rougir celui-ci.
    expect(res.headers['sunset']).toBe('Fri, 26 Feb 2027 00:00:00 GMT');
  });
});

// ─── POST /api/conversations/:conversationId/restore-for-me ──────────────────

describe('POST /api/conversations/:conversationId/restore-for-me', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 when restoring a deleted conversation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Conversation restored');
  });

  it('returns 400 when no participant record exists', async () => {
    // #4332 — repointé : la corbeille lit `Participant`, plus
    // `UserConversationPreferences`.
    const appNoParticipant = await buildApp({ participantFindFirst: null });
    const res = await appNoParticipant.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    await appNoParticipant.close();
  });

  it('returns 400 when the participant exists but is not deleted', async () => {
    const appNotDeleted = await buildApp({
      participantFindFirst: { ...ACTIVE_PARTICIPANT, deletedForMe: null },
    });
    const res = await appNotDeleted.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    await appNotDeleted.close();
  });

  it('returns 400 when the conversation itself is closed — a personal restore never reopens it for everyone', async () => {
    // #4332 — garde NOUVELLE : `performConversationDeleteForMe` peut CLORE
    // la conversation entière (DM vide jamais utilisé, ou dernier membre
    // actif parti). Restaurer le SEUL participant appelant ne doit jamais
    // rouvrir un fil que la route canonique a fermé pour tout le monde.
    const appClosed = await buildApp({
      participantFindFirst: { ...ACTIVE_PARTICIPANT, conversation: { isActive: false } },
    });
    const res = await appClosed.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    await appClosed.close();
  });

  it('returns 401 when no auth header provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error during the participant lookup', async () => {
    const appErr = await buildApp({ participantFindFirst: new Error('db crash') });
    const res = await appErr.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('returns 500 on database error during the restore write', async () => {
    const appErr = await buildApp({ participantUpdate: new Error('update failed') });
    const res = await appErr.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── POST /api/conversations/:conversationId/clear-history ───────────────────

describe('POST /api/conversations/:conversationId/clear-history', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with clearHistoryBefore when valid date provided', async () => {
    const beforeDate = '2024-01-15T10:30:00.000Z';
    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ beforeDate }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.clearHistoryBefore).toBeDefined();
    expect(body.data.message).toContain('Chat history cleared before');
  });

  it('returns 400 when beforeDate is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ beforeDate: 'not-a-date' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when beforeDate is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 when user is not a member', async () => {
    const appNotMember = await buildApp({ participantFindFirst: null });
    const res = await appNotMember.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ beforeDate: '2024-01-15T10:30:00.000Z' }),
    });
    expect(res.statusCode).toBe(403);
    await appNotMember.close();
  });

  it('returns 401 when no auth header provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ beforeDate: '2024-01-15T10:30:00.000Z' }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error', async () => {
    const appErr = await buildApp({ participantFindFirst: new Error('db crash') });
    const res = await appErr.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ beforeDate: '2024-01-15T10:30:00.000Z' }),
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── DELETE /api/messages/:messageId/delete-for-me ───────────────────────────

describe('DELETE /api/messages/:messageId/delete-for-me', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 when member deletes their message', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Message deleted from your view');
  });

  it('returns 404 when message does not exist', async () => {
    const appNoMsg = await buildApp({ messageFindUnique: null });
    const res = await appNoMsg.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    await appNoMsg.close();
  });

  it('returns 403 when user is not a member of the conversation', async () => {
    const msgNoParticipant: PrismaMessage = {
      ...MESSAGE,
      conversation: { participants: [] },
    };
    const appForbidden = await buildApp({ messageFindUnique: msgNoParticipant });
    const res = await appForbidden.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(403);
    await appForbidden.close();
  });

  it('returns 401 when no auth header provided', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error during findUnique', async () => {
    const appErr = await buildApp({ messageFindUnique: new Error('db crash') });
    const res = await appErr.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('returns 500 on database error during upsert', async () => {
    const appErr = await buildApp({ msgDeletionUpsert: new Error('upsert failed') });
    const res = await appErr.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

describe("DELETE /api/messages/:messageId/delete-for-me — le where imbriqué participants.isActive est HONORÉ, pas seulement déclaré (#4867)", () => {
  // Le double `messageFindUnique` ci-dessus rend un `conversation.participants`
  // déjà pré-filtré À LA MAIN — il ne prouve rien sur le `where: { userId,
  // isActive: true }` imbriqué que la production applique réellement. Ici le
  // double HONORE ce `where` (`findFirstHonouringWhere`, #4867), sur un
  // `findUnique` — la sémantique du where vaut identiquement à un `findFirst`.
  async function buildAppWithHonouringMessage(rawDocument: Record<string, unknown>) {
    const prisma = makePrisma();
    (prisma.message as any).findUnique = jest.fn<any>(findFirstHonouringWhere([rawDocument]));
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    await app.register(userDeletionsRoutes);
    await app.ready();
    return app;
  }

  it('rend 403 pour un participant SORTI (isActive:false) même si sa propre ligne existe encore — preuve par mutation sur le `where` imbriqué', async () => {
    const doc = {
      id: MSG_ID,
      conversationId: CONV_ID,
      content: 'hello',
      conversation: { participants: [{ ...ACTIVE_PARTICIPANT, isActive: false }] },
    };
    const app = await buildAppWithHonouringMessage(doc);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('rend 200 pour un participant ACTIF, sous le même double honorant', async () => {
    const doc = {
      id: MSG_ID,
      conversationId: CONV_ID,
      content: 'hello',
      conversation: { participants: [{ ...ACTIVE_PARTICIPANT, isActive: true }] },
    };
    const app = await buildAppWithHonouringMessage(doc);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── POST /api/messages/:messageId/restore-for-me ────────────────────────────

describe('POST /api/messages/:messageId/restore-for-me', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 when restoring a previously deleted message', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/messages/${MSG_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Message restored');
  });

  it('returns 400 when no deletion record exists', async () => {
    const appNoDeletion = await buildApp({ msgDeletionFindUnique: null });
    const res = await appNoDeletion.inject({
      method: 'POST',
      url: `/api/messages/${MSG_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    await appNoDeletion.close();
  });

  it('returns 401 when no auth header provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/messages/${MSG_ID}/restore-for-me`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error during findUnique', async () => {
    const appErr = await buildApp({ msgDeletionFindUnique: new Error('db crash') });
    const res = await appErr.inject({
      method: 'POST',
      url: `/api/messages/${MSG_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('returns 500 on database error during delete', async () => {
    const appErr = await buildApp({ msgDeletionDelete: new Error('delete failed') });
    const res = await appErr.inject({
      method: 'POST',
      url: `/api/messages/${MSG_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── DELETE /api/messages/bulk/delete-for-me ─────────────────────────────────

describe('DELETE /api/messages/bulk/delete-for-me', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with deleted count when given valid messageIds', async () => {
    const messageIds = [MSG_ID, 'cccccccccccccccccccccccc'];
    const appBulk = await buildApp({
      msgFindMany: messageIds.map((id) => ({ id, conversationId: CONV_ID })),
    });
    const res = await appBulk.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ messageIds }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.deletedCount).toBe(2);
    expect(body.data.requestedCount).toBe(2);
    await appBulk.close();
  });

  it('returns 200 with partial count when some messages not accessible', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ messageIds: [MSG_ID, 'inaccessible-id'] }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.requestedCount).toBe(2);
    expect(body.data.deletedCount).toBeLessThanOrEqual(2);
  });

  it('returns 400 when messageIds array is empty', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ messageIds: [] }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when messageIds has more than 100 entries', async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `msg-${i}`);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ messageIds: tooMany }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 when none of the messages are accessible', async () => {
    const appNoAccess = await buildApp({ msgFindMany: [] });
    const res = await appNoAccess.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ messageIds: [MSG_ID] }),
    });
    expect(res.statusCode).toBe(403);
    await appNoAccess.close();
  });

  it('returns 401 when no auth header provided', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageIds: [MSG_ID] }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error', async () => {
    const appErr = await buildApp({ msgFindMany: new Error('db crash') });
    const res = await appErr.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ messageIds: [MSG_ID] }),
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── GET /api/user/deleted-conversations ─────────────────────────────────────

describe('GET /api/user/deleted-conversations', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with list of deleted conversations', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/user/deleted-conversations',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].conversationId).toBe(CONV_ID);
    expect(body.data[0].deletedAt).toBeDefined();
    expect(body.data[0].conversation).toBeDefined();
  });

  it('returns 200 with empty array when no conversations deleted', async () => {
    // #4332 — repointé : la source est `participant.findMany`, plus
    // `userConversationPreferences.findMany`.
    const appEmpty = await buildApp({ participantFindMany: [] });
    const res = await appEmpty.inject({
      method: 'GET',
      url: '/api/user/deleted-conversations',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(0);
    await appEmpty.close();
  });

  it('returns 401 when no auth header provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/user/deleted-conversations',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error', async () => {
    const appErr = await buildApp({ participantFindMany: new Error('db crash') });
    const res = await appErr.inject({
      method: 'GET',
      url: '/api/user/deleted-conversations',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('maps deleted participants to conversationId, deletedAt, and conversation fields', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/user/deleted-conversations',
      headers: AUTH,
    });
    const body = res.json();
    const firstItem = body.data[0];
    expect(firstItem).toHaveProperty('conversationId');
    expect(firstItem).toHaveProperty('deletedAt');
    expect(firstItem).toHaveProperty('conversation');
    expect(firstItem.conversation).toHaveProperty('id');
    expect(firstItem.conversation).toHaveProperty('identifier');
    expect(firstItem.conversation).toHaveProperty('type');
  });
});

// ─── Câblage : masquer un message retire aussi sa notification ────────────────

/**
 * Un message masqué pour soi disparaît de la conversation — les sept surfaces
 * de lecture l'appliquent, et les trois compteurs de non-lus depuis peu. Sa
 * NOTIFICATION, elle, détient une copie dénormalisée de l'extrait
 * (`Notification.content`, `metadata.messagePreview`), qu'aucun filtre de
 * lecture ne peut rattraper. Ces témoins tiennent le geste sur la route réelle,
 * en observant le `where` réellement envoyé à Prisma.
 */
describe('le masquage personnel retire la copie que la cloche détient', () => {
  const notificationOf = (app: FastifyInstance) =>
    (app as unknown as { prisma: { notification: { deleteMany: jest.Mock } } }).prisma.notification;

  it('« supprimer pour moi » retire les notifications de CE lecteur pour CE message', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(notificationOf(app).deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, messageId: { in: [MSG_ID] } },
    });
    await app.close();
  });

  it('le lot « supprimer pour moi » retire celles des messages RÉELLEMENT accessibles', async () => {
    const app = await buildApp({ msgFindMany: [{ id: MSG_ID, conversationId: CONV_ID }] });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: AUTH,
      payload: { messageIds: [MSG_ID, 'cccccccccccccccccccccccc'] },
    });

    expect(res.statusCode).toBe(200);
    expect(notificationOf(app).deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, messageId: { in: [MSG_ID] } },
    });
    await app.close();
  });

  it('« effacer l\'historique » retire celles des messages antérieurs à la coupure', async () => {
    const app = await buildApp();
    const beforeDate = '2026-05-21T12:00:00.000Z';

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      headers: AUTH,
      payload: { beforeDate },
    });

    expect(res.statusCode).toBe(200);
    expect(notificationOf(app).deleteMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        message: { is: { conversationId: CONV_ID, createdAt: { lt: new Date(beforeDate) } } },
      },
    });
    await app.close();
  });

  it('répond succès quand le retrait de la cloche échoue — la suppression, elle, a eu lieu', async () => {
    const app = await buildApp({ notificationFindMany: new Error('mongo down') });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('n\'écrit rien quand aucune notification ne porte le message', async () => {
    const app = await buildApp({ notificationFindMany: [] });

    await app.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });

    expect(notificationOf(app).deleteMany).not.toHaveBeenCalled();
    await app.close();
  });
});
