/**
 * Simple integration test to debug mocking issues
 */

import Fastify, { FastifyInstance } from 'fastify';
import { NOTIFICATION_PREFERENCE_DEFAULTS } from '@meeshy/shared/types/preferences';
import { userPreferencesRoutes } from '../../routes/me/preferences';

// Mock Prisma
jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn()
}));

// Mock auth middleware
jest.mock('../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (request: any, reply: any) => {
    request.auth = {
      isAuthenticated: true,
      registeredUser: true,
      userId: 'test-user',
      isAnonymous: false
    };
  })
}));

// Mock ConsentValidationService
jest.mock('../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    validatePreferences: jest.fn().mockResolvedValue([])
  }))
}));

describe('Simple Preference Test', () => {
  let app: FastifyInstance;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      userPreferences: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn()
      }
    };

    app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    await app.register(userPreferencesRoutes, { prefix: '/preferences' });
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  it('should get default notification preferences', async () => {
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: '/preferences/notification'
    });

    console.log('GET Response:', response.statusCode, response.body);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(NOTIFICATION_PREFERENCE_DEFAULTS);
  });

  it('should update notification preferences', async () => {
    const updateData = {
      ...NOTIFICATION_PREFERENCE_DEFAULTS,
      pushEnabled: false
    };

    // Mock upsert to return { notification: {...} }
    mockPrisma.userPreferences.upsert.mockResolvedValue({
      notification: updateData
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/preferences/notification',
      payload: updateData
    });

    console.log('PUT Response:', response.statusCode, response.body);

    const body = JSON.parse(response.body);
    console.log('Body:', JSON.stringify(body, null, 2));

    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.pushEnabled).toBe(false);
  });
});
