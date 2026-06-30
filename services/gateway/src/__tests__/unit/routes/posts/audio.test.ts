/**
 * Unit tests for story audio routes (audio.ts)
 * Tests GET /stories/audio, POST /stories/audio/:audioId/use,
 * GET /static/:filename.
 * Note: POST /stories/audio (multipart upload) is excluded — requires @fastify/multipart integration.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import path from 'path';
import fs from 'fs/promises';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('fs/promises', () => ({
  mkdir: jest.fn<any>().mockResolvedValue(undefined),
  writeFile: jest.fn<any>().mockResolvedValue(undefined),
  access: jest.fn<any>().mockResolvedValue(undefined),
  readFile: jest.fn<any>().mockResolvedValue(Buffer.from('fake audio data')),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerStoryAudioRoutes } from '../../../../routes/posts/audio';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const AUDIO_ID = '507f1f77bcf86cd799439033';

const mockAudio = {
  id: AUDIO_ID,
  uploaderId: USER_ID,
  fileUrl: '/api/v1/static/story_audio_abc123.mp3',
  title: 'Chill Vibes',
  duration: 30,
  isPublic: true,
  usageCount: 5,
  uploader: { username: 'alice' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePreValidationAuth(authenticated: boolean) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
      };
    } else {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
  };
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    storyBackgroundAudio: {
      create: jest.fn<any>().mockResolvedValue(mockAudio),
      findMany: jest.fn<any>().mockResolvedValue([mockAudio]),
      update: jest.fn<any>().mockResolvedValue({ ...mockAudio, usageCount: 6 }),
    },
    ...overrides,
  };
}

async function buildApp(opts: {
  authenticated?: boolean;
  prisma?: any;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false });
  const requiredAuth = makePreValidationAuth(authenticated);

  registerStoryAudioRoutes(app, prisma as any, requiredAuth);
  await app.ready();
  return app;
}

// ─── GET /stories/audio ───────────────────────────────────────────────────────

describe('GET /stories/audio — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: '/stories/audio' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /stories/audio — success', () => {
  it('returns 200 with list of audios', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/stories/audio' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /stories/audio — with query filter', () => {
  it('returns 200 with q and limit params', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/stories/audio?q=chill&limit=5' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /stories/audio — empty result', () => {
  it('returns 200 with empty array when no audios found', async () => {
    const prisma = makePrisma({
      storyBackgroundAudio: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        update: jest.fn<any>().mockResolvedValue({}),
        create: jest.fn<any>().mockResolvedValue(mockAudio),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/stories/audio' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    await app.close();
  });
});

describe('GET /stories/audio — invalid limit', () => {
  it('returns 400 when limit is out of range', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/stories/audio?limit=999' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /stories/audio/:audioId/use ────────────────────────────────────────

describe('POST /stories/audio/:audioId/use — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'POST', url: `/stories/audio/${AUDIO_ID}/use`, payload: {} });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /stories/audio/:audioId/use — success', () => {
  it('returns 200 when usage count is incremented', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/stories/audio/${AUDIO_ID}/use`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('POST /stories/audio/:audioId/use — non-existent audio', () => {
  it('returns 200 silently when audio does not exist (update throws, caught silently)', async () => {
    const prisma = makePrisma({
      storyBackgroundAudio: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        update: jest.fn<any>().mockRejectedValue(new Error('Record not found')),
        create: jest.fn<any>().mockResolvedValue(mockAudio),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: `/stories/audio/${AUDIO_ID}/use`, payload: {} });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── GET /static/:filename ────────────────────────────────────────────────────

describe('GET /static/:filename — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: '/static/test.mp3' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /static/:filename — success mp3', () => {
  it('returns 200 with audio content', async () => {
    const mockFs = fs as jest.Mocked<typeof fs>;
    mockFs.access.mockResolvedValueOnce(undefined);
    mockFs.readFile.mockResolvedValueOnce(Buffer.from('fake mp3 data') as any);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/static/story_audio_abc123.mp3' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
    await app.close();
  });
});

describe('GET /static/:filename — invalid extension', () => {
  it('returns 400 when file has non-audio extension', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/static/malicious.exe' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /static/:filename — file not found', () => {
  it('returns 404 when file does not exist on disk', async () => {
    const mockFs = fs as jest.Mocked<typeof fs>;
    mockFs.access.mockRejectedValueOnce(new Error('ENOENT') as any);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/static/missing.mp3' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /static/:filename — ogg content type', () => {
  it('returns 200 with audio/ogg content-type for .ogg file', async () => {
    const mockFs = fs as jest.Mocked<typeof fs>;
    mockFs.access.mockResolvedValueOnce(undefined);
    mockFs.readFile.mockResolvedValueOnce(Buffer.from('fake ogg data') as any);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/static/audio_test.ogg' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('audio/ogg');
    await app.close();
  });
});
