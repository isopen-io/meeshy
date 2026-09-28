import { describe, it, expect, jest } from '@jest/globals';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallRecordingAck } from '@meeshy/shared/types/call-recording';
import {
  announceRecordingArrival,
  registerCallRecordingEvents,
  type CallRecordingAuthority,
} from '../call-recording-events';
import type { RecordingBroadcast, RecordingOutcome } from '../../services/calls/callRecording';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const REC = '64b7f0c2a1b2c3d4e5f60719';

const started: RecordingBroadcast = {
  event: 'started',
  payload: { callId: CALL, recordingId: REC, recorderId: 'alice', startedAt: '2026-09-27T10:00:00.000Z', kind: 'audio' },
};

const harness = (overrides: { userId?: string; allowed?: boolean; outcome?: RecordingOutcome } = {}) => {
  const handlers = new Map<string, (raw: unknown, ack?: (r: CallRecordingAck) => void) => Promise<void>>();
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  const scheduled: Array<() => void> = [];
  const outcome: RecordingOutcome = overrides.outcome ?? { ack: { success: true, recordingId: REC }, broadcasts: [started] };
  const authority = {
    request: jest.fn(async (_userId: string, _input: unknown) => outcome),
    consent: jest.fn(async () => outcome),
    stop: jest.fn(async () => outcome),
    arrival: jest.fn(async (_callId: string, _userId: string) => [started]),
    expire: jest.fn(async (_recordingId: string) => []),
  };
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ room, event, payload });
        return true;
      },
    }),
  };
  const socket = {
    id: 'sock-1',
    on: (event: string, handler: (raw: unknown, ack?: (r: CallRecordingAck) => void) => Promise<void>) => {
      handlers.set(event, handler);
    },
  };
  registerCallRecordingEvents(
    {
      io: io as never,
      authority: authority as unknown as CallRecordingAuthority,
      rateLimiter: { checkLimit: async () => overrides.allowed ?? true },
      schedule: (task) => {
        scheduled.push(task);
      },
    },
    socket as never,
    () => ('userId' in overrides ? overrides.userId : 'alice'),
  );
  const send = async (event: string, raw: unknown) => {
    const acks: CallRecordingAck[] = [];
    await handlers.get(event)?.(raw, (r) => acks.push(r));
    return acks[0];
  };
  return { send, emitted, authority, scheduled, io };
};

describe('call-recording-events — la porte socket du consentement (#8064)', () => {
  it('inscrit les trois verbes du contrat', async () => {
    const h = harness();
    expect(await h.send(CLIENT_EVENTS.CALL_RECORDING_REQUEST, { callId: CALL })).toEqual({ success: true, recordingId: REC });
    expect(await h.send(CLIENT_EVENTS.CALL_RECORDING_CONSENT, { callId: CALL, recordingId: REC, accepted: true })).toEqual({ success: true, recordingId: REC });
    expect(await h.send(CLIENT_EVENTS.CALL_RECORDING_STOP, { callId: CALL, recordingId: REC })).toEqual({ success: true, recordingId: REC });
  });

  it('diffuse les effets dans la room de l’appel', async () => {
    const h = harness();
    await h.send(CLIENT_EVENTS.CALL_RECORDING_CONSENT, { callId: CALL, recordingId: REC, accepted: true });
    expect(h.emitted).toEqual([{ room: `call:${CALL}`, event: SERVER_EVENTS.CALL_RECORDING_STARTED, payload: started.payload }]);
  });

  it('un socket non authentifié, trop fréquent ou une charge invalide n’atteint jamais l’autorité', async () => {
    const anonymous = harness({ userId: undefined });
    expect(await anonymous.send(CLIENT_EVENTS.CALL_RECORDING_REQUEST, { callId: CALL })).toEqual({ success: false, code: 'NOT_AUTHENTICATED' });

    const flooding = harness({ allowed: false });
    expect(await flooding.send(CLIENT_EVENTS.CALL_RECORDING_REQUEST, { callId: CALL })).toEqual({ success: false, code: 'RATE_LIMITED' });

    const invalid = harness();
    expect(await invalid.send(CLIENT_EVENTS.CALL_RECORDING_CONSENT, { callId: CALL, recordingId: REC, accepted: 'yes' })).toEqual({ success: false, code: 'VALIDATION_ERROR' });
    expect(await invalid.send(CLIENT_EVENTS.CALL_RECORDING_REQUEST, { callId: 'nope' })).toEqual({ success: false, code: 'VALIDATION_ERROR' });
    expect(await invalid.send(CLIENT_EVENTS.CALL_RECORDING_REQUEST, { callId: CALL, requiredUserIds: [] })).toEqual({ success: false, code: 'VALIDATION_ERROR' });

    [anonymous, flooding, invalid].forEach((h) => {
      expect(h.authority.request).not.toHaveBeenCalled();
      expect(h.authority.consent).not.toHaveBeenCalled();
      expect(h.emitted).toEqual([]);
    });
  });

  it('une demande acceptée arme l’expiration du délai de consentement', async () => {
    const h = harness();
    await h.send(CLIENT_EVENTS.CALL_RECORDING_REQUEST, { callId: CALL });
    expect(h.scheduled).toHaveLength(1);
    h.scheduled[0]?.();
    await Promise.resolve();
    expect(h.authority.expire).toHaveBeenCalledWith(REC);
  });

  it('une demande refusée n’arme rien', async () => {
    const h = harness({ outcome: { ack: { success: false, code: 'NOT_A_PARTICIPANT' }, broadcasts: [] } });
    expect(await h.send(CLIENT_EVENTS.CALL_RECORDING_REQUEST, { callId: CALL })).toEqual({ success: false, code: 'NOT_A_PARTICIPANT' });
    expect(h.scheduled).toEqual([]);
  });

  it('l’arrivée d’un participant diffuse l’arrêt que l’autorité décide', async () => {
    const h = harness();
    await announceRecordingArrival({ io: h.io as never, authority: h.authority as unknown as CallRecordingAuthority }, CALL, 'dave');
    expect(h.authority.arrival).toHaveBeenCalledWith(CALL, 'dave');
    expect(h.emitted.map((e) => e.event)).toEqual([SERVER_EVENTS.CALL_RECORDING_STARTED]);
  });
});

describe('call-recording-events — le type demandé passe la porte (#8437)', () => {
  it('relaie « video » à l’autorité et refuse un type inconnu', async () => {
    const h = harness();
    expect(await h.send(CLIENT_EVENTS.CALL_RECORDING_REQUEST, { callId: CALL, kind: 'video' })).toEqual({ success: true, recordingId: REC });
    expect(h.authority.request).toHaveBeenCalledWith('alice', { callId: CALL, kind: 'video' });

    expect(await h.send(CLIENT_EVENTS.CALL_RECORDING_REQUEST, { callId: CALL, kind: 'hologram' }))
      .toEqual({ success: false, code: 'VALIDATION_ERROR' });
  });
});
