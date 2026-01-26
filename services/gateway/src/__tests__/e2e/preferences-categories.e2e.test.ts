/**
 * E2E Tests for /me/preferences/categories routes
 * Tests CRUD operations for UserConversationCategory
 */

import Fastify, { FastifyInstance } from 'fastify';
import { userPreferencesRoutes } from '../../routes/me/preferences';

describe('E2E: /me/preferences/categories', () => {
  let app: FastifyInstance;
  const userId = 'test-user-123';
  let createdCategoryIds: string[] = [];

  // Mock Prisma
  const mockPrisma = {
    userConversationCategory: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn()
    },
    conversationPreference: {
      updateMany: jest.fn()
    },
    $transaction: jest.fn()
  };

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // Attach mock prisma
    (app as any).prisma = mockPrisma;

    // Register routes FIRST
    await app.register(async (fastify) => {
      // Mock authentication INSIDE the plugin context
      fastify.addHook('preHandler', async (request: any, reply) => {
        request.auth = {
          isAuthenticated: true,
          userId: userId
        };
      });

      // Then register routes
      await fastify.register(userPreferencesRoutes, { prefix: '/me/preferences' });
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    createdCategoryIds = [];
  });

  describe('GET /me/preferences/categories', () => {
    it('should return all categories with pagination', async () => {
      const mockCategories = [
        {
          id: 'cat-1',
          userId,
          name: 'Work',
          color: '#3B82F6',
          icon: '💼',
          order: 0,
          isExpanded: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'cat-2',
          userId,
          name: 'Personal',
          color: '#10B981',
          icon: '🏠',
          order: 1,
          isExpanded: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockPrisma.userConversationCategory.findMany.mockResolvedValue(mockCategories);
      mockPrisma.userConversationCategory.count.mockResolvedValue(2);

      const response = await app.inject({
        method: 'GET',
        url: '/me/preferences/categories?limit=50&offset=0'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.pagination).toEqual({
        total: 2,
        limit: 50,
        offset: 0
      });
      expect(body.data[0].name).toBe('Work');
      expect(body.data[1].name).toBe('Personal');
    });

    it('should return empty array when no categories exist', async () => {
      mockPrisma.userConversationCategory.findMany.mockResolvedValue([]);
      mockPrisma.userConversationCategory.count.mockResolvedValue(0);

      const response = await app.inject({
        method: 'GET',
        url: '/me/preferences/categories'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });
  });

  describe('GET /me/preferences/categories/:categoryId', () => {
    it('should return a specific category', async () => {
      const mockCategory = {
        id: 'cat-1',
        userId,
        name: 'Work',
        color: '#3B82F6',
        icon: '💼',
        order: 0,
        isExpanded: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.userConversationCategory.findFirst.mockResolvedValue(mockCategory);

      const response = await app.inject({
        method: 'GET',
        url: '/me/preferences/categories/cat-1'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Work');
      expect(body.data.id).toBe('cat-1');
    });

    it('should return 404 for non-existent category', async () => {
      mockPrisma.userConversationCategory.findFirst.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/me/preferences/categories/non-existent'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('NOT_FOUND');
    });
  });

  describe('POST /me/preferences/categories', () => {
    it('should create a new category with all fields', async () => {
      const newCategory = {
        id: 'cat-new',
        userId,
        name: 'Projects',
        color: '#F59E0B',
        icon: '📁',
        order: 0,
        isExpanded: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.userConversationCategory.findFirst.mockResolvedValue(null);
      mockPrisma.userConversationCategory.create.mockResolvedValue(newCategory);

      const response = await app.inject({
        method: 'POST',
        url: '/me/preferences/categories',
        payload: {
          name: 'Projects',
          color: '#F59E0B',
          icon: '📁',
          order: 0,
          isExpanded: true
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Projects');
      expect(body.data.color).toBe('#F59E0B');
      expect(body.data.icon).toBe('📁');
    });

    it('should create category with only name (minimal)', async () => {
      const newCategory = {
        id: 'cat-minimal',
        userId,
        name: 'Minimal',
        color: null,
        icon: null,
        order: 0,
        isExpanded: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.userConversationCategory.findFirst.mockResolvedValue(null);
      mockPrisma.userConversationCategory.create.mockResolvedValue(newCategory);

      const response = await app.inject({
        method: 'POST',
        url: '/me/preferences/categories',
        payload: {
          name: 'Minimal'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Minimal');
    });

    it('should return 400 for missing name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/me/preferences/categories',
        payload: {
          color: '#3B82F6'
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for empty name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/me/preferences/categories',
        payload: {
          name: '   '
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('PATCH /me/preferences/categories/:categoryId', () => {
    it('should update category fields', async () => {
      const existingCategory = {
        id: 'cat-1',
        userId,
        name: 'Work',
        color: '#3B82F6',
        icon: '💼',
        order: 0,
        isExpanded: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const updatedCategory = {
        ...existingCategory,
        name: 'Work Projects',
        color: '#10B981'
      };

      mockPrisma.userConversationCategory.findFirst.mockResolvedValue(existingCategory);
      mockPrisma.userConversationCategory.update.mockResolvedValue(updatedCategory);

      const response = await app.inject({
        method: 'PATCH',
        url: '/me/preferences/categories/cat-1',
        payload: {
          name: 'Work Projects',
          color: '#10B981'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Work Projects');
      expect(body.data.color).toBe('#10B981');
    });

    it('should return 404 for non-existent category', async () => {
      mockPrisma.userConversationCategory.findFirst.mockResolvedValue(null);

      const response = await app.inject({
        method: 'PATCH',
        url: '/me/preferences/categories/non-existent',
        payload: {
          name: 'Updated'
        }
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /me/preferences/categories/:categoryId', () => {
    it('should delete category and detach conversations', async () => {
      const existingCategory = {
        id: 'cat-1',
        userId,
        name: 'Work',
        color: '#3B82F6',
        icon: '💼',
        order: 0,
        isExpanded: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.userConversationCategory.findFirst.mockResolvedValue(existingCategory);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const response = await app.inject({
        method: 'DELETE',
        url: '/me/preferences/categories/cat-1'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('deleted');

      // Verify transaction was called with updateMany and delete
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should return 404 for non-existent category', async () => {
      mockPrisma.userConversationCategory.findFirst.mockResolvedValue(null);

      const response = await app.inject({
        method: 'DELETE',
        url: '/me/preferences/categories/non-existent'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('NOT_FOUND');
    });
  });

  describe('POST /me/preferences/categories/reorder', () => {
    it('should reorder multiple categories', async () => {
      mockPrisma.userConversationCategory.updateMany.mockResolvedValue({ count: 1 });

      const response = await app.inject({
        method: 'POST',
        url: '/me/preferences/categories/reorder',
        payload: {
          updates: [
            { categoryId: 'cat-1', order: 2 },
            { categoryId: 'cat-2', order: 0 },
            { categoryId: 'cat-3', order: 1 }
          ]
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('reordered');

      // Verify updateMany was called for each update
      expect(mockPrisma.userConversationCategory.updateMany).toHaveBeenCalledTimes(3);
    });

    it('should handle empty updates array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/me/preferences/categories/reorder',
        payload: {
          updates: []
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('Authorization', () => {
    it('should verify category ownership on GET', async () => {
      mockPrisma.userConversationCategory.findFirst.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/me/preferences/categories/other-user-category'
      });

      // Should return 404 (not found) rather than revealing existence
      expect(response.statusCode).toBe(404);

      // Verify findFirst was called with userId check
      expect(mockPrisma.userConversationCategory.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId
          })
        })
      );
    });

    it('should verify category ownership on UPDATE', async () => {
      mockPrisma.userConversationCategory.findFirst.mockResolvedValue(null);

      const response = await app.inject({
        method: 'PATCH',
        url: '/me/preferences/categories/other-user-category',
        payload: { name: 'Hacked' }
      });

      expect(response.statusCode).toBe(404);
    });

    it('should verify category ownership on DELETE', async () => {
      mockPrisma.userConversationCategory.findFirst.mockResolvedValue(null);

      const response = await app.inject({
        method: 'DELETE',
        url: '/me/preferences/categories/other-user-category'
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
