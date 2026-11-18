import { describe, it, expect, jest } from '@jest/globals';
import { CALL_MAX_PARTICIPANTS } from '@meeshy/shared/types/call-rules';
import {
  CALL_GUEST_ROLE,
  authorizeCallInvitation,
  callEntryForInvitee,
  recordCallInvitation,
  resolveInvitedGuestParticipantId,
} from '../callInvitation';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const CONV = '64b7f0c2a1b2c3d4e5f60719';
const NOW = new Date('2026-09-27T10:00:00.000Z');

type ParticipantRow = { id: string; conversationId: string; userId: string; bannedAt?: Date | null; isActive: boolean; role?: string };

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

type ConversationRow = {
  id: string;
  type: string;
  encryptionMode: string | null;
  isActive: boolean;
  closedAt: Date | null;
  communityId: string | null;
};

type World = {
  session: ReturnType<typeof callSession> | null;
  friends: Array<[string, string]>;
  participants: ParticipantRow[];
  conversation: ConversationRow | null;
  blocked: Array<[string, string]>;
  privateCommunity: boolean;
};

const USERS: Record<string, { id: string; username: string; displayName: string | null; avatar: string | null; [field: string]: string | boolean | Date | null }> = {
  alice: { id: 'alice', username: 'alice', displayName: 'Alice', avatar: null },
  gone: { id: 'gone', username: 'gone', displayName: null, avatar: null, isActive: false },
  erased: { id: 'erased', username: 'erased', displayName: null, avatar: null, isActive: true, deletedAt: NOW },
  root: { id: 'root', username: 'root', displayName: null, avatar: null, role: 'ADMIN' },
  bob: { id: 'bob', username: 'bob', displayName: null, avatar: null },
  dave: { id: 'dave', username: 'dave', displayName: 'Dave', avatar: 'https://cdn/dave.png', systemLanguage: null, regionalLanguage: 'es', customDestinationLanguage: null, deviceLocale: null },
};

const fakePrisma = (world: World) => ({
  userRelation: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
  friendRequest: {
    findFirst: jest.fn(async ({ where }: { where: { OR: Array<{ senderId: string; receiverId: string }> } }) => {
      const [{ senderId, receiverId }] = where.OR;
      const linked = world.friends.some(([a, b]) => (a === senderId && b === receiverId) || (a === receiverId && b === senderId));
      return linked ? { id: 'fr' } : null;
    }),
  },
  conversation: { findUnique: jest.fn(async () => world.conversation) },
  community: {
    findFirst: jest.fn(async () => (world.privateCommunity ? { createdBy: 'owner', isPrivate: true, isActive: true, members: [] } : null)),
  },
  communityMember: { findMany: jest.fn(async () => []) },
  user: {
    findFirst: jest.fn(async ({ where }: { where: { OR: Array<{ id: string | { in: string[] }; blockedUserIds: { has?: string; hasSome?: string[] } }> } }) => {
      const pairs = where.OR.flatMap((clause) => {
        const ids = typeof clause.id === 'string' ? [clause.id] : clause.id.in;
        const targets = clause.blockedUserIds.has ? [clause.blockedUserIds.has] : clause.blockedUserIds.hasSome ?? [];
        return ids.flatMap((id) => targets.map((target) => [id, target] as const));
      });
      return pairs.some(([a, b]) => world.blocked.some(([x, y]) => x === a && y === b)) ? { id: 'blocked' } : null;
    }),
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

const groupConversation = (overrides: Partial<ConversationRow> = {}): ConversationRow => ({
  id: CONV,
  type: 'group',
  encryptionMode: 'server',
  isActive: true,
  closedAt: null,
  communityId: null,
  ...overrides,
});

const makeWorld = (overrides: Partial<World> = {}): World => ({
  session: callSession(),
  friends: [['alice', 'dave']],
  participants: [],
  conversation: groupConversation(),
  blocked: [],
  privateCommunity: false,
  ...overrides,
});

const authorize = (world: World, input: { inviter?: string; invitee?: string; ringing?: string[] } = {}) =>
  authorizeCallInvitation(
    {
      prisma: fakePrisma(world) as never,
      callService: { getCallSession: async () => { if (!world.session) throw new Error('CALL_NOT_FOUND'); return world.session; } } as never,
      ringingInviteeIds: () => input.ringing ?? [],
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

describe('authorizeCallInvitation — l’invitation fait entrer dans la conversation de l’appel (#19650)', () => {
  it('dit le chemin : groupe ⇒ admission, tête-à-tête lisible ⇒ bascule, tête-à-tête chiffré ⇒ invité de l’appel', async () => {
    expect(await authorize(makeWorld())).toMatchObject({ ok: true, route: 'admit-member', inviteeIsMember: false });
    const answered = callSession({ answeredAt: NOW });
    expect(await authorize(makeWorld({ session: answered, conversation: groupConversation({ type: 'direct' }) })))
      .toMatchObject({ ok: true, route: 'rebranch' });
    expect(await authorize(makeWorld({ session: answered, conversation: groupConversation({ type: 'direct', encryptionMode: 'e2ee' }) })))
      .toMatchObject({ ok: true, route: 'legacy-guest' });
  });

  it('dit si l’invité est déjà membre actif du groupe : il sonne seulement', async () => {
    const member = makeWorld({ participants: [{ id: 'p-dave', conversationId: CONV, userId: 'dave', bannedAt: null, isActive: true }] });
    expect(await authorize(member)).toMatchObject({ ok: true, inviteeIsMember: true });
  });

  it('un appel en tête-à-tête qui sonne encore ne s’ouvre à personne (D5)', async () => {
    expect(await authorize(makeWorld({ conversation: groupConversation({ type: 'direct' }) })))
      .toEqual({ ok: false, code: 'CALL_NOT_ACTIVE' });
  });

  it('les invitations qui sonnent comptent dans le plafond', async () => {
    const actives = Array.from({ length: CALL_MAX_PARTICIPANTS - 1 }, (_, i) => inCall(i === 0 ? 'alice' : `u${i}`));
    const world = makeWorld({ session: callSession({ participants: actives }) });
    expect(await authorize(world, { ringing: ['erin'] })).toEqual({ ok: false, code: 'MAX_PARTICIPANTS_REACHED' });
    expect(await authorize(world, { ringing: ['dave'] })).toMatchObject({ ok: true });
    expect(await authorize(world)).toMatchObject({ ok: true });
  });

  it('refuse une personne bloquée avec un participant présent, dans un sens comme dans l’autre', async () => {
    expect(await authorize(makeWorld({ blocked: [['bob', 'dave']] }))).toEqual({ ok: false, code: 'PERMISSION_DENIED' });
    expect(await authorize(makeWorld({ blocked: [['dave', 'bob']] }))).toEqual({ ok: false, code: 'PERMISSION_DENIED' });
  });

  it('refuse l’entrée d’un salon de communauté privée à qui ne peut y faire entrer personne', async () => {
    const salon = makeWorld({ conversation: groupConversation({ communityId: 'c1' }), privateCommunity: true });
    expect(await authorize(salon)).toEqual({ ok: false, code: 'PERMISSION_DENIED' });
  });

  it('refuse une conversation externe, et une conversation close', async () => {
    expect(await authorize(makeWorld({ conversation: groupConversation({ type: 'external' }) }))).toEqual({ ok: false, code: 'PERMISSION_DENIED' });
    expect(await authorize(makeWorld({ conversation: groupConversation({ closedAt: NOW }) }))).toEqual({ ok: false, code: 'CALL_NOT_ACTIVE' });
    expect(await authorize(makeWorld({ conversation: null }))).toEqual({ ok: false, code: 'CALL_NOT_ACTIVE' });
  });

  it('aucun refus n’écrit quoi que ce soit', async () => {
    const world = makeWorld({ blocked: [['bob', 'dave']] });
    const prisma = fakePrisma(world);
    await authorizeCallInvitation(
      { prisma: prisma as never, callService: { getCallSession: async () => world.session } as never, ringingInviteeIds: () => [] },
      { callId: CALL, inviterUserId: 'alice', inviteeUserId: 'dave' }
    );
    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(prisma.callSession.update).not.toHaveBeenCalled();
  });
});

describe('authorizeCallInvitation — un ancien membre ne revient que par le rang de la porte d’ajout (audit #19650)', () => {
  const formerMember = (inviterRole: string, inviter = 'alice') =>
    makeWorld({
      friends: [[inviter, 'dave']],
      session: callSession({ participants: [inCall(inviter), inCall('bob')] }),
      participants: [
        { id: `p-${inviter}`, conversationId: CONV, userId: inviter, isActive: true, role: inviterRole },
        { id: 'p-dave', conversationId: CONV, userId: 'dave', bannedAt: null, isActive: false },
      ],
    });

  it('un simple membre fait d’un membre retiré ou parti l’invité de CET appel, sans le réintégrer au groupe', async () => {
    expect(await authorize(formerMember('member'))).toMatchObject({ ok: true, route: 'legacy-guest', inviteeIsMember: false });
  });

  it('un modérateur, un administrateur du groupe ou de la plateforme le fait revenir par la porte d’ajout', async () => {
    expect(await authorize(formerMember('moderator'))).toMatchObject({ ok: true, route: 'admit-member' });
    expect(await authorize(formerMember('admin'))).toMatchObject({ ok: true, route: 'admit-member' });
    expect(await authorize(formerMember('member', 'root'), { inviter: 'root' })).toMatchObject({ ok: true, route: 'admit-member' });
  });

  it('quelqu’un qui n’a jamais été membre entre toujours dans le groupe (D2)', async () => {
    expect(await authorize(makeWorld())).toMatchObject({ ok: true, route: 'admit-member' });
  });

  it('callEntryForInvitee dit la même chose à la porte de l’admission, pour tout groupe', async () => {
    const entry = (world: World, inviter = 'alice') =>
      callEntryForInvitee(fakePrisma(world) as never, { conversationId: CONV, inviterUserId: inviter, inviteeUserId: 'dave' });
    expect(await entry(formerMember('member'))).toBe('guest-only');
    expect(await entry(formerMember('moderator'))).toBe('admit');
    expect(await entry(makeWorld())).toBe('admit');
    expect(await entry(makeWorld({ participants: [{ id: 'p-dave', conversationId: CONV, userId: 'dave', isActive: true }] }))).toBe('member');
    expect(await entry(makeWorld({ participants: [{ id: 'p-dave', conversationId: CONV, userId: 'dave', isActive: false, bannedAt: NOW }] }))).toBe('banned');
  });
});

describe('authorizeCallInvitation — un compte désactivé ou supprimé ne s’invite pas (audit #19650)', () => {
  it('refuse comme une personne inconnue', async () => {
    expect(await authorize(makeWorld({ friends: [['alice', 'gone']] }), { invitee: 'gone' })).toEqual({ ok: false, code: 'NOT_A_CONTACT' });
    expect(await authorize(makeWorld({ friends: [['alice', 'erased']] }), { invitee: 'erased' })).toEqual({ ok: false, code: 'NOT_A_CONTACT' });
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
