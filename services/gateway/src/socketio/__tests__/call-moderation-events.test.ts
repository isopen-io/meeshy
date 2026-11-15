import { describe, it, expect, jest } from '@jest/globals';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallControlAck } from '@meeshy/shared/types/call-controls';
import { registerCallModerationEvents } from '../call-moderation-events';

const CALL = '64b7f0c2a1b2c3d4e5f60718';

type Row = {
  id: string;
  participantId: string;
  leftAt: Date | null;
  participant: { userId: string | null; role: string; isActive: boolean };
};

const row = (key: string, role: string, overrides: Partial<Row> = {}): Row => ({
  id: `cp-${key}`,
  participantId: `p-${key}`,
  leftAt: null,
  participant: { userId: key, role, isActive: true },
  ...overrides,
});

const defaultSession = () => ({
  id: CALL,
  status: 'active',
  initiatorId: 'alice',
  participants: [row('alice', 'member'), row('bob', 'member'), row('mod', 'moderator'), row('admin', 'admin')],
});

type Emission = { rooms: string[]; except: string[]; event: string; payload: unknown };

const harness = (overrides: { userId?: string; session?: unknown; sessionFails?: boolean } = {}) => {
  const handlers = new Map<string, (raw: unknown, ack?: (r: CallControlAck) => void) => Promise<void>>();
  const emitted: Emission[] = [];
  const room = (rooms: string[], except: string[]) => ({
    except: (excluded: string) => room(rooms, [...except, excluded]),
    emit: (event: string, payload: unknown) => {
      emitted.push({ rooms, except, event, payload });
      return true;
    },
  });
  const io = { to: (target: string) => room([target], []) };
  const updateParticipantMedia = jest.fn(async (_c: string, _p: string, _m: string, _e: boolean) => ({}));
  const getCallSession = jest.fn(async (_callId: string) => {
    if (overrides.sessionFails) throw new Error('CALL_NOT_FOUND: Call session not found');
    return overrides.session ?? defaultSession();
  });
  const socket = {
    id: 'sock-1',
    on: (event: string, handler: (raw: unknown, ack?: (r: CallControlAck) => void) => Promise<void>) => {
      handlers.set(event, handler);
    },
  };
  registerCallModerationEvents(
    {
      io: io as never,
      rateLimiter: { checkLimit: async () => true },
      callService: { getCallSession, updateParticipantMedia } as never,
    },
    socket as never,
    () => ('userId' in overrides ? overrides.userId : 'alice')
  );
  const mute = async (raw: unknown) => {
    const acks: CallControlAck[] = [];
    await handlers.get(CLIENT_EVENTS.CALL_MUTE_PARTICIPANT)?.(raw, (r) => acks.push(r));
    return acks[0];
  };
  return { mute, emitted, updateParticipantMedia };
};

describe('call:mute-participant — l’admin coupe le micro d’un participant (#8438)', () => {
  it('l’initiateur coupe le micro de bob : bob est prévenu seul, les autres voient le micro coupé', async () => {
    const h = harness();

    expect(await h.mute({ callId: CALL, targetUserId: 'bob' })).toEqual({ success: true });
    expect(h.updateParticipantMedia).toHaveBeenCalledWith(CALL, 'p-bob', 'audio', false);
    expect(h.emitted).toEqual([
      { rooms: ['user:bob'], except: [], event: SERVER_EVENTS.CALL_MUTED_BY_MODERATOR, payload: { callId: CALL, byUserId: 'alice' } },
      {
        rooms: [`call:${CALL}`],
        except: ['user:bob'],
        event: SERVER_EVENTS.CALL_MEDIA_TOGGLED,
        payload: { callId: CALL, participantId: 'p-bob', userId: 'bob', mediaType: 'audio', enabled: false },
      },
    ]);
  });

  it('un modérateur de la conversation coupe un membre, mais pas un admin', async () => {
    expect(await harness({ userId: 'mod' }).mute({ callId: CALL, targetUserId: 'bob' })).toEqual({ success: true });

    const refusedHarness = harness({ userId: 'mod' });
    expect(await refusedHarness.mute({ callId: CALL, targetUserId: 'admin' })).toEqual({ success: false, code: 'PERMISSION_DENIED' });
    expect(refusedHarness.emitted).toEqual([]);
    expect(refusedHarness.updateParticipantMedia).not.toHaveBeenCalled();
  });

  it('un simple membre ne coupe personne', async () => {
    const h = harness({ userId: 'bob' });

    expect(await h.mute({ callId: CALL, targetUserId: 'alice' })).toEqual({ success: false, code: 'PERMISSION_DENIED' });
    expect(h.emitted).toEqual([]);
  });

  it('il faut être connecté à l’appel, et la cible aussi', async () => {
    expect(await harness({ userId: 'mallory' }).mute({ callId: CALL, targetUserId: 'bob' }))
      .toEqual({ success: false, code: 'NOT_A_PARTICIPANT' });

    const left = { ...defaultSession(), participants: [row('alice', 'member'), row('bob', 'member', { leftAt: new Date(0) })] };
    expect(await harness({ session: left }).mute({ callId: CALL, targetUserId: 'bob' }))
      .toEqual({ success: false, code: 'TARGET_NOT_IN_CALL' });
  });

  it('un appel terminé ou introuvable ne se modère plus', async () => {
    expect(await harness({ session: { ...defaultSession(), status: 'ended' } }).mute({ callId: CALL, targetUserId: 'bob' }))
      .toEqual({ success: false, code: 'CALL_NOT_ACTIVE' });
    expect(await harness({ sessionFails: true }).mute({ callId: CALL, targetUserId: 'bob' }))
      .toEqual({ success: false, code: 'NOT_A_PARTICIPANT' });
  });

  it('la charge ne peut pas rallumer un micro', async () => {
    const h = harness();

    expect(await h.mute({ callId: CALL, targetUserId: 'bob', enabled: true })).toEqual({ success: false, code: 'VALIDATION_ERROR' });
    expect(h.updateParticipantMedia).not.toHaveBeenCalled();
  });
});
