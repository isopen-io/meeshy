/**
 * #4923 — `GET /attachments/:attachmentId/metadata` exige désormais les
 * MÊMES bornes que `GET /conversations/:id/attachments`, la LISTE voisine
 * dans le même fichier : appartenance à la conversation (résolue sous les
 * DEUX colonnes — `userId` pour un inscrit, `id` pour un invité de lien),
 * plancher d'historique du lien partagé, masquage personnel, et cycle de vie
 * du message porteur.
 *
 * Avant ce correctif, la route ne portait AUCUNE de ces gardes : n'importe
 * quel compte authentifié qui connaissait un id de pièce jointe obtenait son
 * `fileUrl` et sa transcription, quelle que soit la conversation d'où elle
 * vient. Chaque témoin ci-dessous assert sur le comportement RÉSULTANT
 * (statut, ou valeur servie), jamais sur le `select` — un mock Prisma rend ce
 * qu'on lui dit quel que soit l'argument reçu.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

const mockGetAttachmentWithMetadata = jest.fn<any>();

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    getAttachmentWithMetadata: (...a: any[]) => mockGetAttachmentWithMetadata(...a),
  })),
}));

// ─── Import après les mocks ───────────────────────────────────────────────────

import { registerMetadataRoutes } from '../../../routes/attachments/metadata';

// ─── Constantes ───────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439001';
const OTHER_USER_ID = '507f1f77bcf86cd799439002';
const CONV_ID = '507f1f77bcf86cd799439010';
const OTHER_CONV_ID = '507f1f77bcf86cd799439020';
const MESSAGE_ID = '507f1f77bcf86cd799439030';
const ATTACHMENT_ID = '507f1f77bcf86cd799439040';
const PARTICIPANT_ID = '507f1f77bcf86cd799439050';

/** Une pièce jointe RATTACHÉE — le chemin que le fix couvre. */
const ATTACHMENT = {
  id: ATTACHMENT_ID,
  messageId: MESSAGE_ID,
  uploadedBy: OTHER_USER_ID,
  fileUrl: 'https://cdn.example.com/secret.jpg',
  fileName: 'secret.jpg',
  originalName: 'secret.jpg',
  mimeType: 'image/jpeg',
  fileSize: 42,
  transcription: { type: 'audio', text: 'contenu privé', language: 'fr', confidence: 0.9, source: 'whisper' },
  updatedAt: new Date('2026-09-01T00:00:00Z'),
};

const REGISTERED_PARTICIPANT_ROW = {
  conversationId: CONV_ID,
  role: 'member',
  joinedAt: new Date('2026-01-01T00:00:00Z'),
  shareLinkId: null,
  historyVisibleFrom: null,
  permissions: null,
  anonymousSession: null,
  user: { role: 'USER' },
};

const LIVE_MESSAGE = {
  id: MESSAGE_ID,
  conversationId: CONV_ID,
  deletedAt: null,
  expiresAt: null,
  createdAt: new Date('2026-08-01T00:00:00Z'),
};

function makePrisma(overrides: any = {}) {
  return {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue(LIVE_MESSAGE),
      findFirst: jest.fn<any>().mockResolvedValue({ id: MESSAGE_ID }),
      ...overrides.message,
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(REGISTERED_PARTICIPANT_ROW),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      ...overrides.participant,
    },
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      ...overrides.conversationShareLink,
    },
    userConversationPreferences: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      ...overrides.userConversationPreferences,
    },
    userMessageDeletion: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      ...overrides.userMessageDeletion,
    },
  };
}

const registeredAuth = (userId: string) =>
  ({ isAuthenticated: true, isAnonymous: false, type: 'registered', userId } as const);

const anonymousAuth = (participantId: string) =>
  ({ isAuthenticated: true, isAnonymous: true, type: 'anonymous', userId: 'session-token', participantId } as const);

function buildApp(authContext: unknown, prismaOverrides: any = {}) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const auth = async (req: any) => {
    if (authContext) (req as any).authContext = authContext;
  };
  const prisma = makePrisma(prismaOverrides);
  // Les deux slots reçoivent la même garde : la route n'utilise plus que
  // `authOptional` (#4923) — voir le commentaire au site d'enregistrement.
  registerMetadataRoutes(app, auth, auth, prisma as any);
  return app;
}

async function get(app: FastifyInstance) {
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/metadata` });
  await app.close();
  return res;
}

beforeEach(() => {
  mockGetAttachmentWithMetadata.mockReset();
  mockGetAttachmentWithMetadata.mockResolvedValue(ATTACHMENT);
});

describe('#4923 — appartenance à la conversation', () => {
  it('sert le détail à un membre INSCRIT de la conversation', async () => {
    const res = await get(buildApp(registeredAuth(USER_ID)));
    expect(res.statusCode).toBe(200);
    expect(res.json().data.attachment.fileUrl).toBe(ATTACHMENT.fileUrl);
    expect(res.json().data.attachment.transcription).toEqual(ATTACHMENT.transcription);
  });

  it('refuse un compte INSCRIT qui n’est PAS membre de la conversation — en 404, pas en 403', async () => {
    const res = await get(buildApp(registeredAuth(USER_ID), {
      participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    }));
    expect(res.statusCode).toBe(404);
    expect(res.json().data).toBeUndefined();
  });

  it('sert le détail à un INVITÉ de lien partagé membre de la conversation', async () => {
    const res = await get(buildApp(anonymousAuth(PARTICIPANT_ID), {
      participant: { findUnique: jest.fn<any>().mockResolvedValue({ ...REGISTERED_PARTICIPANT_ROW, user: null }) },
    }));
    expect(res.statusCode).toBe(200);
  });

  it('refuse un invité de lien partagé dont la session appartient à une AUTRE conversation', async () => {
    const res = await get(buildApp(anonymousAuth(PARTICIPANT_ID), {
      participant: { findUnique: jest.fn<any>().mockResolvedValue({ ...REGISTERED_PARTICIPANT_ROW, conversationId: OTHER_CONV_ID, user: null }) },
    }));
    expect(res.statusCode).toBe(404);
  });

  it('refuse un invité de lien partagé dont la session ne résout à AUCUN participant', async () => {
    const res = await get(buildApp(anonymousAuth(PARTICIPANT_ID), {
      participant: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    }));
    expect(res.statusCode).toBe(404);
  });

  it("rend la MÊME réponse pour un id HORS PÉRIMÈTRE et un id INEXISTANT — pas d'oracle d'existence (#4150)", async () => {
    const horsPerimetre = await get(buildApp(registeredAuth(USER_ID), {
      participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    }));

    mockGetAttachmentWithMetadata.mockResolvedValueOnce(null);
    const inexistant = await get(buildApp(registeredAuth(USER_ID)));

    expect(horsPerimetre.statusCode).toBe(inexistant.statusCode);
    expect(horsPerimetre.json()).toEqual(inexistant.json());
  });
});

describe('#4923 — pièce jointe pas encore rattachée à un message', () => {
  it('sert le détail au DÉPOSANT pendant que son envoi est en cours', async () => {
    // `messageId: null` — la fixture ATTACHMENT.uploadedBy est OTHER_USER_ID.
    mockGetAttachmentWithMetadata.mockResolvedValueOnce({ ...ATTACHMENT, messageId: null });
    const res = await get(buildApp(registeredAuth(OTHER_USER_ID)));
    expect(res.statusCode).toBe(200);
  });

  it("refuse quiconque N'EST PAS le déposant tant que l'envoi est en cours", async () => {
    mockGetAttachmentWithMetadata.mockResolvedValueOnce({ ...ATTACHMENT, messageId: null });
    const res = await get(buildApp(registeredAuth(USER_ID)));
    expect(res.statusCode).toBe(404);
  });
});

describe('#4923 — cycle de vie du message porteur', () => {
  it('refuse quand le message porteur a été SUPPRIMÉ', async () => {
    const res = await get(buildApp(registeredAuth(USER_ID), {
      message: { findUnique: jest.fn<any>().mockResolvedValue({ ...LIVE_MESSAGE, deletedAt: new Date('2026-08-15T00:00:00Z') }) },
    }));
    expect(res.statusCode).toBe(404);
  });

  it('refuse quand le message porteur a EXPIRÉ (éphémère ou brûlure de vue unique consommée)', async () => {
    const res = await get(buildApp(registeredAuth(USER_ID), {
      message: { findUnique: jest.fn<any>().mockResolvedValue({ ...LIVE_MESSAGE, expiresAt: new Date('2020-01-01T00:00:00Z') }) },
    }));
    expect(res.statusCode).toBe(404);
  });

  it('sert le détail quand le message porte une échéance FUTURE', async () => {
    const res = await get(buildApp(registeredAuth(USER_ID), {
      message: { findUnique: jest.fn<any>().mockResolvedValue({ ...LIVE_MESSAGE, expiresAt: new Date('2099-01-01T00:00:00Z') }) },
    }));
    expect(res.statusCode).toBe(200);
  });

  it("refuse quand l'id de message rattaché ne résout plus à AUCUN message", async () => {
    const res = await get(buildApp(registeredAuth(USER_ID), {
      message: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    }));
    expect(res.statusCode).toBe(404);
  });
});

describe('#4923 — plancher d’historique et masquage personnel (branchement)', () => {
  // `loadHistoryFloor` / `loadPersonalHistoryHiding` sont les fonctions
  // RÉELLES (non doublées) : seule la requête finale de visibilité est
  // simulée, exactement comme la LISTE voisine la construit
  // (`applyPersonalHistoryHiding(applyHistoryFloor(...), ...)`).
  it("refuse quand le message tombe hors de la fenêtre visible du lecteur (plancher OU masquage)", async () => {
    const res = await get(buildApp(registeredAuth(USER_ID), {
      message: {
        findUnique: jest.fn<any>().mockResolvedValue(LIVE_MESSAGE),
        findFirst: jest.fn<any>().mockResolvedValue(null),
      },
    }));
    expect(res.statusCode).toBe(404);
  });

  it('sert le détail quand le message est dans la fenêtre visible du lecteur', async () => {
    const res = await get(buildApp(registeredAuth(USER_ID)));
    expect(res.statusCode).toBe(200);
  });
});

describe('#4923 — authentification', () => {
  it('refuse une requête sans aucune identité', async () => {
    const res = await get(buildApp(null));
    expect(res.statusCode).toBe(401);
  });
});
