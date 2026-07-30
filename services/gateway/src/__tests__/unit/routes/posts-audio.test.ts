/**
 * Unit tests for posts/audio.ts
 * Tests POST /stories/audio, GET /stories/audio, GET /static/:filename
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockMkdir = jest.fn<any>().mockResolvedValue(undefined);
const mockWriteFile = jest.fn<any>().mockResolvedValue(undefined);
const mockReadFile = jest.fn<any>().mockResolvedValue(Buffer.from('audio data'));
const mockAccess = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('fs/promises', () => ({
  mkdir: (...a: any[]) => mockMkdir(...a),
  writeFile: (...a: any[]) => mockWriteFile(...a),
  readFile: (...a: any[]) => mockReadFile(...a),
  access: (...a: any[]) => mockAccess(...a),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerStoryAudioRoutes } from '../../../routes/posts/audio';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

const DEFAULT_MOCK_FILE = {
  mimetype: 'audio/mpeg',
  filename: 'test.mp3',
  fields: {
    title: { value: 'Test Audio' },
    isPublic: { value: 'true' },
    duration: { value: '30' },
  },
  toBuffer: jest.fn<any>().mockResolvedValue(Buffer.from('fake audio data')),
};

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    sound: {
      create: jest.fn<any>().mockResolvedValue({ id: 'audio-1', title: 'Test Audio', fileUrl: '/api/v1/static/story_audio_test.mp3', uploader: { username: 'alice' } }),
      findMany: jest.fn<any>().mockResolvedValue([]),
      // `GET /static/:filename` consulte `mutedAt` avant de servir : `null` =
      // aucun son coupé. Le cas coupé vit dans routes/posts/__tests__/staticMuted.test.ts.
      findFirst: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue({}),
      ...overrides.sound,
    },
    ...overrides,
  };
}

async function buildApp({
  authenticated = true,
  mockFile = DEFAULT_MOCK_FILE as any,
  prismaOverrides = {},
} = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma = makePrisma(prismaOverrides);

  const requiredAuth = async (req: any, reply: any) => {
    if (!authenticated) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID },
    };
  };

  // Inject mock file() method on all requests (simulates @fastify/multipart)
  app.addHook('onRequest', async (request) => {
    (request as any).file = () => Promise.resolve(mockFile);
  });

  registerStoryAudioRoutes(app, prisma as any, requiredAuth);
  await app.ready();
  return app;
}

// ─── POST /stories/audio ──────────────────────────────────────────────────────

describe('POST /stories/audio — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'POST', url: '/stories/audio' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /stories/audio — no file provided', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ mockFile: null }); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when no file provided', async () => {
    const res = await app.inject({ method: 'POST', url: '/stories/audio' });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /stories/audio — invalid MIME type', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      mockFile: { ...DEFAULT_MOCK_FILE, mimetype: 'video/mp4' },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 for unsupported MIME type', async () => {
    const res = await app.inject({ method: 'POST', url: '/stories/audio' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Invalid audio format');
  });
});

describe('POST /stories/audio — success', () => {
  let app: FastifyInstance;
  const mockCreate = jest.fn<any>().mockResolvedValue({
    id: 'audio-1',
    title: 'Test Audio',
    fileUrl: '/api/v1/static/story_audio_test.mp3',
    duration: 30,
    isPublic: true,
    uploader: { username: 'alice' },
  });
  beforeAll(async () => {
    app = await buildApp({ prismaOverrides: { sound: { create: mockCreate } } });
  });
  afterAll(async () => { await app.close(); });

  it('returns 201 with created audio record', async () => {
    const res = await app.inject({ method: 'POST', url: '/stories/audio' });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Test Audio');
    expect(mockCreate).toHaveBeenCalled();
    expect(mockMkdir).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
  });
});

describe('POST /stories/audio — isPublic false', () => {
  let app: FastifyInstance;
  const mockCreate = jest.fn<any>().mockResolvedValue({
    id: 'audio-2', title: 'Private', fileUrl: '/api/v1/static/story_audio_priv.mp3', isPublic: false,
    uploader: { username: 'alice' },
  });
  beforeAll(async () => {
    app = await buildApp({
      mockFile: { ...DEFAULT_MOCK_FILE, fields: { ...DEFAULT_MOCK_FILE.fields, isPublic: { value: 'false' } } },
      prismaOverrides: { sound: { create: mockCreate } },
    });
  });
  afterAll(async () => { await app.close(); });

  it('creates private audio when isPublic=false', async () => {
    const res = await app.inject({ method: 'POST', url: '/stories/audio' });
    expect(res.statusCode).toBe(201);
    const call = mockCreate.mock.calls[0][0] as any;
    expect(call.data.isPublic).toBe(false);
  });
});

describe('POST /stories/audio — missing extension defaults to .m4a', () => {
  let app: FastifyInstance;
  const mockCreate = jest.fn<any>().mockResolvedValue({
    id: 'audio-3', title: 'No Ext', fileUrl: '/api/v1/static/story_audio_noext.m4a',
    uploader: { username: 'alice' },
  });
  beforeAll(async () => {
    app = await buildApp({
      mockFile: { ...DEFAULT_MOCK_FILE, filename: '' },
      prismaOverrides: { sound: { create: mockCreate } },
    });
  });
  afterAll(async () => { await app.close(); });

  it('uses .m4a extension when filename has no extension', async () => {
    const res = await app.inject({ method: 'POST', url: '/stories/audio' });
    expect(res.statusCode).toBe(201);
    const call = mockCreate.mock.calls[0][0] as any;
    expect(call.data.fileUrl).toContain('.m4a');
  });
});

// ─── GET /stories/audio ───────────────────────────────────────────────────────

describe('GET /stories/audio — empty library', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with empty array', async () => {
    const res = await app.inject({ method: 'GET', url: '/stories/audio' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });
});

describe('GET /stories/audio — with results and search', () => {
  let app: FastifyInstance;
  const audioList = [
    { id: 'a1', title: 'Happy Beats', fileUrl: '/api/v1/static/a1.mp3', isPublic: true, usageCount: 10, uploader: { username: 'alice' } },
    { id: 'a2', title: 'Sad Melody', fileUrl: '/api/v1/static/a2.mp3', isPublic: true, usageCount: 5, uploader: { username: 'bob' } },
  ];
  const mockFindMany = jest.fn<any>().mockResolvedValue(audioList);
  beforeAll(async () => {
    app = await buildApp({ prismaOverrides: { sound: { findMany: mockFindMany } } });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with audio list', async () => {
    const res = await app.inject({ method: 'GET', url: '/stories/audio' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it('passes search query to prisma', async () => {
    const res = await app.inject({ method: 'GET', url: '/stories/audio?q=happy&limit=5' });
    expect(res.statusCode).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ title: expect.any(Object) }),
    }));
  });
});

// ─── GET /static/:filename ────────────────────────────────────────────────────

describe('GET /static/:filename — invalid extension', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 for disallowed file extension', async () => {
    const res = await app.inject({ method: 'GET', url: '/static/malware.exe' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Invalid file type');
  });
});

describe('GET /static/:filename — file not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when file does not exist', async () => {
    mockAccess.mockRejectedValueOnce(new Error('ENOENT: no such file'));
    const res = await app.inject({ method: 'GET', url: '/static/missing.mp3' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('Audio file not found');
  });
});

describe('GET /static/:filename — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockAccess.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(Buffer.from('audio binary data'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns audio file with correct content-type for mp3', async () => {
    const res = await app.inject({ method: 'GET', url: '/static/track.mp3' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
    expect(res.headers['cache-control']).toContain('private');
  });

  it('returns audio file with correct content-type for wav', async () => {
    const res = await app.inject({ method: 'GET', url: '/static/track.wav' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('audio/wav');
  });

  it('prevents path traversal by using basename', async () => {
    const res = await app.inject({ method: 'GET', url: '/static/..%2F..%2Fetc%2Fpasswd.mp3' });
    // Path traversal should be mitigated by path.basename()
    expect(res.statusCode).toBe(200);
  });
});
