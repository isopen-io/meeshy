/**
 * @jest-environment node
 *
 * #11381 — le REJEU d'un `clientMessageId` (dédup précoce de
 * `MessagingService.handleMessage`, le chemin nominal d'une file hors ligne)
 * relit la ligne en base : dans une conversation `server`, elle est scellée.
 * L'expéditeur doit retrouver SON texte, et la retraduction partir du clair —
 * jamais d'une bulle « Message chiffré » ni d'une traduction de ''.
 */
import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const mockHandleNewMessage = jest.fn(async (..._args: unknown[]) => undefined);

jest.mock('../../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({ handleNewMessage: mockHandleNewMessage })),
}));
jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    processExplicitLinksInContent: jest.fn(async ({ content }: { content: string }) => ({ processedContent: content, trackingLinks: [] })),
    collectContentTrackingLinks: jest.fn(async () => []),
  })),
}));
jest.mock('../../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({ markMessagesAsRead: jest.fn(), getUnreadCount: jest.fn() })),
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { MessagingService } from '../../../../services/MessagingService';
import { EncryptionService } from '../../../../services/EncryptionService';
import { resetParticipantLookupCache } from '../../../../utils/participant-lookup-cache';

const CONV_ID = '507f1f77bcf86cd799439012';
const PARTICIPANT_ID = '507f1f77bcf86cd799439014';
const USER_ID = '507f1f77bcf86cd799439011';
const CLIENT_MSG_ID = 'cid_550e8400-e29b-41d4-a716-446655440000';
const SECRET = 'Code 4471';
const savedKey = process.env.ENCRYPTION_MASTER_KEY;

afterAll(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = savedKey;
});

beforeEach(() => {
  jest.clearAllMocks();
  resetParticipantLookupCache();
  process.env.ENCRYPTION_MASTER_KEY = Buffer.alloc(32, 5).toString('base64');
});

function harness() {
  const keys = new Map<string, Record<string, unknown>>();
  const prisma = {
    conversation: {
      findUnique: jest.fn(async () => ({ id: CONV_ID, type: 'private' })),
      findFirst: jest.fn(async () => ({ id: CONV_ID, identifier: 'test-conv', type: 'private' })),
      update: jest.fn(),
    },
    participant: {
      findUnique: jest.fn(async () => ({ id: PARTICIPANT_ID, conversationId: CONV_ID, isActive: true, type: 'user', userId: USER_ID })),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    message: { create: jest.fn(), update: jest.fn(), findMany: jest.fn(async () => []), findFirst: jest.fn(), findUnique: jest.fn() },
    messageAttachment: { findMany: jest.fn(async () => []) },
    user: { findUnique: jest.fn(), findMany: jest.fn(async () => []) },
    serverEncryptionKey: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => { keys.set(String(data.id), data); return data; }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => keys.get(where.id) ?? null),
      update: jest.fn(async () => ({})),
    },
  };
  return prisma;
}

describe('MessagingService — rejeu d’un clientMessageId dans une conversation server', () => {
  it('sert (et retraduit) le CLAIR, jamais la ligne scellée', async () => {
    const prisma = harness();
    const sealed = await new EncryptionService(prisma as unknown as PrismaClient).sealAtRest({ plaintext: SECRET, conversationId: CONV_ID });
    prisma.message.findFirst.mockImplementation(async () => ({
      id: '507f1f77bcf86cd799439013', conversationId: CONV_ID, senderId: PARTICIPANT_ID, content: '', originalLanguage: 'fr',
      messageType: 'text', replyToId: null, deletedAt: null, isEdited: false, validatedMentions: [], createdAt: new Date(),
      updatedAt: new Date(), clientMessageId: CLIENT_MSG_ID, translations: {}, sender: null, attachments: [], replyTo: null,
      isEncrypted: true, encryptionMode: 'server', encryptedContent: sealed.ciphertext, encryptionMetadata: { mode: 'server', ...sealed.metadata },
    }));
    const service = new MessagingService(prisma as unknown as PrismaClient, { handleNewMessage: mockHandleNewMessage } as never);

    const response = await service.handleMessage({ conversationId: CONV_ID, content: SECRET, clientMessageId: CLIENT_MSG_ID }, PARTICIPANT_ID);

    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(response.data).toMatchObject({ content: SECRET, isEncrypted: false, encryptionMode: 'server' });
    expect(JSON.stringify(response.data)).not.toContain(sealed.ciphertext);
    expect(mockHandleNewMessage).toHaveBeenCalledWith(expect.objectContaining({ content: SECRET }));
  });
});
