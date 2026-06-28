import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Mock variables ────────────────────────────────────────────────────────────

const mockSendSuccess = jest.fn<any>((reply: any, data: any) => {
  reply._body = { success: true, data };
  reply._status = 200;
  return reply;
});

const mockSendError = jest.fn<any>((reply: any, statusCode: number, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = statusCode;
  return reply;
});

// ─── jest.mock calls (hoisted before imports) ─────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), error: jest.fn() }),
  },
}));

jest.mock('../../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendError: (...args: any[]) => mockSendError(...args),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { dataExportRoutes } from '../../../../routes/me/export';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// ─── Factories ────────────────────────────────────────────────────────────────

const createMockFastify = () => {
  const routes: Record<string, Record<string, Function>> = {};
  const fastify: any = {
    authenticate: jest.fn(),
    prisma: {
      user: { findUnique: jest.fn<any>().mockResolvedValue(null) },
      participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
      message: { findMany: jest.fn<any>().mockResolvedValue([]) },
    },
    get: jest.fn((path: string, opts: any, handler: Function) => {
      routes['GET'] = routes['GET'] || {};
      routes['GET'][path] = handler;
    }),
    _routes: routes,
  };
  return fastify;
};

const getHandler = (fastify: any, method: string, pathFragment: string): Function => {
  const methodRoutes = fastify._routes[method] || {};
  const key =
    Object.keys(methodRoutes).find((k) => k === pathFragment) ??
    Object.keys(methodRoutes).find((k) => k.includes(pathFragment));
  if (!key)
    throw new Error(
      `No ${method} route matching '${pathFragment}'. Available: ${Object.keys(methodRoutes).join(', ')}`
    );
  return methodRoutes[key];
};

const makeAuthContext = (overrides: any = {}) => ({
  isAuthenticated: true,
  registeredUser: { id: USER_ID },
  userId: USER_ID,
  ...overrides,
});

const makeRequest = (overrides: any = {}) => ({
  query: {},
  authContext: makeAuthContext(),
  ...overrides,
});

const makeReply = () => {
  const reply: any = { _body: null, _status: 200 };
  return reply;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('dataExportRoutes', () => {
  let fastify: ReturnType<typeof createMockFastify>;

  beforeEach(async () => {
    fastify = createMockFastify();
    await dataExportRoutes(fastify);
    jest.clearAllMocks();
    mockSendSuccess.mockImplementation((reply: any, data: any) => {
      reply._body = { success: true, data };
      reply._status = 200;
      return reply;
    });
    mockSendError.mockImplementation((reply: any, statusCode: number, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = statusCode;
      return reply;
    });
  });

  describe('authentication guards', () => {
    it('returns 401 when authContext.isAuthenticated is false', async () => {
      const handler = getHandler(fastify, 'GET', '/export');
      const req = makeRequest({
        authContext: makeAuthContext({ isAuthenticated: false }),
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(401);
      expect(reply._body).toMatchObject({ success: false });
      expect(mockSendError).toHaveBeenCalledWith(
        reply,
        401,
        'Authentication required',
        expect.objectContaining({ code: 'UNAUTHORIZED' })
      );
    });

    it('returns 401 when authContext.registeredUser is null', async () => {
      const handler = getHandler(fastify, 'GET', '/export');
      const req = makeRequest({
        authContext: makeAuthContext({ registeredUser: null }),
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(401);
      expect(mockSendError).toHaveBeenCalledWith(
        reply,
        401,
        'Authentication required',
        expect.objectContaining({ code: 'UNAUTHORIZED' })
      );
    });
  });

  describe('default export (all types, JSON format)', () => {
    it('returns all types (profile + messages + contacts) in JSON by default', async () => {
      const handler = getHandler(fastify, 'GET', '/export');

      const mockUser = {
        id: USER_ID,
        username: 'testuser',
        displayName: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        phoneNumber: null,
        bio: null,
        avatar: null,
        banner: null,
        systemLanguage: 'fr',
        regionalLanguage: null,
        customDestinationLanguage: null,
        timezone: 'UTC',
        createdAt: new Date('2024-01-01'),
        lastActiveAt: new Date('2024-01-15'),
      };

      const mockMessage = {
        id: 'msg1',
        conversationId: 'conv1',
        content: 'Hello',
        originalLanguage: 'fr',
        messageType: 'text',
        messageSource: 'user',
        createdAt: new Date('2024-01-10'),
        editedAt: null,
      };

      const mockParticipation = {
        conversationId: 'conv1',
        role: 'MEMBER',
        joinedAt: new Date('2024-01-01'),
        conversation: {
          id: 'conv1',
          title: 'Test Conversation',
          type: 'group',
          createdAt: new Date('2024-01-01'),
          participants: [
            { userId: 'other-user', displayName: 'Other User', avatar: null, type: 'user' },
          ],
        },
      };

      fastify.prisma.user.findUnique.mockResolvedValue(mockUser);
      fastify.prisma.participant.findMany
        .mockResolvedValueOnce([{ id: 'p1' }]) // for messages query
        .mockResolvedValueOnce([mockParticipation]); // for contacts query
      fastify.prisma.message.findMany.mockResolvedValue([mockMessage]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      expect(reply._body.success).toBe(true);
      const data = reply._body.data;
      expect(data).toHaveProperty('exportDate');
      expect(data.format).toBe('json');
      expect(data.requestedTypes).toEqual(['profile', 'messages', 'contacts']);
      expect(data.profile).toEqual(mockUser);
      expect(data.messages).toEqual([mockMessage]);
      expect(data.messagesCount).toBe(1);
      expect(data.contacts).toHaveLength(1);
      expect(data.contactsCount).toBe(1);
    });
  });

  describe('selective type export', () => {
    it('returns profile only when types=profile', async () => {
      const handler = getHandler(fastify, 'GET', '/export');

      const mockUser = {
        id: USER_ID,
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        createdAt: new Date('2024-01-01'),
        lastActiveAt: new Date('2024-01-15'),
      };

      fastify.prisma.user.findUnique.mockResolvedValue(mockUser);

      const req = makeRequest({ query: { types: 'profile' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      const data = reply._body.data;
      expect(data.requestedTypes).toEqual(['profile']);
      expect(data.profile).toEqual(mockUser);
      expect(data).not.toHaveProperty('messages');
      expect(data).not.toHaveProperty('contacts');
      expect(fastify.prisma.message.findMany).not.toHaveBeenCalled();
    });

    it('returns messages only when types=messages', async () => {
      const handler = getHandler(fastify, 'GET', '/export');

      const mockMessage = {
        id: 'msg1',
        conversationId: 'conv1',
        content: 'Hello world',
        originalLanguage: 'en',
        messageType: 'text',
        messageSource: 'user',
        createdAt: new Date('2024-01-10'),
        editedAt: null,
      };

      fastify.prisma.participant.findMany.mockResolvedValue([{ id: 'p1' }]);
      fastify.prisma.message.findMany.mockResolvedValue([mockMessage]);

      const req = makeRequest({ query: { types: 'messages' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      const data = reply._body.data;
      expect(data.requestedTypes).toEqual(['messages']);
      expect(data.messages).toEqual([mockMessage]);
      expect(data.messagesCount).toBe(1);
      expect(data).not.toHaveProperty('profile');
      expect(data).not.toHaveProperty('contacts');
      expect(fastify.prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('returns contacts only when types=contacts', async () => {
      const handler = getHandler(fastify, 'GET', '/export');

      const mockParticipation = {
        conversationId: 'conv1',
        role: 'ADMIN',
        joinedAt: new Date('2024-01-01'),
        conversation: {
          id: 'conv1',
          title: 'My Group',
          type: 'group',
          createdAt: new Date('2024-01-01'),
          participants: [
            { userId: 'user2', displayName: 'User Two', avatar: null, type: 'user' },
            { userId: USER_ID, displayName: 'Me', avatar: null, type: 'user' },
          ],
        },
      };

      fastify.prisma.participant.findMany.mockResolvedValue([mockParticipation]);

      const req = makeRequest({ query: { types: 'contacts' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      const data = reply._body.data;
      expect(data.requestedTypes).toEqual(['contacts']);
      expect(data.contacts).toHaveLength(1);
      expect(data.contacts[0]).toMatchObject({
        conversationId: 'conv1',
        conversationName: 'My Group',
        conversationType: 'group',
        role: 'ADMIN',
      });
      // self-filter: USER_ID participant excluded
      expect(data.contacts[0].participants).toHaveLength(1);
      expect(data.contacts[0].participants[0].displayName).toBe('User Two');
      expect(data.contactsCount).toBe(1);
      expect(data).not.toHaveProperty('profile');
      expect(data).not.toHaveProperty('messages');
    });
  });

  describe('CSV format', () => {
    it('returns CSV sections when format=csv with messages', async () => {
      const handler = getHandler(fastify, 'GET', '/export');

      const mockUser = {
        id: USER_ID,
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        createdAt: new Date('2024-01-01'),
        lastActiveAt: new Date('2024-01-15'),
      };

      const mockMessage = {
        id: 'msg1',
        conversationId: 'conv1',
        content: 'Hello CSV',
        originalLanguage: 'en',
        messageType: 'text',
        messageSource: 'user',
        createdAt: new Date('2024-01-10'),
        editedAt: null,
      };

      const mockParticipation = {
        conversationId: 'conv1',
        role: 'MEMBER',
        joinedAt: new Date('2024-01-01'),
        conversation: {
          id: 'conv1',
          title: 'CSV Group',
          type: 'group',
          createdAt: new Date('2024-01-01'),
          participants: [
            { userId: 'user2', displayName: 'Other', avatar: null, type: 'user' },
          ],
        },
      };

      fastify.prisma.user.findUnique.mockResolvedValue(mockUser);
      fastify.prisma.participant.findMany
        .mockResolvedValueOnce([{ id: 'p1' }])
        .mockResolvedValueOnce([mockParticipation]);
      fastify.prisma.message.findMany.mockResolvedValue([mockMessage]);

      const req = makeRequest({ query: { format: 'csv' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      const data = reply._body.data;
      expect(data.format).toBe('csv');
      expect(data).toHaveProperty('csv');
      const csv = data.csv as Record<string, string>;
      expect(csv).toHaveProperty('profile');
      expect(csv).toHaveProperty('messages');
      expect(csv).toHaveProperty('contacts');
      // CSV sections should be non-empty strings
      expect(typeof csv.profile).toBe('string');
      expect(csv.profile.length).toBeGreaterThan(0);
      expect(typeof csv.messages).toBe('string');
      expect(csv.messages.length).toBeGreaterThan(0);
      // CSV header should contain field names
      expect(csv.profile).toContain('id');
      expect(csv.messages).toContain('id');
    });
  });

  describe('edge cases', () => {
    it('handles empty messages when no participants found', async () => {
      const handler = getHandler(fastify, 'GET', '/export');

      // participant.findMany returns empty → no pIds → message.findMany not called with real IDs
      fastify.prisma.participant.findMany.mockResolvedValue([]);
      fastify.prisma.message.findMany.mockResolvedValue([]);

      const req = makeRequest({ query: { types: 'messages' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      const data = reply._body.data;
      expect(data.messages).toEqual([]);
      expect(data.messagesCount).toBe(0);
      expect(fastify.prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ senderId: { in: [] } }),
        })
      );
    });

    it('returns 500 on unexpected DB error', async () => {
      const handler = getHandler(fastify, 'GET', '/export');

      fastify.prisma.user.findUnique.mockRejectedValue(new Error('DB connection failed'));

      const req = makeRequest({ query: { types: 'profile' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(500);
      expect(reply._body).toMatchObject({ success: false });
      expect(mockSendError).toHaveBeenCalledWith(
        reply,
        500,
        'Export failed',
        expect.objectContaining({ code: 'EXPORT_ERROR' })
      );
    });
  });
});
