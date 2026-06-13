/**
 * @jest-environment node
 *
 * Unit tests for the DM-only bidirectional block gate used by both
 * `message:send` and `message:send-with-attachments`.
 *
 * The gate lives in `MessageHandler._isDirectMessageBlocked`. It must:
 *   - only enforce for direct/dm conversations (group/public/etc. pass)
 *   - reject when EITHER side blocked the other (bidirectional)
 *   - never query when there is no other active participant
 *
 * Heavy collaborators are mocked at module scope so the handler can be
 * constructed without ZMQ / Redis / Socket.IO wiring. The cache is mocked to
 * always miss so each call hits the (mocked) Prisma layer.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const cacheGet = jest.fn(async () => null as string | null);
const cacheSet = jest.fn(async () => undefined);

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({ get: cacheGet, set: cacheSet }),
}));

import { MessageHandler } from '../MessageHandler';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

type ConvSelect = {
  type: string;
  participants: Array<{ userId: string | null }>;
} | null;

function buildHandler(opts: {
  conversation: ConvSelect;
  blockedBetween?: boolean;
}) {
  const conversationFindUnique = jest.fn(async () => opts.conversation);
  // isBlockedBetween uses prisma.user.findFirst → return a row when blocked.
  const userFindFirst = jest.fn(async () => (opts.blockedBetween ? { id: 'x' } : null));

  const prisma = {
    conversation: { findUnique: conversationFindUnique },
    user: { findFirst: userFindFirst },
  } as unknown as PrismaClient;

  const handler = new MessageHandler({
    io: {} as never,
    prisma,
    messagingService: {} as never,
    translationService: {} as never,
    statusService: {} as never,
    notificationService: {} as never,
    connectedUsers: new Map(),
    socketToUser: new Map(),
    stats: { messages_processed: 0, errors: 0 },
    attachmentService: {} as never,
    readStatusService: {} as never,
    privacyPreferencesService: {} as never,
  });

  // Access the private DM gate through a typed cast — it is the unit of
  // behavior changed by this feature.
  const gate = (
    handler as unknown as {
      _isDirectMessageBlocked: (conversationId: string, userId: string) => Promise<boolean>;
    }
  )._isDirectMessageBlocked.bind(handler);

  return { gate, conversationFindUnique, userFindFirst };
}

describe('MessageHandler DM block gate (_isDirectMessageBlocked)', () => {
  beforeEach(() => {
    cacheGet.mockClear();
    cacheSet.mockClear();
    cacheGet.mockResolvedValue(null);
  });

  it('blocks a direct conversation when the other user blocked me', async () => {
    const { gate } = buildHandler({
      conversation: { type: 'direct', participants: [{ userId: 'me' }, { userId: 'other' }] },
      blockedBetween: true,
    });

    await expect(gate('conv1', 'me')).resolves.toBe(true);
  });

  it('blocks a direct conversation when I blocked the other user (bidirectional)', async () => {
    // isBlockedBetween returns true regardless of which side holds the block;
    // the bidirectional OR query is unit-tested in blocking.test.ts.
    const { gate } = buildHandler({
      conversation: { type: 'dm', participants: [{ userId: 'me' }, { userId: 'other' }] },
      blockedBetween: true,
    });

    await expect(gate('conv1', 'me')).resolves.toBe(true);
  });

  it('allows a direct conversation when neither side blocked the other', async () => {
    const { gate } = buildHandler({
      conversation: { type: 'direct', participants: [{ userId: 'me' }, { userId: 'other' }] },
      blockedBetween: false,
    });

    await expect(gate('conv1', 'me')).resolves.toBe(false);
  });

  it('does NOT enforce for group conversations even if a block exists', async () => {
    const { gate, userFindFirst } = buildHandler({
      conversation: { type: 'group', participants: [{ userId: 'me' }, { userId: 'other' }] },
      blockedBetween: true,
    });

    await expect(gate('conv1', 'me')).resolves.toBe(false);
    // group → never reaches the block lookup
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it('does NOT enforce when there is no other active participant', async () => {
    const { gate, userFindFirst } = buildHandler({
      conversation: { type: 'direct', participants: [{ userId: 'me' }] },
      blockedBetween: true,
    });

    await expect(gate('conv1', 'me')).resolves.toBe(false);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it('returns false for a missing conversation', async () => {
    const { gate, userFindFirst } = buildHandler({ conversation: null, blockedBetween: true });

    await expect(gate('conv1', 'me')).resolves.toBe(false);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it('serves the cached block decision without re-querying', async () => {
    cacheGet.mockResolvedValue('1');
    const { gate, userFindFirst } = buildHandler({
      conversation: { type: 'direct', participants: [{ userId: 'me' }, { userId: 'other' }] },
      blockedBetween: false,
    });

    await expect(gate('conv1', 'me')).resolves.toBe(true);
    expect(userFindFirst).not.toHaveBeenCalled();
  });
});
