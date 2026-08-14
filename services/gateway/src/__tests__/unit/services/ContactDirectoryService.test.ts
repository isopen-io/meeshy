/**
 * Unit tests for ContactDirectoryService — répertoire persisté.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

import { ContactDirectoryService } from '../../../services/ContactDirectoryService';
import { normalizeContacts } from '../../../utils/contact-identifiers';

const OWNER_ID = '507f1f77bcf86cd799439011';
const AWA_ID = '507f1f77bcf86cd799439022';
const BOB_ID = '507f1f77bcf86cd799439033';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: AWA_ID,
    username: 'awa',
    firstName: 'Awa',
    lastName: 'Diallo',
    displayName: 'Awa D.',
    avatar: null,
    isOnline: true,
    lastActiveAt: new Date('2026-07-01T00:00:00.000Z'),
    phoneNumber: '+221771234567',
    email: 'awa@test.com',
    ...overrides,
  };
}

function makePrisma(options: {
  users?: unknown[];
  owner?: { blockedUserIds: string[] } | null;
  existing?: unknown[];
  count?: number;
} = {}) {
  const { users = [], owner = { blockedUserIds: [] }, existing = [], count = existing.length } = options;
  return {
    user: {
      findMany: jest.fn<any>().mockResolvedValue(users),
      findUnique: jest.fn<any>().mockResolvedValue(owner),
    },
    userContact: {
      upsert: jest.fn<any>().mockImplementation(async (args: any) => args),
      findMany: jest.fn<any>().mockResolvedValue(existing),
      count: jest.fn<any>().mockResolvedValue(count),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 3 }),
    },
  } as any;
}

describe('ContactDirectoryService.match', () => {
  it('matches a contact by normalized phone number', async () => {
    const prisma = makePrisma({ users: [makeUser()] });
    const service = new ContactDirectoryService(prisma);
    const contacts = normalizeContacts([{ displayName: 'Awa', phoneNumbers: ['77 123 45 67'] }], 'SN');

    const matches = await service.match({ contacts, excludeUserId: OWNER_ID });

    const match = matches.get(contacts[0].contactKey);
    expect(match?.user.id).toBe(AWA_ID);
    expect(match?.matchedBy).toBe('phone');
  });

  it('matches by email when no phone matches', async () => {
    const prisma = makePrisma({ users: [makeUser({ phoneNumber: null })] });
    const service = new ContactDirectoryService(prisma);
    const contacts = normalizeContacts([{ emails: ['AWA@test.com'] }]);

    const match = (await service.match({ contacts, excludeUserId: OWNER_ID })).get(contacts[0].contactKey);
    expect(match?.matchedBy).toBe('email');
  });

  it('matches by vCard pseudo when neither phone nor email matches', async () => {
    const prisma = makePrisma({ users: [makeUser({ phoneNumber: null, email: 'other@test.com' })] });
    const service = new ContactDirectoryService(prisma);
    const contacts = normalizeContacts([{ usernames: ['@Awa'] }]);

    const match = (await service.match({ contacts, excludeUserId: OWNER_ID })).get(contacts[0].contactKey);
    expect(match?.matchedBy).toBe('username');
    expect(match?.user.username).toBe('awa');
  });

  it('prefers the phone match over email and pseudo for the same contact', async () => {
    const prisma = makePrisma({ users: [makeUser()] });
    const service = new ContactDirectoryService(prisma);
    const contacts = normalizeContacts(
      [{ phoneNumbers: ['+221771234567'], emails: ['awa@test.com'], usernames: ['awa'] }]
    );

    const match = (await service.match({ contacts, excludeUserId: OWNER_ID })).get(contacts[0].contactKey);
    expect(match?.matchedBy).toBe('phone');
  });

  it('excludes the requesting user from its own address book matches', async () => {
    const prisma = makePrisma({ users: [] });
    const service = new ContactDirectoryService(prisma);
    const contacts = normalizeContacts([{ emails: ['me@test.com'] }]);

    await service.match({ contacts, excludeUserId: OWNER_ID });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: expect.objectContaining({ notIn: [OWNER_ID] }) }) })
    );
  });

  it('excludes users the owner has blocked', async () => {
    const prisma = makePrisma({ users: [], owner: { blockedUserIds: [BOB_ID] } });
    const service = new ContactDirectoryService(prisma);
    const contacts = normalizeContacts([{ emails: ['bob@test.com'] }]);

    await service.match({ contacts, excludeUserId: OWNER_ID });

    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.id.notIn).toEqual(expect.arrayContaining([OWNER_ID, BOB_ID]));
    expect(where.NOT).toEqual({ blockedUserIds: { has: OWNER_ID } });
  });

  it('does not hit the database when no contact carries an identifier', async () => {
    const prisma = makePrisma();
    const service = new ContactDirectoryService(prisma);

    const matches = await service.match({ contacts: [], excludeUserId: OWNER_ID });

    expect(matches.size).toBe(0);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('leaves a contact unmatched when no account carries its identifiers', async () => {
    const prisma = makePrisma({ users: [] });
    const service = new ContactDirectoryService(prisma);
    const contacts = normalizeContacts([{ emails: ['ghost@test.com'] }]);

    const matches = await service.match({ contacts, excludeUserId: OWNER_ID });
    expect(matches.get(contacts[0].contactKey)).toBeUndefined();
  });
});

describe('ContactDirectoryService.sync', () => {
  it('persists every contact and reports how many are on Meeshy', async () => {
    const prisma = makePrisma({ users: [makeUser()] });
    const service = new ContactDirectoryService(prisma);
    const contacts = normalizeContacts([
      { displayName: 'Awa', phoneNumbers: ['+221771234567'] },
      { displayName: 'Ghost', emails: ['ghost@test.com'] },
    ]);

    const result = await service.sync({ ownerId: OWNER_ID, contacts });

    expect(prisma.userContact.upsert).toHaveBeenCalledTimes(2);
    expect(result).toEqual(expect.objectContaining({ synced: 2, matched: 1, removed: 0 }));
  });

  it('upserts on the (owner, contactKey) pair so a re-sync does not duplicate', async () => {
    const prisma = makePrisma({ users: [] });
    const service = new ContactDirectoryService(prisma);
    const contacts = normalizeContacts([{ displayName: 'Awa', emails: ['awa@test.com'] }]);

    await service.sync({ ownerId: OWNER_ID, contacts });

    const args = prisma.userContact.upsert.mock.calls[0][0];
    expect(args.where).toEqual({
      ownerId_contactKey: { ownerId: OWNER_ID, contactKey: contacts[0].contactKey },
    });
    expect(args.create).toEqual(expect.objectContaining({ ownerId: OWNER_ID, emails: ['awa@test.com'] }));
  });

  it('clears a stale match when the matched account disappeared', async () => {
    const prisma = makePrisma({ users: [] });
    const service = new ContactDirectoryService(prisma);
    const contacts = normalizeContacts([{ emails: ['awa@test.com'] }]);

    await service.sync({ ownerId: OWNER_ID, contacts });

    const args = prisma.userContact.upsert.mock.calls[0][0];
    expect(args.update).toEqual(expect.objectContaining({ matchedUserId: null, matchedBy: null, matchedAt: null }));
  });

  it('in merge mode it never deletes entries absent from the payload', async () => {
    const prisma = makePrisma({ users: [] });
    const service = new ContactDirectoryService(prisma);
    const contacts = normalizeContacts([{ emails: ['awa@test.com'] }]);

    const result = await service.sync({ ownerId: OWNER_ID, contacts, mode: 'merge' });

    expect(prisma.userContact.deleteMany).not.toHaveBeenCalled();
    expect(result.removed).toBe(0);
  });

  it('in replace mode it purges entries the device no longer carries', async () => {
    const prisma = makePrisma({ users: [] });
    const service = new ContactDirectoryService(prisma);
    const contacts = normalizeContacts([{ emails: ['awa@test.com'] }]);

    const result = await service.sync({ ownerId: OWNER_ID, contacts, mode: 'replace' });

    expect(prisma.userContact.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: OWNER_ID, contactKey: { notIn: [contacts[0].contactKey] } },
    });
    expect(result.removed).toBe(3);
  });

  it('an empty payload in replace mode wipes the directory', async () => {
    const prisma = makePrisma({ users: [] });
    const service = new ContactDirectoryService(prisma);

    const result = await service.sync({ ownerId: OWNER_ID, contacts: [], mode: 'replace' });

    expect(prisma.userContact.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: OWNER_ID, contactKey: { notIn: [] } },
    });
    expect(result.synced).toBe(0);
  });
});

describe('ContactDirectoryService.list', () => {
  const storedEntry = {
    id: 'contact-1',
    contactKey: 'key-1',
    displayName: 'Awa Diallo',
    phoneNumbers: ['+221771234567'],
    emails: ['awa@test.com'],
    usernames: [],
    matchedBy: 'phone',
    matchedAt: new Date('2026-07-01T00:00:00.000Z'),
    lastSyncedAt: new Date('2026-07-01T00:00:00.000Z'),
    matchedUser: makeUser(),
  };

  it('returns the directory with its matched profile inlined', async () => {
    const prisma = makePrisma({ existing: [storedEntry], count: 1 });
    const service = new ContactDirectoryService(prisma);

    const result = await service.list({ ownerId: OWNER_ID, offset: 0, limit: 50 });

    expect(result.contacts[0].isOnMeeshy).toBe(true);
    expect(result.contacts[0].matchedUser?.username).toBe('awa');
    expect(result.total).toBe(1);
  });

  it('marks an unmatched contact as invitable', async () => {
    const prisma = makePrisma({ existing: [{ ...storedEntry, matchedUser: null, matchedBy: null }], count: 1 });
    const service = new ContactDirectoryService(prisma);

    const result = await service.list({ ownerId: OWNER_ID, offset: 0, limit: 50 });

    expect(result.contacts[0].isOnMeeshy).toBe(false);
    expect(result.contacts[0].matchedUser).toBeNull();
  });

  it('filters down to contacts present on Meeshy', async () => {
    const prisma = makePrisma({ existing: [storedEntry], count: 1 });
    const service = new ContactDirectoryService(prisma);

    await service.list({ ownerId: OWNER_ID, offset: 0, limit: 50, filter: 'meeshy' });

    expect(prisma.userContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ matchedUserId: { not: null } }) })
    );
  });

  it('filters down to contacts still to invite', async () => {
    const prisma = makePrisma({ existing: [], count: 0 });
    const service = new ContactDirectoryService(prisma);

    await service.list({ ownerId: OWNER_ID, offset: 0, limit: 50, filter: 'invitable' });

    expect(prisma.userContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ matchedUserId: null }) })
    );
  });

  it('searches on the contact name as stored in the address book', async () => {
    const prisma = makePrisma({ existing: [], count: 0 });
    const service = new ContactDirectoryService(prisma);

    await service.list({ ownerId: OWNER_ID, offset: 0, limit: 50, query: 'awa' });

    const where = prisma.userContact.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([{ displayName: { contains: 'awa', mode: 'insensitive' } }])
    );
  });

  it('clamps the page size', async () => {
    const prisma = makePrisma({ existing: [], count: 0 });
    const service = new ContactDirectoryService(prisma);

    await service.list({ ownerId: OWNER_ID, offset: 0, limit: 10_000 });

    expect(prisma.userContact.findMany.mock.calls[0][0].take).toBe(200);
  });
});

describe('ContactDirectoryService.clear', () => {
  it('removes every entry of the owner and reports the count', async () => {
    const prisma = makePrisma();
    const service = new ContactDirectoryService(prisma);

    const removed = await service.clear(OWNER_ID);

    expect(prisma.userContact.deleteMany).toHaveBeenCalledWith({ where: { ownerId: OWNER_ID } });
    expect(removed).toBe(3);
  });
});
