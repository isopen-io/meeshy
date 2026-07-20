/**
 * Extended unit tests for routes/posts/audio.ts
 * Covers POST /stories/audio (lines 44-83):
 * - unauthenticated path
 * - no file provided
 * - invalid mime type
 * - success with all field variants
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

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
const AUDIO_ID = '507f1f77bcf86cd799439044';

const mockAudio = {
  id: AUDIO_ID,
  uploaderId: USER_ID,
  fileUrl: '/api/v1/static/story_audio_abc123.mp3',
  title: 'Test Sound',
  duration: 30,
  isPublic: true,
  usageCount: 0,
  uploader: { username: 'alice' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequiredAuth(authenticated: boolean) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
      };
    } else {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
  };
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    storyBackgroundAudio: {
      create: jest.fn<any>().mockResolvedValue(mockAudio),
      findMany: jest.fn<any>().mockResolvedValue([mockAudio]),
      update: jest.fn<any>().mockResolvedValue({ ...mockAudio, usageCount: 1 }),
    },
    ...overrides,
  } as any;
}

type FileMock = {
  mimetype: string;
  filename?: string;
  fields?: Record<string, { value: string }>;
  toBuffer?: () => Promise<Buffer>;
} | null;

async function buildApp(opts: {
  authenticated?: boolean;
  prisma?: any;
  fileMock?: FileMock;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, prisma = makePrisma(), fileMock } = opts;

  const app = Fastify({ logger: false });
  const requiredAuth = makeRequiredAuth(authenticated);

  if (fileMock !== undefined) {
    app.addHook('preHandler', async (req: FastifyRequest) => {
      (req as any).file = async () => fileMock;
    });
  }

  registerStoryAudioRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

// ─── POST /stories/audio — no registeredUser in authContext (lines 44-47) ─────

describe('POST /stories/audio — authContext with no registeredUser (lines 44-47)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    // Use a custom requiredAuth that sets authContext without registeredUser
    const customRequiredAuth = async (req: FastifyRequest) => {
      (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: null };
    };
    const appInstance = Fastify({ logger: false });
    appInstance.addHook('preHandler', async (req: FastifyRequest) => {
      (req as any).file = async () => ({
        mimetype: 'audio/mpeg',
        filename: 'test.mp3',
        fields: {},
        toBuffer: async () => Buffer.from('data'),
      });
    });
    registerStoryAudioRoutes(appInstance, prisma, customRequiredAuth);
    await appInstance.ready();
    app = appInstance;
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when registeredUser is null in authContext', async () => {
    const res = await app.inject({ method: 'POST', url: '/stories/audio' });
    expect(res.statusCode).toBe(401);
  });
});

// ─── POST /stories/audio — no file provided (lines 49-52) ────────────────────

describe('POST /stories/audio — no file provided (lines 49-52)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ fileMock: null });
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 when no file is uploaded', async () => {
    const res = await app.inject({ method: 'POST', url: '/stories/audio' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('NO_FILE');
  });
});

// ─── POST /stories/audio — invalid mime type (lines 53-55) ───────────────────

describe('POST /stories/audio — invalid mime type (lines 53-55)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      fileMock: {
        mimetype: 'video/mp4',
        filename: 'video.mp4',
        fields: {},
        toBuffer: async () => Buffer.from('data'),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 for unsupported mime type', async () => {
    const res = await app.inject({ method: 'POST', url: '/stories/audio' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('INVALID_AUDIO_FORMAT');
  });
});

// ─── POST /stories/audio — success with all fields (lines 57-83) ─────────────

describe('POST /stories/audio — success with title, isPublic, duration (lines 57-83)', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  beforeAll(async () => {
    prisma = makePrisma();
    app = await buildApp({
      prisma,
      fileMock: {
        mimetype: 'audio/wav',
        filename: 'my-track.wav',
        fields: {
          title: { value: 'My Great Track' },
          isPublic: { value: 'true' },
          duration: { value: '45' },
        },
        toBuffer: async () => Buffer.from('wav audio data'),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 201 with created audio record', async () => {
    const res = await app.inject({ method: 'POST', url: '/stories/audio' });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(prisma.storyBackgroundAudio.create).toHaveBeenCalled();
  });
});

// ─── POST /stories/audio — success with isPublic=false (line 58) ─────────────

describe('POST /stories/audio — isPublic=false variant', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      fileMock: {
        mimetype: 'audio/mpeg',
        filename: 'track.mp3',
        fields: {
          isPublic: { value: 'false' },
          duration: { value: 'invalid' },
        },
        toBuffer: async () => Buffer.from('mp3 data'),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 201 with isPublic=false and handles invalid duration', async () => {
    const res = await app.inject({ method: 'POST', url: '/stories/audio' });
    expect(res.statusCode).toBe(201);
  });
});

// ─── POST /stories/audio — success with no extension (fallback .m4a) ─────────

describe('POST /stories/audio — no filename extension (fallback .m4a)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      fileMock: {
        mimetype: 'audio/aac',
        filename: 'audiofile',
        fields: {},
        toBuffer: async () => Buffer.from('aac data'),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 201 using fallback extension .m4a', async () => {
    const res = await app.inject({ method: 'POST', url: '/stories/audio' });
    expect(res.statusCode).toBe(201);
  });
});
