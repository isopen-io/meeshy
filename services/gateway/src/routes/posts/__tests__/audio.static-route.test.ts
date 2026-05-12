/**
 * audio.static-route.test.ts
 *
 * Verifies that GET /static/:filename serves story background audio files
 * correctly — content-type, 404 on missing files, auth guard, and
 * rejection of non-audio extensions.
 *
 * Mounts a minimal Fastify instance with a real temp directory so the
 * filesystem assertions are genuine; no database required.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { registerStoryAudioRoutes } from '../audio';

// ---------------------------------------------------------------------------
// Auth middleware stub — simulates requiredAuth preValidation
// ---------------------------------------------------------------------------

function buildRequiredAuth(authenticated = true) {
  return async (request: unknown, reply: unknown) => {
    if (!authenticated) {
      const r = reply as { code: (n: number) => { send: (b: unknown) => void } };
      r.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    } else {
      const req = request as Record<string, unknown>;
      req['authContext'] = {
        type: 'registered',
        registeredUser: { id: 'user-abc', username: 'tester' },
        userId: 'user-abc',
        hasFullAccess: true,
      };
    }
  };
}

// ---------------------------------------------------------------------------
// Prisma stub — only stubs used by registerStoryAudioRoutes
// ---------------------------------------------------------------------------

function buildMockPrisma() {
  return {
    storyBackgroundAudio: {
      create: jest.fn(),
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      update: jest.fn(),
    },
  } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
}

// ---------------------------------------------------------------------------
// Fastify factory
// ---------------------------------------------------------------------------

async function buildApp(opts: { authenticated?: boolean; uploadDir: string } = { uploadDir: '/tmp' }) {
  const { authenticated = true, uploadDir } = opts;

  process.env['UPLOAD_DIR'] = uploadDir;

  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('prisma', buildMockPrisma());
  registerStoryAudioRoutes(app, buildMockPrisma(), buildRequiredAuth(authenticated));
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /static/:filename — story audio static route', () => {
  let uploadDir: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'meeshy-audio-test-'));
  });

  afterEach(async () => {
    await app?.close();
    await fs.rm(uploadDir, { recursive: true, force: true });
    delete process.env['UPLOAD_DIR'];
  });

  it('should_serve_audio_files_from_static_route', async () => {
    const filename = 'story_audio_test-uuid.m4a';
    await fs.writeFile(path.join(uploadDir, filename), Buffer.from('FAKE_AUDIO_BYTES'));
    app = await buildApp({ uploadDir });

    const response = await app.inject({
      method: 'GET',
      url: `/static/${filename}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('FAKE_AUDIO_BYTES');
  });

  it('should_set_correct_content_type', async () => {
    const cases: Array<[string, string]> = [
      ['clip.mp3', 'audio/mpeg'],
      ['clip.wav', 'audio/wav'],
      ['clip.m4a', 'audio/x-m4a'],
      ['clip.aac', 'audio/aac'],
      ['clip.ogg', 'audio/ogg'],
    ];

    app = await buildApp({ uploadDir });

    for (const [filename, expectedMime] of cases) {
      await fs.writeFile(path.join(uploadDir, filename), Buffer.from('x'));

      const response = await app.inject({
        method: 'GET',
        url: `/static/${filename}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain(expectedMime);
    }
  });

  it('should_return_404_for_nonexistent_audio', async () => {
    app = await buildApp({ uploadDir });

    const response = await app.inject({
      method: 'GET',
      url: '/static/story_audio_does-not-exist.m4a',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FILE_NOT_FOUND');
  });

  it('should_reject_non_audio_extensions', async () => {
    app = await buildApp({ uploadDir });

    const response = await app.inject({
      method: 'GET',
      url: '/static/malicious.exe',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('should_reject_path_traversal_attempts', async () => {
    const sensitiveFile = path.join(uploadDir, '..', 'sensitive.m4a');
    await fs.writeFile(sensitiveFile, Buffer.from('SECRET')).catch(() => null);

    app = await buildApp({ uploadDir });

    const response = await app.inject({
      method: 'GET',
      url: '/static/..%2Fsensitive.m4a',
    });

    expect([400, 404]).toContain(response.statusCode);
  });

  it('should_require_auth_if_configured', async () => {
    app = await buildApp({ authenticated: false, uploadDir });

    const response = await app.inject({
      method: 'GET',
      url: '/static/any.m4a',
    });

    expect(response.statusCode).toBe(401);
  });
});
