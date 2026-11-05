/**
 * `GET /conversations/search` sert la MÊME ligne que `GET /conversations` : une
 * pièce masquée (vue unique, floutée, effet) ou la pièce d'un message éphémère
 * actif n'y part qu'avec sa nature et ses drapeaux (#16017, revue #16021).
 *
 * Le schéma de réponse est le VRAI (`conversationMinimalSchema`) : c'est lui qui
 * décide de ce qui atteint le fil, et un schéma doublé en `additionalProperties`
 * ferait passer le témoin pour une mauvaise raison.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyRequest } from 'fastify';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn(async () => 'conv-resolved-id'),
}));

jest.mock('../../../../services/MessageReadStatusService.js', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCountsForUser: jest.fn(async () => new Map()),
  })),
}));

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
  },
}));

import { registerSearchRoutes } from '../../../../routes/conversations/search';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';

const DETAIL_KEYS = [
  'thumbnailUrl',
  'originalName',
  'fileSize',
  'duration',
  'width',
  'height',
  'pageCount',
  'lineCount',
  'fps',
  'alt',
  'metadata',
  'bitrate',
  'sampleRate',
] as const;

const photo = (overrides: Record<string, unknown> = {}) => ({
  id: 'att-1',
  messageId: 'msg-1',
  mimeType: 'image/jpeg',
  fileUrl: 'https://cdn/secret.jpg',
  thumbnailUrl: 'https://cdn/secret-thumb.jpg',
  originalName: 'le-secret.jpg',
  fileSize: 3_145_728,
  duration: 12_000,
  width: 4032,
  height: 3024,
  pageCount: 3,
  lineCount: 7,
  fps: 30,
  bitrate: 128_000,
  sampleRate: 44_100,
  alt: 'Le code est 4521',
  metadata: { exif: { gps: '48.85,2.35' } },
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ...overrides,
});

const conversationWith = (attachment: ReturnType<typeof photo>, message: Record<string, unknown> = {}) => ({
  id: CONV_ID,
  identifier: 'test-conv',
  title: 'Test Conversation',
  type: 'group',
  avatar: null,
  banner: null,
  isActive: true,
  communityId: null,
  lastMessageAt: new Date(),
  createdAt: new Date(),
  _count: { participants: 3 },
  participants: [
    { id: 'part-1', userId: USER_ID, displayName: 'Alice', user: { id: USER_ID, username: 'alice', displayName: 'Alice' } },
  ],
  messages: [
    {
      id: 'msg-1',
      content: 'Regarde',
      senderId: 'part-1',
      messageType: 'image',
      createdAt: new Date(),
      isBlurred: false,
      isViewOnce: false,
      effectFlags: 0,
      expiresAt: null,
      ephemeralDuration: null,
      sender: {
        id: 'part-1',
        userId: USER_ID,
        displayName: 'Alice',
        avatar: null,
        user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: false },
      },
      attachments: [attachment],
      _count: { attachments: 1 },
      ...message,
    },
  ],
});

async function searchFirstPiece(conversation: ReturnType<typeof conversationWith>): Promise<Record<string, unknown>> {
  const prisma = {
    user: { findMany: jest.fn(async () => []) },
    conversation: { findMany: jest.fn(async () => [conversation]) },
    participant: {
      findMany: jest.fn(async (args: any) =>
        (args?.where?.conversationId?.in ?? []).map((conversationId: string) => ({ conversationId })),
      ),
    },
  };
  const app = Fastify({ logger: false });
  registerSearchRoutes(app, prisma as any, async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } };
  });
  await app.ready();
  const res = await app.inject({ method: 'GET', url: '/conversations/search?q=test' });
  await app.close();
  expect(res.statusCode).toBe(200);
  const piece = res.json().data[0].lastMessage.attachments[0];
  if (!piece) throw new Error('aucune pièce servie');
  return piece;
}

const expectNoDetail = (served: Record<string, unknown>) =>
  DETAIL_KEYS.forEach((key) => expect([key, served[key] ?? null]).toEqual([key, null]));

describe('GET /conversations/search — une pièce masquée ou d’éphémère ne sert aucun détail', () => {
  it.each([
    ['floutée (isBlurred)', { isBlurred: true }],
    ['à vue unique (isViewOnce)', { isViewOnce: true }],
    ['masquée par le seul bitfield (VIEW_ONCE)', { effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }],
    ['masquée par le seul bitfield (BLURRED)', { effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }],
  ])('pièce %s d’un message ordinaire : nature et drapeaux gardés, détails à null', async (_label, flags) => {
    const served = await searchFirstPiece(conversationWith(photo(flags)));
    expect(served.id).toBe('att-1');
    expect(served.mimeType).toBe('image/jpeg');
    expectNoDetail(served);
    expect(served.fileUrl).toBeUndefined();
  });

  it('message éphémère actif : même une pièce ordinaire ne sert aucun détail', async () => {
    const served = await searchFirstPiece(conversationWith(photo(), { ephemeralDuration: 30, expiresAt: new Date(Date.now() + 86_400_000) }));
    expectNoDetail(served);
  });

  it('non-régression : la pièce ordinaire d’un message ordinaire garde ses détails', async () => {
    const served = await searchFirstPiece(conversationWith(photo()));
    expect(served.fileSize).toBe(3_145_728);
    expect(served.thumbnailUrl).toBe('https://cdn/secret-thumb.jpg');
    expect(served.originalName).toBe('le-secret.jpg');
    expect(served.alt).toBe('Le code est 4521');
    expect(served.isBlurred).toBe(false);
  });
});
