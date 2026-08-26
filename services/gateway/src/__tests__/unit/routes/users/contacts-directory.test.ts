/**
 * Unit tests for the persisted address book routes (contacts-directory.ts).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const mockResolveForTargets = jest.fn<any>();
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (...args: any[]) => mockResolveForTargets(...args),
  }),
}));

import {
  syncContactsDirectory,
  getContactsDirectory,
  clearContactsDirectory,
} from '../../../../routes/users/contacts-directory';

const FULL = { showOnline: true, showLastSeenTimestamp: true };
const HIDDEN = { showOnline: false, showLastSeenTimestamp: false };

beforeEach(() => {
  mockResolveForTargets.mockReset().mockImplementation(async (_viewer: unknown, ids: string[]) =>
    new Map(ids.map((id) => [id, FULL])),
  );
});

const CURRENT_USER_ID = '507f1f77bcf86cd799439011';
const AWA_ID = '507f1f77bcf86cd799439022';

const MATCHED_USER = {
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
};

const STORED_ENTRY = {
  id: 'contact-1',
  contactKey: 'key-1',
  displayName: 'Awa Diallo',
  phoneNumbers: ['+221771234567'],
  emails: ['awa@test.com'],
  usernames: [],
  matchedBy: 'phone',
  matchedAt: new Date('2026-07-01T00:00:00.000Z'),
  lastSyncedAt: new Date('2026-07-01T00:00:00.000Z'),
  matchedUser: { ...MATCHED_USER },
};

function makePrisma(options: { users?: any[]; entries?: any[]; total?: number } = {}) {
  const { users = [], entries = [], total = entries.length } = options;
  return {
    user: {
      findMany: jest.fn<any>().mockResolvedValue(users),
      findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
    },
    userContact: {
      upsert: jest.fn<any>().mockImplementation(async (args: any) => args),
      findMany: jest.fn<any>().mockResolvedValue(entries),
      count: jest.fn<any>().mockResolvedValue(total),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 2 }),
    },
  } as any;
}

async function buildApp(opts: { auth?: 'authenticated' | 'unauthenticated'; prisma?: any } = {}) {
  const { auth = 'authenticated', prisma = makePrisma() } = opts;
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = auth === 'authenticated'
      ? { isAuthenticated: true, type: 'user', userId: CURRENT_USER_ID, registeredUser: { id: CURRENT_USER_ID, role: 'USER' } }
      : { isAuthenticated: false, registeredUser: null };
  });
  await syncContactsDirectory(app);
  await getContactsDirectory(app);
  await clearContactsDirectory(app);
  await app.ready();
  return { app, prisma };
}

// ─── POST /users/me/contacts/sync ─────────────────────────────────────────────

describe('POST /users/me/contacts/sync', () => {
  it('rejects an unauthenticated caller', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/sync',
      payload: { contacts: [{ emails: ['awa@test.com'] }] },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('persists the address book and reports how many are on Meeshy', async () => {
    const prisma = makePrisma({ users: [MATCHED_USER] });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/sync',
      payload: {
        defaultCountry: 'SN',
        contacts: [
          { displayName: 'Awa', phoneNumbers: ['77 123 45 67'] },
          { displayName: 'Ghost', emails: ['ghost@test.com'] },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.syncedCount).toBe(2);
    expect(body.data.matchedCount).toBe(1);
    expect(prisma.userContact.upsert).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('stores the contact under the authenticated owner', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    await app.inject({
      method: 'POST',
      url: '/users/me/contacts/sync',
      payload: { contacts: [{ displayName: 'Awa', emails: ['awa@test.com'] }] },
    });
    expect(prisma.userContact.upsert.mock.calls[0][0].create).toEqual(
      expect.objectContaining({ ownerId: CURRENT_USER_ID })
    );
    await app.close();
  });

  it('purges vanished contacts only in replace mode', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/sync',
      payload: { mode: 'replace', contacts: [{ emails: ['awa@test.com'] }] },
    });
    expect(res.json().data.removedCount).toBe(2);
    expect(prisma.userContact.deleteMany).toHaveBeenCalled();
    await app.close();
  });

  it('defaults to merge mode so a partial upload never amputates the directory', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    await app.inject({
      method: 'POST',
      url: '/users/me/contacts/sync',
      payload: { contacts: [{ emails: ['awa@test.com'] }] },
    });
    expect(prisma.userContact.deleteMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('downgrades a truncated replace to a merge so the tail is not deleted', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    const contacts = Array.from({ length: 2001 }, (_, i) => ({ emails: [`u${i}@test.com`] }));
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/sync',
      payload: { mode: 'replace', contacts },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.processedContacts).toBe(2000);
    expect(prisma.userContact.deleteMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 400 when contacts is not an array', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/sync',
      payload: { contacts: 'nope' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 500 when persistence fails', async () => {
    const prisma = makePrisma();
    prisma.userContact.upsert = jest.fn<any>().mockRejectedValue(new Error('DB down'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/sync',
      payload: { contacts: [{ emails: ['awa@test.com'] }] },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

/**
 * Synchronisation par lots (contrat K2) — `syncStartedAt`/`isFinalBatch` sont
 * optionnels et rétrocompatibles : leur absence doit laisser le comportement
 * historique testé ci-dessus totalement inchangé (dont la rétrogradation
 * replace→merge d'un lot tronqué). Leur présence bascule la purge sur le
 * filigrane `lastSyncedAt`, jamais sur `contactKey notIn`.
 */
describe('POST /users/me/contacts/sync — synchronisation par lots', () => {
  it('always returns a server-clock syncStartedAt, even without the new batching fields', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    const before = Date.now();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/sync',
      payload: { contacts: [{ emails: ['awa@test.com'] }] },
    });
    const after = Date.now();
    const body = res.json();
    expect(typeof body.data.syncStartedAt).toBe('string');
    const parsed = Date.parse(body.data.syncStartedAt);
    expect(Number.isNaN(parsed)).toBe(false);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
    await app.close();
  });

  it('rejects a syncStartedAt more than 5 seconds in the future', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    const future = new Date(Date.now() + 10_000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/sync',
      payload: { contacts: [{ emails: ['awa@test.com'] }], syncStartedAt: future },
    });
    expect(res.statusCode).toBe(400);
    expect(prisma.userContact.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a syncStartedAt that does not parse as a date', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/sync',
      payload: { contacts: [{ emails: ['awa@test.com'] }], syncStartedAt: 'not-a-date' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('never purges via contactKey notIn once syncStartedAt is present, even with mode replace', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    const past = new Date(Date.now() - 1000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/sync',
      payload: { mode: 'replace', syncStartedAt: past, contacts: [{ emails: ['awa@test.com'] }] },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.userContact.deleteMany).not.toHaveBeenCalled();
    expect(res.json().data.removedCount).toBe(0);
    await app.close();
  });

  it('purges via the lastSyncedAt watermark on the final batch', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    const past = new Date(Date.now() - 1000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/sync',
      payload: { syncStartedAt: past, isFinalBatch: true, contacts: [{ emails: ['awa@test.com'] }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.removedCount).toBe(2);
    expect(prisma.userContact.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: CURRENT_USER_ID, lastSyncedAt: { lt: new Date(past) } },
    });
    await app.close();
  });

  it('treats a lone isFinalBatch request without a token as a complete single-batch sync', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/sync',
      payload: { isFinalBatch: true, contacts: [{ emails: ['awa@test.com'] }] },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.userContact.deleteMany).toHaveBeenCalled();
    await app.close();
  });

  it('never closes a truncated batch: the dropped tail must not be purged', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    const contacts = Array.from({ length: 2001 }, (_, i) => ({ emails: [`u${i}@test.com`] }));
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/sync',
      payload: { syncStartedAt: new Date(Date.now() - 1000).toISOString(), isFinalBatch: true, contacts },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.processedContacts).toBe(2000);
    expect(prisma.userContact.deleteMany).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── GET /users/me/contacts ───────────────────────────────────────────────────

describe('GET /users/me/contacts', () => {
  it('rejects an unauthenticated caller', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: '/users/me/contacts' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns the directory with the matched profile inlined', async () => {
    const prisma = makePrisma({ entries: [STORED_ENTRY], total: 1 });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/me/contacts' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].isOnMeeshy).toBe(true);
    expect(body.data[0].matchedUser.username).toBe('awa');
    expect(body.data[0].displayName).toBe('Awa Diallo');
    await app.close();
  });

  it('emits pagination at the root of the response', async () => {
    const prisma = makePrisma({ entries: [STORED_ENTRY], total: 42 });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/me/contacts?offset=0&limit=1' });
    const body = res.json();
    expect(body.pagination).toEqual({ offset: 0, limit: 1, total: 42, hasMore: true });
    await app.close();
  });

  it('scopes the query to the authenticated owner', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    await app.inject({ method: 'GET', url: '/users/me/contacts' });
    expect(prisma.userContact.findMany.mock.calls[0][0].where.ownerId).toBe(CURRENT_USER_ID);
    await app.close();
  });

  it('honours the meeshy filter', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    await app.inject({ method: 'GET', url: '/users/me/contacts?filter=meeshy' });
    expect(prisma.userContact.findMany.mock.calls[0][0].where.matchedUserId).toEqual({ not: null });
    await app.close();
  });

  it('falls back to the full directory for an unknown filter', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/me/contacts?filter=bogus' });
    expect(res.statusCode).toBe(200);
    expect(prisma.userContact.findMany.mock.calls[0][0].where.matchedUserId).toBeUndefined();
    await app.close();
  });

  it('returns an unmatched contact as invitable', async () => {
    const prisma = makePrisma({
      entries: [{ ...STORED_ENTRY, matchedUser: null, matchedBy: null }],
      total: 1,
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/me/contacts' });
    const body = res.json();
    expect(body.data[0].isOnMeeshy).toBe(false);
    expect(body.data[0].matchedUser).toBeNull();
    await app.close();
  });

  it('returns 500 when the query fails', async () => {
    const prisma = makePrisma();
    prisma.userContact.findMany = jest.fn<any>().mockRejectedValue(new Error('DB down'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/me/contacts' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('names the authenticated caller as the presence viewer', async () => {
    const prisma = makePrisma({ entries: [STORED_ENTRY], total: 1 });
    const { app } = await buildApp({ prisma });
    await app.inject({ method: 'GET', url: '/users/me/contacts' });
    expect(mockResolveForTargets).toHaveBeenCalledWith(
      { userId: CURRENT_USER_ID, role: 'USER' },
      [AWA_ID],
    );
    await app.close();
  });

  it('masks the presence the viewer may not see', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[AWA_ID, HIDDEN]]));
    const prisma = makePrisma({ entries: [STORED_ENTRY], total: 1 });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/me/contacts' });
    const matched = res.json().data[0].matchedUser;
    expect(matched.isOnline).toBe(false);
    expect(matched.lastActiveAt).toBeNull();
    await app.close();
  });

  it('serves a contact blocked since the last sync as invitable, not as a Meeshy account', async () => {
    const prisma = makePrisma({ entries: [STORED_ENTRY], total: 1 });
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ blockedUserIds: [AWA_ID] });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/me/contacts' });
    const entry = res.json().data[0];
    expect(entry.matchedUser).toBeNull();
    expect(entry.isOnMeeshy).toBe(false);
    expect(entry.displayName).toBe('Awa Diallo');
    await app.close();
  });
});

// ─── DELETE /users/me/contacts ────────────────────────────────────────────────

describe('DELETE /users/me/contacts', () => {
  it('rejects an unauthenticated caller', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'DELETE', url: '/users/me/contacts' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('erases every entry of the caller', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: '/users/me/contacts' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.removedCount).toBe(2);
    expect(prisma.userContact.deleteMany).toHaveBeenCalledWith({ where: { ownerId: CURRENT_USER_ID } });
    await app.close();
  });
});
