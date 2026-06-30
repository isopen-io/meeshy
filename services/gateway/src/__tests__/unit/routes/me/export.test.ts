/**
 * Unit tests for routes/me/export.ts
 * Tests the GET /export data portability endpoint.
 *
 * Note: The response schema uses `data: { type: 'object' }` without specific properties,
 * so fast-json-stringify strips dynamic data fields. Tests verify status codes and
 * the prisma calls made (behavioral testing) rather than serialized response content.
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

// ─── Import after mocks ───────────────────────────────────────────────────────

import { dataExportRoutes } from '../../../../routes/me/export';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'usr-export-test-0001';

const mockUser = {
  id: USER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice',
  lastName: 'Smith', email: 'alice@example.com', phoneNumber: null, bio: null,
  avatar: null, banner: null, systemLanguage: 'fr', regionalLanguage: null,
  customDestinationLanguage: null, timezone: 'Europe/Paris',
  createdAt: new Date('2024-01-01'), lastActiveAt: new Date('2024-06-01'),
};

const mockMessages = [{
  id: 'msg-1', conversationId: 'conv-1', content: 'Hello', originalLanguage: 'fr',
  messageType: 'text', messageSource: 'user', createdAt: new Date('2024-06-01'), editedAt: null,
}];

const mockParticipations = [{
  conversationId: 'conv-1', role: 'member', joinedAt: new Date('2024-01-15'),
  conversation: {
    id: 'conv-1', title: 'Work Chat', type: 'group', createdAt: new Date('2024-01-15'),
    participants: [
      { userId: USER_ID, displayName: 'Alice', avatar: null, type: 'user' },
      { userId: 'user-2', displayName: 'Bob', avatar: null, type: 'user' },
    ],
  },
}];

function makeMocks() {
  return {
    userFindUnique: jest.fn<any>().mockResolvedValue(mockUser),
    participantFindMany: jest.fn<any>()
      .mockResolvedValueOnce([{ id: 'part-1' }])  // for messages: participant ids
      .mockResolvedValueOnce(mockParticipations),  // for contacts
    messageFindMany: jest.fn<any>().mockResolvedValue(mockMessages),
  };
}

async function buildApp(opts: {
  auth?: 'authenticated' | 'unauthenticated';
  mocks?: ReturnType<typeof makeMocks>;
} = {}): Promise<{ app: FastifyInstance; mocks: ReturnType<typeof makeMocks> }> {
  const { auth = 'authenticated', mocks = makeMocks() } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    user: { findUnique: mocks.userFindUnique },
    participant: { findMany: mocks.participantFindMany },
    message: { findMany: mocks.messageFindMany },
  } as any);

  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = auth === 'authenticated'
      ? { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } }
      : { isAuthenticated: false, registeredUser: null };
  });

  await app.register(dataExportRoutes);
  await app.ready();
  return { app, mocks };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /export — authentication', () => {
  it('returns 401 when not authenticated', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: '/export' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /export — default JSON (all types)', () => {
  it('returns 200 and calls profile, message, and contacts queries', async () => {
    const { app, mocks } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/export' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(mocks.userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } })
    );
    expect(mocks.messageFindMany).toHaveBeenCalled();
    expect(mocks.participantFindMany).toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /export — profile only', () => {
  it('returns 200 and only calls user.findUnique', async () => {
    const { app, mocks } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/export?types=profile' });
    expect(res.statusCode).toBe(200);
    expect(mocks.userFindUnique).toHaveBeenCalled();
    expect(mocks.messageFindMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /export — messages only', () => {
  it('returns 200 and calls participant then message queries', async () => {
    const mocks = {
      ...makeMocks(),
      participantFindMany: jest.fn<any>().mockResolvedValue([{ id: 'part-1' }]),
    };
    const { app } = await buildApp({ mocks });
    const res = await app.inject({ method: 'GET', url: '/export?types=messages' });
    expect(res.statusCode).toBe(200);
    expect(mocks.participantFindMany).toHaveBeenCalled();
    expect(mocks.messageFindMany).toHaveBeenCalled();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /export — contacts only', () => {
  it('returns 200 and calls participant findMany with isActive', async () => {
    const mocks = {
      ...makeMocks(),
      participantFindMany: jest.fn<any>().mockResolvedValue(mockParticipations),
    };
    const { app } = await buildApp({ mocks });
    const res = await app.inject({ method: 'GET', url: '/export?types=contacts' });
    expect(res.statusCode).toBe(200);
    expect(mocks.participantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isActive: true }) })
    );
    await app.close();
  });
});

describe('GET /export — CSV format', () => {
  it('returns 200 for csv format with all types', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/export?format=csv' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 200 for csv format with contacts only', async () => {
    const mocks = {
      ...makeMocks(),
      participantFindMany: jest.fn<any>().mockResolvedValue(mockParticipations),
    };
    const { app } = await buildApp({ mocks });
    const res = await app.inject({ method: 'GET', url: '/export?format=csv&types=contacts' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 200 for csv format with empty messages list', async () => {
    const mocks = {
      ...makeMocks(),
      participantFindMany: jest.fn<any>().mockResolvedValue([{ id: 'part-1' }]),
      messageFindMany: jest.fn<any>().mockResolvedValue([]),
    };
    const { app } = await buildApp({ mocks });
    const res = await app.inject({ method: 'GET', url: '/export?format=csv&types=profile,messages' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /export — invalid types filtered', () => {
  it('returns 200 and filters invalid type values', async () => {
    const mocks = {
      ...makeMocks(),
      participantFindMany: jest.fn<any>().mockResolvedValue(mockParticipations),
    };
    const { app } = await buildApp({ mocks });
    const res = await app.inject({ method: 'GET', url: '/export?types=profile,invalid,contacts' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /export — error handling', () => {
  it('returns 500 on DB error', async () => {
    const mocks = {
      ...makeMocks(),
      userFindUnique: jest.fn<any>().mockRejectedValue(new Error('db crash')),
    };
    const { app } = await buildApp({ mocks });
    const res = await app.inject({ method: 'GET', url: '/export?types=profile' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
