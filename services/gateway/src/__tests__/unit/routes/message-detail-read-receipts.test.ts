/**
 * `GET /messages/:messageId` — le DERNIER chemin REST qui servait ses accusés
 * depuis les colonnes dénormalisées mortes.
 *
 * `Message.deliveredCount` / `Message.readCount` n'ont aucun écrivain : elles
 * valent toujours zéro. La liste (`GET /conversations/:id/messages`) l'a acté
 * au cycle 100 et délègue depuis à `MessageReadStatusService`, opt-out
 * `showReadReceipts` compris (cycle 101). Cette route-ci — le détail d'UN
 * message — servait encore les colonnes : le MÊME message rendait 2 lectures
 * par la liste et 0 par son détail.
 *
 * L'enjeu est devenu concret : l'extension de notification iOS
 * (`NSEDataSync.syncMessage`) visait `GET /conversations/:cid/messages/:mid`,
 * un couple méthode/chemin que la gateway n'a jamais enregistré (seuls PUT et
 * DELETE y vivent) — la requête tombait donc en 404 depuis toujours. En la
 * repointant sur CETTE route, le blob poussé dans l'App Group devient la
 * source qui écrase le cache GRDB : lui laisser des compteurs à zéro ferait
 * REGRESSER des coches déjà acquises.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks (avant l'import du module de route) ────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockAuthMiddleware = jest.fn();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  isRegisteredUser: (ctx: any) => ctx?.type === 'registered',
}));

jest.mock('../../../services/attachments/index', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {},
  attachmentFullSelect: {},
  attachmentForwardPreviewSelect: {},
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../validation/helpers', () => ({
  validateParams: jest.fn(() => async () => {}),
  validateBody: jest.fn(() => async () => {}),
  validateQuery: jest.fn(() => async () => {}),
}));

jest.mock('../../../validation/messages-schemas', () => ({
  MessageParamsSchema: {},
  AttachmentParamsSchema: {},
  UpdateMessageBodySchema: {},
  MessageStatusBodySchema: {},
  MessageStatusDetailsQuerySchema: {},
  AttachmentStatusBodySchema: {},
}));

// ─── Import après les mocks ───────────────────────────────────────────────────

import messageRoutes from '../../../routes/messages';
import { MessageReadStatusService } from '../../../services/MessageReadStatusService';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
/** L'expéditeur — c'est LUI qui verra (ou non) la coche de lecture. */
const SENDER_USER_ID = '507f1f77bcf86cd799439022';
const SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439023';
const MESSAGE_ID = '507f1f77bcf86cd799439024';

/** Destinataire qui laisse ses accusés visibles (défaut du produit). */
const OPEN_USER_ID = '507f1f77bcf86cd799439031';
const OPEN_PARTICIPANT_ID = '507f1f77bcf86cd799439032';

/** Destinataire qui a désactivé `showReadReceipts`. */
const SILENT_USER_ID = '507f1f77bcf86cd799439041';
const SILENT_PARTICIPANT_ID = '507f1f77bcf86cd799439042';

const MESSAGE_CREATED_AT = new Date('2026-08-01T10:00:00.000Z');
const READ_AT = new Date('2026-08-01T10:05:00.000Z');

type ReceiptSummary = {
  deliveredCount: number;
  readCount: number;
  recipientCount: number;
};

type BuildOptions = {
  optedOutUserIds?: string[];
  /** Simule une panne du service d'accusés (la page doit rester servie). */
  breakReadStatus?: boolean;
};

async function buildApp({ optedOutUserIds = [], breakReadStatus = false }: BuildOptions = {}): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: SENDER_USER_ID,
      hasFullAccess: true,
      registeredUser: { id: SENDER_USER_ID, role: 'USER' },
    };
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const participants = [
    { id: SENDER_PARTICIPANT_ID, userId: SENDER_USER_ID, isActive: true },
    { id: OPEN_PARTICIPANT_ID, userId: OPEN_USER_ID, isActive: true },
    { id: SILENT_PARTICIPANT_ID, userId: SILENT_USER_ID, isActive: true },
  ];

  app.decorate('prisma', {
    message: {
      // Le détail du message servi par la route.
      findFirst: jest.fn().mockResolvedValue({
        id: MESSAGE_ID,
        conversationId: CONV_ID,
        senderId: SENDER_PARTICIPANT_ID,
        content: 'bonjour',
        originalLanguage: 'fr',
        messageType: 'text',
        messageSource: 'user',
        isEdited: false,
        editedAt: null,
        deletedAt: null,
        createdAt: MESSAGE_CREATED_AT,
        updatedAt: MESSAGE_CREATED_AT,
        translations: null,
        metadata: null,
        // Les colonnes dénormalisées sont figées à ZÉRO : seule une valeur
        // CALCULÉE peut expliquer un compteur non nul dans la réponse.
        deliveredCount: 0,
        readCount: 0,
        deliveredToAllAt: null,
        readByAllAt: null,
        sender: {
          id: SENDER_PARTICIPANT_ID,
          userId: SENDER_USER_ID,
          displayName: 'Emetteur',
          user: { id: SENDER_USER_ID, username: 'emetteur' },
        },
        conversation: { participants: [{ userId: SENDER_USER_ID, role: 'member' }] },
        attachments: [],
      }),
      // Lecture du service (batch) : distincte de `findFirst`, utilisée par
      // `getConversationReadStatuses`.
      findMany: breakReadStatus
        ? jest.fn().mockRejectedValue(new Error('read-status backend down'))
        : jest.fn().mockResolvedValue([
            { id: MESSAGE_ID, createdAt: MESSAGE_CREATED_AT, senderId: SENDER_PARTICIPANT_ID },
          ]),
    },
    participant: {
      findMany: jest.fn().mockResolvedValue(participants),
    },
    // Les DEUX destinataires ont lu le message (donc reçu).
    conversationReadCursor: {
      findMany: jest.fn().mockResolvedValue([
        { participantId: OPEN_PARTICIPANT_ID, lastDeliveredAt: READ_AT, lastReadAt: READ_AT },
        { participantId: SILENT_PARTICIPANT_ID, lastDeliveredAt: READ_AT, lastReadAt: READ_AT },
      ]),
    },
    messageStatusEntry: {
      findMany: jest.fn().mockResolvedValue([
        { messageId: MESSAGE_ID, participantId: OPEN_PARTICIPANT_ID, deliveredAt: READ_AT, receivedAt: READ_AT, readAt: READ_AT },
        { messageId: MESSAGE_ID, participantId: SILENT_PARTICIPANT_ID, deliveredAt: READ_AT, receivedAt: READ_AT, readAt: READ_AT },
      ]),
    },
    userPreference: {
      findMany: jest.fn().mockResolvedValue(optedOutUserIds.map((userId) => ({ userId }))),
    },
  });
  app.decorate('translationService', {} as any);
  app.decorate('socketIOHandler', { getManager: () => null } as any);

  await app.register(messageRoutes);
  await app.ready();
  return app;
}

async function fetchReceiptSummary(options: BuildOptions = {}): Promise<ReceiptSummary> {
  const app = await buildApp(options);
  try {
    const res = await app.inject({ method: 'GET', url: `/messages/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(200);
    const message = res.json().data;
    return {
      deliveredCount: message.deliveredCount,
      readCount: message.readCount,
      recipientCount: message.recipientCount,
    };
  } finally {
    await app.close();
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /messages/:messageId — les accusés du détail d\'un message', () => {
  beforeEach(() => {
    // Le cache d'opt-out a la portée du PROCESSUS : une entrée laissée par un
    // test fausserait le suivant.
    (MessageReadStatusService as any).readReceiptOptOutCache.clear();
  });

  it('rend les compteurs RÉELS, pas les colonnes dénormalisées à zéro', async () => {
    expect(await fetchReceiptSummary()).toEqual({
      deliveredCount: 2,
      readCount: 2,
      recipientCount: 2,
    });
  });

  it("ne révèle pas la lecture d'un destinataire qui a désactivé ses accusés", async () => {
    // Même vérité que la liste : l'opt-out sort du numérateur ET du
    // dénominateur, sinon « lu par tous » bascule selon le chemin emprunté.
    expect(await fetchReceiptSummary({ optedOutUserIds: [SILENT_USER_ID] })).toEqual({
      deliveredCount: 1,
      readCount: 1,
      recipientCount: 1,
    });
  });

  it("expose `recipientCount` — le dénominateur que la liste sert déjà", async () => {
    // Sans lui, un client qui hydrate son cache depuis CE chemin (l'extension
    // de notification iOS) ne peut pas décider si « lu par tous » est atteint.
    const summary = await fetchReceiptSummary();
    expect(summary.recipientCount).toBe(2);
  });

  it('sert quand même le message quand le calcul des accusés échoue', async () => {
    expect(await fetchReceiptSummary({ breakReadStatus: true })).toEqual({
      deliveredCount: 0,
      readCount: 0,
      recipientCount: 0,
    });
  });
});
