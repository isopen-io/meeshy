import { describe, it, expect } from '@jest/globals';
import { CALL_RECORDING_CONSENT_TIMEOUT_MS } from '@meeshy/shared/types/call-recording';
import {
  CallRecordingService,
  type CallRecordingRepository,
  type CallRecordingRow,
  type CallRoster,
} from '../callRecording';

const T0 = new Date('2026-09-27T10:00:00.000Z');

type World = {
  rows: CallRecordingRow[];
  roster: CallRoster | null;
  clock: Date;
};

const fakeRepository = (world: World): CallRecordingRepository => {
  const replace = (id: string, patch: Partial<CallRecordingRow>) => {
    world.rows = world.rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
  };
  const find = (id: string) => world.rows.find((row) => row.id === id) ?? null;
  return {
    create: async (input) => {
      const row: CallRecordingRow = {
        id: `rec-${world.rows.length + 1}`,
        callSessionId: input.callSessionId,
        requesterId: input.requesterId,
        requiredUserIds: [...input.requiredUserIds],
        consentedUserIds: [],
        requestedAt: input.requestedAt,
        kind: input.kind,
        startedAt: null,
        stoppedAt: null,
        stopReason: null,
        attachmentId: null,
      };
      world.rows = [...world.rows, row];
      return row;
    },
    findById: async (id) => find(id),
    findOpen: async (callSessionId) =>
      world.rows.find((row) => row.callSessionId === callSessionId && row.stoppedAt === null) ?? null,
    addConsent: async (id, userId) => {
      const row = find(id);
      if (!row || row.startedAt || row.stoppedAt || row.consentedUserIds.includes(userId)) return;
      replace(id, { consentedUserIds: [...row.consentedUserIds, userId] });
    },
    markStarted: async (id, at) => {
      const row = find(id);
      if (!row || row.startedAt || row.stoppedAt) return false;
      replace(id, { startedAt: at });
      return true;
    },
    markStopped: async (id, stop) => {
      const row = find(id);
      if (!row || row.stoppedAt) return false;
      replace(id, { stoppedAt: stop.at, stopReason: stop.reason });
      return true;
    },
  };
};

const makeWorld = (overrides: Partial<World> = {}): World => ({
  rows: [],
  roster: { status: 'active', conversationId: 'conv', activeUserIds: ['alice', 'bob', 'carol'] },
  clock: T0,
  ...overrides,
});

const serviceFor = (world: World) =>
  new CallRecordingService({
    repository: fakeRepository(world),
    roster: async () => world.roster,
    now: () => world.clock,
  });

const requestAsAlice = async (world: World) => {
  const outcome = await serviceFor(world).request('alice', { callId: 'call' });
  if (!outcome.ack.success) throw new Error(`request refused: ${outcome.ack.code}`);
  return outcome.ack.recordingId;
};

describe('CallRecordingService — l’enregistrement ne démarre qu’avec l’accord de tous (#8064)', () => {
  it('une demande fige les participants à consulter et la diffuse, sans démarrer', async () => {
    const world = makeWorld();
    const outcome = await serviceFor(world).request('alice', { callId: 'call' });

    expect(outcome.ack.success).toBe(true);
    expect(outcome.broadcasts.map((b) => b.event)).toEqual(['requested']);
    expect(outcome.broadcasts[0]?.payload).toMatchObject({
      callId: 'call',
      requesterId: 'alice',
      requiredUserIds: ['bob', 'carol'],
      expiresAt: new Date(T0.getTime() + CALL_RECORDING_CONSENT_TIMEOUT_MS).toISOString(),
    });
    expect(world.rows[0]?.startedAt).toBeNull();
  });

  it('refuse la demande d’un non-participant, d’un appel non décroché, ou sans pair à consulter', async () => {
    const outsider = await serviceFor(makeWorld()).request('mallory', { callId: 'call' });
    expect(outsider.ack).toEqual({ success: false, code: 'NOT_A_PARTICIPANT' });

    const ringing = makeWorld({ roster: { status: 'ringing', conversationId: 'conv', activeUserIds: ['alice', 'bob'] } });
    expect((await serviceFor(ringing).request('alice', { callId: 'call' })).ack).toEqual({ success: false, code: 'CALL_NOT_ACTIVE' });

    const alone = makeWorld({ roster: { status: 'active', conversationId: 'conv', activeUserIds: ['alice'] } });
    expect((await serviceFor(alone).request('alice', { callId: 'call' })).ack).toEqual({ success: false, code: 'NO_PEER_TO_CONSENT' });

    const gone = makeWorld({ roster: null });
    expect((await serviceFor(gone).request('alice', { callId: 'call' })).ack).toEqual({ success: false, code: 'NOT_A_PARTICIPANT' });
  });

  it('une seule demande ouverte par appel', async () => {
    const world = makeWorld();
    await requestAsAlice(world);
    const second = await serviceFor(world).request('bob', { callId: 'call' });
    expect(second.ack).toEqual({ success: false, code: 'RECORDING_ALREADY_PENDING' });
  });

  it('démarre au dernier accord, et une seule fois', async () => {
    const world = makeWorld();
    const recordingId = await requestAsAlice(world);

    const first = await serviceFor(world).consent('bob', { callId: 'call', recordingId, accepted: true });
    expect(first.broadcasts).toEqual([]);
    expect(world.rows[0]?.startedAt).toBeNull();

    const last = await serviceFor(world).consent('carol', { callId: 'call', recordingId, accepted: true });
    expect(last.broadcasts.map((b) => b.event)).toEqual(['started']);
    expect(last.broadcasts[0]?.payload).toMatchObject({ recordingId, recorderId: 'alice' });

    const replay = await serviceFor(world).consent('carol', { callId: 'call', recordingId, accepted: true });
    expect(replay.ack).toEqual({ success: false, code: 'RECORDING_NOT_PENDING' });
    expect(replay.broadcasts).toEqual([]);
  });

  it('un refus arrête la demande pour tout le monde', async () => {
    const world = makeWorld();
    const recordingId = await requestAsAlice(world);
    await serviceFor(world).consent('bob', { callId: 'call', recordingId, accepted: true });

    const refusal = await serviceFor(world).consent('carol', { callId: 'call', recordingId, accepted: false });
    expect(refusal.broadcasts).toEqual([
      { event: 'stopped', payload: { callId: 'call', recordingId, reason: 'refused', byUserId: 'carol', wasRecording: false } },
    ]);
    expect(world.rows[0]?.startedAt).toBeNull();
  });

  it('un accord hors délai est refusé et clôt la demande', async () => {
    const world = makeWorld();
    const recordingId = await requestAsAlice(world);
    world.clock = new Date(T0.getTime() + CALL_RECORDING_CONSENT_TIMEOUT_MS + 1);

    const late = await serviceFor(world).consent('bob', { callId: 'call', recordingId, accepted: true });
    expect(late.ack).toEqual({ success: false, code: 'RECORDING_EXPIRED' });
    expect(late.broadcasts[0]).toMatchObject({ event: 'stopped', payload: { reason: 'timeout' } });
  });

  it('le délai échu sans réponse arrête la demande', async () => {
    const world = makeWorld();
    const recordingId = await requestAsAlice(world);
    expect(await serviceFor(world).expire(recordingId)).toEqual([]);

    world.clock = new Date(T0.getTime() + CALL_RECORDING_CONSENT_TIMEOUT_MS);
    const expired = await serviceFor(world).expire(recordingId);
    expect(expired[0]).toMatchObject({ event: 'stopped', payload: { reason: 'timeout', wasRecording: false } });
  });

  it('refuse la réponse d’un tiers, du demandeur, ou sur une autre demande', async () => {
    const world = makeWorld();
    const recordingId = await requestAsAlice(world);

    expect((await serviceFor(world).consent('mallory', { callId: 'call', recordingId, accepted: true })).ack)
      .toEqual({ success: false, code: 'NOT_A_PARTICIPANT' });
    expect((await serviceFor(world).consent('alice', { callId: 'call', recordingId, accepted: true })).ack)
      .toEqual({ success: false, code: 'NOT_A_CONSENTER' });
    expect((await serviceFor(world).consent('bob', { callId: 'other', recordingId, accepted: true })).ack)
      .toEqual({ success: false, code: 'RECORDING_NOT_FOUND' });
  });

  it('un participant arrivé pendant la demande, sans consentir, empêche le démarrage', async () => {
    const world = makeWorld();
    const recordingId = await requestAsAlice(world);
    await serviceFor(world).consent('bob', { callId: 'call', recordingId, accepted: true });
    world.roster = { status: 'active', conversationId: 'conv', activeUserIds: ['alice', 'bob', 'carol', 'dave'] };

    const last = await serviceFor(world).consent('carol', { callId: 'call', recordingId, accepted: true });
    expect(last.broadcasts).toEqual([
      { event: 'stopped', payload: { callId: 'call', recordingId, reason: 'participant-joined', byUserId: null, wasRecording: false } },
    ]);
    expect(world.rows[0]?.startedAt).toBeNull();
  });

  it('une arrivée sans consentement arrête un enregistrement en cours', async () => {
    const world = makeWorld();
    const recordingId = await requestAsAlice(world);
    await serviceFor(world).consent('bob', { callId: 'call', recordingId, accepted: true });
    await serviceFor(world).consent('carol', { callId: 'call', recordingId, accepted: true });

    const rejoin = await serviceFor(world).arrival('call', 'bob');
    expect(rejoin).toEqual([]);

    const arrival = await serviceFor(world).arrival('call', 'dave');
    expect(arrival).toEqual([
      { event: 'stopped', payload: { callId: 'call', recordingId, reason: 'participant-joined', byUserId: null, wasRecording: true } },
    ]);
  });

  it('tout participant peut arrêter l’enregistrement ; un tiers non', async () => {
    const world = makeWorld();
    const recordingId = await requestAsAlice(world);
    await serviceFor(world).consent('bob', { callId: 'call', recordingId, accepted: true });
    await serviceFor(world).consent('carol', { callId: 'call', recordingId, accepted: true });

    expect((await serviceFor(world).stop('mallory', { callId: 'call', recordingId })).ack)
      .toEqual({ success: false, code: 'NOT_A_PARTICIPANT' });

    const stop = await serviceFor(world).stop('bob', { callId: 'call', recordingId });
    expect(stop.broadcasts).toEqual([
      { event: 'stopped', payload: { callId: 'call', recordingId, reason: 'stopped', byUserId: 'bob', wasRecording: true } },
    ]);
    expect((await serviceFor(world).stop('bob', { callId: 'call', recordingId })).broadcasts).toEqual([]);
  });

  it('le demandeur parti peut encore arrêter son propre enregistrement', async () => {
    const world = makeWorld();
    const recordingId = await requestAsAlice(world);
    world.roster = { status: 'ended', conversationId: 'conv', activeUserIds: [] };
    const stop = await serviceFor(world).stop('alice', { callId: 'call', recordingId });
    expect(stop.ack).toEqual({ success: true, recordingId });
  });

  it('une demande échue n’empêche pas d’en ouvrir une nouvelle', async () => {
    const world = makeWorld();
    await requestAsAlice(world);
    world.clock = new Date(T0.getTime() + CALL_RECORDING_CONSENT_TIMEOUT_MS + 5);
    const again = await serviceFor(world).request('bob', { callId: 'call' });
    expect(again.ack.success).toBe(true);
    expect(again.broadcasts.map((b) => b.event)).toEqual(['stopped', 'requested']);
  });
});

describe('CallRecordingService — le type d’enregistrement voyage avec la demande (#8437)', () => {
  it('une demande sans type est une demande audio, comme avant #8437', async () => {
    const world = makeWorld();
    const outcome = await serviceFor(world).request('alice', { callId: 'call' });

    expect(outcome.broadcasts[0]?.payload).toMatchObject({ kind: 'audio' });
    expect(world.rows[0]?.kind).toBe('audio');
  });

  it('une demande vidéo est annoncée vidéo à ceux qui consentent, stockée, puis démarrée vidéo', async () => {
    const world = makeWorld();
    const requested = await serviceFor(world).request('alice', { callId: 'call', kind: 'video' });
    if (!requested.ack.success) throw new Error('refused');
    const recordingId = requested.ack.recordingId;

    expect(requested.broadcasts[0]?.payload).toMatchObject({ kind: 'video', requiredUserIds: ['bob', 'carol'] });
    expect(world.rows[0]?.kind).toBe('video');

    await serviceFor(world).consent('bob', { callId: 'call', recordingId, accepted: true });
    const last = await serviceFor(world).consent('carol', { callId: 'call', recordingId, accepted: true });
    expect(last.broadcasts[0]?.payload).toMatchObject({ recordingId, kind: 'video' });
  });
});
