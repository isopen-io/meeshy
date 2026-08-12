/**
 * Unit tests for contacts matching route (contacts-match.ts)
 * Tests POST /users/me/contacts/match — carnet d'adresses → utilisateurs Meeshy.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { matchContacts } from '../../../../routes/users/contacts-match';

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_USER_ID = '507f1f77bcf86cd799439011';
const MATCHED_USER = {
  id: '507f1f77bcf86cd799439022',
  username: 'awa',
  firstName: 'Awa',
  lastName: 'Diallo',
  displayName: 'Awa D.',
  avatar: null,
  isOnline: true,
  lastActiveAt: new Date('2026-07-01'),
  phoneNumber: '+221771234567',
  email: 'awa@test.com',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(users: any[] = []) {
  return {
    user: {
      findMany: jest.fn<any>().mockResolvedValue(users),
    },
  } as any;
}

async function buildApp(opts: {
  auth?: 'authenticated' | 'unauthenticated';
  prisma?: ReturnType<typeof makePrisma>;
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const { auth = 'authenticated', prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = auth === 'authenticated'
      ? { isAuthenticated: true, userId: CURRENT_USER_ID, registeredUser: { id: CURRENT_USER_ID } }
      : { isAuthenticated: false, registeredUser: null };
  });

  await matchContacts(app);
  await app.ready();
  return { app, prisma };
}

// ─── POST /users/me/contacts/match ────────────────────────────────────────────

describe('POST /users/me/contacts/match — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: { contacts: [{ phoneNumbers: ['+33612345678'] }] },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /users/me/contacts/match — empty contacts', () => {
  it('returns 400 when contacts array is empty', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: { contacts: [] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /users/me/contacts/match — phone match', () => {
  it('matches a contact by normalized phone number and echoes contact name', async () => {
    const prisma = makePrisma([MATCHED_USER]);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: {
        defaultCountry: 'SN',
        contacts: [
          { displayName: 'Awa du bureau', phoneNumbers: ['77 123 45 67'] },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.matches).toHaveLength(1);
    expect(body.data.matches[0].user.username).toBe('awa');
    expect(body.data.matches[0].matchedBy).toBe('phone');
    expect(body.data.matches[0].contactDisplayName).toBe('Awa du bureau');
    expect(body.data.matchedCount).toBe(1);
    expect(body.data.totalContacts).toBe(1);
    await app.close();
  });
});

describe('POST /users/me/contacts/match — tolerant to messy device contacts', () => {
  it('does not reject the whole batch when a contact has more than 5 phone numbers', async () => {
    const prisma = makePrisma([MATCHED_USER]);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: {
        defaultCountry: 'SN',
        contacts: [
          {
            displayName: 'Awa multi-lignes',
            phoneNumbers: [
              '77 000 00 01', '77 000 00 02', '77 000 00 03',
              '77 000 00 04', '77 000 00 05', '77 000 00 06',
              '77 123 45 67',
            ],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.matches).toHaveLength(1);
    await app.close();
  });

  it('drops unknown extra fields instead of rejecting the payload', async () => {
    const prisma = makePrisma([MATCHED_USER]);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: {
        contacts: [
          { phoneNumbers: ['+221771234567'], note: 'champ client inconnu', starred: true },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.matches).toHaveLength(1);
    await app.close();
  });
});

describe('POST /users/me/contacts/match — email match', () => {
  it('matches a contact by lowercased email', async () => {
    const prisma = makePrisma([MATCHED_USER]);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: {
        contacts: [{ displayName: 'Awa', emails: ['AWA@Test.com'] }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.matches).toHaveLength(1);
    expect(body.data.matches[0].matchedBy).toBe('email');
    await app.close();
  });
});

describe('POST /users/me/contacts/match — excludes self', () => {
  it('never queries without excluding the current user', async () => {
    const prisma = makePrisma([]);
    const { app } = await buildApp({ prisma });
    await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: { contacts: [{ phoneNumbers: ['+33612345678'] }] },
    });
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ not: CURRENT_USER_ID });
    await app.close();
  });
});

describe('POST /users/me/contacts/match — no valid identifier', () => {
  it('returns empty matches without querying when nothing is normalizable', async () => {
    const prisma = makePrisma([]);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: { contacts: [{ displayName: 'Sans numéro', phoneNumbers: ['abc'] }] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.matches).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /users/me/contacts/match — payload too large', () => {
  it('returns 400 when more than 2000 contacts are sent', async () => {
    const { app } = await buildApp();
    const contacts = Array.from({ length: 2001 }, (_, i) => ({
      phoneNumbers: [`+3361234${String(i).padStart(4, '0')}`],
    }));
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: { contacts },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /users/me/contacts/match — database error', () => {
  it('returns 500 when the query fails', async () => {
    const prisma = {
      user: { findMany: jest.fn<any>().mockRejectedValue(new Error('DB down')) },
    } as any;
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: { contacts: [{ phoneNumbers: ['+33612345678'] }] },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
