import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';

import { languagesRoutes } from '../../../../routes/admin/languages';

const mockPrisma: any = {
  message: {
    groupBy: jest.fn<any>(),
    aggregateRaw: jest.fn<any>(),
    findMany: jest.fn<any>(),
  },
  user: {
    groupBy: jest.fn<any>(),
  },
};

const adminAuthContext = {
  isAuthenticated: true,
  registeredUser: {
    id: '507f1f77bcf86cd799439011',
    role: 'ADMIN',
    username: 'admin',
  },
};

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = adminAuthContext;
  });

  app.register(languagesRoutes);
  return app;
}

function pipelineOf(callIndex: number): any[] {
  return mockPrisma.message.aggregateRaw.mock.calls[callIndex][0].pipeline;
}

describe('Admin languages routes — DB-side aggregation', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /stats', () => {
    it('aggregates user counts and translation pairs in MongoDB without fetching messages', async () => {
      mockPrisma.message.groupBy
        .mockResolvedValueOnce([
          { originalLanguage: 'fr', _count: { id: 60 } },
          { originalLanguage: 'en', _count: { id: 40 } },
        ])
        .mockResolvedValueOnce([
          { originalLanguage: 'fr', _count: { id: 30 } },
        ]);

      mockPrisma.message.aggregateRaw
        .mockResolvedValueOnce([
          { _id: 'fr', userCount: 12 },
          { _id: 'en', userCount: 5 },
        ])
        .mockResolvedValueOnce([
          { _id: { from: 'fr', to: 'en' }, count: 25, totalScore: 22.5, scoreCount: 25 },
          { _id: { from: 'en', to: 'fr' }, count: 10, totalScore: 8, scoreCount: 10 },
        ]);

      mockPrisma.user.groupBy.mockResolvedValueOnce([
        { systemLanguage: 'fr', _count: { id: 100 } },
      ]);

      const response = await app.inject({ method: 'GET', url: '/stats' });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      expect(body.data.topLanguages).toEqual([
        { language: 'fr', messageCount: 60, userCount: 12, percentage: 60 },
        { language: 'en', messageCount: 40, userCount: 5, percentage: 40 },
      ]);
      expect(body.data.languagePairs).toEqual([
        { from: 'fr', to: 'en', translationCount: 25, avgConfidence: 0.9 },
        { from: 'en', to: 'fr', translationCount: 10, avgConfidence: 0.8 },
      ]);
      expect(body.data.usersByLanguage).toEqual({ fr: 100 });
      expect(body.data.growth).toEqual({ fr: 100, en: 100 });
      expect(body.data.totalMessages).toBe(100);

      expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    });

    it('counts distinct users per language through a Participant lookup pipeline', async () => {
      mockPrisma.message.groupBy
        .mockResolvedValueOnce([{ originalLanguage: 'fr', _count: { id: 1 } }])
        .mockResolvedValueOnce([]);
      mockPrisma.message.aggregateRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.user.groupBy.mockResolvedValueOnce([]);

      await app.inject({ method: 'GET', url: '/stats' });

      const userPipeline = pipelineOf(0);
      const lookup = userPipeline.find((stage) => stage.$lookup);
      expect(lookup.$lookup).toMatchObject({
        from: 'Participant',
        localField: 'senderId',
        foreignField: '_id',
      });
      const match = userPipeline.find((stage) => stage.$match);
      expect(match.$match.originalLanguage).toEqual({ $in: ['fr'] });
      expect(match.$match.deletedAt).toBeNull();
      expect(match.$match.createdAt.$gte.$date).toEqual(expect.any(String));
    });

    it('unwinds the translations object to count language pairs DB-side', async () => {
      mockPrisma.message.groupBy
        .mockResolvedValueOnce([{ originalLanguage: 'fr', _count: { id: 1 } }])
        .mockResolvedValueOnce([]);
      mockPrisma.message.aggregateRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.user.groupBy.mockResolvedValueOnce([]);

      await app.inject({ method: 'GET', url: '/stats' });

      const pairsPipeline = pipelineOf(1);
      const project = pairsPipeline.find((stage) => stage.$project);
      expect(JSON.stringify(project)).toContain('$objectToArray');
      expect(pairsPipeline.some((stage) => stage.$unwind)).toBe(true);
      const match = pairsPipeline.find((stage) => stage.$match);
      expect(match.$match.translations).toEqual({ $ne: null });
      expect(match.$match.createdAt.$gte.$date).toEqual(expect.any(String));
    });
  });

  describe('GET /timeline', () => {
    it('groups message counts per day and language in MongoDB', async () => {
      const today = new Date().toISOString().split('T')[0];
      mockPrisma.message.aggregateRaw.mockResolvedValueOnce([
        { _id: { date: today, lang: 'fr' }, count: 4 },
        { _id: { date: today, lang: 'en' }, count: 2 },
      ]);

      const response = await app.inject({ method: 'GET', url: '/timeline?period=7d' });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(7);

      const todayEntry = body.data.find((entry: any) => entry.date === today);
      expect(todayEntry).toEqual({ date: today, fr: 4, en: 2 });

      const otherDays = body.data.filter((entry: any) => entry.date !== today);
      otherDays.forEach((entry: any) => expect(Object.keys(entry)).toEqual(['date']));

      expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
      const pipeline = pipelineOf(0);
      expect(JSON.stringify(pipeline)).toContain('$dateToString');
    });

    it('filters the pipeline on the requested language', async () => {
      mockPrisma.message.aggregateRaw.mockResolvedValueOnce([]);

      await app.inject({ method: 'GET', url: '/timeline?language=es' });

      const match = pipelineOf(0).find((stage: any) => stage.$match);
      expect(match.$match.originalLanguage).toBe('es');
    });
  });

  describe('GET /translation-accuracy', () => {
    it('computes per-pair accuracy from a DB-side aggregation', async () => {
      mockPrisma.message.aggregateRaw.mockResolvedValueOnce([
        { _id: { from: 'fr', to: 'en' }, count: 50, totalScore: 47.5, scoreCount: 50 },
        { _id: { from: 'en', to: 'es' }, count: 8, totalScore: 4.8, scoreCount: 8 },
      ]);

      const response = await app.inject({ method: 'GET', url: '/translation-accuracy' });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([
        { from: 'fr', to: 'en', avgConfidence: 95, translationCount: 50, quality: 'excellent' },
        { from: 'en', to: 'es', avgConfidence: 60, translationCount: 8, quality: 'fair' },
      ]);

      expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    });

    it('honors the limit query param via $limit after sorting by count', async () => {
      mockPrisma.message.aggregateRaw.mockResolvedValueOnce([]);

      await app.inject({ method: 'GET', url: '/translation-accuracy?limit=3' });

      const pipeline = pipelineOf(0);
      const sortIdx = pipeline.findIndex((stage: any) => stage.$sort);
      const limitIdx = pipeline.findIndex((stage: any) => stage.$limit === 3);
      expect(sortIdx).toBeGreaterThanOrEqual(0);
      expect(limitIdx).toBeGreaterThan(sortIdx);
    });
  });
});
