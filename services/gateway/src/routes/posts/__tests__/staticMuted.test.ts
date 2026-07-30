/**
 * staticMuted.test.ts
 *
 * `mutedAt` doit être un ARRÊT DE DIFFUSION, pas une simple métadonnée :
 * `GET /static/:filename` consulte la base avant de servir le fichier, sinon
 * couper un son (DMCA, modération) laisse le fichier accessible à tout porteur
 * de jeton.
 *
 * Harnais repris de `audio.static-route.test.ts` — Fastify nu, répertoire
 * temporaire réel, stub `requiredAuth` — augmenté de `sound.findFirst`, que la
 * route interroge désormais.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
// Note : le module `audio` est importé dynamiquement dans `buildApp` pour que
// UPLOAD_DIR (lu au chargement du module) prenne le répertoire temporaire du test.

type MutedRow = { id: string } | null;

// ---------------------------------------------------------------------------
// Stub du middleware d'authentification — simule la preValidation requiredAuth
// ---------------------------------------------------------------------------

function buildRequiredAuth() {
  return async (request: unknown) => {
    const req = request as Record<string, unknown>;
    req['authContext'] = {
      type: 'registered',
      registeredUser: { id: 'user-abc', username: 'tester' },
      userId: 'user-abc',
      hasFullAccess: true,
    };
  };
}

// ---------------------------------------------------------------------------
// Faux client Prisma — `findFirst` pilote l'état « coupé » du son
// ---------------------------------------------------------------------------

function buildMockPrisma(muted: MutedRow) {
  // Un argument déclaré : sans lui, `toHaveBeenCalledWith(where)` ne compile pas.
  const findFirst = jest.fn<(args: unknown) => Promise<MutedRow>>().mockResolvedValue(muted);
  const prisma = {
    sound: {
      create: jest.fn(),
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      findFirst,
      update: jest.fn(),
    },
  } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
  return { prisma, findFirst };
}

// ---------------------------------------------------------------------------
// Fabrique Fastify
// ---------------------------------------------------------------------------

async function buildApp(uploadDir: string, muted: MutedRow) {
  process.env['UPLOAD_DIR'] = uploadDir;

  jest.resetModules();
  const { registerStoryAudioRoutes } = await import('../audio');

  const { prisma, findFirst } = buildMockPrisma(muted);
  const app: FastifyInstance = Fastify({ logger: false });
  registerStoryAudioRoutes(app, prisma, buildRequiredAuth());
  await app.ready();
  return { app, findFirst };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /static/:filename — mutedAt arrête la diffusion', () => {
  const FILENAME = 'story_audio_muted-uuid.m4a';
  let uploadDir: string;
  let app: FastifyInstance | undefined;

  beforeEach(async () => {
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'meeshy-muted-test-'));
    await fs.writeFile(path.join(uploadDir, FILENAME), Buffer.from('FAKE_AUDIO_BYTES'));
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    await fs.rm(uploadDir, { recursive: true, force: true });
    delete process.env['UPLOAD_DIR'];
  });

  it('test_static_mutedSound_returns410', async () => {
    const built = await buildApp(uploadDir, { id: '507f1f77bcf86cd799439011' });
    app = built.app;

    const response = await app.inject({ method: 'GET', url: `/static/${FILENAME}` });

    expect(response.statusCode).toBe(410);
    const body = JSON.parse(response.body) as { success: boolean; code: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe('SOUND_MUTED');
  });

  it('test_static_mutedSound_bodyIsNotTheFile', async () => {
    const built = await buildApp(uploadDir, { id: '507f1f77bcf86cd799439011' });
    app = built.app;

    const response = await app.inject({ method: 'GET', url: `/static/${FILENAME}` });

    expect(response.body).not.toContain('FAKE_AUDIO_BYTES');
  });

  it('test_static_notMutedSound_returns200', async () => {
    const built = await buildApp(uploadDir, null);
    app = built.app;

    const response = await app.inject({ method: 'GET', url: `/static/${FILENAME}` });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('FAKE_AUDIO_BYTES');
  });

  it('test_static_mutedLookup_isScopedToTheServedFilename', async () => {
    const built = await buildApp(uploadDir, null);
    app = built.app;

    await app.inject({ method: 'GET', url: `/static/${FILENAME}` });

    expect(built.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          fileUrl: { endsWith: `/${FILENAME}` },
          mutedAt: { not: null },
        }),
      }),
    );
  });

  it('test_static_invalidExtension_neverReachesTheDatabase', async () => {
    const built = await buildApp(uploadDir, null);
    app = built.app;

    const response = await app.inject({ method: 'GET', url: '/static/malicious.exe' });

    expect(response.statusCode).toBe(400);
    expect(built.findFirst).not.toHaveBeenCalled();
  });
});
