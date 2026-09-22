/**
 * #7358 (G-9) — un invité ANONYME est un membre : ses statuts de pièce jointe
 * s'écrivent et se lisent comme ceux d'un inscrit.
 *
 * Le contexte anonyme porte `userId = Participant.id` (branche anonyme de
 * `UnifiedAuthService`) et `participantId` à côté. Les deux portes pièce jointe
 * cherchaient l'appelant par `where: { userId }` : pour un invité, la colonne
 * `Participant.userId` est nulle, la recherche ne trouvait personne, et la
 * route répondait 404 à un membre qui existe — son écoute ne s'enregistrait
 * jamais, et il ne voyait pas qui avait écouté.
 *
 * Le Prisma factice ÉVALUE le `where` imbriqué contre les vraies lignes
 * (inscrit et invité) : c'est la recherche, pas sa forme, qui est mesurée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

const REGISTERED_USER_ID = '507f1f77bcf86cd799439001';
const REGISTERED_PARTICIPANT_ID = '507f1f77bcf86cd799439002';
const GUEST_PARTICIPANT_ID = '507f1f77bcf86cd799439003';
const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439011';
const ATTACHMENT_ID = '507f1f77bcf86cd799439044';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (request: any) => {
    request.authContext = request.headers['x-test-guest']
      ? {
          type: 'anonymous',
          isAuthenticated: true,
          isAnonymous: true,
          participantId: '507f1f77bcf86cd799439003',
          userId: '507f1f77bcf86cd799439003',
          hasFullAccess: false,
        }
      : {
          type: 'registered',
          isAuthenticated: true,
          isAnonymous: false,
          userId: '507f1f77bcf86cd799439001',
          hasFullAccess: true,
          registeredUser: { id: '507f1f77bcf86cd799439001', role: 'USER' },
        };
  },
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

jest.mock('../../../utils/rate-limiter', () => ({
  createCustomRateLimiter: () => ({
    middleware: () => async (_req: unknown, _reply: unknown) => {},
  }),
}));

const emptyPage = () => ({ statuses: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } });
const mockGetAttachmentStatusDetails = jest.fn(async (..._args: unknown[]) => emptyPage());
const mockMarkImageAsViewed = jest.fn(async (..._args: unknown[]) => undefined);

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getAttachmentStatusDetails: (...args: unknown[]) => mockGetAttachmentStatusDetails(...args),
    markImageAsViewed: (...args: unknown[]) => mockMarkImageAsViewed(...args),
  })),
}));

import messageRoutes from '../../../routes/messages';

type ParticipantRow = {
  readonly id: string;
  readonly userId: string | null;
  readonly isActive: boolean;
  readonly bannedAt: Date | null;
};

const MEMBERS: readonly ParticipantRow[] = [
  { id: REGISTERED_PARTICIPANT_ID, userId: REGISTERED_USER_ID, isActive: true, bannedAt: null },
  { id: GUEST_PARTICIPANT_ID, userId: null, isActive: true, bannedAt: null },
];

function fieldMatches(row: ParticipantRow, key: string, expected: unknown): boolean {
  if (key === 'OR') {
    return (expected as ReadonlyArray<Record<string, unknown>>).some((branch) => rowMatches(row, branch));
  }
  const actual = (row as Record<string, unknown>)[key];
  if (expected !== null && typeof expected === 'object' && 'isSet' in (expected as object)) {
    return (expected as { isSet: boolean }).isSet ? actual !== undefined : actual === undefined || actual === null;
  }
  return actual === expected;
}

function rowMatches(row: ParticipantRow, where: Record<string, unknown> | undefined): boolean {
  return Object.entries(where ?? {}).every(([key, expected]) => fieldMatches(row, key, expected));
}

function buildPrisma() {
  return {
    messageAttachment: {
      findFirst: jest.fn(async (args: any) => {
        const participantsQuery = args?.include?.message?.include?.conversation?.include?.participants;
        return {
          id: ATTACHMENT_ID,
          messageId: MSG_ID,
          message: {
            id: MSG_ID,
            conversationId: CONV_ID,
            createdAt: new Date('2026-09-01T10:00:00Z'),
            deletedAt: null,
            conversation: {
              id: CONV_ID,
              participants: MEMBERS.filter((row) => rowMatches(row, participantsQuery?.where)),
            },
          },
        };
      }),
    },
    participant: { findFirst: jest.fn(async () => ({ id: GUEST_PARTICIPANT_ID })) },
    userPreferences: { findMany: jest.fn(async () => []) },
  } as any;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', buildPrisma());
  app.decorate('translationService', {} as any);
  app.decorate('socketIOHandler', { getManager: () => null } as any);
  await app.register(messageRoutes);
  await app.ready();
  return app;
}

describe('#7358 — un invité anonyme est membre des portes pièce jointe', () => {
  let app: FastifyInstance | null = null;

  beforeEach(async () => {
    mockGetAttachmentStatusDetails.mockClear();
    mockMarkImageAsViewed.mockClear();
    app = await buildApp();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("GET status-details : l'invité lit qui a consulté la pièce jointe", async () => {
    const response = await app!.inject({
      method: 'GET',
      url: `/attachments/${ATTACHMENT_ID}/status-details`,
      headers: { 'x-test-guest': '1' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockGetAttachmentStatusDetails).toHaveBeenCalledTimes(1);
  });

  it("POST status : l'ouverture de l'invité s'enregistre sous SON Participant.id", async () => {
    const response = await app!.inject({
      method: 'POST',
      url: `/attachments/${ATTACHMENT_ID}/status`,
      headers: { 'x-test-guest': '1' },
      payload: { action: 'viewed' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockMarkImageAsViewed).toHaveBeenCalledWith(GUEST_PARTICIPANT_ID, ATTACHMENT_ID, expect.any(Object));
  });

  it("un inscrit reste servi et s'enregistre sous son Participant.id — pas de régression", async () => {
    const read = await app!.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/status-details` });
    const write = await app!.inject({
      method: 'POST',
      url: `/attachments/${ATTACHMENT_ID}/status`,
      payload: { action: 'viewed' },
    });

    expect(read.statusCode).toBe(200);
    expect(write.statusCode).toBe(200);
    expect(mockMarkImageAsViewed).toHaveBeenCalledWith(REGISTERED_PARTICIPANT_ID, ATTACHMENT_ID, expect.any(Object));
  });
});
