import { describe, it, expect, jest } from '@jest/globals';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallControlAck } from '@meeshy/shared/types/call-controls';
import { SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter';
import { registerCallLiveFrameEvents, type CallLiveFrameSender } from '../call-live-frame-events';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const AT = new Date('2026-10-03T10:00:00.000Z');

type Harness = {
  readonly userId?: string;
  readonly allowed?: boolean;
  readonly sender?: CallLiveFrameSender | null;
};

const harness = (overrides: Harness = {}) => {
  const handlers = new Map<string, (raw: unknown, ack?: (r: CallControlAck) => void) => Promise<void>>();
  const relayed: Array<{ room: string; event: string; payload: unknown }> = [];
  const checkLimit = jest.fn(async (_userId: string, _config: unknown) => overrides.allowed ?? true);
  const resolveSender = jest.fn(async (_userId: string, _callId: string): Promise<CallLiveFrameSender | null> =>
    'sender' in overrides ? overrides.sender ?? null : { userId: 'alice', activeParticipants: 2 }
  );
  const socket = {
    id: 'sock-1',
    on: (event: string, handler: (raw: unknown, ack?: (r: CallControlAck) => void) => Promise<void>) => {
      handlers.set(event, handler);
    },
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        relayed.push({ room, event, payload });
        return true;
      },
    }),
  };
  registerCallLiveFrameEvents(
    { rateLimiter: { checkLimit }, resolveSender, now: () => AT },
    socket as never,
    () => ('userId' in overrides ? overrides.userId : 'alice')
  );
  const send = async (raw: unknown) => {
    const acks: CallControlAck[] = [];
    await handlers.get(CLIENT_EVENTS.CALL_FRAME_SELECT)?.(raw, (r) => acks.push(r));
    return acks[0];
  };
  return { send, relayed, checkLimit, resolveSender };
};

describe('call:frame-select — le cadre en direct part vers l’autre participant d’un appel à deux (#9214)', () => {
  it('relaie le cadre et les textes partagés dans la room de l’appel, au nom de l’émetteur résolu', async () => {
    const h = harness();

    const ack = await h.send({ callId: CALL, frameId: 'jovial.fete.duo', texts: { name: ' Alice ' } });

    expect(ack).toEqual({ success: true });
    expect(h.relayed).toEqual([
      {
        room: `call:${CALL}`,
        event: SERVER_EVENTS.CALL_FRAME_SELECTED,
        payload: { callId: CALL, userId: 'alice', frameId: 'jovial.fete.duo', texts: { name: 'Alice' }, at: AT.toISOString() },
      },
    ]);
  });

  it('retirer le cadre relaie `frameId: null`, sans textes', async () => {
    const h = harness();

    expect(await h.send({ callId: CALL, frameId: null })).toEqual({ success: true });
    expect(h.relayed[0]?.payload).toEqual({ callId: CALL, userId: 'alice', frameId: null, at: AT.toISOString() });
  });

  it('un membre qui n’est pas connecté à CET appel ne relaie rien', async () => {
    const h = harness({ sender: null });

    expect(await h.send({ callId: CALL, frameId: null })).toEqual({ success: false, code: 'NOT_A_PARTICIPANT' });
    expect(h.relayed).toEqual([]);
  });

  it('un appel à plus de deux ne reçoit aucun cadre en direct', async () => {
    const h = harness({ sender: { userId: 'alice', activeParticipants: 3 } });

    expect(await h.send({ callId: CALL, frameId: 'jovial.fete.duo' })).toEqual({ success: false, code: 'PERMISSION_DENIED' });
    expect(h.relayed).toEqual([]);
  });

  it('un appel où l’émetteur est seul ne relaie rien', async () => {
    const h = harness({ sender: { userId: 'alice', activeParticipants: 1 } });

    expect(await h.send({ callId: CALL, frameId: 'jovial.fete.duo' })).toEqual({ success: false, code: 'CALL_NOT_ACTIVE' });
    expect(h.relayed).toEqual([]);
  });

  it('un identifiant hors forme, un texte trop long ou une clé étrangère est refusé à la frontière', async () => {
    const h = harness();

    expect(await h.send({ callId: CALL, frameId: '../../etc' })).toEqual({ success: false, code: 'VALIDATION_ERROR' });
    expect(await h.send({ callId: CALL, frameId: 'a.b', texts: { name: 'x'.repeat(200) } })).toEqual({
      success: false,
      code: 'VALIDATION_ERROR',
    });
    expect(await h.send({ callId: CALL, frameId: 'a.b', texts: { phone: '0600000000' } })).toEqual({
      success: false,
      code: 'VALIDATION_ERROR',
    });
    expect(await h.send({ callId: CALL, frameId: 'a.b', userId: 'bob' })).toEqual({ success: false, code: 'VALIDATION_ERROR' });
    expect(h.resolveSender).not.toHaveBeenCalled();
    expect(h.relayed).toEqual([]);
  });

  it('le débit est borné par personne, au budget des cadres en direct', async () => {
    const h = harness({ allowed: false });

    expect(await h.send({ callId: CALL, frameId: null })).toEqual({ success: false, code: 'RATE_LIMITED' });
    expect(h.checkLimit).toHaveBeenCalledWith('alice', SOCKET_RATE_LIMITS.CALL_FRAME_SELECT);
    expect(SOCKET_RATE_LIMITS.CALL_FRAME_SELECT).toMatchObject({ maxRequests: 10, windowMs: 10000 });
    expect(h.relayed).toEqual([]);
  });

  it('un socket non authentifié n’atteint rien', async () => {
    const h = harness({ userId: undefined });

    expect(await h.send({ callId: CALL, frameId: null })).toEqual({ success: false, code: 'NOT_AUTHENTICATED' });
    expect(h.checkLimit).not.toHaveBeenCalled();
  });
});
