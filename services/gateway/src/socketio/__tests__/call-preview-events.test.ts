import { describe, it, expect } from '@jest/globals';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallControlAck } from '@meeshy/shared/types/call-controls';
import { registerCallPreviewEvents, type PreviewCall } from '../call-preview-events';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const SDP = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n';

const ringing = (overrides: Partial<PreviewCall> = {}): PreviewCall => ({
  status: 'ringing',
  initiatorId: 'alice',
  conversationId: 'conv-1',
  conversationType: 'direct',
  joinedUserIds: ['alice'],
  ...overrides,
});

type Emission = { room: string; event: string; payload: unknown };

const harness = (overrides: { userId?: string; call?: PreviewCall | null; members?: readonly string[] } = {}) => {
  const handlers = new Map<string, (raw: unknown, ack?: (r: CallControlAck) => void) => Promise<void>>();
  const emitted: Emission[] = [];
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => (emitted.push({ room, event, payload }), true) }) };
  const members = overrides.members ?? ['alice', 'bob'];
  const socket = {
    id: 'sock-1',
    on: (event: string, handler: (raw: unknown, ack?: (r: CallControlAck) => void) => Promise<void>) => {
      handlers.set(event, handler);
    },
  };
  registerCallPreviewEvents(
    {
      io: io as never,
      rateLimiter: { checkLimit: async () => true },
      loadCall: async () => ('call' in overrides ? overrides.call ?? null : ringing()),
      isMember: async (_conversationId, userId) => members.includes(userId),
    },
    socket as never,
    () => overrides.userId ?? 'bob'
  );
  const send = async (event: string, raw: unknown) => {
    const acks: CallControlAck[] = [];
    await handlers.get(event)?.(raw, (r) => acks.push(r));
    return acks[0];
  };
  return {
    emitted,
    request: (raw: unknown) => send(CLIENT_EVENTS.CALL_PREVIEW_REQUEST, raw),
    signal: (raw: unknown) => send(CLIENT_EVENTS.CALL_PREVIEW_SIGNAL, raw),
  };
};

const offer = (from: string, to: string) => ({ callId: CALL, signal: { type: 'offer', from, to, sdp: SDP } });

describe('call:preview-request — l’appelé demande à voir qui l’appelle (#8480)', () => {
  it('l’appelé d’un appel 1:1 qui sonne prévient l’initiateur, et lui seul', async () => {
    const h = harness();
    expect(await h.request({ callId: CALL })).toEqual({ success: true });
    expect(h.emitted).toEqual([
      { room: 'user:alice', event: SERVER_EVENTS.CALL_PREVIEW_REQUESTED, payload: { callId: CALL, userId: 'bob' } },
    ]);
  });

  it('un appel décroché ou terminé n’a plus d’aperçu', async () => {
    for (const status of ['active', 'ended', 'missed', 'rejected']) {
      const h = harness({ call: ringing({ status }) });
      expect(await h.request({ callId: CALL })).toEqual({ success: false, code: 'CALL_NOT_ACTIVE' });
      expect(h.emitted).toEqual([]);
    }
  });

  it('un appel de groupe n’a pas d’aperçu', async () => {
    const h = harness({ call: ringing({ conversationType: 'group' }) });
    expect(await h.request({ callId: CALL })).toEqual({ success: false, code: 'PERMISSION_DENIED' });
    expect(h.emitted).toEqual([]);
  });

  it('un non-membre de la conversation ne voit rien', async () => {
    const h = harness({ userId: 'eve' });
    expect(await h.request({ callId: CALL })).toEqual({ success: false, code: 'NOT_A_PARTICIPANT' });
    expect(h.emitted).toEqual([]);
  });

  it('l’initiateur ne se demande pas l’aperçu à lui-même', async () => {
    const h = harness({ userId: 'alice' });
    expect(await h.request({ callId: CALL })).toEqual({ success: false, code: 'PERMISSION_DENIED' });
  });

  it('un appelé qui a déjà décroché passe par l’appel, plus par l’aperçu', async () => {
    const h = harness({ call: ringing({ joinedUserIds: ['alice', 'bob'] }) });
    expect(await h.request({ callId: CALL })).toEqual({ success: false, code: 'ALREADY_IN_CALL' });
  });

  it('un appel introuvable est refusé sans diffusion', async () => {
    const h = harness({ call: null });
    expect(await h.request({ callId: CALL })).toEqual({ success: false, code: 'NOT_A_PARTICIPANT' });
    expect(h.emitted).toEqual([]);
  });
});

describe('call:preview-signal — le lien d’aperçu, qui ne décroche rien (#8480)', () => {
  it('l’offre de l’initiateur part vers l’appelé, sous l’événement d’aperçu', async () => {
    const h = harness({ userId: 'alice' });
    expect(await h.signal(offer('alice', 'bob'))).toEqual({ success: true });
    expect(h.emitted).toEqual([
      { room: 'user:bob', event: SERVER_EVENTS.CALL_PREVIEW_SIGNAL, payload: offer('alice', 'bob') },
    ]);
  });

  it('la réponse de l’appelé revient à l’initiateur, et seulement à lui', async () => {
    const h = harness();
    const answer = { callId: CALL, signal: { type: 'answer', from: 'bob', to: 'alice', sdp: SDP } };
    expect(await h.signal(answer)).toEqual({ success: true });
    expect(h.emitted).toEqual([{ room: 'user:alice', event: SERVER_EVENTS.CALL_PREVIEW_SIGNAL, payload: answer }]);
  });

  it('les candidats voyagent dans les deux sens', async () => {
    const candidate = { type: 'ice-candidate', from: 'bob', to: 'alice', candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 };
    const h = harness();
    expect(await h.signal({ callId: CALL, signal: candidate })).toEqual({ success: true });
    expect(h.emitted[0]?.room).toBe('user:alice');
  });

  it('l’appelé ne peut viser personne d’autre que l’initiateur', async () => {
    const h = harness({ members: ['alice', 'bob', 'carol'] });
    expect(await h.signal(offer('bob', 'carol'))).toEqual({ success: false, code: 'PERMISSION_DENIED' });
    expect(h.emitted).toEqual([]);
  });

  it('l’initiateur ne vise qu’un membre qui sonne encore', async () => {
    expect(await harness({ userId: 'alice' }).signal(offer('alice', 'eve'))).toEqual({ success: false, code: 'TARGET_NOT_IN_CALL' });
    const joined = harness({ userId: 'alice', call: ringing({ joinedUserIds: ['alice', 'bob'] }) });
    expect(await joined.signal(offer('alice', 'bob'))).toEqual({ success: false, code: 'ALREADY_IN_CALL' });
  });

  it('un signal au nom d’un autre est refusé', async () => {
    const h = harness({ userId: 'bob' });
    expect(await h.signal(offer('alice', 'bob'))).toEqual({ success: false, code: 'PERMISSION_DENIED' });
    expect(h.emitted).toEqual([]);
  });

  it('plus rien ne passe une fois l’appel décroché', async () => {
    const h = harness({ userId: 'alice', call: ringing({ status: 'active' }) });
    expect(await h.signal(offer('alice', 'bob'))).toEqual({ success: false, code: 'CALL_NOT_ACTIVE' });
  });

  it('un SDP malformé est refusé à la frontière', async () => {
    const h = harness({ userId: 'alice' });
    const bad = { callId: CALL, signal: { type: 'offer', from: 'alice', to: 'bob', sdp: 'nope' } };
    expect(await h.signal(bad)).toEqual({ success: false, code: 'VALIDATION_ERROR' });
  });
});
