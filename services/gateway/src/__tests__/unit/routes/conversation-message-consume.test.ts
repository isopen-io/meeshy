/**
 * `POST /conversations/:id/messages/:messageId/consume`.
 *
 * Le budget d'un message à vue unique se dépense par SPECTATEUR. La route
 * l'incrémentait par APPEL :
 *
 *   await prisma.message.update({ data: { viewOnceCount: { increment: 1 } } })
 *
 * — sans condition, sans clé d'idempotence, et sans jamais relire le
 * `MessageStatusEntry.viewedOnceAt` qu'elle écrivait deux instructions plus
 * bas. Dans un groupe où l'émetteur a posé `maxViewOnceCount: 2`, un seul
 * destinataire qui rouvre la photo deux fois porte `isFullyConsumed` à vrai,
 * la route l'ANNONCE à toute la room, et le second destinataire perd un média
 * qu'il n'a jamais ouvert. Un rejeu de la requête — file hors-ligne, double
 * tap, retry réseau — produit le même effet à lui seul.
 *
 * Le double Prisma de ce fichier HONORE le filtre de la revendication (une
 * entrée déjà estampillée n'est plus appariée) : un double qui rendrait la
 * même ligne quelle que soit la question ne pourrait pas discriminer, et le
 * témoin central mesurerait l'implémentation au lieu du comportement.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';

// ─── Mocks (avant l'import du module de route) ────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/messaging/MessagingService', () => ({
  MessagingService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({})),
}));

// ─── Import après les mocks ───────────────────────────────────────────────────

import { registerMessagesRoutes } from '../../../routes/conversations/messages';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const MESSAGE_ID = '507f1f77bcf86cd799439033';

const VIEWER_USER_ID = '507f1f77bcf86cd799439022';
const VIEWER_PARTICIPANT_ID = '507f1f77bcf86cd7994390a1';
const PEER_USER_ID = '507f1f77bcf86cd799439023';
const PEER_PARTICIPANT_ID = '507f1f77bcf86cd7994390a2';
const ANON_PARTICIPANT_ID = '507f1f77bcf86cd7994390a3';
const ANON_SESSION_TOKEN = 'anon_session_token_xyz';

// ─── Double Prisma ────────────────────────────────────────────────────────────

interface StatusEntry {
  messageId: string;
  participantId: string;
  /** `undefined` = colonne ABSENTE du document, l'état d'une entrée créée par la livraison. */
  viewedOnceAt?: Date;
}

/**
 * `maxViewOnceCount: 2` — un groupe de deux destinataires, une ouverture
 * chacun. C'est la configuration où le défaut est visible : deux ouvertures du
 * MÊME spectateur épuisaient le budget des deux.
 */
function buildPrisma(options: {
  maxViewOnceCount: number;
  statusEntries: StatusEntry[];
  participants: Array<{ id: string; userId: string | null }>;
}) {
  const message = {
    id: MESSAGE_ID,
    conversationId: CONV_ID,
    isViewOnce: true,
    viewOnceCount: 0,
    maxViewOnceCount: options.maxViewOnceCount,
  };
  const entries = [...options.statusEntries];

  const messageUpdate = jest.fn(async (args: any) => {
    if (args.data?.viewOnceCount?.increment) {
      message.viewOnceCount += args.data.viewOnceCount.increment;
    }
    return { ...message };
  });

  const statusUpdateMany = jest.fn(async (args: any) => {
    // Le filtre est HONORÉ : `OR: [{ viewedOnceAt: null }, { viewedOnceAt: { isSet: false } }]`
    // n'apparie que les entrées qui n'ont pas encore été estampillées.
    const wantsUnviewed = Array.isArray(args.where?.OR);
    const matched = entries.filter(
      (e) =>
        e.messageId === args.where.messageId &&
        e.participantId === args.where.participantId &&
        (!wantsUnviewed || e.viewedOnceAt === undefined || e.viewedOnceAt === null)
    );
    for (const e of matched) e.viewedOnceAt = args.data.viewedOnceAt;
    return { count: matched.length };
  });

  const statusCreate = jest.fn(async (args: any) => {
    const clash = entries.some(
      (e) => e.messageId === args.data.messageId && e.participantId === args.data.participantId
    );
    if (clash) {
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    }
    entries.push({
      messageId: args.data.messageId,
      participantId: args.data.participantId,
      viewedOnceAt: args.data.viewedOnceAt,
    });
    return { id: 'entry_new' };
  });

  return {
    message,
    entries,
    messageUpdate,
    statusUpdateMany,
    statusCreate,
    prisma: {
      message: {
        findFirst: jest.fn(async (args: any) =>
          args.where.id === message.id && args.where.conversationId === message.conversationId
            ? { ...message }
            : null
        ),
        update: messageUpdate,
      },
      messageStatusEntry: { updateMany: statusUpdateMany, create: statusCreate },
      participant: {
        findFirst: jest.fn(async (args: any) => {
          const found = options.participants.find((p) =>
            args.where.id !== undefined ? p.id === args.where.id : p.userId === args.where.userId
          );
          return found ? { id: found.id } : null;
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any,
  };
}

function buildSocket() {
  const emit = jest.fn((_event: string, _payload: unknown) => undefined);
  const to = jest.fn((_room: string) => ({ emit }));
  return {
    emit,
    to,
    handler: {
      getManager: () => ({ getIO: () => ({ to }), enqueueOfflineMessageMutation: jest.fn() }),
    },
  };
}

async function buildApp(
  db: ReturnType<typeof buildPrisma>,
  caller: { anonymous: boolean } = { anonymous: false }
) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const socket = buildSocket();
  (app as any).socketIOHandler = socket.handler;
  (app as any).notificationService = null;

  const auth = async (req: any) => {
    req.authContext = caller.anonymous
      ? {
          type: 'anonymous',
          isAuthenticated: true,
          isAnonymous: true,
          userId: ANON_SESSION_TOKEN,
          participantId: ANON_PARTICIPANT_ID,
        }
      : {
          type: 'registered',
          isAuthenticated: true,
          isAnonymous: false,
          userId: VIEWER_USER_ID,
          registeredUser: { id: VIEWER_USER_ID, role: 'USER' },
        };
  };

  registerMessagesRoutes(app, db.prisma, {} as any, auth, auth);
  await app.ready();
  return { app, socket };
}

const consume = (app: any) =>
  app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/consume` });

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockResolveConversationId.mockResolvedValue(CONV_ID);
  mockCanAccessConversation.mockResolvedValue(true);
});

describe('POST /conversations/:id/messages/:messageId/consume', () => {
  it('la première ouverture dépense une unité et l’annonce à la room', async () => {
    // Verrou : le chemin nominal doit survivre au correctif à l'identique.
    const db = buildPrisma({
      maxViewOnceCount: 2,
      statusEntries: [{ messageId: MESSAGE_ID, participantId: VIEWER_PARTICIPANT_ID }],
      participants: [
        { id: VIEWER_PARTICIPANT_ID, userId: VIEWER_USER_ID },
        { id: PEER_PARTICIPANT_ID, userId: PEER_USER_ID },
      ],
    });
    const { app, socket } = await buildApp(db);
    try {
      const res = await consume(app);
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ viewOnceCount: 1, maxViewOnceCount: 2, isFullyConsumed: false });
      expect(db.messageUpdate).toHaveBeenCalledTimes(1);
      expect(socket.to).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
      expect(socket.emit).toHaveBeenCalledWith(
        'message:consumed',
        expect.objectContaining({ messageId: MESSAGE_ID, viewOnceCount: 1, isFullyConsumed: false })
      );
    } finally {
      await app.close();
    }
  });

  it('une seconde ouverture du MÊME spectateur ne consomme pas le budget du pair', async () => {
    // Le défaut utilisateur, reproduit tel quel : deux ouvertures du même
    // destinataire faisaient passer `isFullyConsumed` à vrai sur un budget de
    // deux, alors que le second destinataire n'a rien ouvert.
    const db = buildPrisma({
      maxViewOnceCount: 2,
      statusEntries: [{ messageId: MESSAGE_ID, participantId: VIEWER_PARTICIPANT_ID }],
      participants: [
        { id: VIEWER_PARTICIPANT_ID, userId: VIEWER_USER_ID },
        { id: PEER_PARTICIPANT_ID, userId: PEER_USER_ID },
      ],
    });
    const { app } = await buildApp(db);
    try {
      await consume(app);
      const second = await consume(app);

      expect(second.statusCode).toBe(200);
      expect(second.json().data).toMatchObject({ viewOnceCount: 1, isFullyConsumed: false });
      expect(db.messageUpdate).toHaveBeenCalledTimes(1);
      expect(db.message.viewOnceCount).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('un rejeu n’annonce rien à la room', async () => {
    // Rediffuser un compte identique ferait clignoter chez les pairs un
    // événement qui ne correspond à aucune ouverture nouvelle.
    const db = buildPrisma({
      maxViewOnceCount: 2,
      statusEntries: [{ messageId: MESSAGE_ID, participantId: VIEWER_PARTICIPANT_ID }],
      participants: [{ id: VIEWER_PARTICIPANT_ID, userId: VIEWER_USER_ID }],
    });
    const { app, socket } = await buildApp(db);
    try {
      await consume(app);
      socket.emit.mockClear();
      await consume(app);
      expect(socket.emit).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('un spectateur anonyme est identifié par son participantId, pas par son jeton', async () => {
    // `authContext.userId` porte un jeton de session pour un anonyme : la
    // recherche par `userId` ne trouvait jamais sa ligne, si bien qu'il
    // dépensait le budget sans laisser la moindre trace de l'avoir fait — et
    // pouvait donc le dépenser indéfiniment.
    const db = buildPrisma({
      maxViewOnceCount: 2,
      statusEntries: [],
      participants: [{ id: ANON_PARTICIPANT_ID, userId: null }],
    });
    const { app } = await buildApp(db, { anonymous: true });
    try {
      const first = await consume(app);
      const second = await consume(app);

      expect(first.json().data).toMatchObject({ viewOnceCount: 1 });
      expect(second.json().data).toMatchObject({ viewOnceCount: 1 });
      expect(db.messageUpdate).toHaveBeenCalledTimes(1);
      expect(db.entries).toEqual([
        expect.objectContaining({ participantId: ANON_PARTICIPANT_ID, viewedOnceAt: expect.any(Date) }),
      ]);
    } finally {
      await app.close();
    }
  });

  it('un appelant sans ligne de participant ne dépense rien', async () => {
    // Inatteignable tant que `canAccessConversation` tient — il exige lui-même
    // une ligne active. La garde existe pour que le budget ne puisse jamais
    // être dépensé par un spectateur qu'on ne sait pas nommer.
    const db = buildPrisma({
      maxViewOnceCount: 2,
      statusEntries: [],
      participants: [],
    });
    const { app, socket } = await buildApp(db);
    try {
      const res = await consume(app);
      expect(res.statusCode).toBe(403);
      expect(db.messageUpdate).not.toHaveBeenCalled();
      expect(socket.emit).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
