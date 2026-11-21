import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { rebranchCall, type CallRebranchDeps } from '../callConversationRebranch';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const DIRECT = '64b7f0c2a1b2c3d4e5f60719';

type State = {
  session: { id: string; conversationId: string; originConversationId?: string; status: string; version: number };
  claims: Record<string, string | null>;
  conversations: string[];
  participants: Array<{ id: string; conversationId: string; userId: string; isActive: boolean }>;
  callParticipants: Array<{ id: string; participantId: string; userId: string }>;
};

const initial = (): State => ({
  session: { id: CALL, conversationId: DIRECT, status: 'active', version: 3 },
  claims: { [DIRECT]: CALL },
  conversations: [DIRECT],
  participants: [
    { id: 'd-alice', conversationId: DIRECT, userId: 'alice', isActive: true },
    { id: 'd-bob', conversationId: DIRECT, userId: 'bob', isActive: true },
  ],
  callParticipants: [
    { id: 'cp-alice', participantId: 'd-alice', userId: 'alice' },
    { id: 'cp-bob', participantId: 'd-bob', userId: 'bob' },
  ],
});

const harness = (options: { found?: string[]; state?: State; beforeSwap?: (state: State) => void } = {}) => {
  const state = options.state ?? initial();
  const log: string[] = [];
  const emitted: Array<{ room: string; event: string; payload: any }> = [];
  let created = 0;
  const prisma: any = {
    callSession: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        options.beforeSwap?.(state);
        if (state.session.id !== where.id || state.session.conversationId !== where.conversationId || where.status.notIn.includes(state.session.status)) {
          return { count: 0 };
        }
        state.session = { ...state.session, conversationId: data.conversationId, originConversationId: data.originConversationId, version: state.session.version + 1 };
        log.push(`session→${data.conversationId}`);
        return { count: 1 };
      }),
      findUnique: jest.fn(async () => ({ conversationId: state.session.conversationId })),
    },
    conversation: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        if ('activeCallId' in data && data.activeCallId === null) {
          if (state.claims[where.id] !== where.activeCallId) return { count: 0 };
          state.claims[where.id] = null;
          log.push(`release ${where.id}`);
          return { count: 1 };
        }
        log.push(`announce-ready ${where.id}`);
        return { count: 1 };
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        state.conversations = state.conversations.filter((id) => id !== where.id);
        log.push(`delete ${where.id}`);
        return { count: 1 };
      }),
    },
    participant: {
      findMany: jest.fn(async ({ where }: any) => state.participants.filter((p) => p.conversationId === where.conversationId && p.isActive)),
      deleteMany: jest.fn(async ({ where }: any) => {
        state.participants = state.participants.filter((p) => p.conversationId !== where.conversationId);
        return { count: 1 };
      }),
    },
    callParticipant: {
      findMany: jest.fn(async () => state.callParticipants.map((cp) => ({ id: cp.id, participant: { userId: cp.userId } }))),
      update: jest.fn(async ({ where, data }: any) => {
        state.callParticipants = state.callParticipants.map((cp) => (cp.id === where.id ? { ...cp, participantId: data.participantId } : cp));
        return {};
      }),
    },
  };
  const addGroup = (id: string, userIds: string[]) => {
    state.conversations.push(id);
    userIds.forEach((userId) => state.participants.push({ id: `${id}-${userId}`, conversationId: id, userId, isActive: true }));
  };
  (options.found ?? []).forEach((id) => addGroup(id, ['alice', 'bob', 'dave']));
  const deps: CallRebranchDeps = {
    prisma,
    io: { to: (room: string) => ({ emit: (event: string, payload: unknown) => void emitted.push({ room, event, payload }) }) } as never,
    claim: jest.fn(async (conversationId: string, callId: string) => {
      if (state.claims[conversationId]) return false;
      state.claims[conversationId] = callId;
      log.push(`claim ${conversationId}`);
      return true;
    }),
    notify: jest.fn(),
    findGroups: jest.fn(async () => (options.found ?? []).map((id) => ({ id, title: 'Les trois', memberUserIds: ['alice', 'bob', 'dave'] }))),
    createGroup: jest.fn(async ({ memberUserIds, callId }) => {
      created += 1;
      const id = `g-created-${created}`;
      addGroup(id, [...memberUserIds]);
      state.claims[id] = callId;
      log.push(`create ${id}`);
      return { id, title: null };
    }),
    postLiveMessage: jest.fn(async (callId: string) => void log.push(`live-message ${callId} in ${state.session.conversationId}`)),
    joinRoom: jest.fn(async (userId: string, conversationId: string) => void log.push(`join ${userId}@${conversationId}`)),
    announceNew: jest.fn(async (payload: any) => void log.push(`conversation:new ${payload.conversationId}`)),
    now: () => new Date('2026-11-18T10:00:00Z'),
  };
  const run = (invitee = 'dave') =>
    rebranchCall(deps, { callId: CALL, fromConversationId: DIRECT, presentUserIds: ['alice', 'bob'], inviterUserId: 'bob', inviteeUserId: invitee });
  return { state, log, emitted, deps, run };
};

describe('rebranchCall — l’appel en tête-à-tête rejoint le groupe des présents et de l’invité (#19650)', () => {
  it('crée le groupe, déplace l’appel, garde la réservation du tête-à-tête et prend celle du groupe', async () => {
    const h = harness();
    const outcome = await h.run();

    expect(outcome).toEqual({ kind: 'rebranched', conversationId: 'g-created-1', title: null, created: true, memberUserIds: ['alice', 'bob', 'dave'] });
    expect(h.state.session).toMatchObject({ conversationId: 'g-created-1', originConversationId: DIRECT, version: 4 });
    expect(h.state.claims).toEqual({ [DIRECT]: CALL, 'g-created-1': CALL });
    expect(h.state.callParticipants).toEqual([
      { id: 'cp-alice', participantId: 'g-created-1-alice', userId: 'alice' },
      { id: 'cp-bob', participantId: 'g-created-1-bob', userId: 'bob' },
    ]);
  });

  it('pose la bulle « en cours » dans le groupe, joint les rooms, annonce le groupe, PUIS dit la bascule', async () => {
    const h = harness();
    await h.run();

    expect(h.log).toEqual([
      'create g-created-1',
      `session→g-created-1`,
      'announce-ready g-created-1',
      `live-message ${CALL} in g-created-1`,
      'join alice@g-created-1',
      'join bob@g-created-1',
      'join dave@g-created-1',
      'conversation:new g-created-1',
    ]);
    expect(h.emitted).toEqual([{
      room: `call:${CALL}`,
      event: SERVER_EVENTS.CALL_CONVERSATION_CHANGED,
      payload: {
        callId: CALL,
        conversationId: 'g-created-1',
        previousConversationId: DIRECT,
        conversationType: 'group',
        conversationTitle: null,
        memberUserIds: ['alice', 'bob', 'dave'],
        created: true,
        reason: 'invitation',
      },
    }]);
  });

  it('reprend le groupe où ils sont déjà tous, sans en créer ni l’annoncer', async () => {
    const h = harness({ found: ['g-old'] });
    const outcome = await h.run();

    expect(outcome).toMatchObject({ kind: 'rebranched', conversationId: 'g-old', title: 'Les trois', created: false });
    expect(h.deps.createGroup).not.toHaveBeenCalled();
    expect(h.deps.announceNew).not.toHaveBeenCalled();
    expect(h.emitted[0].payload).toMatchObject({ conversationId: 'g-old', conversationTitle: 'Les trois', created: false });
  });

  it('un groupe trouvé dont la réservation est prise cède au suivant, sinon à un groupe neuf', async () => {
    const h = harness({ found: ['g-busy'] });
    h.state.claims['g-busy'] = 'another-call';
    const outcome = await h.run();
    expect(outcome).toMatchObject({ kind: 'rebranched', conversationId: 'g-created-1', created: true });
  });

  it('course : une autre invitation a basculé l’appel la première — le groupe perdant est défait', async () => {
    const h = harness({
      beforeSwap: (state) => {
        state.session = { ...state.session, conversationId: 'g-winner', originConversationId: DIRECT };
      },
    });
    const outcome = await h.run('erin');

    expect(outcome).toEqual({ kind: 'lost', conversationId: 'g-winner' });
    expect(h.state.claims['g-created-1']).toBeNull();
    expect(h.state.conversations).not.toContain('g-created-1');
    expect(h.state.participants.some((p) => p.conversationId === 'g-created-1')).toBe(false);
    expect(h.emitted).toEqual([]);
    expect(h.deps.postLiveMessage).not.toHaveBeenCalled();
  });

  it('course sur un groupe trouvé : la réservation est rendue, le groupe reste', async () => {
    const h = harness({
      found: ['g-old'],
      beforeSwap: (state) => {
        state.session = { ...state.session, conversationId: 'g-winner' };
      },
    });
    expect(await h.run()).toEqual({ kind: 'lost', conversationId: 'g-winner' });
    expect(h.state.claims['g-old']).toBeNull();
    expect(h.state.conversations).toContain('g-old');
    expect(h.deps.notify).toHaveBeenCalledWith('g-old', CALL);
  });

  it('un groupe neuf naît en tenant la réservation : aucun signal de liste avant la bascule gagnée (audit #19650)', async () => {
    const h = harness();
    const notified: string[] = [];
    (h.deps.notify as jest.Mock<any>).mockImplementation((conversationId: string) => {
      notified.push(`${conversationId} after ${h.log[h.log.length - 1]}`);
    });
    await h.run();

    expect(h.deps.createGroup).toHaveBeenCalledWith({ inviterUserId: 'bob', memberUserIds: ['alice', 'bob', 'dave'], callId: CALL });
    expect(h.deps.claim).not.toHaveBeenCalledWith('g-created-1', CALL);
    expect(notified).toEqual(['g-created-1 after conversation:new g-created-1']);
  });

  it('un groupe neuf perdu dans une course disparaît sans qu’aucune liste l’ait vu (audit #19650)', async () => {
    const h = harness({
      beforeSwap: (state) => {
        state.session = { ...state.session, conversationId: 'g-winner' };
      },
    });
    expect(await h.run('erin')).toEqual({ kind: 'lost', conversationId: 'g-winner' });
    expect(h.deps.claim).not.toHaveBeenCalled();
    expect(h.deps.notify).not.toHaveBeenCalled();
    expect(h.state.conversations).not.toContain('g-created-1');
  });

  it('une panne APRÈS la bascule gagnée ne fait pas échouer la bascule : elle est dite, et le groupe neuf est visible (audit #19650)', async () => {
    const h = harness();
    (h.deps.prisma as any).callParticipant.update = jest.fn(async () => { throw new Error('mongo write conflict'); });
    (h.deps.joinRoom as jest.Mock<any>).mockImplementation(async () => { throw new Error('io down'); });

    const outcome = await h.run();

    expect(outcome).toMatchObject({ kind: 'rebranched', conversationId: 'g-created-1', created: true });
    expect(h.log).toContain('announce-ready g-created-1');
    expect(h.emitted.map((e) => e.event)).toEqual([SERVER_EVENTS.CALL_CONVERSATION_CHANGED]);
  });

  it('une lecture des membres du groupe en panne, ou un firstMessageSentAt refusé, non plus', async () => {
    const h = harness();
    (h.deps.prisma as any).participant.findMany = jest.fn(async () => { throw new Error('read timeout'); });
    const updateMany = (h.deps.prisma as any).conversation.updateMany;
    (h.deps.prisma as any).conversation.updateMany = jest.fn(async (args: any) => {
      if (!('activeCallId' in args.data)) throw new Error('write refused');
      return updateMany(args);
    });

    expect(await h.run()).toMatchObject({ kind: 'rebranched', conversationId: 'g-created-1' });
    expect(h.emitted.map((e) => e.event)).toEqual([SERVER_EVENTS.CALL_CONVERSATION_CHANGED]);
  });
});
