/**
 * Unit tests for contacts matching route (contacts-match.ts)
 * Tests POST /users/me/contacts/match — carnet d'adresses → utilisateurs Meeshy.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
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

const mockResolveForTargets = jest.fn<any>();
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (...args: any[]) => mockResolveForTargets(...args),
  }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { matchContacts } from '../../../../routes/users/contacts-match';

const FULL = { showOnline: true, showLastSeenTimestamp: true };
const HIDDEN = { showOnline: false, showLastSeenTimestamp: false };

beforeEach(() => {
  mockResolveForTargets.mockReset().mockImplementation(async (_viewer: unknown, ids: string[]) =>
    new Map(ids.map((id) => [id, FULL])),
  );
});

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
      findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
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
      ? { isAuthenticated: true, type: 'user', userId: CURRENT_USER_ID, registeredUser: { id: CURRENT_USER_ID, role: 'USER' } }
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
  it('returns an empty match set without querying the database', async () => {
    // Un carnet vide (permission accordée, aucun contact) est un état normal,
    // pas une erreur client : renvoyer 400 faisait remonter « erreur gateway »
    // dans l'app pour un cas parfaitement légitime.
    const { app, prisma } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: { contacts: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.matches).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
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
    expect(where.id.notIn).toContain(CURRENT_USER_ID);
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

describe('POST /users/me/contacts/match — oversized payload', () => {
  it('truncates instead of rejecting, and reports what it processed', async () => {
    // Un carnet plus gros que la borne ne doit pas faire ÉCHOUER la recherche
    // de contacts : on traite les 2000 premiers et on dit au client combien
    // ont été traités, pour qu'il pagine le reste.
    const { app } = await buildApp();
    const contacts = Array.from({ length: 2001 }, (_, i) => ({
      phoneNumbers: [`+3361234${String(i).padStart(4, '0')}`],
    }));
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: { contacts },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.totalContacts).toBe(2001);
    expect(body.data.processedContacts).toBe(2000);
    await app.close();
  });

  it('returns 400 when contacts is not an array', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: { contacts: 'nope' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /users/me/contacts/match — messy address book never fails the batch', () => {
  it('accepts an address book full of short codes, labels and empty strings', async () => {
    const prisma = makePrisma([MATCHED_USER]);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: {
        defaultCountry: 'SN',
        contacts: [
          { displayName: 'Repondeur', phoneNumbers: ['*123#'] },
          { displayName: 'Urgences', phoneNumbers: ['112', 'SOS', '', '   '] },
          { displayName: 'x'.repeat(600), phoneNumbers: ['+999 000 111 222'], emails: ['pas-un-email'] },
          { displayName: 'Awa', phoneNumbers: ['77 123 45 67'] },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.matches).toHaveLength(1);
    await app.close();
  });

  it('ignores a non ISO-3166 alpha-2 default country instead of rejecting', async () => {
    // `Locale.current.region?.identifier` peut valoir "419" (Amérique latine).
    const prisma = makePrisma([MATCHED_USER]);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: {
        defaultCountry: '419',
        contacts: [{ displayName: 'Awa', phoneNumbers: ['+221771234567'] }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.matches).toHaveLength(1);
    await app.close();
  });

  it('tolerates malformed entries mixed into the batch', async () => {
    const prisma = makePrisma([MATCHED_USER]);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: {
        contacts: [
          { phoneNumbers: 'not-an-array' },
          { emails: [null, 42] },
          { displayName: 'Awa', emails: ['awa@test.com'] },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.matches).toHaveLength(1);
    await app.close();
  });
});

describe('POST /users/me/contacts/match — vCard pseudo', () => {
  it('matches a contact by its vCard nickname when no phone or email matches', async () => {
    const prisma = makePrisma([{ ...MATCHED_USER, phoneNumber: null, email: 'other@test.com' }]);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: { contacts: [{ displayName: 'Awa', usernames: ['@Awa'] }] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.matches).toHaveLength(1);
    expect(body.data.matches[0].matchedBy).toBe('username');
    await app.close();
  });
});

/**
 * Le rapprochement est une porte de sortie de profils : `isOnline` / `lastActiveAt`
 * y passent par le même gate STRICT que `/users/search`, jamais bruts.
 */
describe('POST /users/me/contacts/match — gate de présence', () => {
  it('masks the presence of a matched profile the viewer may not see', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[MATCHED_USER.id, HIDDEN]]));
    const prisma = makePrisma([MATCHED_USER]);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: { contacts: [{ displayName: 'Awa', phoneNumbers: ['+221771234567'] }] },
    });
    expect(res.statusCode).toBe(200);
    const matched = res.json().data.matches[0].user;
    expect(matched.isOnline).toBe(false);
    expect(matched.lastActiveAt).toBeNull();
    expect(matched.username).toBe('awa');
    await app.close();
  });

  it('serves the presence the resolver allows', async () => {
    const prisma = makePrisma([MATCHED_USER]);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: { contacts: [{ displayName: 'Awa', phoneNumbers: ['+221771234567'] }] },
    });
    const matched = res.json().data.matches[0].user;
    expect(matched.isOnline).toBe(true);
    expect(matched.lastActiveAt).toBe(MATCHED_USER.lastActiveAt.toISOString());
    await app.close();
  });

  it('resolves the presence for the authenticated viewer', async () => {
    const prisma = makePrisma([MATCHED_USER]);
    const { app } = await buildApp({ prisma });
    await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: { contacts: [{ displayName: 'Awa', phoneNumbers: ['+221771234567'] }] },
    });
    expect(mockResolveForTargets).toHaveBeenCalledWith(
      { userId: CURRENT_USER_ID, role: 'USER' },
      [MATCHED_USER.id],
    );
    await app.close();
  });

  it('does not resolve anything when nothing matched', async () => {
    const prisma = makePrisma([]);
    const { app } = await buildApp({ prisma });
    await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: { contacts: [{ displayName: 'Ghost', phoneNumbers: ['+221771234567'] }] },
    });
    expect(mockResolveForTargets).not.toHaveBeenCalled();
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
