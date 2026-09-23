/**
 * #7578 — ouvrir une vue unique ne la retire plus aux autres.
 *
 * La consommation tenait un compteur GLOBAL plafonné à un : la première
 * ouverture — l'AUTEUR compris — programmait la destruction pour tous, et un
 * destinataire qui n'avait rien vu perdait le message. La règle du porteur :
 *
 *  - la consommation se compte PAR PERSONNE ;
 *  - l'ouverture de l'auteur ne compte jamais ;
 *  - la purge du CONTENU n'est programmée que lorsque TOUS les destinataires
 *    actifs ont ouvert ;
 *  - qui a ouvert ne reçoit plus que `consumedByMe: true`.
 *
 * Le double Prisma HONORE les filtres qui décident (revendication, ouvertures
 * relues, participants actifs) : un double qui rendrait la même ligne quelle
 * que soit la question ne pourrait pas faire tomber ces témoins.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: (...args: unknown[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../services/MentionService', () => ({ resolveMentionedUsers: jest.fn() }));
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

import { registerMessagesRoutes } from '../../../routes/conversations/messages';
import { messageSchema } from '@meeshy/shared/types/api-schemas';
import {
  computeViewOnceStates,
  projectViewOnceForReader,
} from '../../../services/messaging/viewOnceAudience';

const CONV_ID = '507f1f77bcf86cd799439011';
const MESSAGE_ID = '507f1f77bcf86cd799439033';

type Member = { readonly id: string; readonly userId: string; readonly isActive?: boolean };

const AUTHOR: Member = { id: '507f1f77bcf86cd7994390a0', userId: '507f1f77bcf86cd799439020' };
const BOB: Member = { id: '507f1f77bcf86cd7994390a1', userId: '507f1f77bcf86cd799439021' };
const CAROL: Member = { id: '507f1f77bcf86cd7994390a2', userId: '507f1f77bcf86cd799439022' };

interface Entry {
  messageId: string;
  participantId: string;
  viewedOnceAt?: Date | null;
}

function buildWorld(members: readonly Member[]) {
  const message = {
    id: MESSAGE_ID,
    conversationId: CONV_ID,
    senderId: AUTHOR.id,
    isViewOnce: true,
    viewOnceCount: 0,
    maxViewOnceCount: 1,
    content: 'SECRET',
  };
  const entries: Entry[] = [];
  const burnWrites: unknown[] = [];

  const isActive = (id: string) => members.some((m) => m.id === id && m.isActive !== false);

  const prisma = {
    message: {
      findFirst: jest.fn(async (args: any) =>
        args.where.id === message.id && args.where.conversationId === CONV_ID ? { ...message } : null,
      ),
      update: jest.fn(async (args: any) => {
        if (args.data?.viewOnceCount?.increment) message.viewOnceCount += args.data.viewOnceCount.increment;
        return { ...message };
      }),
      updateMany: jest.fn(async (args: any) => {
        burnWrites.push(args);
        return { count: 1 };
      }),
    },
    messageStatusEntry: {
      updateMany: jest.fn(async (args: any) => {
        const matched = entries.filter(
          (e) =>
            e.messageId === args.where.messageId &&
            e.participantId === args.where.participantId &&
            (e.viewedOnceAt === undefined || e.viewedOnceAt === null),
        );
        for (const e of matched) e.viewedOnceAt = args.data.viewedOnceAt;
        return { count: matched.length };
      }),
      create: jest.fn(async (args: any) => {
        if (entries.some((e) => e.messageId === args.data.messageId && e.participantId === args.data.participantId)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        entries.push({ ...args.data });
        return {};
      }),
      findMany: jest.fn(async (args: any) =>
        entries
          .filter((e) => args.where.messageId.in.includes(e.messageId) && e.viewedOnceAt instanceof Date)
          .map((e) => ({ messageId: e.messageId, participantId: e.participantId })),
      ),
    },
    participant: {
      findFirst: jest.fn(async (args: any) => {
        const found = members.find(
          (m) =>
            (args.where.id !== undefined ? m.id === args.where.id : m.userId === args.where.userId) &&
            m.isActive !== false,
        );
        return found ? { id: found.id } : null;
      }),
      findMany: jest.fn(async (args: any) =>
        (args.where.id.in as string[]).filter(isActive).map((id) => ({ id })),
      ),
      count: jest.fn(async () => members.filter((m) => m.isActive !== false).length),
    },
    user: { findFirst: jest.fn(async () => null) },
  };

  return { prisma, message, entries, burnWrites };
}

async function openAs(world: ReturnType<typeof buildWorld>, member: Member) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const emit = jest.fn();
  (app as any).socketIOHandler = { getManager: () => ({ getIO: () => ({ to: () => ({ emit }) }) }) };
  (app as any).notificationService = null;
  const auth = async (req: any) => {
    req.authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: member.userId,
      registeredUser: { id: member.userId, role: 'USER' },
    };
  };
  registerMessagesRoutes(app, world.prisma as any, {} as any, auth, auth);
  await app.ready();
  try {
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/consume` });
    return { res, emit };
  } finally {
    await app.close();
  }
}

beforeEach(() => {
  mockResolveConversationId.mockResolvedValue(CONV_ID);
  mockCanAccessConversation.mockResolvedValue(true);
});

describe('#7578 — une vue unique se consomme PAR PERSONNE', () => {
  it("l'auteur ouvre ⇒ aucune purge programmée, et le destinataire peut toujours l'ouvrir", async () => {
    const world = buildWorld([AUTHOR, BOB]);

    const byAuthor = await openAs(world, AUTHOR);
    expect(byAuthor.res.json().data).toMatchObject({ viewOnceCount: 0, maxViewOnceCount: 1, isFullyConsumed: false, consumedByMe: true });
    expect(world.burnWrites).toHaveLength(0);
    expect(world.message.viewOnceCount).toBe(0);

    const byBob = await openAs(world, BOB);
    expect(byBob.res.statusCode).toBe(200);
    expect(byBob.res.json().data).toMatchObject({ viewOnceCount: 1, isFullyConsumed: true, consumedByMe: true });
  });

  it("dans un groupe de trois, un destinataire ouvre ⇒ l'autre peut toujours l'ouvrir", async () => {
    const world = buildWorld([AUTHOR, BOB, CAROL]);

    const byBob = await openAs(world, BOB);
    expect(byBob.res.json().data).toMatchObject({ viewOnceCount: 1, maxViewOnceCount: 2, isFullyConsumed: false });
    expect(world.burnWrites).toHaveLength(0);

    const states = await computeViewOnceStates(world.prisma as any, [world.message], CAROL.id);
    expect(states.get(MESSAGE_ID)).toMatchObject({ consumedByMe: false, isFullyConsumed: false });
  });

  it('les deux destinataires ont ouvert ⇒ la purge est programmée, jamais une destruction de la bulle', async () => {
    const world = buildWorld([AUTHOR, BOB, CAROL]);

    await openAs(world, BOB);
    const byCarol = await openAs(world, CAROL);

    expect(byCarol.res.json().data).toMatchObject({ viewOnceCount: 2, maxViewOnceCount: 2, isFullyConsumed: true });
    expect(world.burnWrites).toHaveLength(1);
    const write = world.burnWrites[0] as { data: Record<string, unknown> };
    expect(Object.keys(write.data)).toEqual(['viewOnceBurnAt']);
  });

  it("un destinataire PARTI ne bloque pas la purge, et son ouverture passée ne compte pas", async () => {
    const world = buildWorld([AUTHOR, BOB, { ...CAROL, isActive: false }]);

    const byBob = await openAs(world, BOB);

    expect(byBob.res.json().data).toMatchObject({ viewOnceCount: 1, maxViewOnceCount: 1, isFullyConsumed: true });
  });

  it("l'annonce dit QUI a ouvert — l'auteur est signalé comme tel", async () => {
    const world = buildWorld([AUTHOR, BOB]);

    const { emit } = await openAs(world, AUTHOR);

    expect(emit).toHaveBeenCalledWith(
      'message:consumed',
      expect.objectContaining({ userId: AUTHOR.userId, participantId: AUTHOR.id, byAuthor: true, isFullyConsumed: false }),
    );
  });
});

describe('#7578 — qui a ouvert ne reçoit plus le contenu', () => {
  const served = {
    id: MESSAGE_ID,
    isViewOnce: true,
    content: 'SECRET',
    translations: [{ targetLanguage: 'en', translatedContent: 'SECRET' }],
    attachments: [{ id: 'att' }],
    metadata: { sticker: { emoji: '👋' } },
    sticker: { emoji: '👋' },
    messageType: 'image',
  };

  it("sert à celui qui l'a ouverte l'état seul — ni texte, ni traduction, ni pièce jointe", () => {
    const out = projectViewOnceForReader(served, {
      consumedByMe: true,
      isFullyConsumed: false,
      openedCount: 1,
      recipientCount: 2,
    });

    expect(out).toMatchObject({
      id: MESSAGE_ID,
      messageType: 'image',
      consumedByMe: true,
      content: '',
      translations: [],
      attachments: [],
      metadata: null,
      sticker: null,
    });
    expect(JSON.stringify(out)).not.toContain('SECRET');
  });

  it("sert le contenu intact à qui ne l'a pas encore ouverte, même si un autre l'a fait", () => {
    const out = projectViewOnceForReader(served, {
      consumedByMe: false,
      isFullyConsumed: false,
      openedCount: 1,
      recipientCount: 2,
    });

    expect(out).toMatchObject({ content: 'SECRET', consumedByMe: false, viewOnceCount: 1, maxViewOnceCount: 2 });
  });

  it("n'ajoute pas au message une clé qu'il ne portait pas (lecture projetée)", () => {
    const out = projectViewOnceForReader({ id: MESSAGE_ID, isViewOnce: true }, {
      consumedByMe: true,
      isFullyConsumed: false,
      openedCount: 0,
      recipientCount: 1,
    });

    expect(out).not.toHaveProperty('content');
    expect(out).not.toHaveProperty('attachments');
  });

  it('une lecture des ouvertures qui échoue sert FERMÉ', async () => {
    const { loadViewOnceReaderStates } = await import('../../../services/messaging/viewOnceAudience');
    const broken = {
      messageStatusEntry: { findMany: jest.fn(async () => { throw new Error('mongo down'); }) },
      participant: { findMany: jest.fn(), count: jest.fn() },
    };

    const states = await loadViewOnceReaderStates(broken as any, [{ id: MESSAGE_ID, conversationId: CONV_ID, senderId: AUTHOR.id, isViewOnce: true }], BOB.id);

    expect(states.get(MESSAGE_ID)?.consumedByMe).toBe(true);
  });
});

describe('#7578 — l’état par lecteur traverse le VRAI sérialiseur', () => {
  it('consumedByMe, isFullyConsumed et le dénominateur sortent sur le fil ; le contenu non', async () => {
    const projected = projectViewOnceForReader(
      { id: MESSAGE_ID, isViewOnce: true, content: 'SECRET', conversationId: CONV_ID },
      { consumedByMe: true, isFullyConsumed: false, openedCount: 1, recipientCount: 2 },
    );
    const app = Fastify({ logger: false });
    app.get('/m', { schema: { response: { 200: messageSchema } } }, async () => projected);
    await app.ready();
    try {
      const body = (await app.inject({ method: 'GET', url: '/m' })).json();
      expect(body).toMatchObject({ consumedByMe: true, isFullyConsumed: false, viewOnceCount: 1, maxViewOnceCount: 2, content: '' });
    } finally {
      await app.close();
    }
  });
});
