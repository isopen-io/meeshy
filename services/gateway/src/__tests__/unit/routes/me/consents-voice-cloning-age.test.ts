/**
 * `PUT /me/consents/voice-cloning` n'accorde le clonage vocal qu'à 18 ans
 * révolus, date limite calculée au jour près (#17309). Fail-closed : sans date
 * de naissance, l'octroi est refusé et rien n'est écrit. Le retrait, lui,
 * reste toujours possible.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyRequest } from 'fastify';
import { meConsentsRoutes, CONSENT_POLICY_VERSION } from '../../../../routes/me/consents';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const USER_ID = '68a000000000000000000001';

function birthDateYearsAgo(years: number, dayOffset = 0): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate() + dayOffset));
}

function makePrisma(birthDate: Date | null, voiceCloningEnabledAt: Date | null = null) {
  const row = {
    dataProcessingConsentAt: null,
    analyticsConsentAt: null,
    voiceDataConsentAt: null,
    voiceProfileConsentAt: null,
    voiceCloningEnabledAt,
    birthDate,
  };
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ ...row }),
      update: jest.fn<any>().mockImplementation(async ({ data }: any) => ({ ...row, ...data })),
    },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

async function putVoiceCloning(prisma: ReturnType<typeof makePrisma>, granted: boolean) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER_ID, isAuthenticated: true };
  });
  await app.register(meConsentsRoutes, { prefix: '/api/v1/me' });
  await app.ready();
  return app.inject({
    method: 'PUT',
    url: '/api/v1/me/consents/voice-cloning',
    headers: { 'content-type': 'application/json' },
    payload: { granted, policyVersion: CONSENT_POLICY_VERSION },
  });
}

describe('PUT /me/consents/voice-cloning — 18 ans révolus au jour près (#17309)', () => {
  it('accorde le jour exact des 18 ans', async () => {
    const prisma = makePrisma(birthDateYearsAgo(18));
    const res = await putVoiceCloning(prisma, true);

    expect(res.statusCode).toBe(200);
    expect(prisma.user.update.mock.calls[0][0].data.voiceCloningEnabledAt).toBeInstanceOf(Date);
  });

  it('refuse la veille des 18 ans, sans rien écrire', async () => {
    const prisma = makePrisma(birthDateYearsAgo(18, 1));
    const res = await putVoiceCloning(prisma, true);

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('VOICE_CLONING_AGE_REQUIRED');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuse sans date de naissance (fail-closed), sans rien écrire', async () => {
    const prisma = makePrisma(null);
    const res = await putVoiceCloning(prisma, true);

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('VOICE_CLONING_AGE_REQUIRED');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('demande la date de naissance dans la même lecture', async () => {
    const prisma = makePrisma(birthDateYearsAgo(30));
    await putVoiceCloning(prisma, true);

    expect(prisma.user.findUnique.mock.calls[0][0].select.birthDate).toBe(true);
  });

  it('laisse un mineur RETIRER un clonage accordé avant la règle', async () => {
    const prisma = makePrisma(birthDateYearsAgo(15), new Date('2026-01-01T00:00:00.000Z'));
    const res = await putVoiceCloning(prisma, false);

    expect(res.statusCode).toBe(200);
    expect(prisma.user.update.mock.calls[0][0].data).toEqual({ voiceCloningEnabledAt: null });
  });
});
