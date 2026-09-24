/**
 * `GET`/`PATCH /api/v1/me/onboarding` (#7729) — l'état du parcours de
 * l'utilisateur AUTHENTIFIÉ, jamais d'un autre. Le calcul vit dans
 * `OnboardingService` ; la route authentifie, valide, sérialise.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { meOnboardingRoutes } from '../../../../routes/me/onboarding';
import { OnboardingStateSchema } from '@meeshy/shared/types/onboarding';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const USER_ID = '68a000000000000000000001';
const GLOBAL_ID = '68a0000000000000000000aa';
const NOW = new Date('2026-09-26T12:00:00.000Z');

function makePrisma(user: Record<string, unknown> | null = {}) {
  const row =
    user === null
      ? null
      : {
          id: USER_ID,
          createdAt: new Date('2026-09-25T09:00:00.000Z'),
          birthDate: null,
          systemLanguage: 'fr',
          regionalLanguage: null,
          blockedUserIds: [],
          onboardingCompletedAt: null,
          onboardingSteps: [],
          ...user,
        };
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(row),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue(row),
    },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ id: GLOBAL_ID }) },
    message: { findMany: jest.fn<any>().mockResolvedValue([]) },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    friendRequest: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    engagementCounter: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    engagementConversationCredit: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

async function buildApp(prisma: ReturnType<typeof makePrisma>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    const userId = req.headers['x-test-user-id'] as string | undefined;
    (req as any).auth = userId ? { userId, isAuthenticated: true } : undefined;
  });
  await app.register(meOnboardingRoutes, { prefix: '/api/v1/me', now: () => NOW });
  await app.ready();
  return app;
}

const headers = { 'x-test-user-id': USER_ID };

describe('GET /me/onboarding', () => {
  it('401 sans authentification', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/onboarding' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('404 pour un compte introuvable', async () => {
    const app = await buildApp(makePrisma(null));
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/onboarding', headers });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('sert l\'état de L\'APPELANT, conforme au contrat partagé', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/api/v1/me/onboarding', headers });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(OnboardingStateSchema.safeParse(body.data).success).toBe(true);
    expect(body.data).toEqual({
      eligible: true,
      completedAt: null,
      seenSteps: [],
      prefilledSteps: [],
      globalConversationId: GLOBAL_ID,
      protectedRegime: true,
      storyDefaultVisibility: 'friends',
      suggestions: [],
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: USER_ID } }));
    expect(res.headers['cache-control']).toBe('private, no-cache');
    await app.close();
  });

  it('ne laisse passer aucun champ hors contrat dans une suggestion', async () => {
    const prisma = makePrisma({ birthDate: new Date('1995-01-01T00:00:00.000Z') });
    const candidate = {
      id: '68a000000000000000000002',
      username: 'nova',
      displayName: 'Nova',
      avatar: null,
      birthDate: new Date('1996-01-01T00:00:00.000Z'),
      systemLanguage: 'fr',
      regionalLanguage: null,
      blockedUserIds: [],
      isActive: true,
      deletedAt: null,
      isOnline: true,
      lastActiveAt: NOW,
    };
    prisma.message.findMany.mockResolvedValue([{ senderId: 'p2' }]);
    prisma.participant.findMany.mockResolvedValue([{ id: 'p2', userId: candidate.id }]);
    prisma.user.findMany.mockResolvedValue([candidate]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/api/v1/me/onboarding', headers });

    expect(res.json().data.suggestions).toEqual([
      { id: candidate.id, username: 'nova', displayName: 'Nova', avatarUrl: null, languages: ['fr'] },
    ]);
    await app.close();
  });
});

describe('PATCH /me/onboarding', () => {
  it('401 sans authentification', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({ method: 'PATCH', url: '/api/v1/me/onboarding', payload: { finish: true } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('400 sur un corps hors contrat', async () => {
    const app = await buildApp(makePrisma());
    for (const payload of [{}, { step: 'tutorial', outcome: 'done' }, { step: 'global' }, { finish: false }]) {
      const res = await app.inject({ method: 'PATCH', url: '/api/v1/me/onboarding', headers, payload });
      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
    }
    await app.close();
  });

  it('enregistre une étape vue et rend le nouvel état', async () => {
    const prisma = makePrisma({ onboardingSteps: ['languages'] });
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me/onboarding',
      headers,
      payload: { step: 'global', outcome: 'done' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.seenSteps).toEqual(['languages', 'global']);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { onboardingSteps: ['languages', 'global'] },
    });
    await app.close();
  });

  it('{ finish: true } clôt le parcours : eligible=false, completedAt posé', async () => {
    const app = await buildApp(makePrisma());

    const res = await app.inject({ method: 'PATCH', url: '/api/v1/me/onboarding', headers, payload: { finish: true } });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ eligible: false, completedAt: NOW.toISOString() });
    await app.close();
  });

  it('404 pour un compte introuvable', async () => {
    const app = await buildApp(makePrisma(null));
    const res = await app.inject({ method: 'PATCH', url: '/api/v1/me/onboarding', headers, payload: { finish: true } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
