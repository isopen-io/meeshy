/**
 * GET /attachments/search — #5170.
 *
 * Recherche d'un média à travers TOUTES les conversations du lecteur. Les
 * fonctions de périmètre (`loadHistoryFloorsOrFail`, `historyFloorClause`,
 * `loadPersonalHistoryHidingByConversation`, `protectedPreview`,
 * `maskedAttachment`) sont RÉELLES dans ce harnais — jamais mockées : c'est
 * précisément leur composition que cette route livre, et un double les
 * rendrait invisibles au témoin (cf. `services/gateway/CLAUDE.md`, « un
 * témoin qui ne peut pas tomber n'est pas un témoin »). Seules les requêtes
 * Prisma brutes sont doublées.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

import { registerAttachmentSearchRoutes } from '../../../../routes/attachments/search';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_A = '507f1f77bcf86cd799439021';
const CONV_B = '507f1f77bcf86cd799439022';
const CONV_NOT_MEMBER = '507f1f77bcf86cd799439099';
const ATT_1 = '507f1f77bcf86cd799439031';
const ATT_2 = '507f1f77bcf86cd799439032';
const MSG_1 = '507f1f77bcf86cd799439041';
const MSG_2 = '507f1f77bcf86cd799439042';

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ATT_1,
    messageId: MSG_1,
    fileName: 'photo.jpg',
    originalName: 'Vacation Photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 12345,
    fileUrl: 'https://cdn.example.com/photo.jpg',
    thumbnailUrl: null,
    duration: null,
    uploadedBy: USER_ID,
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    width: 800,
    height: 600,
    isViewOnce: false,
    isBlurred: false,
    effectFlags: 0,
    message: {
      conversationId: CONV_A,
      createdAt: new Date('2026-08-01T09:59:00.000Z'),
      isEncrypted: false,
      isViewOnce: false,
      isBlurred: false,
      effectFlags: 0,
      expiresAt: null,
    },
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, any> = {}) {
  const { participant, messageAttachment, userConversationPreferences, userMessageDeletion, ...rest } = overrides;
  return {
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([
        { conversationId: CONV_A, role: 'member', joinedAt: new Date('2026-01-01'), shareLinkId: null, historyVisibleFrom: null, permissions: null, anonymousSession: null, user: { role: 'USER' } },
        { conversationId: CONV_B, role: 'member', joinedAt: new Date('2026-01-01'), shareLinkId: null, historyVisibleFrom: null, permissions: null, anonymousSession: null, user: { role: 'USER' } },
      ]),
      ...participant,
    },
    messageAttachment: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([baseRow()]),
      ...messageAttachment,
    },
    userConversationPreferences: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      ...userConversationPreferences,
    },
    userMessageDeletion: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      ...userMessageDeletion,
    },
    ...rest,
  };
}

async function buildApp(prisma: any, authContext: any = { type: 'user', isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } }): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const setAuth = async (req: FastifyRequest) => { (req as any).authContext = authContext; };
  registerAttachmentSearchRoutes(app, setAuth, prisma);
  await app.ready();
  return app;
}

describe('GET /attachments/search — not registered', () => {
  it('returns 403 for an anonymous/unregistered caller', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: 'part-1' });
    try {
      const res = await app.inject({ method: 'GET', url: '/attachments/search?q=photo' });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});

describe('GET /attachments/search — appartenance', () => {
  it('ne visite aucune conversation hors appartenance (le `where` ne nomme que celles du lecteur)', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    try {
      const res = await app.inject({ method: 'GET', url: '/attachments/search?q=photo' });
      expect(res.statusCode).toBe(200);
      const call = prisma.messageAttachment.findMany.mock.calls[0][0];
      expect(call.where.message.conversationId.in.sort()).toEqual([CONV_A, CONV_B].sort());
      expect(call.where.message.conversationId.in).not.toContain(CONV_NOT_MEMBER);
    } finally {
      await app.close();
    }
  });

  it('sans aucune appartenance, rend une liste vide sans interroger messageAttachment', async () => {
    const prisma = makePrisma({ participant: { findMany: jest.fn<any>().mockResolvedValue([]) } });
    const app = await buildApp(prisma);
    try {
      const res = await app.inject({ method: 'GET', url: '/attachments/search?q=photo' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).data.attachments).toEqual([]);
      expect(prisma.messageAttachment.findMany).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('un `q` vide rend une liste vide sans interroger la base', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    try {
      const res = await app.inject({ method: 'GET', url: '/attachments/search?q=%20%20' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).data.attachments).toEqual([]);
      expect(prisma.participant.findMany).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});

describe('GET /attachments/search — succès', () => {
  it('filtre `originalName` (insensible à la casse) et sert `conversationId` par ligne', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    try {
      const res = await app.inject({ method: 'GET', url: '/attachments/search?q=vacation' });
      expect(res.statusCode).toBe(200);
      const call = prisma.messageAttachment.findMany.mock.calls[0][0];
      expect(call.where.originalName).toEqual({ contains: 'vacation', mode: 'insensitive' });

      const body = JSON.parse(res.payload);
      expect(body.data.attachments).toHaveLength(1);
      expect(body.data.attachments[0]).toEqual(
        expect.objectContaining({ id: ATT_1, originalName: 'Vacation Photo.jpg', conversationId: CONV_A })
      );
      // Les champs internes de protection ne fuient jamais sur le fil.
      expect(body.data.attachments[0]).not.toHaveProperty('isViewOnce');
      expect(body.data.attachments[0]).not.toHaveProperty('effectFlags');
    } finally {
      await app.close();
    }
  });
});

describe('GET /attachments/search — exclusion du contenu PROTÉGÉ (#5170 critère 3)', () => {
  it('le `where` ferme nativement isViewOnce/isBlurred/isEncrypted et l\'éphémère, aux DEUX niveaux', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    try {
      await app.inject({ method: 'GET', url: '/attachments/search?q=photo' });
      const call = prisma.messageAttachment.findMany.mock.calls[0][0];
      expect(call.where.isViewOnce).toBe(false);
      expect(call.where.isBlurred).toBe(false);
      expect(call.where.message.isViewOnce).toBe(false);
      expect(call.where.message.isBlurred).toBe(false);
      expect(call.where.message.isEncrypted).toBe(false);
      expect(call.where.message.OR).toEqual([{ expiresAt: { isSet: false } }, { expiresAt: null }]);
    } finally {
      await app.close();
    }
  });

  it('un message à VUE UNIQUE (booléen `true`) ne survit jamais au second passage — RED sans le filtre applicatif', async () => {
    const row = baseRow({ message: { ...baseRow().message, isViewOnce: true } });
    const prisma = makePrisma({ messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([row]) } });
    const app = await buildApp(prisma);
    try {
      const res = await app.inject({ method: 'GET', url: '/attachments/search?q=photo' });
      expect(JSON.parse(res.payload).data.attachments).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('un message ÉPHÉMÈRE (bit EFFECT_FLAGS sans le booléen jumeau) est retenu par le second passage', async () => {
    // Le `where` ne peut pas fermer `effectFlags` (pas d'opérateur bitwise
    // Mongo côté Prisma) : un mock qui l'ignorerait laisserait passer une
    // ligne qu'un vrai moteur, lui, n'aurait pas non plus exclue par le
    // `where` — c'est exactement le cas que le second passage doit fermer.
    const row = baseRow({ message: { ...baseRow().message, effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL } });
    const prisma = makePrisma({ messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([row]) } });
    const app = await buildApp(prisma);
    try {
      const res = await app.inject({ method: 'GET', url: '/attachments/search?q=photo' });
      expect(JSON.parse(res.payload).data.attachments).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('une pièce jointe elle-même FLOUTÉE (indépendamment du message) est retenue par le second passage', async () => {
    const row = baseRow({ isBlurred: true });
    const prisma = makePrisma({ messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([row]) } });
    const app = await buildApp(prisma);
    try {
      const res = await app.inject({ method: 'GET', url: '/attachments/search?q=photo' });
      expect(JSON.parse(res.payload).data.attachments).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('un message CHIFFRÉ est exclu', async () => {
    const row = baseRow({ message: { ...baseRow().message, isEncrypted: true } });
    const prisma = makePrisma({ messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([row]) } });
    const app = await buildApp(prisma);
    try {
      const res = await app.inject({ method: 'GET', url: '/attachments/search?q=photo' });
      expect(JSON.parse(res.payload).data.attachments).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('une ligne sans message porteur (relation absente) est exclue, fail-CLOSED', async () => {
    const row = baseRow({ message: null });
    const prisma = makePrisma({ messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([row]) } });
    const app = await buildApp(prisma);
    try {
      const res = await app.inject({ method: 'GET', url: '/attachments/search?q=photo' });
      expect(JSON.parse(res.payload).data.attachments).toEqual([]);
    } finally {
      await app.close();
    }
  });
});

describe('GET /attachments/search — masquage personnel (clear-history / delete-for-me)', () => {
  it('un message supprimé « pour moi » (`UserMessageDeletion`) est absent du résultat', async () => {
    const prisma = makePrisma({
      userMessageDeletion: {
        findMany: jest.fn<any>().mockResolvedValue([{ messageId: MSG_1, message: { conversationId: CONV_A } }]),
      },
    });
    const app = await buildApp(prisma);
    try {
      const res = await app.inject({ method: 'GET', url: '/attachments/search?q=photo' });
      expect(JSON.parse(res.payload).data.attachments).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('un historique effacé avant la date du message (`clearHistoryBefore`) le masque', async () => {
    const prisma = makePrisma({
      userConversationPreferences: {
        findMany: jest.fn<any>().mockResolvedValue([{ conversationId: CONV_A, clearHistoryBefore: new Date('2026-08-15T00:00:00.000Z') }]),
      },
    });
    const app = await buildApp(prisma);
    try {
      const res = await app.inject({ method: 'GET', url: '/attachments/search?q=photo' });
      // `message.createdAt` de la fixture (2026-08-01) est ANTÉRIEUR au cutoff.
      expect(JSON.parse(res.payload).data.attachments).toEqual([]);
    } finally {
      await app.close();
    }
  });
});

describe('GET /attachments/search — plancher d\'historique (#5170 critère 2)', () => {
  it('compose `historyFloorClause` dans le `where.message` quand un octroi par date existe', async () => {
    const grantedFrom = new Date('2026-07-01T00:00:00.000Z');
    const prisma = makePrisma({
      participant: {
        findMany: jest.fn<any>().mockResolvedValue([
          { conversationId: CONV_A, role: 'member', joinedAt: new Date('2026-01-01'), shareLinkId: null, historyVisibleFrom: grantedFrom, permissions: null, anonymousSession: null, user: { role: 'USER' } },
        ]),
      },
    });
    const app = await buildApp(prisma);
    try {
      await app.inject({ method: 'GET', url: '/attachments/search?q=photo' });
      const call = prisma.messageAttachment.findMany.mock.calls[0][0];
      expect(call.where.message.AND).toEqual([
        { OR: [{ conversationId: CONV_A, createdAt: { gte: grantedFrom } }] },
      ]);
    } finally {
      await app.close();
    }
  });
});

describe('GET /attachments/search — pagination par curseur', () => {
  it('résout le curseur SANS le `where` courant et filtre `createdAt < cursor`', async () => {
    const prisma = makePrisma({
      messageAttachment: {
        findFirst: jest.fn<any>().mockResolvedValue({ createdAt: new Date('2026-08-10T00:00:00.000Z') }),
        findMany: jest.fn<any>().mockResolvedValue([baseRow()]),
      },
    });
    const app = await buildApp(prisma);
    try {
      await app.inject({ method: 'GET', url: `/attachments/search?q=photo&cursor=${ATT_2}` });
      expect(prisma.messageAttachment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ATT_2 } })
      );
      const call = prisma.messageAttachment.findMany.mock.calls[0][0];
      expect(call.where.createdAt).toEqual({ lt: new Date('2026-08-10T00:00:00.000Z') });
    } finally {
      await app.close();
    }
  });

  it('`hasMore` est vrai quand la page brute atteint `limit`, faux sinon', async () => {
    const prisma = makePrisma({
      messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([baseRow()]) },
    });
    const app = await buildApp(prisma);
    try {
      const res = await app.inject({ method: 'GET', url: '/attachments/search?q=photo&limit=1' });
      const body = JSON.parse(res.payload);
      expect(body.pagination).toEqual({ limit: 1, hasMore: true, nextCursor: ATT_1 });
    } finally {
      await app.close();
    }
  });
});
