import { describe, it, expect, jest } from '@jest/globals';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallControlAck } from '@meeshy/shared/types/call-controls';
import { SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter';
import {
  callRoomRecipients,
  registerCallLiveFrameEvents,
  type CallLiveFrameRecipient,
  type CallLiveFrameSender,
} from '../call-live-frame-events';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const AT = new Date('2026-10-03T10:00:00.000Z');

type Harness = {
  readonly userId?: string;
  readonly allowed?: boolean;
  readonly sender?: CallLiveFrameSender | null;
  readonly room?: ReadonlyArray<{ readonly socketId: string; readonly capabilities: readonly string[] }>;
};

type GroupDelivery = { readonly socketId: string; readonly payload: unknown };

const harness = (overrides: Harness = {}) => {
  const handlers = new Map<string, (raw: unknown, ack?: (r: CallControlAck) => void) => Promise<void>>();
  const relayed: Array<{ room: string; event: string; payload: unknown }> = [];
  const checkLimit = jest.fn(async (_userId: string, _config: unknown) => overrides.allowed ?? true);
  const resolveSender = jest.fn(async (_userId: string, _callId: string): Promise<CallLiveFrameSender | null> =>
    'sender' in overrides ? overrides.sender ?? null : { userId: 'alice', activeParticipants: 2 }
  );
  const delivered: GroupDelivery[] = [];
  const groupRecipients = jest.fn(async (_callId: string): Promise<readonly CallLiveFrameRecipient[]> =>
    (overrides.room ?? []).map(({ socketId, capabilities }) => ({
      socketId,
      capabilities: new Set(capabilities) as CallLiveFrameRecipient['capabilities'],
      emit: (payload) => {
        delivered.push({ socketId, payload });
      },
    }))
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
    { rateLimiter: { checkLimit }, resolveSender, groupRecipients, now: () => AT },
    socket as never,
    () => ('userId' in overrides ? overrides.userId : 'alice')
  );
  const send = async (raw: unknown) => {
    const acks: CallControlAck[] = [];
    await handlers.get(CLIENT_EVENTS.CALL_FRAME_SELECT)?.(raw, (r) => acks.push(r));
    return acks[0];
  };
  return { send, relayed, delivered, checkLimit, resolveSender, groupRecipients };
};

describe('call:frame-select — le cadre en direct part vers les autres participants de l’appel (#9214, #11279)', () => {
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

  it('une réponse à une proposition (#9287) relaie `reply` avec le cadre qu’elle concerne', async () => {
    const h = harness();

    expect(await h.send({ callId: CALL, frameId: 'jovial.fete.duo', reply: 'accepted' })).toEqual({ success: true });
    expect(await h.send({ callId: CALL, frameId: 'jovial.fete.duo', reply: 'declined' })).toEqual({ success: true });
    expect(h.relayed.map((r) => r.payload)).toEqual([
      { callId: CALL, userId: 'alice', frameId: 'jovial.fete.duo', reply: 'accepted', at: AT.toISOString() },
      { callId: CALL, userId: 'alice', frameId: 'jovial.fete.duo', reply: 'declined', at: AT.toISOString() },
    ]);
  });

  it('une réponse sans cadre ou d’une autre forme est refusée à la frontière (#9287)', async () => {
    const h = harness();

    expect(await h.send({ callId: CALL, frameId: null, reply: 'accepted' })).toEqual({ success: false, code: 'VALIDATION_ERROR' });
    expect(await h.send({ callId: CALL, frameId: 'a.b', reply: 'maybe' })).toEqual({ success: false, code: 'VALIDATION_ERROR' });
    expect(h.relayed).toEqual([]);
  });

  it('un membre qui n’est pas connecté à CET appel ne relaie rien', async () => {
    const h = harness({ sender: null });

    expect(await h.send({ callId: CALL, frameId: null })).toEqual({ success: false, code: 'NOT_A_PARTICIPANT' });
    expect(h.relayed).toEqual([]);
  });

  it('à deux, le choix part toujours à la room de l’appel, sans relire qui l’écoute', async () => {
    const h = harness();

    await h.send({ callId: CALL, frameId: 'jovial.fete.duo' });

    expect(h.groupRecipients).not.toHaveBeenCalled();
    expect(h.relayed).toHaveLength(1);
  });

  describe('en groupe (3 à 6, #11279)', () => {
    const GROUP_ROOM = [
      { socketId: 'sock-1', capabilities: ['call-live-frame-group'] },
      { socketId: 'sock-bob', capabilities: ['call-live-frame-group'] },
      { socketId: 'sock-carol-old-ios', capabilities: [] },
      { socketId: 'sock-dan', capabilities: ['call-live-frame-group'] },
    ];

    it.each([3, 4, 5, 6])('à %i, le choix part à chaque membre qui sait l’afficher, jamais à l’émetteur', async (n) => {
      const h = harness({ sender: { userId: 'alice', activeParticipants: n }, room: GROUP_ROOM });

      expect(await h.send({ callId: CALL, frameId: 'jovial.fete.trio', texts: { name: 'Alice' } })).toEqual({ success: true });

      const payload = { callId: CALL, userId: 'alice', frameId: 'jovial.fete.trio', texts: { name: 'Alice' }, at: AT.toISOString() };
      expect(h.groupRecipients).toHaveBeenCalledWith(CALL);
      expect(h.delivered).toEqual([
        { socketId: 'sock-bob', payload },
        { socketId: 'sock-dan', payload },
      ]);
      expect(h.relayed).toEqual([]);
    });

    it('un ancien client qui n’annonce pas la capacité ne reçoit rien : il afficherait une proposition qu’il ne sait pas tenir', async () => {
      const h = harness({
        sender: { userId: 'alice', activeParticipants: 3 },
        room: [{ socketId: 'sock-carol-old-ios', capabilities: [] }],
      });

      expect(await h.send({ callId: CALL, frameId: 'jovial.fete.trio' })).toEqual({ success: true });
      expect(h.delivered).toEqual([]);
      expect(h.relayed).toEqual([]);
    });

    it('une réponse et un retrait voyagent aussi à tout le groupe capable', async () => {
      const h = harness({ sender: { userId: 'alice', activeParticipants: 4 }, room: GROUP_ROOM });

      await h.send({ callId: CALL, frameId: 'jovial.fete.trio', reply: 'accepted' });
      await h.send({ callId: CALL, frameId: null });

      expect(h.delivered.map((d) => d.payload)).toEqual([
        { callId: CALL, userId: 'alice', frameId: 'jovial.fete.trio', reply: 'accepted', at: AT.toISOString() },
        { callId: CALL, userId: 'alice', frameId: 'jovial.fete.trio', reply: 'accepted', at: AT.toISOString() },
        { callId: CALL, userId: 'alice', frameId: null, at: AT.toISOString() },
        { callId: CALL, userId: 'alice', frameId: null, at: AT.toISOString() },
      ]);
    });

    it('au-delà du plafond d’un appel, aucun cadre en direct ne part', async () => {
      const h = harness({ sender: { userId: 'alice', activeParticipants: 7 }, room: GROUP_ROOM });

      expect(await h.send({ callId: CALL, frameId: 'jovial.fete.trio' })).toEqual({ success: false, code: 'PERMISSION_DENIED' });
      expect(h.groupRecipients).not.toHaveBeenCalled();
      expect(h.delivered).toEqual([]);
    });
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

describe('les destinataires d’un cadre en groupe se lisent dans la room de l’appel (#11279)', () => {
  it('chaque socket de la room porte les capacités annoncées à son ouverture, et reçoit `call:frame-selected`', async () => {
    const emitted: Array<{ socketId: string; event: string; payload: unknown }> = [];
    const member = (id: string, auth: unknown) => ({
      id,
      handshake: { auth },
      emit: (event: string, payload: unknown) => {
        emitted.push({ socketId: id, event, payload });
        return true;
      },
    });
    const rooms: string[] = [];
    const io = {
      in: (room: string) => {
        rooms.push(room);
        return {
          fetchSockets: async () => [
            member('sock-new', { token: 'jwt', capabilities: ['call-live-frame-group'] }),
            member('sock-old', { token: 'jwt' }),
          ],
        };
      },
    };

    const recipients = await callRoomRecipients(io as never)(CALL);
    const payload = { callId: CALL, userId: 'alice', frameId: null, at: AT.toISOString() };
    recipients.forEach((recipient) => recipient.emit(payload));

    expect(rooms).toEqual([`call:${CALL}`]);
    expect(recipients.map((r) => [r.socketId, [...r.capabilities]])).toEqual([
      ['sock-new', ['call-live-frame-group']],
      ['sock-old', []],
    ]);
    expect(emitted).toEqual([
      { socketId: 'sock-new', event: SERVER_EVENTS.CALL_FRAME_SELECTED, payload },
      { socketId: 'sock-old', event: SERVER_EVENTS.CALL_FRAME_SELECTED, payload },
    ]);
  });
});
