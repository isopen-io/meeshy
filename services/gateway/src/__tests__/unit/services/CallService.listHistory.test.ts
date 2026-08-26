/**
 * CallService.listHistory Unit Tests
 *
 * Tests cursor-based call history pagination, missed-call filtering,
 * peer resolution for direct conversations, and — directive produit
 * 2026-08-25 — the STRICT presence gate on `peer.isOnline`: co-membership of
 * the direct conversation is what makes a user the *peer*, never what makes
 * their presence *visible* to the caller.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// `resolveForTargets` is mocked (not the real singleton) so each test controls
// visibility directly and stays isolated from the module-level singleton that
// `getPresenceVisibilityService` caches across calls within this file.
const mockResolveForTargets = jest.fn<any>();
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (...args: any[]) => mockResolveForTargets(...args),
  }),
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
  callParticipantFindMany?: jest.MockedFunction<any>;
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
      findMany: overrides.callParticipantFindMany ?? jest.fn<any>().mockResolvedValue([]),
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
  beforeEach(() => {
    mockResolveForTargets.mockReset();
    mockResolveForTargets.mockResolvedValue(new Map());
  });

  describe('empty history', () => {
    it('returns empty items and hasMore=false when no calls exist', async () => {
      const prisma = makePrisma();
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
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
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
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
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(result.items[0].durationSec).toBe(90);
    });

    it('derives direction=outgoing when current user is initiator', async () => {
      const row = makeRow({ initiatorId: USER_ID });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany: jest.fn<any>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(result.items[0].direction).toBe('outgoing');
    });

    it('derives direction=incoming when call was answered by another initiator AND I personally joined it', async () => {
      const row = makeRow({
        id: 'call-1',
        initiatorId: 'other-user',
        answeredAt: new Date(),
      });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany: jest.fn<any>().mockResolvedValue([]),
        callParticipantFindMany: jest.fn<any>().mockResolvedValue([{ callSessionId: 'call-1' }]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(result.items[0].direction).toBe('incoming');
    });

    it('derives direction=missed when another user initiated and call was not answered', async () => {
      const row = makeRow({ initiatorId: 'other-user', answeredAt: null, status: 'missed' });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany: jest.fn<any>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(result.items[0].direction).toBe('missed');
    });

    it('derives direction=missed — never incoming — when the call was answered by others but I never personally joined it (group bystander)', async () => {
      // A P2P call in a group conversation is capped at 2 active participants.
      // A 3rd conversation member whose auto-early-join lost that race has no
      // CallParticipant row of their own, even though `answeredAt` is set
      // (the other two DID answer). The call never reached this member.
      const row = makeRow({
        id: 'call-1',
        conversationId: CONV_GROUP,
        conversation: { type: 'group', title: 'Squad', avatar: null },
        initiatorId: 'other-user',
        answeredAt: new Date(),
      });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany: jest.fn<any>().mockResolvedValue([]),
        callParticipantFindMany: jest.fn<any>().mockResolvedValue([]), // no row for USER_ID
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(result.items[0].direction).toBe('missed');
    });

    it('does NOT query callParticipant for calls the current user initiated', async () => {
      const row = makeRow({ id: 'call-1', initiatorId: USER_ID });
      const callParticipantFindMany = jest.fn<any>().mockResolvedValue([]);
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany: jest.fn<any>().mockResolvedValue([]),
        callParticipantFindMany,
      });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(callParticipantFindMany).not.toHaveBeenCalled();
    });

    it('scopes the callParticipant participation lookup to the current user and the returned call ids', async () => {
      const row = makeRow({ id: 'call-1', initiatorId: 'other-user', answeredAt: new Date() });
      const callParticipantFindMany = jest.fn<any>().mockResolvedValue([{ callSessionId: 'call-1' }]);
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany: jest.fn<any>().mockResolvedValue([]),
        callParticipantFindMany,
      });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(callParticipantFindMany).toHaveBeenCalledWith({
        where: { callSessionId: { in: ['call-1'] }, participant: { userId: USER_ID } },
        select: { callSessionId: true },
      });
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
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
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
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
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
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
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
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
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
      await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
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
      const result = await svc.listHistory(USER_ID, { limit: 1, filter: 'all', viewer: null });
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
      const result = await svc.listHistory(USER_ID, { limit: 1, filter: 'all', viewer: null });
      expect(result.nextCursor).toBe('call-1');
    });

    it('does NOT set nextCursor when there is no next page', async () => {
      const rows = [makeRow({ id: 'call-1' })];
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue(rows),
        participantFindMany: jest.fn<any>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
    });

    it('passes cursor to prisma query when cursor is provided', async () => {
      const callSessionFindMany = jest.fn<any>().mockResolvedValue([]);
      const prisma = makePrisma({ callSessionFindMany, participantFindMany: jest.fn<any>().mockResolvedValue([]) });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, cursor: 'call-cursor-id', filter: 'all', viewer: null });
      const callToFindMany = callSessionFindMany.mock.calls[0][0];
      expect(callToFindMany.cursor).toEqual({ id: 'call-cursor-id' });
      expect(callToFindMany.skip).toBe(1);
    });
  });

  describe('missed call filter', () => {
    it('excludes current user as initiator and keeps the base terminal-status window when filter=missed', async () => {
      const callSessionFindMany = jest.fn<any>().mockResolvedValue([]);
      const prisma = makePrisma({ callSessionFindMany, participantFindMany: jest.fn<any>().mockResolvedValue([]) });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'missed', viewer: null });
      const { where } = callSessionFindMany.mock.calls[0][0];
      // The base terminal-status window (ended/missed/rejected/failed) must
      // survive — the missed filter narrows further via `where.OR` below, it
      // must never collapse the query down to `status: missed` alone (that
      // would silently exclude the group-bystander case this filter exists
      // to catch — see the two OR-branch tests below).
      expect(where.status).toEqual({ in: [CallStatus.ended, CallStatus.missed, CallStatus.rejected, CallStatus.failed] });
      expect(where.initiatorId).toEqual({ not: USER_ID });
    });

    it('matches a call-wide missed status (nobody answered) via the OR clause', async () => {
      const callSessionFindMany = jest.fn<any>().mockResolvedValue([]);
      const prisma = makePrisma({ callSessionFindMany, participantFindMany: jest.fn<any>().mockResolvedValue([]) });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'missed', viewer: null });
      const { where } = callSessionFindMany.mock.calls[0][0];
      expect(where.OR).toContainEqual({ status: CallStatus.missed });
    });

    it('also matches a group call ANSWERED by others that the current user never personally joined (mirrors deriveCallDirection — Vague 105/136)', async () => {
      // A group call can reach `status: 'ended'` (not `missed`) when other
      // members answered and talked while this member's own CallParticipant
      // row never got created (declined, ignored, offline). `direction`
      // already reports 'missed' for this row under filter=all (Vague 105);
      // the missed-tab QUERY must select the same rows, or the filter is a
      // lie for every group call with 3+ members (the common case since the
      // 2-participant cap was lifted 2026-08-13).
      const callSessionFindMany = jest.fn<any>().mockResolvedValue([]);
      const prisma = makePrisma({ callSessionFindMany, participantFindMany: jest.fn<any>().mockResolvedValue([]) });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'missed', viewer: null });
      const { where } = callSessionFindMany.mock.calls[0][0];
      expect(where.OR).toContainEqual({
        answeredAt: { not: null },
        participants: { none: { participant: { userId: USER_ID } } },
      });
    });

    it('does not apply missed filter when filter=all', async () => {
      const callSessionFindMany = jest.fn<any>().mockResolvedValue([]);
      const prisma = makePrisma({ callSessionFindMany, participantFindMany: jest.fn<any>().mockResolvedValue([]) });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      const { where } = callSessionFindMany.mock.calls[0][0];
      expect(where.initiatorId).toBeUndefined();
      expect(where.OR).toBeUndefined();
    });
  });

  // Directive produit 2026-08-25 — TROU #3. Being the other member of a
  // direct conversation makes someone the *peer* in this journal; it must
  // never, on its own, make their presence *visible* to the caller.
  describe('peer presence gating (directive produit 2026-08-25)', () => {
    const NON_PRIVILEGED_VIEWER = { userId: USER_ID, role: 'USER' as const };
    const ADMIN_VIEWER = { userId: USER_ID, role: 'ADMIN' as const };

    const directRow = () =>
      makeRow({ conversationId: CONV_DIRECT, conversation: { type: 'direct', title: null, avatar: null } });

    it('USER non ami (co-membre de la conversation seul) ⇒ peer.isOnline masqué à false', async () => {
      mockResolveForTargets.mockResolvedValue(
        new Map([['user-peer-1', { showOnline: false, showLastSeenTimestamp: false }]])
      );
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([directRow()]),
        participantFindMany: jest.fn<any>().mockResolvedValue([makePeer()]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: NON_PRIVILEGED_VIEWER });
      expect(result.items[0].peer?.isOnline).toBe(false);
    });

    it('ADMIN non ami ⇒ peer.isOnline visible (entitlement inconditionnel de la directive)', async () => {
      mockResolveForTargets.mockResolvedValue(
        new Map([['user-peer-1', { showOnline: true, showLastSeenTimestamp: true }]])
      );
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([directRow()]),
        participantFindMany: jest.fn<any>().mockResolvedValue([makePeer()]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: ADMIN_VIEWER });
      expect(result.items[0].peer?.isOnline).toBe(true);
    });

    it('ami accepté ⇒ visible sous les préférences du pair', async () => {
      mockResolveForTargets.mockResolvedValue(
        new Map([['user-peer-1', { showOnline: true, showLastSeenTimestamp: true }]])
      );
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([directRow()]),
        participantFindMany: jest.fn<any>().mockResolvedValue([makePeer()]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: NON_PRIVILEGED_VIEWER });
      expect(result.items[0].peer?.isOnline).toBe(true);
    });

    // `resolveForTargets` rend une entrée par id demandé ; une entrée ABSENTE
    // est une anomalie, et une porte de confidentialité refuse par défaut
    // (`applyPresenceVisibilityAsOffline` sans `onMissingEntry`). Ce témoin
    // rougit si le site rouvrait le régime `'reveal'` du prefs-only retiré.
    it('carte sans entrée pour le pair ⇒ masqué (le défaut est « hide », jamais « reveal »)', async () => {
      mockResolveForTargets.mockResolvedValue(new Map());
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([directRow()]),
        participantFindMany: jest.fn<any>().mockResolvedValue([makePeer()]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: NON_PRIVILEGED_VIEWER });
      expect(result.items[0].peer?.isOnline).toBe(false);
      // La gate ne touche QUE la présence : l'identité du pair survit intacte.
      expect(result.items[0].peer).toMatchObject({ userId: 'user-peer-1', username: 'peer', displayName: 'Peer User' });
    });

    it('résout en UNE requête batchée, avec le viewer et le `userId` du pair', async () => {
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([directRow()]),
        participantFindMany: jest.fn<any>().mockResolvedValue([makePeer()]),
      });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: NON_PRIVILEGED_VIEWER });
      expect(mockResolveForTargets).toHaveBeenCalledTimes(1);
      expect(mockResolveForTargets).toHaveBeenCalledWith(NON_PRIVILEGED_VIEWER, ['user-peer-1']);
    });

    it("n'ouvre aucune résolution quand la page ne porte aucun appel direct (groupes seuls)", async () => {
      const row = makeRow({ conversationId: CONV_GROUP, conversation: { type: 'group', title: 'Squad', avatar: null } });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([row]),
        participantFindMany: jest.fn<any>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: NON_PRIVILEGED_VIEWER });
      expect(mockResolveForTargets).not.toHaveBeenCalled();
    });
  });
});
