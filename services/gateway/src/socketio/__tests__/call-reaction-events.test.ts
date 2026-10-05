import { describe, it, expect, jest } from '@jest/globals';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallControlAck } from '@meeshy/shared/types/call-controls';
import { SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter';
import { registerCallReactionEvents } from '../call-reaction-events';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const AT = new Date('2026-09-27T10:00:00.000Z');

type Harness = {
  readonly userId?: string;
  readonly allowed?: boolean;
  readonly participant?: { participantId: string; userId: string } | null;
  readonly recordFails?: boolean;
};

const harness = (overrides: Harness = {}) => {
  const handlers = new Map<string, (raw: unknown, ack?: (r: CallControlAck) => void) => Promise<void>>();
  const relayed: Array<{ room: string; event: string; payload: unknown }> = [];
  const checkLimit = jest.fn(async (_userId: string, _config: unknown) => overrides.allowed ?? true);
  const recordReaction = jest.fn(async (_callId: string, _emoji: string) => {
    if (overrides.recordFails) throw new Error('mongo down');
  });
  const resolveActiveCallParticipant = jest.fn(async (_userId: string, _callId: string) =>
    'participant' in overrides ? overrides.participant ?? null : { participantId: 'p-alice', userId: 'alice' }
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
  registerCallReactionEvents(
    { rateLimiter: { checkLimit }, resolveActiveCallParticipant, recordReaction, now: () => AT },
    socket as never,
    () => ('userId' in overrides ? overrides.userId : 'alice')
  );
  const send = async (raw: unknown) => {
    const acks: CallControlAck[] = [];
    await handlers.get(CLIENT_EVENTS.CALL_REACTION)?.(raw, (r) => acks.push(r));
    return acks[0];
  };
  return { send, relayed, recordReaction, checkLimit, resolveActiveCallParticipant };
};

describe('call:reaction — une réaction part vers les autres participants de l’appel (#8439)', () => {
  it('relaie la réaction dans la room de l’appel, au nom de l’émetteur résolu, et la compte', async () => {
    const h = harness();

    expect(await h.send({ callId: CALL, emoji: '🎉' })).toEqual({ success: true });
    expect(h.relayed).toEqual([
      {
        room: `call:${CALL}`,
        event: SERVER_EVENTS.CALL_REACTION_RECEIVED,
        payload: { callId: CALL, userId: 'alice', emoji: '🎉', at: AT.toISOString() },
      },
    ]);
    expect(h.recordReaction).toHaveBeenCalledWith(CALL, '🎉');
  });

  it('un membre qui n’est pas connecté à CET appel ne relaie rien et ne compte rien', async () => {
    const h = harness({ participant: null });

    expect(await h.send({ callId: CALL, emoji: '👍' })).toEqual({ success: false, code: 'NOT_A_PARTICIPANT' });
    expect(h.relayed).toEqual([]);
    expect(h.recordReaction).not.toHaveBeenCalled();
  });

  it('un emoji hors liste blanche, ou une charge étrangère, est refusé à la frontière', async () => {
    const h = harness();

    expect(await h.send({ callId: CALL, emoji: '💩' })).toEqual({ success: false, code: 'VALIDATION_ERROR' });
    expect(await h.send({ callId: 'nope', emoji: '👍' })).toEqual({ success: false, code: 'VALIDATION_ERROR' });
    expect(h.resolveActiveCallParticipant).not.toHaveBeenCalled();
    expect(h.relayed).toEqual([]);
  });

  it('le débit est borné par personne, au budget des réactions d’appel', async () => {
    const h = harness({ allowed: false });

    expect(await h.send({ callId: CALL, emoji: '👍' })).toEqual({ success: false, code: 'RATE_LIMITED' });
    expect(h.checkLimit).toHaveBeenCalledWith('alice', SOCKET_RATE_LIMITS.CALL_REACTION);
    expect(SOCKET_RATE_LIMITS.CALL_REACTION).toMatchObject({ maxRequests: 5, windowMs: 1000 });
    expect(h.relayed).toEqual([]);
  });

  it('un socket non authentifié n’atteint rien', async () => {
    const h = harness({ userId: undefined });

    expect(await h.send({ callId: CALL, emoji: '👍' })).toEqual({ success: false, code: 'NOT_AUTHENTICATED' });
    expect(h.checkLimit).not.toHaveBeenCalled();
  });

  it('un compte qui échoue n’empêche pas la réaction d’être vue', async () => {
    const h = harness({ recordFails: true });

    expect(await h.send({ callId: CALL, emoji: '❤️' })).toEqual({ success: true });
    expect(h.relayed).toHaveLength(1);
  });
});
