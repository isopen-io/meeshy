/**
 * #7357 — les deux portes « qui a lu / qui a écouté » gardent l'historique
 * AU NIVEAU DE LA ROUTE, là où la réponse part.
 *
 *   - `GET /messages/:messageId/status-details`
 *   - `GET /attachments/:attachmentId/status-details`
 *
 * Un accusé est NOMINATIF : pour un lecteur arrivé après coup, un contenu
 * antérieur à son plancher n'existe pas — même 404 qu'un id inconnu, jamais
 * un 500 qui distinguerait les deux cas. Et un contenu supprimé ne rend plus
 * ses accusés : pour une pièce jointe, c'est le MESSAGE parent qui porte
 * `deletedAt` (`MessageAttachment` n'a pas cette colonne).
 *
 * Le Prisma factice REFUSE tout champ de `where` que le schéma ne déclare pas
 * (lu dans le DMMF du client généré) : la vraie base lèverait
 * `PrismaClientValidationError`, et un double complaisant laisserait passer
 * une route qui répond 500 à chaque appel.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterAll, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { datamodelReel } from '../../security/prisma-relation-fields';

const USER_ID = '507f1f77bcf86cd799439001';
const PARTICIPANT_ID = '507f1f77bcf86cd799439002';
const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439011';
const ATTACHMENT_ID = '507f1f77bcf86cd799439044';

const HISTORY_FLOOR = new Date('2024-06-01T00:00:00Z');
const BEFORE_FLOOR = new Date('2024-01-01T00:00:00Z');
const AFTER_FLOOR = new Date('2024-09-01T00:00:00Z');

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (request: any) => {
    request.authContext = {
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
const mockGetMessageStatusDetails = jest.fn(async (..._args: unknown[]) => emptyPage());
const mockGetAttachmentStatusDetails = jest.fn(async (..._args: unknown[]) => emptyPage());

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getMessageStatusDetails: (...args: unknown[]) => mockGetMessageStatusDetails(...args),
    getAttachmentStatusDetails: (...args: unknown[]) => mockGetAttachmentStatusDetails(...args),
  })),
}));

import messageRoutes from '../../../routes/messages';

type ContentRow = { readonly createdAt: Date; readonly deletedAt: Date | null };

function schemaFields(model: string): ReadonlySet<string> {
  const found = datamodelReel().find((m) => m.name === model);
  if (!found) throw new Error(`datamodel Prisma réel introuvable pour ${model} — lancer prisma generate`);
  return new Set(found.fields.map((f) => f.name));
}

const RELATION_OPERATORS: ReadonlySet<string> = new Set(['is', 'isNot', 'AND', 'OR', 'NOT']);

function assertWhereMatchesSchema(model: string, where: Record<string, unknown>): void {
  const known = schemaFields(model);
  const unknown = Object.keys(where).filter((key) => !known.has(key) && !RELATION_OPERATORS.has(key));
  if (unknown.length > 0) {
    throw new Error(`PrismaClientValidationError: Unknown argument \`${unknown[0]}\` on ${model}`);
  }
}

function messageMatches(row: ContentRow, filter: Record<string, unknown> | undefined): boolean {
  if (!filter) return true;
  assertWhereMatchesSchema('Message', filter);
  return !('deletedAt' in filter) || filter.deletedAt !== null || row.deletedAt === null;
}

function participantsFor(where: Record<string, unknown> | undefined) {
  const matches = (where?.userId === undefined || where.userId === USER_ID) && (where?.isActive === undefined || where.isActive === true);
  return matches ? [{ userId: USER_ID }] : [];
}

function restrictedParticipant() {
  return {
    id: PARTICIPANT_ID,
    role: 'member',
    joinedAt: HISTORY_FLOOR,
    shareLinkId: null,
    historyVisibleFrom: null,
    permissions: { canViewHistory: false },
    anonymousSession: null,
    user: null,
  };
}

function buildPrisma(content: ContentRow, readerRow: Record<string, unknown>) {
  return {
    message: {
      findFirst: jest.fn(async (args: any) => {
        const where = args?.where ?? {};
        if (!messageMatches(content, { deletedAt: where.deletedAt })) return null;
        return {
          id: MSG_ID,
          conversationId: CONV_ID,
          createdAt: content.createdAt,
          deletedAt: content.deletedAt,
          conversation: { id: CONV_ID, participants: participantsFor(args?.include?.conversation?.include?.participants?.where) },
        };
      }),
    },
    messageAttachment: {
      findFirst: jest.fn(async (args: any) => {
        const where = args?.where ?? {};
        assertWhereMatchesSchema('MessageAttachment', where);
        const parentFilter = where.message?.is ?? where.message;
        if (!messageMatches(content, parentFilter)) return null;
        return {
          id: ATTACHMENT_ID,
          messageId: MSG_ID,
          message: {
            id: MSG_ID,
            conversationId: CONV_ID,
            createdAt: content.createdAt,
            deletedAt: content.deletedAt,
            conversation: {
              id: CONV_ID,
              participants: participantsFor(args?.include?.message?.include?.conversation?.include?.participants?.where),
            },
          },
        };
      }),
    },
    participant: { findFirst: jest.fn(async () => readerRow) },
  } as any;
}

async function buildApp(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as any);
  app.decorate('translationService', {} as any);
  app.decorate('socketIOHandler', { getManager: () => null } as any);
  await app.register(messageRoutes);
  await app.ready();
  return app;
}

const DOORS = [
  { name: 'message', url: `/messages/${MSG_ID}/status-details`, service: mockGetMessageStatusDetails },
  { name: 'attachment', url: `/attachments/${ATTACHMENT_ID}/status-details`, service: mockGetAttachmentStatusDetails },
] as const;

describe.each(DOORS)('#7357 — GET status-details ($name) garde plancher et suppression', ({ url, service }) => {
  let app: FastifyInstance | null = null;

  const serve = async (content: ContentRow, readerRow: Record<string, unknown> = restrictedParticipant()) => {
    app = await buildApp(buildPrisma(content, readerRow));
    return app.inject({ method: 'GET', url });
  };

  beforeEach(() => {
    mockGetMessageStatusDetails.mockClear();
    mockGetAttachmentStatusDetails.mockClear();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("rend 404 pour un contenu antérieur au plancher du lecteur — sans jamais appeler le service", async () => {
    const response = await serve({ createdAt: BEFORE_FLOOR, deletedAt: null });

    expect(response.statusCode).toBe(404);
    expect(service).not.toHaveBeenCalled();
  });

  it('sert un contenu postérieur au plancher et transmet ce plancher au service', async () => {
    const response = await serve({ createdAt: AFTER_FLOOR, deletedAt: null });

    expect(response.statusCode).toBe(200);
    expect(service).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ historyFloor: HISTORY_FLOOR }));
  });

  it('sert un membre sans restriction (plancher null) — pas de régression', async () => {
    const response = await serve({ createdAt: BEFORE_FLOOR, deletedAt: null }, { id: PARTICIPANT_ID });

    expect(response.statusCode).toBe(200);
    expect(service).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ historyFloor: null }));
  });

  it("rend 404 pour un message SUPPRIMÉ — ses accusés partent avec lui", async () => {
    const response = await serve({ createdAt: AFTER_FLOOR, deletedAt: new Date('2024-10-01T00:00:00Z') });

    expect(response.statusCode).toBe(404);
    expect(service).not.toHaveBeenCalled();
  });
});
