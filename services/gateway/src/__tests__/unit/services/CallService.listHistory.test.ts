/**
 * CallService.listHistory Unit Tests
 *
 * Tests cursor-based call history pagination, missed-call filtering,
 * and peer resolution for direct conversations.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../services/TURNCredentialService', () => ({
  TURNCredentialService: jest.fn().mockImplementation(() => ({
    generateCredentials: jest.fn().mockReturnValue([]),
    isConfigured: jest.fn().mockReturnValue(false),
    getStatus: jest.fn().mockReturnValue({ configured: false, turnServersCount: 0, stunServersCount: 3, credentialTTL: 600, hasCustomSecret: false }),
  })),
}));

jest.mock('@meeshy/shared/utils/call-summary', () => ({
  buildCallSummaryWithMetadata: jest.fn(),
  callSummaryClientMessageId: jest.fn().mockReturnValue('summary-msg-id'),
}));

jest.mock('@meeshy/shared/types/video-call', () => ({
  CALL_ERROR_CODES: {
    NOT_A_PARTICIPANT: 'NOT_A_PARTICIPANT',
    CALL_NOT_FOUND: 'CALL_NOT_FOUND',
    CALL_ALREADY_ACTIVE: 'CALL_ALREADY_ACTIVE',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
  },
}));

import { CallService } from '../../../services/CallService';
import { CallStatus } from '@meeshy/shared/prisma/client';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = 'user-abc';
const CONV_DIRECT = 'conv-direct-1';
const CONV_GROUP = 'conv-group-1';

function makeRow(overrides: Partial<{
  id: string;
  conversationId: string;
  mode: string;
  status: string;
  endReason: string | null;
  initiatorId: string;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  duration: number | null;
  bytesSent: number | null;
  bytesReceived: number | null;
  metadata: unknown;
  conversation: { type: string; title: string | null; avatar: string | null };
}> = {}) {
  return {
    id: 'call-1',
    conversationId: CONV_DIRECT,
    mode: 'audio',
    status: 'ended',
    endReason: 'hangup',
    initiatorId: USER_ID,
    startedAt: new Date('2026-01-01T10:00:00Z'),
    answeredAt: new Date('2026-01-01T10:00:05Z'),
    endedAt: new Date('2026-01-01T10:01:05Z'),
    duration: 60,
    bytesSent: null,
    bytesReceived: null,
    metadata: { type: 'audio' },
    conversation: { type: 'direct', title: null, avatar: null },
    ...overrides,
  };
}

function makePeer() {
  return {
    conversationId: CONV_DIRECT,
    user: {
      id: 'user-peer-1',
      username: 'peer',
      displayName: 'Peer User',
      avatar: null,
      phoneNumber: null,
      isOnline: true,
    },
  };
}

function makePrisma(overrides: {
  callSessionFindMany?: jest.MockedFunction<any>;
  participantFindMany?: jest.MockedFunction<any>;
} = {}) {
  return {
    conversation: { findUnique: jest.fn<any>(), findFirst: jest.fn<any>() },
    participant: {
      findFirst: jest.fn<any>(),
      findMany: overrides.participantFindMany ?? jest.fn<any>().mockResolvedValue([]),
    },
    callSession: {
      create: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      findFirst: jest.fn<any>(),
      update: jest.fn<any>(),
      updateMany: jest.fn<any>(),
      findMany: overrides.callSessionFindMany ?? jest.fn<any>().mockResolvedValue([]),
    },
    callParticipant: {
      create: jest.fn<any>(),
      findFirst: jest.fn<any>(),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>(),
      updateMany: jest.fn<any>(),
    },
    message: { create: jest.fn<any>() },
    $transaction: jest.fn<any>(),
  } as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallService.listHistory', () => {

  describe('empty history', () => {
    it('returns empty items and hasMore=false when no calls exist', async () => {
      const prisma = makePrisma();
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all' });
      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
    });
  });

  describe('basic retrieval', () => {
    it('returns one item for a single ended call', async () => {
      const row = makeRow();
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany: jest.fn<any>().mockResolvedValue([makePeer()]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].callId).toBe('call-1');
    });

    it('maps duration from the persisted field', async () => {
      const row = makeRow({ duration: 90 });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany: jest.fn<any>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all' });
      expect(result.items[0].durationSec).toBe(90);
    });

    it('derives direction=outgoing when current user is initiator', async () => {
      const row = makeRow({ initiatorId: USER_ID });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany: jest.fn<any>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all' });
      expect(result.items[0].direction).toBe('outgoing');
    });

    it('derives direction=incoming when call was answered by another initiator', async () => {
      const row = makeRow({
        initiatorId: 'other-user',
        answeredAt: new Date(),
      });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany: jest.fn<any>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all' });
      expect(result.items[0].direction).toBe('incoming');
    });

    it('derives direction=missed when another user initiated and call was not answered', async () => {
      const row = makeRow({ initiatorId: 'other-user', answeredAt: null, status: 'missed' });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany: jest.fn<any>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all' });
      expect(result.items[0].direction).toBe('missed');
    });
  });

  describe('peer resolution for direct conversations', () => {
    it('attaches peer data for direct conversation calls', async () => {
      const row = makeRow({ conversationId: CONV_DIRECT, conversation: { type: 'direct', title: null, avatar: null } });
      const peer = makePeer();
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany: jest.fn<any>().mockResolvedValue([peer]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all' });
      expect(result.items[0].peer).not.toBeNull();
      expect(result.items[0].peer?.userId).toBe('user-peer-1');
      expect(result.items[0].peer?.username).toBe('peer');
    });

    it('returns null peer for group conversation calls', async () => {
      const row = makeRow({ conversationId: CONV_GROUP, conversation: { type: 'group', title: 'Team', avatar: null } });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany: jest.fn<any>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all' });
      expect(result.items[0].peer).toBeNull();
    });

    it('skips participants with null user when resolving direct call peers', async () => {
      // m.user === null → the if-guard at line 1029 is false → peer stays null
      const row = makeRow({ conversationId: CONV_DIRECT, conversation: { type: 'direct', title: null, avatar: null } });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany: jest.fn<any>().mockResolvedValue([
          { conversationId: CONV_DIRECT, user: null },
        ]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all' });
      expect(result.items[0].peer).toBeNull();
    });

    it('maps null displayName to null in the peer object', async () => {
      // m.user.displayName is null → ?? null fires at line 1033
      const row = makeRow({ conversationId: CONV_DIRECT, conversation: { type: 'direct', title: null, avatar: null } });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany: jest.fn<any>().mockResolvedValue([
          {
            conversationId: CONV_DIRECT,
            user: {
              id: 'user-peer-2',
              username: 'peer2',
              displayName: null,
              avatar: null,
              phoneNumber: null,
              isOnline: false,
            },
          },
        ]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all' });
      expect(result.items[0].peer?.displayName).toBeNull();
    });

    it('does NOT query participants when no direct calls are returned', async () => {
      const row = makeRow({ conversation: { type: 'group', title: null, avatar: null } });
      const participantFindMany = jest.fn<any>().mockResolvedValue([]);
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany,
      });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'all' });
      expect(participantFindMany).not.toHaveBeenCalled();
    });
  });

  describe('cursor-based pagination', () => {
    it('returns hasMore=true when rows.length > limit', async () => {
      const rows = [makeRow({ id: 'call-1' }), makeRow({ id: 'call-2' })];
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue(rows),
        participantFindMany: jest.fn<any>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      // limit=1 → 2 rows means there IS a next page
      const result = await svc.listHistory(USER_ID, { limit: 1, filter: 'all' });
      expect(result.hasMore).toBe(true);
      expect(result.items).toHaveLength(1);
    });

    it('sets nextCursor to the last item id when hasMore=true', async () => {
      const rows = [makeRow({ id: 'call-1' }), makeRow({ id: 'call-2' })];
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue(rows),
        participantFindMany: jest.fn<any>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 1, filter: 'all' });
      expect(result.nextCursor).toBe('call-1');
    });

    it('does NOT set nextCursor when there is no next page', async () => {
      const rows = [makeRow({ id: 'call-1' })];
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue(rows),
        participantFindMany: jest.fn<any>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all' });
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
    });

    it('passes cursor to prisma query when cursor is provided', async () => {
      const callSessionFindMany = jest.fn<any>().mockResolvedValue([]);
      const prisma = makePrisma({ callSessionFindMany, participantFindMany: jest.fn<any>().mockResolvedValue([]) });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, cursor: 'call-cursor-id', filter: 'all' });
      const callToFindMany = callSessionFindMany.mock.calls[0][0];
      expect(callToFindMany.cursor).toEqual({ id: 'call-cursor-id' });
      expect(callToFindMany.skip).toBe(1);
    });
  });

  describe('missed call filter', () => {
    it('queries only missed calls and excludes current user as initiator when filter=missed', async () => {
      const callSessionFindMany = jest.fn<any>().mockResolvedValue([]);
      const prisma = makePrisma({ callSessionFindMany, participantFindMany: jest.fn<any>().mockResolvedValue([]) });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'missed' });
      const { where } = callSessionFindMany.mock.calls[0][0];
      expect(where.status).toBe(CallStatus.missed);
      expect(where.initiatorId).toEqual({ not: USER_ID });
    });

    it('does not apply missed filter when filter=all', async () => {
      const callSessionFindMany = jest.fn<any>().mockResolvedValue([]);
      const prisma = makePrisma({ callSessionFindMany, participantFindMany: jest.fn<any>().mockResolvedValue([]) });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'all' });
      const { where } = callSessionFindMany.mock.calls[0][0];
      expect(where.initiatorId).toBeUndefined();
    });
  });
});
