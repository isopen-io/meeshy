/**
 * CallService.listHistory Unit Tests
 *
 * Tests cursor-based call history pagination, missed-call filtering,
 * peer resolution for direct conversations, and — directive produit
 * 2026-08-25 — the STRICT presence gate on `peer.isOnline`: co-membership of
 * the direct conversation is what makes a user the *peer*, never what makes
 * their presence *visible* to the caller.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn() },
}));

// `resolveForTargets` is mocked (not the real singleton) so each test controls
// visibility directly and stays isolated from the module-level singleton that
// `getPresenceVisibilityService` caches across calls within this file.
type PresenceDecision = { showOnline: boolean; showLastSeenTimestamp: boolean };
const mockResolveForTargets = jest.fn<(viewer: unknown, ids: readonly string[]) => Promise<Map<string, PresenceDecision>>>();
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (viewer: unknown, ids: readonly string[]) => mockResolveForTargets(viewer, ids),
  }),
}));

const mockWarn = jest.fn();

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
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { findManyIn, type MongoDocument } from '../../helpers/mongo-where';

type FindMany = (args?: unknown) => Promise<unknown>;
type CallSessionFindMany = (args: Prisma.CallSessionFindManyArgs) => Promise<unknown>;

const lastSessionQuery = (findMany: jest.Mock<CallSessionFindMany>): Prisma.CallSessionFindManyArgs => {
  const query = findMany.mock.calls.at(-1)?.[0];
  if (!query) throw new Error('callSession.findMany jamais appelé');
  return query;
};

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
  conversation: { type: string; title: string | null; avatar: string | null; participants: { id: string }[] };
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
    conversation: { type: 'direct', title: null, avatar: null, participants: [{ id: 'p-reader' }] },
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
  callSessionFindMany?: jest.Mock<CallSessionFindMany>;
  participantFindMany?: jest.Mock<FindMany>;
  callParticipantFindMany?: jest.Mock<FindMany>;
} = {}) {
  return {
    conversation: { findUnique: jest.fn<FindMany>(), findFirst: jest.fn<FindMany>() },
    participant: {
      findFirst: jest.fn<FindMany>(),
      findMany: overrides.participantFindMany ?? jest.fn<FindMany>().mockResolvedValue([]),
    },
    callSession: {
      create: jest.fn<FindMany>(),
      findUnique: jest.fn<FindMany>(),
      findFirst: jest.fn<FindMany>(),
      update: jest.fn<FindMany>(),
      updateMany: jest.fn<FindMany>(),
      findMany: overrides.callSessionFindMany ?? jest.fn<CallSessionFindMany>().mockResolvedValue([]),
    },
    callParticipant: {
      create: jest.fn<FindMany>(),
      findFirst: jest.fn<FindMany>(),
      findMany: overrides.callParticipantFindMany ?? jest.fn<FindMany>().mockResolvedValue([]),
      update: jest.fn<FindMany>(),
      updateMany: jest.fn<FindMany>(),
    },
    message: { create: jest.fn<FindMany>() },
    $transaction: jest.fn<FindMany>(),
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
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([row]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([makePeer()]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].callId).toBe('call-1');
    });

    it('maps duration from the persisted field', async () => {
      const row = makeRow({ duration: 90 });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([row]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(result.items[0].durationSec).toBe(90);
    });

    it('derives direction=outgoing when current user is initiator', async () => {
      const row = makeRow({ initiatorId: USER_ID });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([row]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([]),
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
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([row]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([]),
        // #18242 — une ligne DÉCROCHÉE : une ligne de sonnerie seule ne suffit plus.
        callParticipantFindMany: jest.fn<FindMany>().mockResolvedValue([{ callSessionId: 'call-1', role: 'participant', answeredAt: new Date(), participant: { userId: USER_ID } }]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(result.items[0].direction).toBe('incoming');
    });

    it('derives direction=missed when another user initiated and call was not answered', async () => {
      const row = makeRow({ initiatorId: 'other-user', answeredAt: null, status: 'missed' });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([row]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([]),
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
        conversation: { type: 'group', title: 'Squad', avatar: null, participants: [{ id: 'p-reader' }] },
        initiatorId: 'other-user',
        answeredAt: new Date(),
      });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([row]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([]),
        callParticipantFindMany: jest.fn<FindMany>().mockResolvedValue([]), // no row for USER_ID
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(result.items[0].direction).toBe('missed');
    });

    it('does NOT query callParticipant for calls the current user initiated', async () => {
      const row = makeRow({ id: 'call-1', initiatorId: USER_ID });
      const callParticipantFindMany = jest.fn<FindMany>().mockResolvedValue([]);
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([row]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([]),
        callParticipantFindMany,
      });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(callParticipantFindMany).not.toHaveBeenCalled();
    });

    it('scopes the callParticipant participation lookup to the returned call ids, with what tells who ANSWERED (#18242) and nothing else', async () => {
      const row = makeRow({ id: 'call-1', initiatorId: 'other-user', answeredAt: new Date() });
      const callParticipantFindMany = jest.fn<FindMany>().mockResolvedValue([{ callSessionId: 'call-1' }]);
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([row]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([]),
        callParticipantFindMany,
      });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(callParticipantFindMany).toHaveBeenCalledWith({
        where: { callSessionId: { in: ['call-1'] } },
        select: { callSessionId: true, role: true, answeredAt: true, participant: { select: { userId: true } } },
      });
    });
  });

  describe('peer resolution for direct conversations', () => {
    it('attaches peer data for direct conversation calls', async () => {
      const row = makeRow({ conversationId: CONV_DIRECT, conversation: { type: 'direct', title: null, avatar: null, participants: [{ id: 'p-reader' }] } });
      const peer = makePeer();
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([row]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([peer]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(result.items[0].peer).not.toBeNull();
      expect(result.items[0].peer?.userId).toBe('user-peer-1');
      expect(result.items[0].peer?.username).toBe('peer');
    });

    it('returns null peer for group conversation calls', async () => {
      const row = makeRow({ conversationId: CONV_GROUP, conversation: { type: 'group', title: 'Team', avatar: null, participants: [{ id: 'p-reader' }] } });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([row]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(result.items[0].peer).toBeNull();
    });

    it('skips participants with null user when resolving direct call peers', async () => {
      // m.user === null → the if-guard at line 1029 is false → peer stays null
      const row = makeRow({ conversationId: CONV_DIRECT, conversation: { type: 'direct', title: null, avatar: null, participants: [{ id: 'p-reader' }] } });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([row]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([
          { conversationId: CONV_DIRECT, user: null },
        ]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(result.items[0].peer).toBeNull();
    });

    it('maps null displayName to null in the peer object', async () => {
      // m.user.displayName is null → ?? null fires at line 1033
      const row = makeRow({ conversationId: CONV_DIRECT, conversation: { type: 'direct', title: null, avatar: null, participants: [{ id: 'p-reader' }] } });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([row]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([
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
      const row = makeRow({ conversation: { type: 'group', title: null, avatar: null, participants: [{ id: 'p-reader' }] } });
      const participantFindMany = jest.fn<FindMany>().mockResolvedValue([]);
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([row]),
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
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue(rows),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([]),
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
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue(rows),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 1, filter: 'all', viewer: null });
      expect(result.nextCursor).toBe('call-1');
    });

    it('does NOT set nextCursor when there is no next page', async () => {
      const rows = [makeRow({ id: 'call-1' })];
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue(rows),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
    });

    it('passes cursor to prisma query when cursor is provided', async () => {
      const callSessionFindMany = jest.fn<CallSessionFindMany>().mockResolvedValue([]);
      const prisma = makePrisma({ callSessionFindMany, participantFindMany: jest.fn<FindMany>().mockResolvedValue([]) });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, cursor: 'call-cursor-id', filter: 'all', viewer: null });
      const callToFindMany = lastSessionQuery(callSessionFindMany);
      expect(callToFindMany.cursor).toEqual({ id: 'call-cursor-id' });
      expect(callToFindMany.skip).toBe(1);
    });
  });

  describe('missed call filter', () => {
    it('excludes current user as initiator and keeps the base terminal-status window when filter=missed', async () => {
      const callSessionFindMany = jest.fn<CallSessionFindMany>().mockResolvedValue([]);
      const prisma = makePrisma({ callSessionFindMany, participantFindMany: jest.fn<FindMany>().mockResolvedValue([]) });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'missed', viewer: null });
      const { where } = lastSessionQuery(callSessionFindMany);
      // The base terminal-status window (ended/missed/rejected/failed) must
      // survive — the missed filter narrows further via `where.OR` below, it
      // must never collapse the query down to `status: missed` alone (that
      // would silently exclude the group-bystander case this filter exists
      // to catch — see the two OR-branch tests below).
      expect(where.status).toEqual({ in: [CallStatus.ended, CallStatus.missed, CallStatus.rejected, CallStatus.failed] });
      expect(where.initiatorId).toEqual({ not: USER_ID });
    });

    it('matches a call-wide missed status (nobody answered) via the OR clause', async () => {
      const callSessionFindMany = jest.fn<CallSessionFindMany>().mockResolvedValue([]);
      const prisma = makePrisma({ callSessionFindMany, participantFindMany: jest.fn<FindMany>().mockResolvedValue([]) });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'missed', viewer: null });
      const { where } = lastSessionQuery(callSessionFindMany);
      expect(where.OR).toContainEqual({ status: CallStatus.missed });
    });

    it('does not apply missed filter when filter=all', async () => {
      const callSessionFindMany = jest.fn<CallSessionFindMany>().mockResolvedValue([]);
      const prisma = makePrisma({ callSessionFindMany, participantFindMany: jest.fn<FindMany>().mockResolvedValue([]) });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: null });
      const { where } = lastSessionQuery(callSessionFindMany);
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
      makeRow({ conversationId: CONV_DIRECT, conversation: { type: 'direct', title: null, avatar: null, participants: [{ id: 'p-reader' }] } });

    it('USER non ami (co-membre de la conversation seul) ⇒ peer.isOnline masqué à false', async () => {
      mockResolveForTargets.mockResolvedValue(
        new Map([['user-peer-1', { showOnline: false, showLastSeenTimestamp: false }]])
      );
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([directRow()]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([makePeer()]),
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
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([directRow()]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([makePeer()]),
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
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([directRow()]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([makePeer()]),
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
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([directRow()]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([makePeer()]),
      });
      const svc = new CallService(prisma);
      const result = await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: NON_PRIVILEGED_VIEWER });
      expect(result.items[0].peer?.isOnline).toBe(false);
      // La gate ne touche QUE la présence : l'identité du pair survit intacte.
      expect(result.items[0].peer).toMatchObject({ userId: 'user-peer-1', username: 'peer', displayName: 'Peer User' });
    });

    it('résout en UNE requête batchée, avec le viewer et le `userId` du pair', async () => {
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([directRow()]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([makePeer()]),
      });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: NON_PRIVILEGED_VIEWER });
      expect(mockResolveForTargets).toHaveBeenCalledTimes(1);
      expect(mockResolveForTargets).toHaveBeenCalledWith(NON_PRIVILEGED_VIEWER, ['user-peer-1']);
    });

    it("n'ouvre aucune résolution quand la page ne porte aucun appel direct (groupes seuls)", async () => {
      const row = makeRow({ conversationId: CONV_GROUP, conversation: { type: 'group', title: 'Squad', avatar: null, participants: [{ id: 'p-reader' }] } });
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<CallSessionFindMany>().mockResolvedValue([row]),
        participantFindMany: jest.fn<FindMany>().mockResolvedValue([]),
      });
      const svc = new CallService(prisma);
      await svc.listHistory(USER_ID, { limit: 10, filter: 'all', viewer: NON_PRIVILEGED_VIEWER });
      expect(mockResolveForTargets).not.toHaveBeenCalled();
    });
  });

  // #18242 B-1 — le journal se lit contre des DOCUMENTS MongoDB : une ligne
  // écrite avant le champ (ou par un réplica ancien) n'a PAS la clé
  // `answeredAt`, une ligne du code qui marque la porte (`null` à la création).
  // Le `where` de l'onglet « manqués » est ÉVALUÉ contre ces documents, et la
  // direction se lit sur ce que la projection Prisma en rend.
  describe('le journal contre des documents MongoDB (#18242 B-1)', () => {
    const NOW = new Date('2026-11-21T12:00:00.000Z');
    const ANSWERED_AFTER_PROMOTION = new Date('2026-11-20T10:00:05.000Z');
    const OTHER = 'user-other';
    const THIRD = 'user-third';

    type LineSpec = { readonly userId: string; readonly role?: 'initiator' | 'participant'; readonly answeredAt?: Date | null };
    type CallSpec = {
      readonly id: string;
      readonly type: 'direct' | 'group';
      readonly initiatorId?: string;
      readonly status?: string;
      readonly answeredAt?: Date | null;
      readonly invitedUserIds?: readonly string[];
      readonly lines: readonly LineSpec[];
    };

    /** `answeredAt` absent de la spécification ⇒ clé ABSENTE du document. */
    const lineDoc = (callSessionId: string, spec: LineSpec, order: number): MongoDocument => ({
      callSessionId,
      role: spec.role ?? 'participant',
      joinedAt: new Date(ANSWERED_AFTER_PROMOTION.getTime() + order),
      ...('answeredAt' in spec ? { answeredAt: spec.answeredAt } : {}),
      participant: { id: `p-${spec.userId}`, userId: spec.userId, displayName: spec.userId, avatar: null },
    });

    const callDoc = (spec: CallSpec): MongoDocument => {
      const answeredAt = 'answeredAt' in spec ? spec.answeredAt : ANSWERED_AFTER_PROMOTION;
      return {
        id: spec.id,
        conversationId: `conv-${spec.id}`,
        mode: 'p2p',
        status: spec.status ?? 'ended',
        endReason: null,
        initiatorId: spec.initiatorId ?? OTHER,
        startedAt: new Date(ANSWERED_AFTER_PROMOTION.getTime() - 5_000),
        answeredAt,
        endedAt: new Date(ANSWERED_AFTER_PROMOTION.getTime() + 60_000),
        duration: 60,
        bytesSent: null,
        bytesReceived: null,
        metadata: { type: 'audio' },
        reactionCounts: null,
        invitedUserIds: spec.invitedUserIds ?? [],
        hiddenForUserIds: [],
        conversation: {
          type: spec.type,
          title: null,
          avatar: null,
          participants: [
            { id: 'p-reader', userId: USER_ID, isActive: true },
            { id: 'p-other', userId: OTHER, isActive: true },
          ],
        },
        participants: spec.lines.map((line, order) => lineDoc(spec.id, line, order)),
      };
    };

    const journalWorld = (calls: readonly CallSpec[]) => {
      const sessions = calls.map(callDoc);
      const lines = calls.flatMap((spec) => spec.lines.map((line, order) => lineDoc(spec.id, line, order)));
      const prisma = {
        callSession: { findMany: findManyIn(sessions).findMany },
        participant: { findMany: findManyIn([]).findMany },
        callParticipant: { findMany: findManyIn(lines).findMany },
      } as unknown as PrismaClient;
      return new CallService(prisma);
    };

    const read = async (calls: readonly CallSpec[], filter: 'all' | 'missed') => {
      const page = await journalWorld(calls).listHistory(USER_ID, { limit: 30, filter, viewer: null });
      return page.items;
    };

    const directionOf = async (call: CallSpec) => (await read([call], 'all')).find((item) => item.callId === call.id)?.direction;
    const missedTab = async (calls: readonly CallSpec[]) => (await read(calls, 'missed')).map((item) => item.callId);

    let restoreNow: () => void = () => undefined;
    beforeEach(() => {
      mockWarn.mockClear();
      const spy = jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
      restoreNow = () => spy.mockRestore();
    });
    afterEach(() => restoreNow());

    const duoWithoutKey: CallSpec = {
      id: 'call-duo',
      type: 'direct',
      lines: [{ userId: OTHER, role: 'initiator' }, { userId: USER_ID }],
    };

    it('B-1 — un DUO décroché après la promotion, lignes SANS la clé : le destinataire qui a parlé lit « entrant »', async () => {
      expect(await directionOf(duoWithoutKey)).toBe('incoming');
    });

    it('B-1 — le même duo n\'apparaît pas dans l\'onglet « manqués »', async () => {
      expect(await missedTab([duoWithoutKey])).toEqual([]);
    });

    it('B-1 — un DUO dont la marque du destinataire s\'est perdue (lignes du nouveau code, `answeredAt: null`) reste « entrant », hors des manqués', async () => {
      const duo: CallSpec = { ...duoWithoutKey, lines: [{ userId: OTHER, role: 'initiator', answeredAt: null }, { userId: USER_ID, answeredAt: null }] };
      expect(await directionOf(duo)).toBe('incoming');
      expect(await missedTab([duo])).toEqual([]);
    });

    it('un appel de groupe NON SUIVI (aucune ligne ne porte la clé) garde la règle d\'avant, quelle que soit sa date', async () => {
      const call: CallSpec = { id: 'call-old', type: 'group', lines: [{ userId: OTHER, role: 'initiator' }, { userId: USER_ID }, { userId: THIRD }] };
      expect(await directionOf(call)).toBe('incoming');
      expect(await missedTab([call])).toEqual([]);
    });

    it('un appel de groupe SUIVI : le lecteur qui a seulement SONNÉ lit « manqué » et figure dans l\'onglet', async () => {
      const call: CallSpec = {
        id: 'call-rang',
        type: 'group',
        lines: [{ userId: OTHER, role: 'initiator', answeredAt: ANSWERED_AFTER_PROMOTION }, { userId: USER_ID, answeredAt: null }, { userId: THIRD, answeredAt: ANSWERED_AFTER_PROMOTION }],
      };
      expect(await directionOf(call)).toBe('missed');
      expect(await missedTab([call])).toEqual(['call-rang']);
    });

    it('un appel de groupe SUIVI où le lecteur a décroché : « entrant », hors des manqués', async () => {
      const call: CallSpec = {
        id: 'call-took-part',
        type: 'group',
        lines: [{ userId: OTHER, role: 'initiator', answeredAt: null }, { userId: USER_ID, answeredAt: ANSWERED_AFTER_PROMOTION }],
      };
      expect(await directionOf(call)).toBe('incoming');
      expect(await missedTab([call])).toEqual([]);
    });

    it('un duo où un tiers a été INVITÉ n\'est plus un duo : la sonnerie du lecteur ne vaut pas participation', async () => {
      const call: CallSpec = {
        id: 'call-invited',
        type: 'direct',
        invitedUserIds: [THIRD],
        lines: [{ userId: OTHER, role: 'initiator', answeredAt: null }, { userId: USER_ID, answeredAt: null }, { userId: THIRD, answeredAt: ANSWERED_AFTER_PROMOTION }],
      };
      expect(await directionOf(call)).toBe('missed');
      expect(await missedTab([call])).toEqual(['call-invited']);
    });

    it('un appel décroché par d\'autres où le lecteur n\'a AUCUNE ligne figure dans l\'onglet, comme un appel au statut `missed`', async () => {
      const bystander: CallSpec = { id: 'call-bystander', type: 'group', lines: [{ userId: OTHER, role: 'initiator' }, { userId: THIRD }] };
      const missed: CallSpec = { id: 'call-missed', type: 'direct', status: 'missed', answeredAt: null, lines: [{ userId: OTHER, role: 'initiator' }] };
      const mine: CallSpec = { id: 'call-mine', type: 'group', initiatorId: USER_ID, lines: [{ userId: USER_ID, role: 'initiator' }] };
      expect((await missedTab([bystander, missed, mine])).sort()).toEqual(['call-bystander', 'call-missed']);
    });

    it('R5 — lire le journal ne journalise rien, même pour un appel suivi sans aucune marque (l\'alerte vit à l\'écriture du résumé)', async () => {
      const call: CallSpec = { id: 'call-unmarked', type: 'group', lines: [{ userId: OTHER, role: 'initiator', answeredAt: null }, { userId: USER_ID, answeredAt: null }] };
      await read([call], 'all');
      expect(mockWarn).not.toHaveBeenCalled();
    });
  });
});
