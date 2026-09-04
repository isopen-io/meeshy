/**
 * Unit tests for attachments/metadata.ts
 * Tests GET /attachments/:attachmentId/metadata,
 *       DELETE /attachments/:attachmentId,
 *       GET /conversations/:conversationId/attachments
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

// `@meeshy/shared/types/api-schemas` n'est PAS doublé, et ne doit plus l'être.
//
// Ce harnais en substituait un faux `messageAttachmentSchema` (trois clés) et
// un faux `messageAttachmentMinimalSchema` (deux clés). Le double DÉSARMAIT
// `fast-json-stringify` — c'est-à-dire exactement la couche où vit le contrat
// servi par ces trois routes : sous un schéma inventé, aucune des trente
// assertions ci-dessous ne pouvait attester quoi que ce soit de ce que la
// route rend RÉELLEMENT (#4887, défaut 4).
//
// C'est le patron que `services/gateway/CLAUDE.md` interdit depuis les cycles
// 91, 93 et 104 : « un double PARTIEL d'un module perd en silence tout ce que
// le module GAGNE ». Le remède documenté est `jest.requireActual` + surcharge
// ciblée ; ici aucune surcharge n'est nécessaire — les vrais schémas SONT ce
// qu'on mesure, donc la couche à traverser.

const mockGetAttachmentWithMetadata = jest.fn<any>();
const mockGetAttachment = jest.fn<any>();
const mockDeleteAttachment = jest.fn<any>();
const mockGetConversationAttachments = jest.fn<any>();

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    getAttachmentWithMetadata: (...a: any[]) => mockGetAttachmentWithMetadata(...a),
    getAttachment: (...a: any[]) => mockGetAttachment(...a),
    deleteAttachment: (...a: any[]) => mockDeleteAttachment(...a),
    getConversationAttachments: (...a: any[]) => mockGetConversationAttachments(...a),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerMetadataRoutes } from '../../../routes/attachments/metadata';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const ATTACHMENT_ID = 'att-111aaa';
const CONV_ID = 'conv-222bbb';
const PARTICIPANT_ID = 'part-333ccc';

const MOCK_ATTACHMENT = {
  id: ATTACHMENT_ID,
  type: 'image',
  url: '/files/img.jpg',
  uploadedBy: USER_ID,
  isAnonymous: false,
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      ...overrides.participant,
    },
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue({ allowViewHistory: true }),
      ...overrides.conversationShareLink,
    },
    // Les deux tables que lit `loadPersonalHistoryHiding`. Par défaut vides :
    // un lecteur qui ne masque rien ne doit rien changer à l'appel du service.
    userConversationPreferences: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      ...overrides.userConversationPreferences,
    },
    userMessageDeletion: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      ...overrides.userMessageDeletion,
    },
    ...overrides,
  };
}

type AuthMode = 'registered' | 'anonymous' | 'none';

async function buildApp({
  authMode = 'registered' as AuthMode,
  role = 'USER',
  participantId = PARTICIPANT_ID as string | undefined,
  prismaOverrides = {} as any,
} = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const authRequired = async (req: any, reply: any) => {
    if (authMode !== 'registered') {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    }
    (req as any).authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      type: 'registered',
      userId: USER_ID,
      registeredUser: { id: USER_ID, role },
    };
  };

  const authOptional = async (req: any) => {
    if (authMode === 'registered') {
      (req as any).authContext = {
        isAuthenticated: true,
        isAnonymous: false,
        type: 'registered',
        userId: USER_ID,
        registeredUser: { id: USER_ID, role },
      };
    } else if (authMode === 'anonymous') {
      // Un participant anonyme MUNI d'un jeton de session valide porte
      // `isAuthenticated: true` (cf. `createAnonymousUserContext`). Seul le
      // visiteur nu a `isAuthenticated: false`. La fixture posait l'inverse,
      // c'est-à-dire un visiteur nu — et les tests passaient quand même,
      // parce que la garde des routes était elle aussi fausse.
      (req as any).authContext = {
        isAuthenticated: true,
        isAnonymous: true,
        type: 'anonymous',
        userId: 'session-token',
        participantId,
      };
    }
    // authMode === 'none': no authContext set → handler returns 401
  };

  const prisma = makePrisma(prismaOverrides);
  await registerMetadataRoutes(app, authRequired, authOptional, prisma as any);
  await app.ready();
  (app as any).__prisma = prisma;
  return app;
}

// ─── GET /attachments/:attachmentId/metadata ─────────────────────────────────

describe('GET /attachments/:id/metadata — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authMode: 'none' }); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/metadata` });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /attachments/:id/metadata — not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetAttachmentWithMetadata.mockResolvedValue(null);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when attachment does not exist', async () => {
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/metadata` });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /attachments/:id/metadata — ETag cache hit', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetAttachmentWithMetadata.mockResolvedValue(MOCK_ATTACHMENT);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 304 when ETag matches', async () => {
    const updatedAtMs = MOCK_ATTACHMENT.updatedAt.getTime();
    const etag = `"${ATTACHMENT_ID}-${updatedAtMs}"`;
    const res = await app.inject({
      method: 'GET',
      url: `/attachments/${ATTACHMENT_ID}/metadata`,
      headers: { 'if-none-match': etag },
    });
    expect(res.statusCode).toBe(304);
  });
});

describe('GET /attachments/:id/metadata — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetAttachmentWithMetadata.mockResolvedValue(MOCK_ATTACHMENT);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with Cache-Control and ETag headers', async () => {
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/metadata` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.headers['cache-control']).toContain('private');
    expect(res.headers['etag']).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LE HARNAIS EST ARMÉ — et voici ce qui le prouve.
//
// Le double supprimé en tête de fichier déclarait `messageAttachmentSchema`
// avec trois clés inventées (`id`, `type`, `url`) et le minimal avec deux.
// Sous ce double, une réponse portant `type` et `url` les rendait, et perdait
// `uploadedBy` / `isAnonymous` ; sous le VRAI schéma c'est l'exact inverse.
// Les deux témoins ci-dessous distinguent donc les deux harnais dans les DEUX
// sens : ils ne peuvent pas être verts sur un schéma inventé.
//
// C'est le seul genre d'assertion que ce fichier ne pouvait pas porter avant
// (#4887, défaut 4) — ses trente témoins n'interrogeaient que des codes de
// statut et `success: true`, deux valeurs qu'aucun schéma ne touche. Un
// harnais désarmé ne cache pas seulement un bug : il rend indicible la
// question à laquelle il aurait dû répondre.
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /attachments/:id/metadata — contrat SERVI (harnais armé)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetAttachmentWithMetadata.mockResolvedValue({
      ...MOCK_ATTACHMENT,
      fileName: 'photo.jpg',
      originalName: 'Photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 2048,
      fileUrl: 'https://cdn.example.com/photo.jpg',
      createdAt: '2026-09-01T10:00:00.000Z',
    });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('sert les champs du VRAI `messageAttachmentSchema`, pas ceux du double', async () => {
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/metadata` });
    const attachment = res.json().data.attachment;

    // Déclarés par le schéma réel — le double les supprimait.
    expect(attachment.uploadedBy).toBe(USER_ID);
    expect(attachment.isAnonymous).toBe(false);
    expect(attachment.originalName).toBe('Photo.jpg');
    expect(attachment.fileSize).toBe(2048);
  });

  it("supprime `type` et `url`, que seul le double déclarait", async () => {
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/metadata` });
    const attachment = res.json().data.attachment;

    // `fast-json-stringify` retire toute clé qu'aucun schéma ne déclare. Sous
    // le double, ces deux-là survivaient — le harnais attestait donc d'un
    // contrat que la route ne sert pas.
    expect(attachment).not.toHaveProperty('type');
    expect(attachment).not.toHaveProperty('url');
  });
});

describe('GET /attachments/:id/metadata — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetAttachmentWithMetadata.mockRejectedValue(new Error('DB error'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on service error', async () => {
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/metadata` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── DELETE /attachments/:attachmentId ───────────────────────────────────────

describe('DELETE /attachments/:id — no auth context', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetAttachment.mockResolvedValue(MOCK_ATTACHMENT);
    app = await buildApp({ authMode: 'none' });
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when no auth context', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /attachments/:id — not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetAttachment.mockResolvedValue(null);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when attachment not found', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /attachments/:id — forbidden (wrong owner)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetAttachment.mockResolvedValue({ ...MOCK_ATTACHMENT, uploadedBy: 'other-user' });
    app = await buildApp({ role: 'USER' });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not owner', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(403);
  });
});

describe('DELETE /attachments/:id — owner deletes', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetAttachment.mockResolvedValue(MOCK_ATTACHMENT);
    mockDeleteAttachment.mockResolvedValue(undefined);
    app = await buildApp({ role: 'USER' });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when owner deletes their attachment', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('DELETE /attachments/:id — admin deletes', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetAttachment.mockResolvedValue({ ...MOCK_ATTACHMENT, uploadedBy: 'other-user' });
    mockDeleteAttachment.mockResolvedValue(undefined);
    app = await buildApp({ role: 'ADMIN' });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when admin deletes any attachment', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('DELETE /attachments/:id — BIGBOSS deletes', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetAttachment.mockResolvedValue({ ...MOCK_ATTACHMENT, uploadedBy: 'other-user' });
    mockDeleteAttachment.mockResolvedValue(undefined);
    app = await buildApp({ role: 'BIGBOSS' });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when BIGBOSS deletes any attachment', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('DELETE /attachments/:id — anonymous owner', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetAttachment.mockResolvedValue({
      ...MOCK_ATTACHMENT,
      uploadedBy: 'session-token',
      isAnonymous: true,
    });
    mockDeleteAttachment.mockResolvedValue(undefined);
    app = await buildApp({ authMode: 'anonymous' });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when anonymous user deletes their own attachment', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('DELETE /attachments/:id — anonymous forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetAttachment.mockResolvedValue({
      ...MOCK_ATTACHMENT,
      uploadedBy: 'other-session',
      isAnonymous: true,
    });
    app = await buildApp({ authMode: 'anonymous' });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when anonymous user tries to delete someone else attachment', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(403);
  });
});

describe('DELETE /attachments/:id — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetAttachment.mockResolvedValue(MOCK_ATTACHMENT);
    mockDeleteAttachment.mockRejectedValue(new Error('storage failure'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on service error', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /conversations/:conversationId/attachments ───────────────────────────

describe('GET /conversations/:id/attachments — no auth context', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authMode: 'none' }); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when no auth context', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /conversations/:id/attachments — authenticated not member', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      prismaOverrides: {
        participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not a conversation member', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /conversations/:id/attachments — authenticated member success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetConversationAttachments.mockResolvedValue([{ id: 'att-1', type: 'image' }]);
    app = await buildApp({
      prismaOverrides: {
        participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }) },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with attachments for a conversation member', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /conversations/:id/attachments — anonymous participant not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      authMode: 'anonymous',
      prismaOverrides: {
        participant: { findUnique: jest.fn<any>().mockResolvedValue(null) },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  // #4856 — le `participantId` recherché est celui de la SESSION anonyme
  // appelante (son propre jeton), jamais un tiers énuméré : son absence est
  // un « je ne trouve pas », pas un refus d'accès. Le texte disait déjà
  // « not found » sous un 403.
  it('returns 404 when anonymous participant is not found', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /conversations/:id/attachments — anonymous wrong conversation', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      authMode: 'anonymous',
      prismaOverrides: {
        participant: {
          findUnique: jest.fn<any>().mockResolvedValue({
            conversationId: 'different-conv',
            type: 'anonymous',
            anonymousSession: null,
          }),
        },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when participant belongs to a different conversation', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
    expect(res.statusCode).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La galerie est un SECOND LECTEUR des messages de la conversation — elle en
// sert les pièces jointes. Elle doit donc honorer les mêmes exclusions que le
// premier lecteur (`GET /conversations/:id/messages`) : plancher de lien de
// partage, masquage personnel, tombstone `deletedAt`. Ce que la galerie retire
// n'est pas une préférence d'affichage : c'est le contenu lui-même — `fileUrl`,
// `originalName`, la transcription d'un audio.
//
// Le plancher est un `createdAt >= joinedAt`, JAMAIS un refus global : un
// participant entré par un lien sans historique voit les messages postés depuis
// son arrivée, donc leurs médias.
// ─────────────────────────────────────────────────────────────────────────────

const JOINED_AT = new Date('2026-06-15T00:00:00Z');

const messageFilterOf = (call: any) => call?.[1]?.messageFilter;

describe('GET /conversations/:id/attachments — plancher de lien de partage', () => {
  beforeEach(() => { mockGetConversationAttachments.mockClear(); });

  it('borne la galerie d’un membre INSCRIT entré par un lien sans historique', async () => {
    // Le trou : la branche « membre enregistré » ne vérifiait que l'adhésion.
    // Un inscrit entré par un lien `allowViewHistory:false` porte pourtant un
    // `shareLinkId` (routes/conversations/sharing.ts) et n'a pas plus de droit
    // sur l'avant-jointure qu'un anonyme entré à côté de lui.
    mockGetConversationAttachments.mockResolvedValue([]);
    const app = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID, conversationId: CONV_ID, joinedAt: JOINED_AT, shareLinkId: 'link-1',
          }),
        },
        conversationShareLink: {
          findUnique: jest.fn<any>().mockResolvedValue({ allowViewHistory: false }),
        },
      },
    });

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
    expect(res.statusCode).toBe(200);
    expect(messageFilterOf(mockGetConversationAttachments.mock.calls[0]))
      .toEqual({ createdAt: { gte: JOINED_AT } });
    await app.close();
  });

  it('ne borne RIEN pour un membre ajouté directement, et n’interroge aucun lien', async () => {
    mockGetConversationAttachments.mockResolvedValue([]);
    const app = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID, conversationId: CONV_ID, joinedAt: JOINED_AT, shareLinkId: null,
          }),
        },
      },
    });

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
    expect(res.statusCode).toBe(200);
    expect(messageFilterOf(mockGetConversationAttachments.mock.calls[0])).toEqual({});
    expect((app as any).__prisma.conversationShareLink.findUnique).not.toHaveBeenCalled();
    await app.close();
  });

  it('SERT la galerie bornée à un anonyme sans historique, au lieu de la refuser', async () => {
    // Ce test disait 403. Le refus contredisait `GET messages`, qui sert à ce
    // même participant les messages postés depuis son arrivée — pièces jointes
    // comprises. La galerie les cachait pourtant toutes.
    mockGetConversationAttachments.mockResolvedValue([]);
    const app = await buildApp({
      authMode: 'anonymous',
      prismaOverrides: {
        participant: {
          findUnique: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID, conversationId: CONV_ID, type: 'anonymous',
            joinedAt: JOINED_AT, shareLinkId: 'link-1',
          }),
        },
        conversationShareLink: {
          findUnique: jest.fn<any>().mockResolvedValue({ allowViewHistory: false }),
        },
      },
    });

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
    expect(res.statusCode).toBe(200);
    expect(messageFilterOf(mockGetConversationAttachments.mock.calls[0]))
      .toEqual({ createdAt: { gte: JOINED_AT } });
    await app.close();
  });

  it('lit `participant.shareLinkId`, pas la copie dans `anonymousSession`', async () => {
    // Deux colonnes portent le même fait à la jointure anonyme
    // (routes/anonymous.ts). `messages.ts`, `/sync` et le module de plancher
    // lisent tous la colonne canonique ; cette route lisait l'autre.
    mockGetConversationAttachments.mockResolvedValue([]);
    const app = await buildApp({
      authMode: 'anonymous',
      prismaOverrides: {
        participant: {
          findUnique: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID, conversationId: CONV_ID, type: 'anonymous',
            joinedAt: JOINED_AT, shareLinkId: 'link-1', anonymousSession: null,
          }),
        },
        conversationShareLink: {
          findUnique: jest.fn<any>().mockResolvedValue({ allowViewHistory: false }),
        },
      },
    });

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
    expect(res.statusCode).toBe(200);
    expect(messageFilterOf(mockGetConversationAttachments.mock.calls[0]))
      .toEqual({ createdAt: { gte: JOINED_AT } });
    await app.close();
  });

  it('ne borne rien quand le lien est INTROUVABLE — posture du dépôt', async () => {
    mockGetConversationAttachments.mockResolvedValue([]);
    const app = await buildApp({
      authMode: 'anonymous',
      prismaOverrides: {
        participant: {
          findUnique: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID, conversationId: CONV_ID, type: 'anonymous',
            joinedAt: JOINED_AT, shareLinkId: 'link-gone',
          }),
        },
        conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
      },
    });

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
    expect(res.statusCode).toBe(200);
    expect(messageFilterOf(mockGetConversationAttachments.mock.calls[0])).toEqual({});
    await app.close();
  });

  it('ne sert RIEN quand le plancher est ILLISIBLE (contrôle d’accès, pas courtoisie)', async () => {
    const app = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID, conversationId: CONV_ID, joinedAt: JOINED_AT, shareLinkId: 'link-1',
          }),
        },
        conversationShareLink: {
          findUnique: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
        },
      },
    });

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
    expect(res.statusCode).toBe(500);
    expect(mockGetConversationAttachments).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /conversations/:id/attachments — masquage personnel', () => {
  beforeEach(() => { mockGetConversationAttachments.mockClear(); });

  it('retire les médias des messages que ce lecteur a supprimés de SA vue', async () => {
    mockGetConversationAttachments.mockResolvedValue([]);
    const app = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID, conversationId: CONV_ID, joinedAt: JOINED_AT, shareLinkId: null,
          }),
        },
        userMessageDeletion: {
          findMany: jest.fn<any>().mockResolvedValue([{ messageId: 'm-hidden' }]),
        },
      },
    });

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
    expect(res.statusCode).toBe(200);
    expect(messageFilterOf(mockGetConversationAttachments.mock.calls[0]))
      .toEqual({ id: { notIn: ['m-hidden'] } });
    await app.close();
  });

  it('garde la borne la PLUS STRICTE quand le plancher et le vidage se croisent', async () => {
    // Un `clear-history` plus ANCIEN que la jointure ne doit pas desserrer le
    // plancher : le masquage personnel est une courtoisie, le plancher est un
    // contrôle d'accès.
    mockGetConversationAttachments.mockResolvedValue([]);
    const app = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID, conversationId: CONV_ID, joinedAt: JOINED_AT, shareLinkId: 'link-1',
          }),
        },
        conversationShareLink: {
          findUnique: jest.fn<any>().mockResolvedValue({ allowViewHistory: false }),
        },
        userConversationPreferences: {
          findFirst: jest.fn<any>().mockResolvedValue({
            clearHistoryBefore: new Date('2026-01-01T00:00:00Z'),
          }),
        },
      },
    });

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
    expect(res.statusCode).toBe(200);
    expect(messageFilterOf(mockGetConversationAttachments.mock.calls[0]))
      .toEqual({ createdAt: { gte: JOINED_AT } });
    await app.close();
  });

  it('n’interroge PAS les tables de masquage pour un anonyme — il n’en possède aucune', async () => {
    mockGetConversationAttachments.mockResolvedValue([]);
    const app = await buildApp({
      authMode: 'anonymous',
      prismaOverrides: {
        participant: {
          findUnique: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID, conversationId: CONV_ID, type: 'anonymous',
            joinedAt: JOINED_AT, shareLinkId: null,
          }),
        },
      },
    });

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
    expect(res.statusCode).toBe(200);
    expect((app as any).__prisma.userMessageDeletion.findMany).not.toHaveBeenCalled();
    expect((app as any).__prisma.userConversationPreferences.findFirst).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /conversations/:id/attachments — contrat SERVI (harnais armé)', () => {
  beforeEach(() => { mockGetConversationAttachments.mockClear(); });

  it('sert les treize clés de la liste, et retient toute colonne lourde', async () => {
    // Le service ne charge plus `transcription` ni `translations` (#4887,
    // défaut 3) ; ce témoin garde l'autre moitié de la garantie — même si un
    // appelant futur en remettait dans la charge, le schéma de la LISTE ne les
    // déclare pas et le sérialiseur les retirerait. Le contrat servi ne dépend
    // pas de la discipline du producteur.
    mockGetConversationAttachments.mockResolvedValue([{
      id: 'att-1',
      messageId: 'msg-1',
      fileName: 'note.m4a',
      originalName: 'Note vocale.m4a',
      mimeType: 'audio/mp4',
      fileSize: 84213,
      fileUrl: 'https://cdn.example.com/note.m4a',
      thumbnailUrl: null,
      width: null,
      height: null,
      duration: 12480,
      uploadedBy: USER_ID,
      createdAt: '2026-09-01T10:00:00.000Z',
      transcription: { type: 'audio', text: 'La réunion est déplacée.' },
      translations: { en: { type: 'audio', transcription: 'The meeting moved.' } },
    }]);
    const app = await buildApp({
      prismaOverrides: {
        participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID, conversationId: CONV_ID }) },
      },
    });

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
    const [attachment] = res.json().data.attachments;

    expect(Object.keys(attachment).sort()).toEqual([
      'createdAt', 'duration', 'fileName', 'fileSize', 'fileUrl', 'height', 'id',
      'messageId', 'mimeType', 'originalName', 'thumbnailUrl', 'uploadedBy', 'width',
    ]);
    await app.close();
  });
});

describe('GET /conversations/:id/attachments — with type filter', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetConversationAttachments.mockResolvedValue([]);
    app = await buildApp({
      prismaOverrides: {
        participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }) },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('passes type filter to service', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/attachments?type=image&limit=10&offset=5`,
    });
    expect(res.statusCode).toBe(200);
    expect(mockGetConversationAttachments).toHaveBeenCalledWith(
      CONV_ID,
      expect.objectContaining({ type: 'image', limit: 10, offset: 5 }),
    );
  });
});

describe('GET /conversations/:id/attachments — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetConversationAttachments.mockRejectedValue(new Error('DB failure'));
    app = await buildApp({
      prismaOverrides: {
        participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }) },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on service error', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
    expect(res.statusCode).toBe(500);
  });
});
