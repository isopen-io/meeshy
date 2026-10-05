import { describe, it, expect, jest } from '@jest/globals';
import { CALL_MAX_PARTICIPANTS } from '@meeshy/shared/types/call-rules';
import {
  CALL_GUEST_ROLE,
  authorizeCallInvitation,
  recordCallInvitation,
  resolveInvitedGuestParticipantId,
} from '../callInvitation';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const CONV = '64b7f0c2a1b2c3d4e5f60719';
const NOW = new Date('2026-09-27T10:00:00.000Z');

type ParticipantRow = { id: string; conversationId: string; userId: string; bannedAt?: Date | null; isActive: boolean };

const inCall = (key: string, leftAt: Date | null = null) => ({
  id: `cp-${key}`,
  participantId: `p-${key}`,
  leftAt,
  participant: { userId: key, role: 'member', isActive: true },
});

const callSession = (overrides: Record<string, unknown> = {}) => ({
  id: CALL,
  conversationId: CONV,
  status: 'active',
  initiatorId: 'alice',
  invitedUserIds: [] as string[],
  participants: [inCall('alice'), inCall('bob')],
  ...overrides,
});

type World = {
  session: ReturnType<typeof callSession> | null;
  friends: Array<[string, string]>;
  participants: ParticipantRow[];
};

const USERS: Record<string, { id: string; username: string; displayName: string | null; avatar: string | null; [prism: string]: string | null }> = {
  alice: { id: 'alice', username: 'alice', displayName: 'Alice', avatar: null },
  bob: { id: 'bob', username: 'bob', displayName: null, avatar: null },
  dave: { id: 'dave', username: 'dave', displayName: 'Dave', avatar: 'https://cdn/dave.png', systemLanguage: null, regionalLanguage: 'es', customDestinationLanguage: null, deviceLocale: null },
};

const fakePrisma = (world: World) => ({
  friendRequest: {
    findFirst: jest.fn(async ({ where }: { where: { OR: Array<{ senderId: string; receiverId: string }> } }) => {
      const [{ senderId, receiverId }] = where.OR;
      const linked = world.friends.some(([a, b]) => (a === senderId && b === receiverId) || (a === receiverId && b === senderId));
      return linked ? { id: 'fr' } : null;
    }),
  },
  user: {
    findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.flatMap((id) => (USERS[id] ? [USERS[id]] : []))
    ),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => USERS[where.id] ?? null),
  },
  participant: {
    findFirst: jest.fn(async ({ where }: { where: { conversationId: string; userId: string } }) =>
      world.participants.find((p) => p.conversationId === where.conversationId && p.userId === where.userId) ?? null
    ),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `guest-${String(data['userId'])}`, ...data } as unknown as ParticipantRow;
      world.participants = [...world.participants, row];
      return row;
    }),
  },
  callSession: {
    findUnique: jest.fn(async () => world.session),
    update: jest.fn(async ({ data }: { data: { invitedUserIds: { push: string } } }) => {
      if (world.session) world.session = { ...world.session, invitedUserIds: [...world.session.invitedUserIds, data.invitedUserIds.push] };
      return world.session;
    }),
  },
});

const makeWorld = (overrides: Partial<World> = {}): World => ({
  session: callSession(),
  friends: [['alice', 'dave']],
  participants: [],
  ...overrides,
});

const authorize = (world: World, input: { inviter?: string; invitee?: string } = {}) =>
  authorizeCallInvitation(
    {
      prisma: fakePrisma(world) as never,
      callService: { getCallSession: async () => { if (!world.session) throw new Error('CALL_NOT_FOUND'); return world.session; } } as never,
    },
    { callId: CALL, inviterUserId: input.inviter ?? 'alice', inviteeUserId: input.invitee ?? 'dave' }
  );

describe('authorizeCallInvitation — qui peut faire sonner qui dans un appel en cours (#8433)', () => {
  it('un participant connecté invite un ami accepté, même hors de la conversation', async () => {
    const grant = await authorize(makeWorld());

    expect(grant).toMatchObject({
      ok: true,
      invitee: { userId: 'dave', username: 'dave', displayName: 'Dave', avatar: 'https://cdn/dave.png' },
      inviter: { userId: 'alice', username: 'alice' },
      activeCount: 2,
    });
  });

  it('refuse une personne qui n’est pas un ami accepté', async () => {
    expect(await authorize(makeWorld({ friends: [] }))).toEqual({ ok: false, code: 'NOT_A_CONTACT' });
    expect(await authorize(makeWorld(), { invitee: 'ghost' })).toEqual({ ok: false, code: 'NOT_A_CONTACT' });
  });

  it('refuse un inviteur qui n’est pas connecté à cet appel', async () => {
    const left = makeWorld({ session: callSession({ participants: [inCall('alice', NOW), inCall('bob')] }) });
    expect(await authorize(left)).toEqual({ ok: false, code: 'NOT_A_PARTICIPANT' });
    expect(await authorize(makeWorld({ friends: [['mallory', 'dave']] }), { inviter: 'mallory' }))
      .toEqual({ ok: false, code: 'NOT_A_PARTICIPANT' });
    expect(await authorize(makeWorld({ session: null }))).toEqual({ ok: false, code: 'NOT_A_PARTICIPANT' });
  });

  it('refuse un appel terminé', async () => {
    expect(await authorize(makeWorld({ session: callSession({ status: 'ended' }) }))).toEqual({ ok: false, code: 'CALL_NOT_ACTIVE' });
  });

  it('refuse d’inviter quelqu’un déjà dans l’appel, ou soi-même', async () => {
    expect(await authorize(makeWorld({ friends: [['alice', 'bob']] }), { invitee: 'bob' })).toEqual({ ok: false, code: 'ALREADY_IN_CALL' });
    expect(await authorize(makeWorld(), { invitee: 'alice' })).toEqual({ ok: false, code: 'ALREADY_IN_CALL' });
  });

  it('refuse au plafond de l’appel', async () => {
    const full = Array.from({ length: CALL_MAX_PARTICIPANTS }, (_, i) => inCall(i === 0 ? 'alice' : `u${i}`));
    expect(await authorize(makeWorld({ session: callSession({ participants: full }) })))
      .toEqual({ ok: false, code: 'MAX_PARTICIPANTS_REACHED' });
  });

  it('refuse une personne bannie de la conversation', async () => {
    const banned = makeWorld({ participants: [{ id: 'p-dave', conversationId: CONV, userId: 'dave', bannedAt: NOW, isActive: false }] });
    expect(await authorize(banned)).toEqual({ ok: false, code: 'PERMISSION_DENIED' });
  });
});

describe('recordCallInvitation — l’invitation est notée sur la session, une fois', () => {
  it('ajoute la personne, sans doublon', async () => {
    const world = makeWorld();
    const prisma = fakePrisma(world);

    await recordCallInvitation(prisma as never, { id: CALL, invitedUserIds: [] }, 'dave');
    await recordCallInvitation(prisma as never, { id: CALL, invitedUserIds: ['dave'] }, 'dave');

    expect(prisma.callSession.update).toHaveBeenCalledTimes(1);
    expect(world.session?.invitedUserIds).toEqual(['dave']);
  });
});

describe('resolveInvitedGuestParticipantId — l’invitation ouvre CET appel, pas la conversation', () => {
  const resolve = (world: World, userId = 'dave') =>
    resolveInvitedGuestParticipantId(fakePrisma(world) as never, { callId: CALL, userId }, NOW);

  it('crée pour l’invité une participation INACTIVE, sans droits, qui ne l’inscrit pas dans la conversation', async () => {
    const world = makeWorld({ session: callSession({ invitedUserIds: ['dave'] }) });

    expect(await resolve(world)).toBe('guest-dave');
    expect(world.participants[0]).toMatchObject({
      conversationId: CONV,
      userId: 'dave',
      type: 'user',
      role: CALL_GUEST_ROLE,
      displayName: 'Dave',
      language: 'es',
      isActive: false,
      leftAt: NOW,
      permissions: expect.objectContaining({ canSendMessages: false, canViewHistory: false }),
    });
  });

  it('réutilise la participation d’un ancien membre, sans la réactiver', async () => {
    const world = makeWorld({
      session: callSession({ invitedUserIds: ['dave'] }),
      participants: [{ id: 'p-old', conversationId: CONV, userId: 'dave', bannedAt: null, isActive: false }],
    });

    expect(await resolve(world)).toBe('p-old');
    expect(world.participants).toHaveLength(1);
  });

  it('rien pour qui n’est pas invité, un appel terminé, ou un banni', async () => {
    expect(await resolve(makeWorld())).toBeNull();
    expect(await resolve(makeWorld({ session: callSession({ invitedUserIds: ['dave'], status: 'ended' }) }))).toBeNull();
    expect(await resolve(makeWorld({ session: null }))).toBeNull();
    const banned = makeWorld({
      session: callSession({ invitedUserIds: ['dave'] }),
      participants: [{ id: 'p-dave', conversationId: CONV, userId: 'dave', bannedAt: NOW, isActive: false }],
    });
    expect(await resolve(banned)).toBeNull();
  });

  it('deux appareils qui décrochent ensemble partagent la même participation', async () => {
    const world = makeWorld({ session: callSession({ invitedUserIds: ['dave'] }) });
    const prisma = fakePrisma(world);
    prisma.participant.create.mockImplementationOnce(async () => {
      world.participants = [...world.participants, { id: 'p-first', conversationId: CONV, userId: 'dave', isActive: false }];
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    });

    expect(await resolveInvitedGuestParticipantId(prisma as never, { callId: CALL, userId: 'dave' }, NOW)).toBe('p-first');
  });
});
