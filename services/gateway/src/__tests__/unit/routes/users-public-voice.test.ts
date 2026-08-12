/**
 * Tests for the public-profile voice exposure (A2) and the PATCH voicePublic
 * toggle (A3).
 *
 * - Pure unit tests on the `deriveVoiceFields` / `withVoiceFields` helpers.
 * - Integration test on PATCH /users/me { voicePublic } via app.inject,
 *   mocking the heavy mutation-log / cache dependencies.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const updateMany = jest.fn<(...args: unknown[]) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 });

const cacheDel = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({ del: cacheDel }),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn(({ op }: { op: () => Promise<unknown> }) => op()),
}));

jest.mock('../../../middleware/auth', () => ({
  authUserCacheKey: (id: string) => `auth:user:${id}`,
}));

jest.mock('../../../utils/normalize', () => ({
  normalizeEmail: (v: string) => v.toLowerCase(),
  capitalizeName: (v: string) => v,
  normalizeDisplayName: (v: string) => v,
  normalizePhoneNumber: (v: string) => v,
  normalizePhoneWithCountry: (v: string) => ({ isValid: true, phoneNumber: v, countryCode: 'FR' }),
}));

import {
  deriveVoiceFields,
  withVoiceFields,
  updateUserProfile,
} from '../../../routes/users/profile';
import type { VoiceModelFields } from '../../../routes/users/profile';

describe('deriveVoiceFields', () => {
  it('exposes a public voice when opted-in and a reference audio exists', () => {
    const result = deriveVoiceFields({
      voicePublicAt: new Date('2026-01-01T00:00:00Z'),
      referenceAudioUrl: '/api/v1/attachments/file/abc.m4a',
      totalDurationMs: 15000,
      qualityScore: 0.82,
    });
    expect(result).toEqual({
      voicePublic: true,
      voiceSampleUrl: '/api/v1/attachments/file/abc.m4a',
      voiceSampleDurationMs: 15000,
      voiceQuality: 0.82,
    });
  });

  it('hides the voice when not opted-in (voicePublicAt null)', () => {
    expect(
      deriveVoiceFields({
        voicePublicAt: null,
        referenceAudioUrl: '/api/v1/attachments/file/abc.m4a',
        totalDurationMs: 15000,
        qualityScore: 0.82,
      })
    ).toEqual({ voicePublic: false });
  });

  it('hides the voice when opted-in but no reference audio url', () => {
    expect(
      deriveVoiceFields({
        voicePublicAt: new Date(),
        referenceAudioUrl: null,
        totalDurationMs: 15000,
        qualityScore: 0.82,
      })
    ).toEqual({ voicePublic: false });
  });

  it('hides the voice when there is no voice model at all', () => {
    expect(deriveVoiceFields(null)).toEqual({ voicePublic: false });
    expect(deriveVoiceFields(undefined)).toEqual({ voicePublic: false });
  });
});

describe('withVoiceFields', () => {
  it('strips the raw voiceModel relation and merges public voice fields', () => {
    const enriched = withVoiceFields({
      id: 'u1',
      username: 'alice',
      voiceModel: {
        voicePublicAt: new Date(),
        referenceAudioUrl: '/file.m4a',
        totalDurationMs: 9000,
        qualityScore: 0.5,
      },
    });
    expect('voiceModel' in enriched).toBe(false);
    expect(enriched).toMatchObject({
      id: 'u1',
      username: 'alice',
      voicePublic: true,
      voiceSampleUrl: '/file.m4a',
      voiceSampleDurationMs: 9000,
      voiceQuality: 0.5,
    });
  });

  it('returns voicePublic:false and no leak when voiceModel is absent', () => {
    const input: { id: string; username: string; voiceModel?: VoiceModelFields | null } = {
      id: 'u2',
      username: 'bob',
    };
    const enriched = withVoiceFields(input);
    expect('voiceModel' in enriched).toBe(false);
    expect(enriched).toEqual({ id: 'u2', username: 'bob', voicePublic: false });
  });
});

function buildPrisma(): PrismaClient {
  const prisma = {
    user: {
      update: jest.fn(() =>
        Promise.resolve({
          id: 'me-id',
          role: 'USER',
          systemLanguage: 'fr',
          regionalLanguage: 'en',
          customDestinationLanguage: null,
          deviceLocale: null,
        })
      ),
      findUnique: jest.fn(() => Promise.resolve(null)),
      findFirst: jest.fn(() => Promise.resolve(null)),
    },
    userVoiceModel: {
      updateMany,
    },
  };
  return prisma as unknown as PrismaClient;
}

async function buildPatchApp(prisma: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      registeredUser: { id: 'me-id' },
      userId: 'me-id',
    };
  });
  app.addHook('preValidation', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      registeredUser: { id: 'me-id' },
      userId: 'me-id',
    };
  });
  await updateUserProfile(app);
  await app.ready();
  return app;
}

describe('PATCH /users/me { voicePublic }', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeEach(async () => {
    updateMany.mockClear();
    prisma = buildPrisma();
    app = await buildPatchApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  it('sets voicePublicAt to a timestamp when voicePublic=true', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { voicePublic: true },
    });
    expect(res.statusCode).toBe(200);
    expect(updateMany).toHaveBeenCalledTimes(1);
    const arg = updateMany.mock.calls[0][0] as {
      where: { userId: string };
      data: { voicePublicAt: Date | null };
    };
    expect(arg.where).toEqual({ userId: 'me-id' });
    expect(arg.data.voicePublicAt).toBeInstanceOf(Date);
  });

  it('clears voicePublicAt to null when voicePublic=false', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { voicePublic: false },
    });
    expect(res.statusCode).toBe(200);
    expect(updateMany).toHaveBeenCalledTimes(1);
    const arg = updateMany.mock.calls[0][0] as { data: { voicePublicAt: Date | null } };
    expect(arg.data.voicePublicAt).toBeNull();
  });

  it('does not touch the voice model when voicePublic is omitted', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { bio: 'hello' },
    });
    expect(res.statusCode).toBe(200);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
