/**
 * Résolution d'une carte de visite partagée vers les comptes Meeshy (#8101).
 *
 * Le double évalue les `where` contre des documents en mémoire (champ ABSENT
 * ≠ `null`) et PROJETTE chaque `select` : ce que la résolution n'a pas
 * demandé à la base ne peut pas atteindre la réponse.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

import { ContactCardResolver } from '../../../services/ContactCardResolver';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

const VIEWER_ID = '507f1f77bcf86cd799439011';
const AWA_ID = '507f1f77bcf86cd799439022';
const BOB_ID = '507f1f77bcf86cd799439033';
const CAT_ID = '507f1f77bcf86cd799439044';
const DAN_ID = '507f1f77bcf86cd799439055';

const PUBLIC_KEYS = ['avatarUrl', 'bannerUrl', 'bio', 'displayName', 'relation', 'userId', 'username'];

const makeUser = (overrides: MongoDocument = {}): MongoDocument => ({
  id: AWA_ID,
  username: 'awa',
  firstName: 'Awa',
  lastName: 'Diallo',
  displayName: 'Awa D.',
  avatar: 'https://cdn.meeshy.me/a.jpg',
  banner: 'https://cdn.meeshy.me/b.jpg',
  bio: 'Photographe à Dakar',
  isActive: true,
  isOnline: true,
  lastActiveAt: new Date('2026-09-01T00:00:00.000Z'),
  role: 'ADMIN',
  phoneNumber: '+33612345678',
  email: 'awa@example.com',
  blockedUserIds: [],
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  ...overrides,
});

const viewer = (overrides: MongoDocument = {}): MongoDocument =>
  makeUser({
    id: VIEWER_ID,
    username: 'moi',
    phoneNumber: '+221770000000',
    email: 'moi@example.com',
    phoneCountryCode: 'FR',
    ...overrides,
  });

const project = (row: MongoDocument, select: MongoDocument | undefined): MongoDocument =>
  select ? Object.fromEntries(Object.keys(select).filter((key) => key in row).map((key) => [key, row[key]])) : row;

type Store = {
  readonly users: readonly MongoDocument[];
  readonly friendRequests?: readonly MongoDocument[];
  readonly preferences?: readonly MongoDocument[];
};

function makePrisma(store: Store) {
  const query = (rows: readonly MongoDocument[]) =>
    jest.fn(async (args: { where?: MongoDocument; select?: MongoDocument } = {}) =>
      rows.filter((row) => matchesMongoWhere(row, args.where)).map((row) => project(row, args.select)),
    );
  return {
    user: {
      findMany: query(store.users),
      findUnique: jest.fn(async (args: { where: { id: string }; select?: MongoDocument }) => {
        const row = store.users.find((user) => user.id === args.where.id);
        return row ? project(row, args.select) : null;
      }),
    },
    friendRequest: { findMany: query(store.friendRequests ?? []) },
    userPreferences: { findMany: query(store.preferences ?? []) },
    userPreference: { findMany: query([]) },
  };
}

const resolve = async (store: Store, body: { phones?: string[]; emails?: string[]; defaultCountry?: string }) => {
  const prisma = makePrisma(store);
  const resolver = new ContactCardResolver(prisma as never);
  const accounts = await resolver.resolve({
    viewerId: VIEWER_ID,
    phones: body.phones ?? [],
    emails: body.emails ?? [],
    defaultCountry: body.defaultCountry,
  });
  return { accounts, prisma };
};

describe('ContactCardResolver — ce qui sort', () => {
  it('rend le profil public du compte dont le numéro figure dans la vCard', async () => {
    const { accounts } = await resolve({ users: [viewer(), makeUser()] }, { phones: ['+33 6 12 34 56 78'] });
    expect(accounts).toEqual([
      {
        userId: AWA_ID,
        displayName: 'Awa D.',
        username: 'awa',
        avatarUrl: 'https://cdn.meeshy.me/a.jpg',
        bannerUrl: 'https://cdn.meeshy.me/b.jpg',
        bio: 'Photographe à Dakar',
        relation: 'none',
      },
    ]);
  });

  it('ne sert JAMAIS l’e-mail, le téléphone, la présence, le rôle ni les dates du compte', async () => {
    const { accounts } = await resolve({ users: [viewer(), makeUser()] }, { emails: ['awa@example.com'] });
    expect(Object.keys(accounts[0] ?? {}).sort()).toEqual(PUBLIC_KEYS);
    const wire = JSON.stringify(accounts);
    expect(wire).not.toContain('+33612345678');
    expect(wire).not.toContain('awa@example.com');
    expect(wire).not.toContain('2026-09-01');
    expect(wire).not.toContain('ADMIN');
  });

  it('ne demande à la base aucune colonne sensible pour composer le profil', async () => {
    const { prisma } = await resolve({ users: [viewer(), makeUser()] }, { phones: ['+33612345678'] });
    const profileSelect = prisma.user.findMany.mock.calls
      .map(([args]) => (args as { select?: MongoDocument }).select ?? {})
      .find((select) => 'bio' in select);
    expect(Object.keys(profileSelect ?? {}).sort()).toEqual(
      ['avatar', 'banner', 'bio', 'displayName', 'firstName', 'id', 'lastName', 'username'].sort(),
    );
  });

  it('lit un numéro LOCAL dans le pays du numéro du lecteur', async () => {
    const { accounts } = await resolve({ users: [viewer({ phoneCountryCode: 'FR' }), makeUser()] }, { phones: ['06 12 34 56 78'] });
    expect(accounts.map((account) => account.userId)).toEqual([AWA_ID]);
  });

  it('préfère le pays explicitement fourni', async () => {
    const senegal = makeUser({ phoneNumber: '+221771234567' });
    const { accounts } = await resolve({ users: [viewer({ phoneCountryCode: 'FR' }), senegal] }, { phones: ['77 123 45 67'], defaultCountry: 'SN' });
    expect(accounts.map((account) => account.userId)).toEqual([AWA_ID]);
  });

  it('apparie un e-mail sans tenir compte de la casse', async () => {
    const { accounts } = await resolve({ users: [viewer(), makeUser()] }, { emails: ['  AWA@Example.COM '] });
    expect(accounts.map((account) => account.userId)).toEqual([AWA_ID]);
  });

  it('compose le nom affiché quand le compte n’en a pas', async () => {
    const { accounts } = await resolve({ users: [viewer(), makeUser({ displayName: null })] }, { phones: ['+33612345678'] });
    expect(accounts[0]?.displayName).toBe('Awa Diallo');
  });

  it('sert une bio vide comme null', async () => {
    const { accounts } = await resolve({ users: [viewer(), makeUser({ bio: '' })] }, { phones: ['+33612345678'] });
    expect(accounts[0]?.bio).toBeNull();
  });

  it('dédoublonne un compte trouvé par son numéro ET son e-mail, et borne à trois comptes', async () => {
    const users = [
      viewer(),
      makeUser(),
      makeUser({ id: BOB_ID, username: 'bob', phoneNumber: '+33611111111', email: 'bob@example.com' }),
      makeUser({ id: CAT_ID, username: 'cat', phoneNumber: '+33622222222', email: 'cat@example.com' }),
      makeUser({ id: DAN_ID, username: 'dan', phoneNumber: '+33633333333', email: 'dan@example.com' }),
    ];
    const { accounts } = await resolve(
      { users },
      { phones: ['+33612345678', '+33611111111', '+33622222222', '+33633333333'], emails: ['awa@example.com'] },
    );
    expect(accounts.map((account) => account.userId)).toEqual([AWA_ID, BOB_ID, CAT_ID]);
  });

  it('ne rend rien et n’interroge rien pour une carte sans identifiant exploitable', async () => {
    const { accounts, prisma } = await resolve({ users: [viewer(), makeUser()] }, { phones: ['SOS', '*123#'], emails: ['pas-un-mail'] });
    expect(accounts).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});

describe('ContactCardResolver — qui est écarté', () => {
  it('écarte un compte désactivé ou supprimé', async () => {
    const users = [viewer(), makeUser({ isActive: false }), makeUser({ id: BOB_ID, phoneNumber: '+33611111111', deletedAt: new Date() })];
    const { accounts } = await resolve({ users }, { phones: ['+33612345678', '+33611111111'] });
    expect(accounts).toEqual([]);
  });

  it('écarte un compte que le lecteur a bloqué', async () => {
    const { accounts } = await resolve({ users: [viewer({ blockedUserIds: [AWA_ID] }), makeUser()] }, { phones: ['+33612345678'] });
    expect(accounts).toEqual([]);
  });

  it('écarte un compte qui a bloqué le lecteur', async () => {
    const { accounts } = await resolve({ users: [viewer(), makeUser({ blockedUserIds: [VIEWER_ID] })] }, { phones: ['+33612345678'] });
    expect(accounts).toEqual([]);
  });

  it('écarte un compte masqué de la recherche, sauf pour un ami', async () => {
    const preferences = [{ userId: AWA_ID, privacy: { hideProfileFromSearch: true } }];
    const hidden = await resolve({ users: [viewer(), makeUser()], preferences }, { phones: ['+33612345678'] });
    expect(hidden.accounts).toEqual([]);

    const friendRequests = [{ senderId: VIEWER_ID, receiverId: AWA_ID, status: 'accepted' }];
    const friend = await resolve({ users: [viewer(), makeUser()], preferences, friendRequests }, { phones: ['+33612345678'] });
    expect(friend.accounts.map((account) => account.relation)).toEqual(['friend']);
  });
});

describe('ContactCardResolver — relation du lecteur', () => {
  const relationFor = async (friendRequests: readonly MongoDocument[]) =>
    (await resolve({ users: [viewer(), makeUser()], friendRequests }, { phones: ['+33612345678'] })).accounts[0]?.relation;

  it('ami, demande envoyée, demande reçue, aucune', async () => {
    expect(await relationFor([{ senderId: AWA_ID, receiverId: VIEWER_ID, status: 'accepted' }])).toBe('friend');
    expect(await relationFor([{ senderId: VIEWER_ID, receiverId: AWA_ID, status: 'pending' }])).toBe('request-sent');
    expect(await relationFor([{ senderId: AWA_ID, receiverId: VIEWER_ID, status: 'pending' }])).toBe('request-received');
    expect(await relationFor([{ senderId: AWA_ID, receiverId: VIEWER_ID, status: 'rejected' }])).toBe('none');
    expect(await relationFor([])).toBe('none');
  });

  it('une amitié acceptée l’emporte sur une demande restée en attente', async () => {
    expect(
      await relationFor([
        { senderId: VIEWER_ID, receiverId: AWA_ID, status: 'pending' },
        { senderId: AWA_ID, receiverId: VIEWER_ID, status: 'accepted' },
      ]),
    ).toBe('friend');
  });

  it('reconnaît la propre carte du lecteur', async () => {
    const { accounts } = await resolve({ users: [viewer(), makeUser()] }, { emails: ['MOI@example.com'] });
    expect(accounts.map((account) => [account.userId, account.relation])).toEqual([[VIEWER_ID, 'self']]);
  });
});
