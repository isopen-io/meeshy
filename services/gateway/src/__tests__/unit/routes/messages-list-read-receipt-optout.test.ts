/**
 * `GET /conversations/:id/messages` — les accusés d'un participant qui a
 * DÉSACTIVÉ `showReadReceipts` ne doivent pas ressortir du rattrapage REST.
 *
 * Le gate d'opt-out est posé par `MessageReadStatusService`, et quatre de ses
 * lecteurs le respectent explicitement (`getMessageReadStatus`,
 * `getConversationReadStatuses`, `getMessageStatusDetails`,
 * `getLatestMessageSummary` — tous filtrent EN AMONT, donc le participant
 * opt-out disparaît du numérateur COMME du dénominateur). Le chemin de
 * rattrapage — la liste de messages, lue à chaque démarrage à froid et à
 * chaque remontée de fil — recomptait ces mêmes accusés à sa façon, sans
 * jamais consulter la préférence : la coche bleue de l'expéditeur révélait
 * une lecture que son auteur avait explicitement choisi de taire, et le
 * dénominateur `recipientCount` comptait un destinataire que le canal socket
 * n'y comptait pas (la coche « lu par tous » basculait donc d'un chemin à
 * l'autre).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

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
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
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

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: jest.fn().mockResolvedValue(new Map()),
  }),
}));

// ─── Import après les mocks ───────────────────────────────────────────────────

import { registerMessagesRoutes } from '../../../routes/conversations/messages';
import { MessageReadStatusService } from '../../../services/MessageReadStatusService';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

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

/**
 * @param optedOutUserIds les `User.id` dont `showReadReceipts` vaut `false`
 */
async function buildApp(optedOutUserIds: string[]): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const participants = [
    { id: SENDER_PARTICIPANT_ID, userId: SENDER_USER_ID, isActive: true },
    { id: OPEN_PARTICIPANT_ID, userId: OPEN_USER_ID, isActive: true },
    { id: SILENT_PARTICIPANT_ID, userId: SILENT_USER_ID, isActive: true },
  ];

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue(participants[0]),
      findMany: jest.fn().mockResolvedValue(participants),
    },
    message: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([
        {
          id: MESSAGE_ID,
          conversationId: CONV_ID,
          senderId: SENDER_PARTICIPANT_ID,
          content: 'bonjour',
          originalLanguage: 'fr',
          messageType: 'text',
          messageSource: 'user',
          createdAt: MESSAGE_CREATED_AT,
          updatedAt: MESSAGE_CREATED_AT,
          isEdited: false,
          deletedAt: null,
          validatedMentions: [],
          attachments: [],
          // Les champs dénormalisés en base n'ont AUCUN écrivain : ils valent
          // toujours zéro. Ce test les fige à zéro pour que seule la valeur
          // CALCULÉE puisse expliquer un compteur non nul.
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
        },
      ]),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        systemLanguage: 'fr',
        regionalLanguage: null,
        customDestinationLanguage: null,
        deviceLocale: null,
      }),
    },
    reaction: { findMany: jest.fn().mockResolvedValue([]) },
    attachmentStatusEntry: { findMany: jest.fn().mockResolvedValue([]) },
    // Les DEUX destinataires ont lu le message (donc reçu). Sans gate
    // d'opt-out, l'expéditeur les verrait tous les deux.
    conversationReadCursor: {
      findMany: jest.fn().mockResolvedValue([
        { participantId: OPEN_PARTICIPANT_ID, lastDeliveredAt: READ_AT, lastReadAt: READ_AT },
        { participantId: SILENT_PARTICIPANT_ID, lastDeliveredAt: READ_AT, lastReadAt: READ_AT },
      ]),
    },
    messageStatusEntry: {
      findMany: jest.fn().mockResolvedValue([
        {
          messageId: MESSAGE_ID,
          participantId: OPEN_PARTICIPANT_ID,
          deliveredAt: READ_AT,
          receivedAt: READ_AT,
          readAt: READ_AT,
        },
        {
          messageId: MESSAGE_ID,
          participantId: SILENT_PARTICIPANT_ID,
          deliveredAt: READ_AT,
          receivedAt: READ_AT,
          readAt: READ_AT,
        },
      ]),
    },
    // Cf. `services/preferences/privacy-storage.ts` : l'application n'écrit que
    // le document JSON. Un double qui n'exprimerait l'opt-out que par les
    // lignes héritées testerait un chemin que plus aucun client n'emprunte.
    userPreferences: {
      findMany: jest.fn().mockResolvedValue(
        optedOutUserIds.map((userId) => ({ userId, privacy: { showReadReceipts: false } }))
      ),
    },
    userPreference: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const optionalAuth = async (req: any) => {
    req.authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: SENDER_USER_ID,
      registeredUser: { id: SENDER_USER_ID, role: 'USER' },
    };
  };

  registerMessagesRoutes(app, prisma, {} as any, optionalAuth, optionalAuth);
  await app.ready();
  return app;
}

async function fetchReceiptSummary(optedOutUserIds: string[]): Promise<ReceiptSummary> {
  const app = await buildApp(optedOutUserIds);
  try {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
    expect(res.statusCode).toBe(200);
    const message = res.json().data[0];
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

describe("GET /conversations/:id/messages — l'opt-out d'accusés de lecture", () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    // Le cache d'opt-out a la portée du PROCESSUS : une entrée laissée par un
    // test fausserait le suivant.
    clearPrivacyPreferencesCache();
  });

  it('compte les deux destinataires quand personne ne s\'est retiré', async () => {
    expect(await fetchReceiptSummary([])).toEqual({
      deliveredCount: 2,
      readCount: 2,
      recipientCount: 2,
    });
  });

  it("ne révèle pas la lecture d'un destinataire qui a désactivé ses accusés", async () => {
    const summary = await fetchReceiptSummary([SILENT_USER_ID]);
    expect(summary.readCount).toBe(1);
    expect(summary.deliveredCount).toBe(1);
  });

  it("retire aussi le destinataire opt-out du DÉNOMINATEUR, comme le fait le canal socket", async () => {
    // Sinon la coche « lu par tous » ne bascule jamais côté REST (1/2) alors
    // qu'elle bascule côté socket (1/1) — deux vérités pour un même message.
    expect(await fetchReceiptSummary([SILENT_USER_ID])).toEqual({
      deliveredCount: 1,
      readCount: 1,
      recipientCount: 1,
    });
  });

  it("n'attribue aucun accusé quand TOUS les destinataires se sont retirés", async () => {
    expect(await fetchReceiptSummary([OPEN_USER_ID, SILENT_USER_ID])).toEqual({
      deliveredCount: 0,
      readCount: 0,
      recipientCount: 0,
    });
  });
});
