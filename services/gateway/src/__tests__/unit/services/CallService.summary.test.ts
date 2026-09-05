/**
 * CallService.createCallSummaryMessage — Phase P3 unit tests.
 *
 * Verifies the gateway posts exactly one call-summary system message per
 * terminated call, attributes it to the initiator's participant, and stays a
 * no-op for non-terminal / housekeeping / duplicate cases. The pure label
 * mapping is tested separately in packages/shared (call-summary.test.ts); here
 * we cover the persistence + idempotency wiring with a mocked Prisma client.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('@meeshy/shared/types/video-call', () => ({
  CALL_ERROR_CODES: { CALL_NOT_FOUND: 'CALL_NOT_FOUND', NOT_A_PARTICIPANT: 'NOT_A_PARTICIPANT' }
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../../services/TURNCredentialService', () => ({
  TURNCredentialService: jest.fn().mockImplementation(() => ({}))
}));

import { CallService } from '../../../services/CallService';
import { Prisma } from '@meeshy/shared/prisma/client';
import { findFirstHonouringWhere } from '../../helpers/find-first-honouring-where';

type MockFn = jest.Mock<any>;

const createMockPrisma = () => ({
  // `updateMany` resolves by default so persistCallStats' `.updateMany(...).catch(...)`
  // chains on a real Promise (the impl writes best-effort and swallows errors).
  // Defaults to `{ count: 1 }` (lock won / snapshot still fresh) so pre-existing
  // tests that don't exercise the race path are unaffected.
  callSession: {
    findUnique: jest.fn() as MockFn,
    updateMany: (jest.fn() as MockFn).mockResolvedValue({ count: 1 })
  },
  participant: { findFirst: jest.fn() as MockFn },
  message: {
    create: jest.fn() as MockFn,
    // Upsert lookup — defaults to "no existing message" (create branch).
    findFirst: (jest.fn() as MockFn).mockResolvedValue(null),
    update: jest.fn() as MockFn
  }
});

const CALL_ID = '6650000000000000000000aa';
const CONVERSATION_ID = '6650000000000000000000bb';
const INITIATOR_USER_ID = '6650000000000000000000cc';
const INITIATOR_PARTICIPANT_ID = '6650000000000000000000dd';
const OTHER_PARTY_USER_ID = '6650000000000000000000ee';
const OTHER_PARTY_PARTICIPANT_ID = '6650000000000000000000ff';

/**
 * Le résumé d'appel attribue `senderId` par
 * `where: { userId: call.initiatorId, conversationId: call.conversationId }`
 * (`CallService.ts`) — la SEULE ligne de tête, sans `include`/relation. Un
 * `mockResolvedValue({ id: INITIATOR_PARTICIPANT_ID })` inconditionnel rend
 * la même ligne quel que soit le `where` demandé : retirer `userId` du filtre
 * de production laisserait les 12 témoins de ce fichier verts (#5191).
 *
 * L'INTRUS — l'autre partie de l'appel, un participant RÉEL de la même
 * conversation — est semé EN PREMIER : si `userId` disparaît du `where`,
 * `findFirstHonouringWhere` rend cette ligne-là, et le résumé s'attribuerait
 * au mauvais participant plutôt qu'à l'initiateur.
 */
function seedInitiatorParticipant(prisma: ReturnType<typeof createMockPrisma>): void {
  prisma.participant.findFirst.mockImplementation(
    findFirstHonouringWhere([
      { id: OTHER_PARTY_PARTICIPANT_ID, userId: OTHER_PARTY_USER_ID, conversationId: CONVERSATION_ID },
      { id: INITIATOR_PARTICIPANT_ID, userId: INITIATOR_USER_ID, conversationId: CONVERSATION_ID }
    ])
  );
}

const makeSession = (overrides: Record<string, unknown> = {}) => ({
  id: CALL_ID,
  conversationId: CONVERSATION_ID,
  initiatorId: INITIATOR_USER_ID,
  status: 'ended',
  endReason: 'completed',
  duration: 272,
  metadata: { type: 'audio' },
  ...overrides
});

const makeSUT = () => {
  const prisma = createMockPrisma();
  const sut = new CallService(prisma as never);
  return { sut, prisma };
};

describe('CallService.createCallSummaryMessage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('posts a completed-audio summary attributed to the initiator participant', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession());
    seedInitiatorParticipant(prisma);
    prisma.message.create.mockResolvedValue({ id: 'm1', conversationId: CONVERSATION_ID });

    const result = await sut.createCallSummaryMessage(CALL_ID);

    expect(result).toEqual({ kind: 'created', message: { id: 'm1', conversationId: CONVERSATION_ID } });
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    const arg = prisma.message.create.mock.calls[0][0] as any;
    expect(arg.data).toMatchObject({
      conversationId: CONVERSATION_ID,
      senderId: INITIATOR_PARTICIPANT_ID,
      content: 'Appel audio · 04:32',
      messageType: 'system',
      messageSource: 'system',
      clientMessageId: `call-summary:${CALL_ID}`
    });
  });

  it('persists structured call metadata (direction, data, quality) on the message', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(
      makeSession({ metadata: { type: 'video' }, duration: 272, bytesSent: 1_000_000, bytesReceived: 1_400_000, networkQuality: 'good' })
    );
    seedInitiatorParticipant(prisma);
    prisma.message.create.mockResolvedValue({ id: 'm1', conversationId: CONVERSATION_ID });

    await sut.createCallSummaryMessage(CALL_ID);

    const arg = prisma.message.create.mock.calls[0][0] as any;
    expect(arg.data.metadata).toEqual({
      kind: 'call',
      callId: CALL_ID,
      initiatorId: INITIATOR_USER_ID,
      callType: 'video',
      outcome: 'completed',
      durationSeconds: 272,
      bytesTotal: 2_400_000,
      bytesEstimated: false,
      networkQuality: 'good'
    });
  });

  it('labels a completed video call from metadata.type', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession({ metadata: { type: 'video' }, duration: 65 }));
    seedInitiatorParticipant(prisma);
    prisma.message.create.mockResolvedValue({ id: 'm2' });

    await sut.createCallSummaryMessage(CALL_ID);

    expect((prisma.message.create.mock.calls[0][0] as any).data.content).toBe('Appel vidéo · 01:05');
  });

  it('labels a rejected call "Appel refusé"', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(
      makeSession({ status: 'rejected', endReason: 'rejected', duration: 0, metadata: { type: 'video' } })
    );
    seedInitiatorParticipant(prisma);
    prisma.message.create.mockResolvedValue({ id: 'm3' });

    await sut.createCallSummaryMessage(CALL_ID);

    expect((prisma.message.create.mock.calls[0][0] as any).data.content).toBe('Appel refusé');
  });

  it('returns null and creates nothing for a non-terminal call', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession({ status: 'active', endReason: null }));

    const result = await sut.createCallSummaryMessage(CALL_ID);

    expect(result).toBeNull();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('returns null for a garbage-collected phantom session', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession({ endReason: 'garbageCollected' }));

    const result = await sut.createCallSummaryMessage(CALL_ID);

    expect(result).toBeNull();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('returns null when the call does not exist', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(null);

    expect(await sut.createCallSummaryMessage(CALL_ID)).toBeNull();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('returns null when the initiator has no participant row', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession());
    prisma.participant.findFirst.mockResolvedValue(null);

    expect(await sut.createCallSummaryMessage(CALL_ID)).toBeNull();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('is idempotent: swallows the P2002 duplicate from a concurrent terminal path', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession());
    seedInitiatorParticipant(prisma);
    prisma.message.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test'
      })
    );

    const result = await sut.createCallSummaryMessage(CALL_ID);

    expect(result).toBeNull();
  });

  it('rethrows non-P2002 prisma errors', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession());
    seedInitiatorParticipant(prisma);
    prisma.message.create.mockRejectedValue(new Error('db down'));

    await expect(sut.createCallSummaryMessage(CALL_ID)).rejects.toThrow('db down');
  });

  /**
   * #5191 — la garde PLATE : `where: { userId: call.initiatorId, conversationId }`
   * EST l'attribution. Un intrus (l'autre partie de l'appel, `seedInitiatorParticipant`)
   * est semé avant l'initiateur : si le filtre `userId` disparaissait de la
   * production, ce témoin attribuerait le résumé au mauvais participant.
   */
  it('attribue le résumé au participant dont le `userId` est celui de l’initiateur, jamais au premier trouvé', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession());
    seedInitiatorParticipant(prisma);
    prisma.message.create.mockResolvedValue({ id: 'm1', conversationId: CONVERSATION_ID });

    await sut.createCallSummaryMessage(CALL_ID);

    const arg = prisma.message.create.mock.calls[0][0] as any;
    expect(arg.data.senderId).toBe(INITIATOR_PARTICIPANT_ID);
    expect(arg.data.senderId).not.toBe(OTHER_PARTY_PARTICIPANT_ID);
  });

  /**
   * Jumeau du témoin de `CallService.liveMessage.test.ts` : le résumé d'appel
   * est un message comme un autre pour l'aperçu de conversation, le compte de
   * non-lus et le delta `/sync`, tous gardés par `deletedAt: null`
   * (présent-et-null — une colonne absente ne l'apparie pas sur MongoDB).
   * Un « Appel manqué » sans la colonne ne ferait jamais monter le badge.
   */
  it('marks the call summary message as live so the deletedAt:null readers match it', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession());
    seedInitiatorParticipant(prisma);
    prisma.message.create.mockResolvedValue({ id: 'm1', conversationId: CONVERSATION_ID });

    await sut.createCallSummaryMessage(CALL_ID);

    const { data } = prisma.message.create.mock.calls[0][0] as any;
    expect(Object.prototype.hasOwnProperty.call(data, 'deletedAt')).toBe(true);
    expect(data.deletedAt).toBeNull();
  });
});

describe('CallService.createCallSummaryMessage — upsert du message vivant', () => {
  beforeEach(() => jest.clearAllMocks());

  const LIVE_MESSAGE = {
    id: 'm-live',
    metadata: {
      kind: 'call-live',
      callId: CALL_ID,
      initiatorId: INITIATOR_USER_ID,
      callType: 'audio',
      outcome: 'completed',
      durationSeconds: 0,
      bytesTotal: null,
      bytesEstimated: false,
      networkQuality: null
    }
  };

  it('édite in-place le message vivant vers le terminal ({kind:updated})', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession());
    prisma.message.findFirst.mockResolvedValue(LIVE_MESSAGE);
    prisma.message.update.mockResolvedValue({ id: 'm-live', conversationId: CONVERSATION_ID });

    const result = await sut.createCallSummaryMessage(CALL_ID);

    expect(result).toEqual({ kind: 'updated', message: { id: 'm-live', conversationId: CONVERSATION_ID } });
    expect(prisma.message.create).not.toHaveBeenCalled();
    const arg = prisma.message.update.mock.calls[0][0] as any;
    expect(arg.where).toEqual({ id: 'm-live' });
    expect(arg.data.content).toBe('Appel audio · 04:32');
    expect(arg.data.metadata).toMatchObject({ kind: 'call', outcome: 'completed', callId: CALL_ID });
  });

  it('cherche le message existant par findFirst(conversationId, clientMessageId)', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession());
    prisma.message.findFirst.mockResolvedValue(LIVE_MESSAGE);
    prisma.message.update.mockResolvedValue({ id: 'm-live' });

    await sut.createCallSummaryMessage(CALL_ID);

    expect(prisma.message.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { conversationId: CONVERSATION_ID, clientMessageId: `call-summary:${CALL_ID}` }
    }));
  });

  it('no-op (null) quand le message stocké est déjà terminal — idempotence des 7 chemins', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession());
    prisma.message.findFirst.mockResolvedValue({
      id: 'm-final',
      metadata: { ...LIVE_MESSAGE.metadata, kind: 'call', outcome: 'completed', durationSeconds: 272 }
    });

    const result = await sut.createCallSummaryMessage(CALL_ID);

    expect(result).toBeNull();
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('anti-freeze : P2002 au create → re-findFirst → update du live fraîchement commité', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession());
    seedInitiatorParticipant(prisma);
    // 1er lookup : rien ; le create live commite pendant la course ; 2e lookup : le live.
    prisma.message.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(LIVE_MESSAGE);
    prisma.message.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test'
      })
    );
    prisma.message.update.mockResolvedValue({ id: 'm-live', conversationId: CONVERSATION_ID });

    const result = await sut.createCallSummaryMessage(CALL_ID);

    expect(result).toEqual({ kind: 'updated', message: { id: 'm-live', conversationId: CONVERSATION_ID } });
    expect((prisma.message.update.mock.calls[0][0] as any).data.content).toBe('Appel audio · 04:32');
  });

  it('P2002 au create puis re-lookup terminal → null (l\'autre terminal a gagné)', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession());
    seedInitiatorParticipant(prisma);
    prisma.message.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'm-final', metadata: { ...LIVE_MESSAGE.metadata, kind: 'call' } });
    prisma.message.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test'
      })
    );

    const result = await sut.createCallSummaryMessage(CALL_ID);

    expect(result).toBeNull();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('GC : convertit un message vivant existant en failed (« Appel … interrompu »)', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(
      makeSession({ endReason: 'garbageCollected', metadata: { type: 'video' } })
    );
    prisma.message.findFirst.mockResolvedValue({
      id: 'm-live',
      metadata: { ...LIVE_MESSAGE.metadata, callType: 'video' }
    });
    prisma.message.update.mockResolvedValue({ id: 'm-live', conversationId: CONVERSATION_ID });

    const result = await sut.createCallSummaryMessage(CALL_ID);

    expect(result).toEqual({ kind: 'updated', message: { id: 'm-live', conversationId: CONVERSATION_ID } });
    const arg = prisma.message.update.mock.calls[0][0] as any;
    expect(arg.data.content).toBe('Appel vidéo interrompu');
    expect(arg.data.metadata).toMatchObject({ kind: 'call', outcome: 'failed' });
  });

  it('GC : reste silencieux sans message existant (comportement actuel)', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession({ endReason: 'garbageCollected' }));
    prisma.message.findFirst.mockResolvedValue(null);

    const result = await sut.createCallSummaryMessage(CALL_ID);

    expect(result).toBeNull();
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('GC : reste silencieux quand le message stocké est déjà terminal', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession({ endReason: 'garbageCollected' }));
    prisma.message.findFirst.mockResolvedValue({
      id: 'm-final',
      metadata: { ...LIVE_MESSAGE.metadata, kind: 'call', outcome: 'missed' }
    });

    const result = await sut.createCallSummaryMessage(CALL_ID);

    expect(result).toBeNull();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('émet endedByInitiator quand l\'appel manqué non répondu a été terminé par son initiateur', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession({
      status: 'missed',
      endReason: 'missed',
      duration: 0,
      answeredAt: null,
      metadata: { type: 'audio', endedBy: INITIATOR_USER_ID }
    }));
    seedInitiatorParticipant(prisma);
    prisma.message.create.mockResolvedValue({ id: 'm1' });

    await sut.createCallSummaryMessage(CALL_ID);

    const arg = prisma.message.create.mock.calls[0][0] as any;
    expect(arg.data.metadata).toMatchObject({ kind: 'call', outcome: 'missed', endedByInitiator: true });
  });

  it('omet endedByInitiator quand quelqu\'un d\'autre a terminé l\'appel manqué', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession({
      status: 'missed',
      endReason: 'missed',
      duration: 0,
      answeredAt: null,
      metadata: { type: 'audio', endedBy: 'someone-else' }
    }));
    seedInitiatorParticipant(prisma);
    prisma.message.create.mockResolvedValue({ id: 'm1' });

    await sut.createCallSummaryMessage(CALL_ID);

    const arg = prisma.message.create.mock.calls[0][0] as any;
    expect(arg.data.metadata.outcome).toBe('missed');
    expect('endedByInitiator' in arg.data.metadata).toBe(false);
  });

  it('omet endedByInitiator une fois l\'appel répondu, même terminé par l\'initiateur', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession({
      status: 'missed',
      endReason: 'missed',
      duration: 0,
      answeredAt: new Date('2026-07-11T10:00:00Z'),
      metadata: { type: 'audio', endedBy: INITIATOR_USER_ID }
    }));
    seedInitiatorParticipant(prisma);
    prisma.message.create.mockResolvedValue({ id: 'm1' });

    await sut.createCallSummaryMessage(CALL_ID);

    const arg = prisma.message.create.mock.calls[0][0] as any;
    expect('endedByInitiator' in arg.data.metadata).toBe(false);
  });
});

describe('CallService.persistCallStats', () => {
  beforeEach(() => jest.clearAllMocks());

  const lastUpdateData = (prisma: ReturnType<typeof createMockPrisma>) =>
    (prisma.callSession.updateMany.mock.calls[0]?.[0] as any)?.data;

  it('stores the (sent, received) pair as a coherent unit, not per-field max', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue({ bytesSent: 0, bytesReceived: 0 });

    await sut.persistCallStats(CALL_ID, { bytesSent: 500_000, bytesReceived: 1_500_000, level: 'good' });

    expect(lastUpdateData(prisma)).toEqual({
      bytesSent: 500_000,
      bytesReceived: 1_500_000,
      networkQuality: 'good'
    });
  });

  it('keeps the pair with the larger TOTAL (avoids cross-participant over-count)', async () => {
    const { sut, prisma } = makeSUT();
    // Stored pair total = 2.0M. An asymmetric peer reports sent=1.8M+recv=0.1M
    // (total 1.9M < 2.0M) → must NOT overwrite, or data would mix endpoints.
    prisma.callSession.findUnique.mockResolvedValue({ bytesSent: 1_000_000, bytesReceived: 1_000_000 });

    await sut.persistCallStats(CALL_ID, { bytesSent: 1_800_000, bytesReceived: 100_000 });

    expect(prisma.callSession.updateMany).not.toHaveBeenCalled();
  });

  it('overwrites when the new report total is larger', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue({ bytesSent: 1_000_000, bytesReceived: 1_000_000 });

    await sut.persistCallStats(CALL_ID, { bytesSent: 1_500_000, bytesReceived: 1_500_000 });

    expect(lastUpdateData(prisma)).toMatchObject({ bytesSent: 1_500_000, bytesReceived: 1_500_000 });
  });

  it('updates only the quality tier when no byte counters are present', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue({ bytesSent: null, bytesReceived: null });

    await sut.persistCallStats(CALL_ID, { level: 'poor' });

    expect(lastUpdateData(prisma)).toEqual({ networkQuality: 'poor' });
  });

  it('is a no-op when the call no longer exists', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(null);

    await sut.persistCallStats(CALL_ID, { bytesSent: 1, bytesReceived: 1, level: 'good' });

    expect(prisma.callSession.updateMany).not.toHaveBeenCalled();
  });

  it('ignores an unknown quality tier', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue({ bytesSent: 0, bytesReceived: 0 });

    await sut.persistCallStats(CALL_ID, { level: 'amazing' });

    expect(prisma.callSession.updateMany).not.toHaveBeenCalled();
  });

  it('scopes the write to the read (bytesSent, bytesReceived) snapshot to guard against a concurrent write', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue({ bytesSent: 100, bytesReceived: 200 });

    await sut.persistCallStats(CALL_ID, { bytesSent: 900, bytesReceived: 900 });

    expect(prisma.callSession.updateMany).toHaveBeenCalledWith({
      where: { id: CALL_ID, bytesSent: 100, bytesReceived: 200 },
      data: { bytesSent: 900, bytesReceived: 900 }
    });
  });

  it('drops the report without throwing when the snapshot is stale (concurrent write already advanced the row)', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue({ bytesSent: 0, bytesReceived: 0 });
    prisma.callSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(sut.persistCallStats(CALL_ID, { bytesSent: 500, bytesReceived: 600 })).resolves.toBeUndefined();
  });

});
