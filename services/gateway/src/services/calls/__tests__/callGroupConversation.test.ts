import { describe, it, expect, jest } from '@jest/globals';
import { createCallGroup, exactMembers, findExactCallGroups } from '../callGroupConversation';

const CALL = '64b7f0c2a1b2c3d4e5f60718';

type Member = { userId: string | null; isActive: boolean };
type Group = {
  id: string;
  type: string;
  isActive: boolean;
  closedAt?: Date | null;
  deletedAt?: Date | null;
  communityId?: string | null;
  isAnnouncementChannel?: boolean;
  encryptionMode?: string | null;
  activeCallId?: string | null;
  lastMessageAt: Date;
  title?: string | null;
  participants: Member[];
};

const members = (...ids: string[]): Member[] => ids.map((userId) => ({ userId, isActive: true }));
const group = (id: string, ids: string[], overrides: Partial<Group> = {}): Group => ({
  id,
  type: 'group',
  isActive: true,
  encryptionMode: 'server',
  lastMessageAt: new Date('2026-11-01T10:00:00Z'),
  participants: members(...ids),
  ...overrides,
});

const fakePrisma = (groups: Group[], liveCalls: Record<string, string> = {}) => ({
  conversation: {
    findMany: jest.fn(async ({ where }: { where: { AND: Array<{ participants: { some: { userId: string } } }> } }) => {
      const required = where.AND.map((clause) => clause.participants.some.userId);
      return groups
        .filter((g) => g.type === 'group')
        .filter((g) => required.every((u) => g.participants.some((p) => p.userId === u && p.isActive)))
        .map((g) => ({ ...g, participants: g.participants.filter((p) => p.isActive) }));
    }),
  },
  callSession: {
    findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.filter((id) => liveCalls[id]).map((id) => ({ id, status: liveCalls[id] }))
    ),
  },
});

const find = (groups: Group[], liveCalls: Record<string, string> = {}) =>
  findExactCallGroups(fakePrisma(groups, liveCalls) as never, { callId: CALL, memberUserIds: ['alice', 'bob', 'dave'] });

describe('exactMembers', () => {
  it('dédoublonne et ordonne l’ensemble cible', () => {
    expect(exactMembers(['bob', 'alice', 'bob'], 'dave')).toEqual(['alice', 'bob', 'dave']);
  });
});

describe('findExactCallGroups — le groupe où ils sont TOUS, et eux seuls (#19650)', () => {
  it('trouve le groupe aux membres actifs exactement S', async () => {
    expect((await find([group('g1', ['alice', 'bob', 'dave'])])).map((g) => g.id)).toEqual(['g1']);
  });

  it('ignore un sur-ensemble et un sous-ensemble', async () => {
    expect(await find([group('g1', ['alice', 'bob', 'dave', 'erin']), group('g2', ['alice', 'bob'])])).toEqual([]);
  });

  it('ignore un salon de communauté, un canal d’annonce, un groupe clos, supprimé ou désactivé', async () => {
    const ids = ['alice', 'bob', 'dave'];
    expect(await find([
      group('salon', ids, { communityId: 'c1' }),
      group('annonce', ids, { isAnnouncementChannel: true }),
      group('clos', ids, { closedAt: new Date() }),
      group('supprime', ids, { deletedAt: new Date() }),
      group('inactif', ids, { isActive: false }),
    ])).toEqual([]);
  });

  it('ignore un groupe chiffré de bout en bout', async () => {
    expect(await find([group('g1', ['alice', 'bob', 'dave'], { encryptionMode: 'e2ee' })])).toEqual([]);
  });

  it('ignore un groupe dont la réservation est tenue par un autre appel vivant, pas par un appel fini', async () => {
    const found = await find(
      [group('pris', ['alice', 'bob', 'dave'], { activeCallId: 'other' }), group('libre', ['alice', 'bob', 'dave'], { activeCallId: 'old' })],
      { other: 'active', old: 'ended' }
    );
    expect(found.map((g) => g.id)).toEqual(['libre']);
  });

  it('compte un ancien membre parti ou banni comme absent', async () => {
    const withLeaver = group('g1', ['alice', 'bob', 'dave'], { participants: [...members('alice', 'bob', 'dave'), { userId: 'erin', isActive: false }] });
    expect((await find([withLeaver])).map((g) => g.id)).toEqual(['g1']);
  });

  it('un participant anonyme actif compte comme un membre de plus', async () => {
    const withGuest = group('g1', ['alice', 'bob', 'dave'], { participants: [...members('alice', 'bob', 'dave'), { userId: null, isActive: true }] });
    expect(await find([withGuest])).toEqual([]);
  });

  it('départage par le dernier message le plus récent', async () => {
    const found = await find([
      group('ancien', ['alice', 'bob', 'dave'], { lastMessageAt: new Date('2026-01-01T00:00:00Z') }),
      group('recent', ['alice', 'bob', 'dave'], { lastMessageAt: new Date('2026-11-17T00:00:00Z') }),
    ]);
    expect(found.map((g) => g.id)).toEqual(['recent', 'ancien']);
  });

  it('rend une liste vide sans candidat', async () => {
    expect(await find([])).toEqual([]);
  });
});

describe('createCallGroup — le groupe naît scellé, sans annonce', () => {
  const USERS = [
    { id: 'alice', username: 'alice', displayName: 'Alice', avatar: null, systemLanguage: 'fr' },
    { id: 'bob', username: 'bob', displayName: null, avatar: 'https://cdn/bob.png', systemLanguage: 'en' },
    { id: 'dave', username: 'dave', displayName: 'Dave', avatar: null, systemLanguage: null, regionalLanguage: 'es' },
  ];

  it('crée un groupe sans titre, l’inviteur créateur et les autres membres, régime posé, silencieux', async () => {
    const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'g-new', title: null, ...data }));
    const prisma = {
      user: { findMany: jest.fn(async () => USERS) },
      conversation: { create },
    };
    const group = await createCallGroup(
      { prisma: prisma as never, regime: async () => ({ id: 'g-new', encryptionMode: 'server' }) },
      { inviterUserId: 'bob', memberUserIds: ['alice', 'bob', 'dave'] }
    );

    expect(group).toEqual({ id: 'g-new', title: null });
    const data = create.mock.calls[0][0].data as Record<string, any>;
    expect(data).toMatchObject({ id: 'g-new', encryptionMode: 'server', type: 'group', firstMessageSentAt: null });
    expect(data.title).toBeUndefined();
    expect(typeof data.identifier).toBe('string');
    const rows = data.participants.create as Array<Record<string, any>>;
    expect(rows.map((r) => [r.userId, r.role])).toEqual([['bob', 'creator'], ['alice', 'member'], ['dave', 'member']]);
    expect(rows.find((r) => r.userId === 'dave')).toMatchObject({ type: 'user', displayName: 'Dave', language: 'es' });
    expect(rows.find((r) => r.userId === 'bob')).toMatchObject({ displayName: 'bob', avatar: 'https://cdn/bob.png' });
    expect(rows.every((r) => r.permissions && r.permissions.canSendMessages === true)).toBe(true);
    expect(data.activeCallId).toBeUndefined();
  });

  it('naît en tenant la réservation de l’appel qui le fait naître : aucune prise à annoncer (audit #19650)', async () => {
    const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'g-new', title: null, ...data }));
    const prisma = { user: { findMany: jest.fn(async () => USERS) }, conversation: { create } };
    await createCallGroup(
      { prisma: prisma as never, regime: async () => ({ encryptionMode: 'server' }) },
      { inviterUserId: 'bob', memberUserIds: ['alice', 'bob', 'dave'], callId: 'call-1' }
    );
    expect(create.mock.calls[0][0].data).toMatchObject({ activeCallId: 'call-1', firstMessageSentAt: null });
  });
});
