/**
 * Revue de conformité O4 (#10499) — RETIRER le consentement d'analyse
 * (RGPD art. 7(3)) détache le compte du comportement DÉJÀ rangé : les
 * événements v2 perdent leur `userId` et tout identifiant qui les relierait
 * (session d'application, page de fil, recherche), les impressions perdent
 * leur session et leur page. Un octroi ne détache rien.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { CONSENT_POLICY_VERSION, meConsentsRoutes } from '../../../../routes/me/consents';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const USER = '507f1f77bcf86cd799439011';

function fakePrisma() {
  const columns: Record<string, Date | null> = {
    dataProcessingConsentAt: new Date('2026-01-01'),
    analyticsConsentAt: new Date('2026-01-01'),
  };
  const commands: Record<string, unknown>[] = [];
  return {
    commands,
    prisma: {
      user: {
        findUnique: jest.fn(async () => ({ ...columns })),
        update: jest.fn(async ({ data }: { data: Record<string, Date | null> }) => {
          Object.assign(columns, data);
          return { ...columns };
        }),
      },
      userPreferences: { findUnique: async () => null },
      $runCommandRaw: jest.fn(async (command: Record<string, unknown>) => {
        commands.push(command);
        return { ok: 1, n: 0, nModified: 0 };
      }),
    },
  };
}

async function buildApp(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER, isAuthenticated: true };
  });
  await app.register(meConsentsRoutes, { prefix: '/api/v1/me' });
  await app.ready();
  return app;
}

const put = (app: FastifyInstance, purpose: string, granted: boolean) =>
  app.inject({ method: 'PUT', url: `/api/v1/me/consents/${purpose}`, payload: { granted, policyVersion: CONSENT_POLICY_VERSION } });

describe('PUT /me/consents/analytics — le retrait détache le comportement déjà rangé', () => {
  it('retirer l’analyse détache ContentEvent et PostImpression de ce compte', async () => {
    const { prisma, commands } = fakePrisma();
    const app = await buildApp(prisma);
    const res = await put(app, 'analytics', false);

    expect(res.statusCode).toBe(200);
    const collections = commands.map((command) => command.update);
    expect(collections).toEqual(expect.arrayContaining(['ContentEvent', 'PostImpression']));
    const journal = JSON.stringify(commands);
    expect(journal).toContain(USER);
    expect(journal).toContain('appSessionId');
    expect(journal).toContain('feedRequestId');
    await app.close();
  });

  it('retirer le traitement des données (parent de l’analyse) détache aussi', async () => {
    const { prisma, commands } = fakePrisma();
    const app = await buildApp(prisma);
    await put(app, 'data-processing', false);

    expect(commands.map((command) => command.update)).toEqual(expect.arrayContaining(['ContentEvent']));
    await app.close();
  });

  it('accorder ne détache rien', async () => {
    const { prisma, commands } = fakePrisma();
    const app = await buildApp(prisma);
    await put(app, 'analytics', true);

    expect(commands).toEqual([]);
    await app.close();
  });
});

describe('PUT /me/consents — un retrait se SOUVIENT qu’il est un refus', () => {
  it.each(['analytics', 'data-processing'])('retirer %s date le refus d’analyse (analyticsConsentWithdrawnAt)', async (purpose) => {
    const { prisma } = fakePrisma();
    const app = await buildApp(prisma);
    await put(app, purpose, false);

    const writes = prisma.user.update.mock.calls.map(([args]) => (args as { data: Record<string, unknown> }).data);
    expect(writes.some((data) => data.analyticsConsentWithdrawnAt instanceof Date)).toBe(true);
    await app.close();
  });

  it('accorder de nouveau l’analyse efface le refus', async () => {
    const { prisma } = fakePrisma();
    const app = await buildApp(prisma);
    await put(app, 'analytics', false);
    await put(app, 'analytics', true);

    const last = prisma.user.update.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> };
    expect(last.data.analyticsConsentWithdrawnAt).toBeNull();
    await app.close();
  });

  it('accorder un AUTRE consentement n’efface pas le refus d’analyse', async () => {
    const { prisma } = fakePrisma();
    const app = await buildApp(prisma);
    await put(app, 'analytics', false);
    await put(app, 'voice-data', true);

    const last = prisma.user.update.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> };
    expect('analyticsConsentWithdrawnAt' in last.data).toBe(false);
    await app.close();
  });
});
