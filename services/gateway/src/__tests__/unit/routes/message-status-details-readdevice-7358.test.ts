/**
 * #7358 (G-9) — `readDevice` (l'appareil sur lequel un membre a lu) ne sert
 * qu'à ce membre. `GET /conversations/:id/receipts?detail=people` le masquait
 * depuis le lot G9 ; sa porte jumelle `GET /messages/:id/status-details`
 * servait encore l'appareil de CHAQUE lecteur à tout membre — ce qui part à
 * côté du correctif.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
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

const STATUS_PAGE = {
  statuses: [
    { participantId: '507f1f77bcf86cd799439002', displayName: 'Moi', avatar: null, deliveredAt: null, receivedAt: null, readAt: new Date('2026-09-01T10:10:00Z'), readDevice: 'ios' },
    { participantId: '507f1f77bcf86cd799439003', displayName: 'Invité', avatar: null, deliveredAt: null, receivedAt: null, readAt: new Date('2026-09-01T10:11:00Z'), readDevice: 'web' },
    { participantId: '507f1f77bcf86cd799439005', displayName: 'Autre', avatar: null, deliveredAt: null, receivedAt: null, readAt: new Date('2026-09-01T10:12:00Z'), readDevice: 'android' },
  ],
  pagination: { total: 3, limit: 20, offset: 0, hasMore: false },
};

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getMessageStatusDetails: async () => STATUS_PAGE,
  })),
}));

import messageRoutes from '../../../routes/messages';

type ParticipantRow = { readonly id: string; readonly userId: string | null; readonly isActive: boolean };

const MEMBERS: readonly ParticipantRow[] = [
  { id: REGISTERED_PARTICIPANT_ID, userId: REGISTERED_USER_ID, isActive: true },
  { id: GUEST_PARTICIPANT_ID, userId: null, isActive: true },
];

function rowMatches(row: ParticipantRow, where: Record<string, unknown> | undefined): boolean {
  return Object.entries(where ?? {}).every(([key, expected]) =>
    key === 'OR' ? true : (row as Record<string, unknown>)[key] === expected
  );
}

function buildPrisma() {
  return {
    message: {
      findFirst: jest.fn(async (args: any) => ({
        id: MSG_ID,
        conversationId: CONV_ID,
        createdAt: new Date('2026-09-01T10:00:00Z'),
        deletedAt: null,
        conversation: {
          id: CONV_ID,
          participants: MEMBERS.filter((row) => rowMatches(row, args?.include?.conversation?.include?.participants?.where)),
        },
      })),
    },
    participant: { findFirst: jest.fn(async () => null) },
  } as any;
}

async function readDevices(headers: Record<string, string> = {}): Promise<Record<string, string | null>> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', buildPrisma());
  app.decorate('translationService', {} as any);
  app.decorate('socketIOHandler', { getManager: () => null } as any);
  await app.register(messageRoutes);
  await app.ready();
  const response = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}/status-details`, headers });
  await app.close();
  expect(response.statusCode).toBe(200);
  const rows = response.json().data as Array<{ participantId: string; readDevice: string | null }>;
  return Object.fromEntries(rows.map((row) => [row.participantId, row.readDevice ?? null]));
}

describe('#7358 — GET /messages/:id/status-details ne sert readDevice qu\'au lecteur lui-même', () => {
  it("un inscrit voit SON appareil, jamais celui des autres", async () => {
    expect(await readDevices()).toEqual({
      [REGISTERED_PARTICIPANT_ID]: 'ios',
      [GUEST_PARTICIPANT_ID]: null,
      '507f1f77bcf86cd799439005': null,
    });
  });

  it("un invité voit SON appareil, jamais celui des autres", async () => {
    expect(await readDevices({ 'x-test-guest': '1' })).toEqual({
      [REGISTERED_PARTICIPANT_ID]: null,
      [GUEST_PARTICIPANT_ID]: 'web',
      '507f1f77bcf86cd799439005': null,
    });
  });
});
