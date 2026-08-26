/**
 * `GET /conversations/:id/messages` — ce que le lecteur a retiré de SA vue ne
 * lui est pas re-servi.
 *
 * Les deux fonctionnalités de masquage personnel étaient écrites et jamais
 * lues : `POST /api/conversations/:id/clear-history` posait un curseur dans
 * `UserConversationPreferences.clearHistoryBefore` et le diffusait aux autres
 * appareils du compte ; `DELETE /api/messages/:id/delete-for-me` écrivait une
 * ligne `UserMessageDeletion`. Aucune requête de lecture ne consultait l'une
 * ou l'autre — `deletedAt: null` (la pierre tombale du « supprimer pour tout
 * le monde ») était le SEUL filtre. « Message deleted from your view » et
 * « Chat history cleared before X » étaient donc deux réponses que l'API
 * n'avait aucun moyen d'honorer : la liste suivante re-servait tout.
 *
 * Ce test attaque le CÂBLAGE, pas la sémantique du filtre (couverte par
 * `personalHistoryFilter.test.ts`) : il vérifie que la route charge bien les
 * deux faits et les pose sur la requête qu'elle envoie à la base.
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
const USER_ID = '507f1f77bcf86cd799439022';
const PARTICIPANT_ID = '507f1f77bcf86cd799439023';
const VISIBLE_MESSAGE_ID = '507f1f77bcf86cd799439024';
const HIDDEN_MESSAGE_ID = '507f1f77bcf86cd799439025';

const CUTOFF = new Date('2026-08-01T00:00:00.000Z');

interface Scenario {
  readonly clearHistoryBefore?: Date | null;
  readonly hiddenMessageIds?: readonly string[];
  readonly anonymous?: boolean;
}

function buildApp(scenario: Scenario): { app: FastifyInstance; prisma: any } {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue({ id: PARTICIPANT_ID, userId: USER_ID, isActive: true }),
      findMany: jest.fn().mockResolvedValue([{ id: PARTICIPANT_ID, userId: USER_ID, isActive: true }]),
    },
    message: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([
        {
          id: VISIBLE_MESSAGE_ID,
          conversationId: CONV_ID,
          senderId: PARTICIPANT_ID,
          content: 'bonjour',
          originalLanguage: 'fr',
          messageType: 'text',
          messageSource: 'user',
          createdAt: new Date('2026-08-02T10:00:00.000Z'),
          updatedAt: new Date('2026-08-02T10:00:00.000Z'),
          isEdited: false,
          deletedAt: null,
          validatedMentions: [],
          attachments: [],
          deliveredCount: 0,
          readCount: 0,
          sender: {
            id: PARTICIPANT_ID,
            userId: USER_ID,
            displayName: 'Emetteur',
            user: { id: USER_ID, username: 'emetteur' },
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
    conversationReadCursor: { findMany: jest.fn().mockResolvedValue([]) },
    messageStatusEntry: { findMany: jest.fn().mockResolvedValue([]) },
    userPreference: { findMany: jest.fn().mockResolvedValue([]) },
    userPreferences: { findMany: jest.fn().mockResolvedValue([]) },
    userConversationPreferences: {
      findFirst: jest.fn().mockResolvedValue(
        scenario.clearHistoryBefore === undefined
          ? null
          : { clearHistoryBefore: scenario.clearHistoryBefore }
      ),
    },
    userMessageDeletion: {
      findMany: jest.fn().mockResolvedValue(
        (scenario.hiddenMessageIds ?? []).map((messageId) => ({ messageId }))
      ),
    },
  };

  const optionalAuth = async (req: any) => {
    req.authContext = scenario.anonymous
      ? {
          type: 'anonymous',
          isAuthenticated: true,
          isAnonymous: true,
          userId: undefined,
          participantId: PARTICIPANT_ID,
        }
      : {
          type: 'registered',
          isAuthenticated: true,
          isAnonymous: false,
          userId: USER_ID,
          registeredUser: { id: USER_ID, role: 'USER' },
        };
  };

  registerMessagesRoutes(app, prisma, {} as any, optionalAuth, optionalAuth);
  return { app, prisma };
}

async function listMessages(scenario: Scenario): Promise<{ pageWhere: any; countWhere: any }> {
  const { app, prisma } = buildApp(scenario);
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
    expect(res.statusCode).toBe(200);
    return {
      pageWhere: prisma.message.findMany.mock.calls[0][0].where,
      countWhere: prisma.message.count.mock.calls[0][0].where,
    };
  } finally {
    await app.close();
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /conversations/:id/messages — le masquage personnel du lecteur', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it("n'ajoute aucune contrainte quand le lecteur n'a rien masqué", async () => {
    const { pageWhere } = await listMessages({});

    expect(pageWhere.createdAt).toBeUndefined();
    expect(pageWhere.id).toBeUndefined();
    expect(pageWhere).toMatchObject({ conversationId: CONV_ID, deletedAt: null });
  });

  it("borne la page au curseur d'historique effacé", async () => {
    const { pageWhere } = await listMessages({ clearHistoryBefore: CUTOFF });

    expect(pageWhere.createdAt).toEqual({ gte: CUTOFF });
  });

  it('borne AUSSI le COUNT total, pour que la pagination ne promette pas ce qui est masqué', async () => {
    const { countWhere } = await listMessages({ clearHistoryBefore: CUTOFF });

    expect(countWhere.createdAt).toEqual({ gte: CUTOFF });
  });

  it("exclut les messages supprimés de la seule vue du lecteur", async () => {
    const { pageWhere } = await listMessages({ hiddenMessageIds: [HIDDEN_MESSAGE_ID] });

    expect(pageWhere.id).toEqual({ notIn: [HIDDEN_MESSAGE_ID] });
  });

  it('applique les DEUX faits ensemble — aucun ne remplace l\'autre', async () => {
    const { pageWhere } = await listMessages({
      clearHistoryBefore: CUTOFF,
      hiddenMessageIds: [HIDDEN_MESSAGE_ID],
    });

    expect(pageWhere.createdAt).toEqual({ gte: CUTOFF });
    expect(pageWhere.id).toEqual({ notIn: [HIDDEN_MESSAGE_ID] });
  });

  it("ne consulte ni l'une ni l'autre table pour un lecteur anonyme, qui n'en possède aucune ligne", async () => {
    const { app, prisma } = buildApp({ anonymous: true });
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
      expect(res.statusCode).toBe(200);
      expect(prisma.userConversationPreferences.findFirst).not.toHaveBeenCalled();
      expect(prisma.userMessageDeletion.findMany).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('scope la lecture des suppressions à CETTE conversation, pas à tout le compte', async () => {
    const { app, prisma } = buildApp({ hiddenMessageIds: [HIDDEN_MESSAGE_ID] });
    await app.ready();
    try {
      await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
      expect(prisma.userMessageDeletion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, message: { conversationId: CONV_ID } },
        })
      );
    } finally {
      await app.close();
    }
  });
});
