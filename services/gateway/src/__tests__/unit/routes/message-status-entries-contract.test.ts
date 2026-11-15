/**
 * `GET /conversations/:id/messages` — le contrat de sortie ne porte AUCUNE
 * entrée de statut nominative, quoi qu'en dise `include_status`.
 *
 * Ce fichier existe parce que le défaut qu'il verrouille était invisible aux
 * doubles : `messages-routes.test.ts` monte un faux Fastify SANS sérialiseur,
 * et y voyait donc un champ `statusEntries` que la production retire depuis
 * toujours. `fast-json-stringify` ne sérialise que ce que le schéma déclare, et
 * `messageSchema` ne déclare pas `statusEntries` — le tableau était construit,
 * puis jeté.
 *
 * Ce qu'il en coûtait : `include_status=true` ajoutait la relation au `select`
 * Prisma, soit une requête supplémentaire par page ramenant jusqu'à
 * `messages × participants` documents `MessageStatusEntry`, sur le chemin de
 * lecture le plus chaud du produit.
 *
 * Ce que cette garde protège EN PLUS de la dépense : déclarer `statusEntries`
 * dans le schéma pour « réparer » le champ manquant publierait d'un coup des
 * accusés NOMINATIFS — identité, horodatage, durée de lecture, appareil — sans
 * le gate `showReadReceipts` que les cinq lecteurs de `MessageReadStatusService`
 * appliquent tous. Le détail nominatif a déjà son point de service, lui GATÉ :
 * `GET /conversations/:id/statuses` (`messages-advanced.ts`, via
 * `filterReadReceiptVisible`).
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

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const SENDER_USER_ID = '507f1f77bcf86cd799439022';
const SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439023';
const MESSAGE_ID = '507f1f77bcf86cd799439024';
const READER_PARTICIPANT_ID = '507f1f77bcf86cd799439032';
const READER_USER_ID = '507f1f77bcf86cd799439031';

const AT = new Date('2026-08-01T10:00:00.000Z');

type Harness = {
  app: FastifyInstance;
  messageFindMany: jest.Mock;
};

function buildHarness(): Harness {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  // La ligne PORTE des entrées de statut : si la route les recopiait, le
  // sérialiseur serait le seul rempart — et ce test dirait pourquoi.
  const messageFindMany = jest.fn().mockResolvedValue([
    {
      id: MESSAGE_ID,
      conversationId: CONV_ID,
      senderId: SENDER_PARTICIPANT_ID,
      content: 'bonjour',
      originalLanguage: 'fr',
      messageType: 'text',
      messageSource: 'user',
      createdAt: AT,
      updatedAt: AT,
      isEdited: false,
      deletedAt: null,
      validatedMentions: [],
      attachments: [],
      deliveredCount: 0,
      readCount: 0,
      deliveredToAllAt: null,
      readByAllAt: null,
      statusEntries: [
        {
          id: 'status-entry-1',
          participantId: READER_PARTICIPANT_ID,
          userId: READER_USER_ID,
          deliveredAt: AT,
          receivedAt: AT,
          readAt: AT,
          readDurationMs: 4200,
          readDevice: 'ios',
        },
      ],
      sender: {
        id: SENDER_PARTICIPANT_ID,
        userId: SENDER_USER_ID,
        displayName: 'Emetteur',
        user: { id: SENDER_USER_ID, username: 'emetteur' },
      },
    },
  ]) as unknown as jest.Mock;

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue({
        id: SENDER_PARTICIPANT_ID,
        userId: SENDER_USER_ID,
        isActive: true,
      }),
      findMany: jest.fn().mockResolvedValue([
        { id: SENDER_PARTICIPANT_ID, userId: SENDER_USER_ID, isActive: true },
        { id: READER_PARTICIPANT_ID, userId: READER_USER_ID, isActive: true },
      ]),
    },
    message: {
      count: jest.fn().mockResolvedValue(1),
      findMany: messageFindMany,
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
    conversationReadCursor: { findMany: jest.fn().mockResolvedValue([]) },
    messageStatusEntry: { findMany: jest.fn().mockResolvedValue([]) },
    userPreference: { findMany: jest.fn().mockResolvedValue([]) },
    userPreferences: { findMany: jest.fn().mockResolvedValue([]) },
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
  return { app, messageFindMany };
}

async function get(url: string) {
  const { app, messageFindMany } = buildHarness();
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    return { body: res.json(), messageFindMany };
  } finally {
    await app.close();
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /conversations/:id/messages — les entrées de statut nominatives', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it("ne sont pas servies, même quand la ligne en porte et qu'on les demande", async () => {
    const { body } = await get(`/conversations/${CONV_ID}/messages?include_status=true`);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].statusEntries).toBeUndefined();
  });

  it("ne sont pas non plus CHARGÉES — la dépense suivait le contrat, pas l'inverse", async () => {
    const { messageFindMany } = await get(`/conversations/${CONV_ID}/messages?include_status=true`);
    const select = (messageFindMany.mock.calls[0][0] as any).select;
    expect(select.statusEntries).toBeUndefined();
  });

  it("reste accepté comme paramètre — aucun client n'est rejeté pour l'avoir envoyé", async () => {
    const { body } = await get(`/conversations/${CONV_ID}/messages?include_status=true`);
    expect(body.success).toBe(true);
  });

  it('sert les compteurs agrégés, eux GATÉS, qui portent le besoin réel des coches', async () => {
    // `deliveredCount` / `readCount` / `recipientCount` viennent de
    // `getConversationReadStatuses`, qui retire les opt-out du numérateur COMME
    // du dénominateur. C'est la voie servie, et elle n'a pas bougé.
    const { body } = await get(`/conversations/${CONV_ID}/messages`);
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        deliveredCount: expect.any(Number),
        readCount: expect.any(Number),
        recipientCount: expect.any(Number),
      })
    );
  });
});
