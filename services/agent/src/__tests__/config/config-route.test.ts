import Fastify, { type FastifyInstance } from 'fastify';
import { OBJECT_ID_PATTERN } from '@meeshy/shared/utils/object-id';
import { configRoutes } from '../../routes/config';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// La surface HTTP privée que la gateway pousse dans le process agent (bust de
// cache, stop de scan). Les deux verbes n'acceptent un `conversationId` que
// s'il a la FORME d'un ObjectId Mongo — la borne de confiance vit ici, et rien
// ne descend vers Redis/Prisma tant qu'elle n'est pas franchie.

const CONV_ID = '507f1f77bcf86cd799439011';
const MALFORMED_IDS = ['pas-un-id', '507f1f77bcf86cd79943901', '507f1f77bcf86cd799439011z', ''];

type RedisMock = {
  del: jest.Mock;
  set: jest.Mock;
};

type PrismaMock = {
  agentConfig: { updateMany: jest.Mock };
};

function makeRedis(): RedisMock {
  return { del: jest.fn().mockResolvedValue(1), set: jest.fn().mockResolvedValue('OK') };
}

function makePrisma(): PrismaMock {
  return { agentConfig: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
}

async function buildApp(redis: RedisMock, prisma: PrismaMock): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register((instance) =>
    configRoutes(instance, prisma as unknown as PrismaClient, redis),
  );
  await app.ready();
  return app;
}

describe('routes de configuration de l\'agent ✦ borne ObjectId', () => {
  it('utilise la MÊME règle ObjectId que le SSOT partagé, pas une regex recopiée', () => {
    expect(OBJECT_ID_PATTERN).toBe('^[0-9a-fA-F]{24}$');
  });

  describe('POST /api/agent/config/:conversationId/stop', () => {
    it('arrête le scan pour un ObjectId bien formé', async () => {
      const redis = makeRedis();
      const prisma = makePrisma();
      const app = await buildApp(redis, prisma);

      const response = await app.inject({
        method: 'POST',
        url: `/api/agent/config/${CONV_ID}/stop`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(redis.set).toHaveBeenCalledWith(`agent:scan-stop:${CONV_ID}`, '1', 'EX', 60);
      expect(prisma.agentConfig.updateMany).toHaveBeenCalledWith({
        where: { conversationId: CONV_ID },
        data: { scanStartedAt: null, currentNode: null },
      });
      await app.close();
    });

    it.each(MALFORMED_IDS)(
      'refuse un identifiant hors forme (%j) sans toucher Redis ni Prisma',
      async (badId) => {
        const redis = makeRedis();
        const prisma = makePrisma();
        const app = await buildApp(redis, prisma);

        const response = await app.inject({
          method: 'POST',
          url: `/api/agent/config/${encodeURIComponent(badId)}/stop`,
        });

        expect(response.statusCode).toBe(400);
        expect(redis.set).not.toHaveBeenCalled();
        expect(prisma.agentConfig.updateMany).not.toHaveBeenCalled();
        await app.close();
      },
    );
  });

  describe('POST /api/agent/cache/invalidate', () => {
    it('invalide la cible conversation pour un ObjectId bien formé', async () => {
      const redis = makeRedis();
      const prisma = makePrisma();
      const app = await buildApp(redis, prisma);

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/cache/invalidate',
        payload: { conversationId: CONV_ID },
      });

      expect(response.statusCode).toBe(200);
      expect(redis.del).toHaveBeenCalledWith(`agent:config:${CONV_ID}`);
      await app.close();
    });

    it.each(MALFORMED_IDS.filter((id) => id.length > 0))(
      'refuse un conversationId hors forme (%j) sans toucher Redis',
      async (badId) => {
        const redis = makeRedis();
        const prisma = makePrisma();
        const app = await buildApp(redis, prisma);

        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/cache/invalidate',
          payload: { conversationId: badId },
        });

        expect(response.statusCode).toBe(400);
        expect(redis.del).not.toHaveBeenCalled();
        await app.close();
      },
    );
  });
});
