/**
 * Unit tests for story audio routes (audio.ts)
 * Tests GET /stories/audio, GET /static/:filename.
 * `POST /stories/audio` a été RETIRÉE (#4190) — voir la note en fin de fichier.
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
    sound: {
      create: jest.fn<any>().mockResolvedValue(mockAudio),
      findMany: jest.fn<any>().mockResolvedValue([mockAudio]),
      // `GET /static/:filename` consulte `mutedAt` avant de servir : `null` =
      // aucun son coupé. Le cas coupé vit dans routes/posts/__tests__/staticMuted.test.ts.
      findFirst: jest.fn<any>().mockResolvedValue(null),
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
      sound: {
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

// ─── POST /stories/audio — RETIRÉE (#4190) ───────────────────────────────────
//
// Les huit témoins de la moitié MORTE du couple homonyme sont partis avec la
// route, et `buildUploadApp` avec eux — ce harnais ne servait qu'à elle.
// Ce n'est pas une capacité qui disparaît mais une porte SANS APPELANT : aucun
// des trois clients n'émettait ce POST, et il matérialisait tout l'envoi en
// mémoire (`toBuffer()`), d'où la borne de 100 Mo qui part avec lui.
//
// La moitié VIVANTE du couple — `GET /stories/audio` (iOS `SoundLibraryService`)
// et `GET /static/:filename` — garde ci-dessus TOUTE sa couverture ; c'est elle
// que ce retrait pouvait emporter par accident, le verbe étant la seule chose
// qui distingue les deux routes.
//
// L'ABSENCE du POST est gardée là où la table de routes se lit vraiment, et non
// par le silence de ce fichier : `unit/routes/orphan-route-removal.test.ts`
// § « la bibliothèque de sons garde sa moitié vivante » pose les DEUX moitiés
// dans le même bloc — « ne monte plus POST /stories/audio » ET « monte toujours
// GET /stories/audio » — ce qui empêche cette garde négative de mourir en
// silence le jour où plus rien ne serait énuméré.
