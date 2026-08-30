/**
 * Unit tests for posts/audio.ts
 * Tests GET /stories/audio, GET /static/:filename
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
    // `...overrides` EN PREMIER : placé en dernier, il réécrasait tout l'objet
    // `sound` fusionné juste au-dessus dès qu'un test passait `{ sound: {...} }`,
    // ne laissant que la clé surchargée. Les mocks de base disparaissaient en
    // silence, et la route tombait en 500 sur la première méthode manquante.
    ...overrides,
    sound: {
      create: jest.fn<any>().mockResolvedValue({ id: 'audio-1', title: 'Test Audio', fileUrl: '/api/v1/static/story_audio_test.mp3', uploader: { username: 'alice' } }),
      findMany: jest.fn<any>().mockResolvedValue([]),
      // Deux usages : `GET /static/:filename` consulte `mutedAt` avant de
      // servir, et `POST /stories/audio` cherche un envoi identique (`null` =
      // aucun, donc création). Le cas coupé vit dans staticMuted.test.ts.
      findFirst: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue({}),
      ...overrides.sound,
    },
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

// ─── POST /stories/audio — RETIRÉE (#4190) ──────────────────────────────────
// Les huit témoins de la moitié MORTE du couple sont partis avec la route.
// La moitié VIVANTE — `GET /stories/audio` (iOS `SoundLibraryService`) et
// `GET /static/:filename` — reste intégralement couverte ci-dessous.

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
    // La clause est passée d'un `title` nu à un `OR` titre/pseudo : un son
    // capturé naît sans titre, le chercher par titre seul le rendait invisible.
    // L'OR de recherche vit dans le AND, à côté du prédicat NOT_MUTED_WHERE —
    // deux OR au même niveau, le second écraserait le premier.
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([expect.objectContaining({ OR: expect.any(Array) })]),
      }),
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

describe('GET /stories/audio — recherche', () => {
  let app: FastifyInstance;
  const findMany = jest.fn<any>().mockResolvedValue([]);
  beforeAll(async () => {
    app = await buildApp({ prismaOverrides: { sound: { findMany } } });
  });
  afterAll(async () => { await app.close(); });

  /**
   * Un son CAPTURÉ naît sans titre — le libellé « Son original » est composé
   * par le client dans sa langue. Chercher le titre seul rendrait donc
   * introuvable tout ce que la bibliothèque produit d'elle-même.
   */
  it('matches the uploader username as well as the title', async () => {
    await app.inject({ method: 'GET', url: '/stories/audio?q=alice' });
    const where = (findMany.mock.calls[0][0] as any).where;
    expect(where.AND[1].OR).toEqual([
      { title: { contains: 'alice', mode: 'insensitive' } },
      { uploader: { username: { contains: 'alice', mode: 'insensitive' } } },
    ]);
    // La découverte reste bornée aux sons publics et non coupés — forme
    // isSet-safe : `mutedAt: null` seul ne matche pas un champ ABSENT en
    // Prisma-Mongo, or aucun chemin de création ne pose `mutedAt` (prod
    // 2026-08-02 : bibliothèque entière invisible).
    expect(where.isPublic).toBe(true);
    expect(where.AND[0]).toEqual({ OR: [{ mutedAt: null }, { mutedAt: { isSet: false } }] });
  });

  it('includes the uploader so the list can credit an author', async () => {
    await app.inject({ method: 'GET', url: '/stories/audio' });
    const args = findMany.mock.calls[findMany.mock.calls.length - 1][0] as any;
    expect(args.include?.uploader).toBeDefined();
  });
});
