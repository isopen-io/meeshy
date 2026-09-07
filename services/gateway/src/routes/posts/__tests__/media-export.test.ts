/**
 * GET /posts/:postId/media/:mediaId/export — export watermarké (#3600).
 *
 * Le service de watermarkage lui-même (`services/media/mediaWatermark.ts`)
 * a ses propres témoins (`services/media/__tests__/mediaWatermark.test.ts`).
 * Ici, on garde le CONTRAT de la route : authentification, porte d'audience
 * du post (`mayConsumePost`, la même que favori/impression/partage — jamais
 * réimplémentée localement), appartenance du média AU post visé, type
 * supporté, et cache (une variante déjà présente ne régénère pas).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const applyImageWatermark = jest.fn<any>().mockResolvedValue(undefined);
const applyVideoWatermark = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../services/media/mediaWatermark', () => {
  const actual = jest.requireActual('../../../services/media/mediaWatermark') as object;
  return {
    ...actual,
    applyImageWatermark: (...args: unknown[]) => applyImageWatermark(...args),
    applyVideoWatermark: (...args: unknown[]) => applyVideoWatermark(...args),
  };
});

import { registerPostMediaExportRoutes } from '../media-export';
import { watermarkedVariantPath } from '../../../services/media/mediaWatermark';

const AUTHOR_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439022';
const POST_ID = '507f1f77bcf86cd799439033';
const MEDIA_ID = '507f1f77bcf86cd799439044';

function makePreValidationAuth(userId: string | null) {
  return async (req: FastifyRequest) => {
    (req as any).authContext = userId
      ? { isAuthenticated: true, registeredUser: { id: userId, role: 'USER' } }
      : null;
  };
}

interface PostRow {
  id: string;
  authorId: string;
  visibility: string;
  visibilityUserIds: string[];
  expiresAt: Date | null;
}

interface MediaRow {
  id: string;
  postId: string;
  filePath: string;
  mimeType: string;
}

function post(overrides: Partial<PostRow> = {}): PostRow {
  return {
    id: POST_ID,
    authorId: AUTHOR_ID,
    visibility: 'PUBLIC',
    visibilityUserIds: [],
    expiresAt: null,
    ...overrides,
  };
}

function media(overrides: Partial<MediaRow> = {}): MediaRow {
  return {
    id: MEDIA_ID,
    postId: POST_ID,
    filePath: 'photo.jpg',
    mimeType: 'image/jpeg',
    ...overrides,
  };
}

async function buildApp(opts: {
  userId?: string | null;
  postRow?: PostRow | null;
  mediaRow?: MediaRow | null;
  uploadBasePath?: string;
} = {}) {
  const { userId = AUTHOR_ID, postRow = post(), mediaRow = media(), uploadBasePath = '/tmp/meeshy-export-test' } = opts;
  const app = Fastify({ logger: false });

  const postFindFirst = jest.fn<any>(async () => (postRow ? { ...postRow, author: { username: 'alice' } } : null));
  const mediaFindFirst = jest.fn<any>(async (args: any) => {
    if (!mediaRow) return null;
    if (args.where.id !== mediaRow.id || args.where.postId !== mediaRow.postId) return null;
    return mediaRow;
  });

  const prisma = {
    post: { findFirst: postFindFirst },
    postMedia: { findFirst: mediaFindFirst },
    postComment: {},
    friendRequest: {},
    communityMember: {},
    participant: {},
    postMention: {},
  } as any;

  registerPostMediaExportRoutes(app, prisma, makePreValidationAuth(userId), uploadBasePath);
  await app.ready();
  return { app, postFindFirst, mediaFindFirst };
}

describe('GET /posts/:postId/media/:mediaId/export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rend 401 sans contexte auth', async () => {
    const { app } = await buildApp({ userId: null });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/media/${MEDIA_ID}/export` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('rend 404 quand le post est PRIVATE et le lecteur n’est pas l’auteur', async () => {
    const { app } = await buildApp({
      userId: OTHER_USER_ID,
      postRow: post({ visibility: 'PRIVATE' }),
    });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/media/${MEDIA_ID}/export` });
    expect(res.statusCode).toBe(404);
    expect(applyImageWatermark).not.toHaveBeenCalled();
    await app.close();
  });

  it('rend 404 quand le média n’appartient pas au post visé', async () => {
    const { app } = await buildApp({
      mediaRow: media({ postId: '507f1f77bcf86cd799439099' }),
    });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/media/${MEDIA_ID}/export` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('rend 404 sur un identifiant malformé, sans lever', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/not-an-id/media/${MEDIA_ID}/export` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('rend 404 pour un type de média non supporté (ex. PDF)', async () => {
    const { app } = await buildApp({ mediaRow: media({ mimeType: 'application/pdf' }) });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/media/${MEDIA_ID}/export` });
    expect(res.statusCode).toBe(404);
    expect(applyImageWatermark).not.toHaveBeenCalled();
    await app.close();
  });

  describe('génération — image', () => {
    const uploadBasePath = path.join(os.tmpdir(), `meeshy-export-${Date.now()}-img`);

    afterEach(async () => {
      await fs.rm(uploadBasePath, { recursive: true, force: true });
    });

    it('appelle applyImageWatermark avec la source et la destination attendues, puis sert le fichier', async () => {
      const destPath = watermarkedVariantPath(uploadBasePath, MEDIA_ID, '.jpg');
      applyImageWatermark.mockImplementationOnce(async () => {
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.writeFile(destPath, 'watermarked-bytes');
      });

      const { app } = await buildApp({ uploadBasePath });
      const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/media/${MEDIA_ID}/export` });

      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('watermarked-bytes');
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(applyImageWatermark).toHaveBeenCalledWith({
        sourcePath: path.join(uploadBasePath, 'photo.jpg'),
        destPath,
        handle: '@alice',
        mediaId: MEDIA_ID,
      });
      expect(applyVideoWatermark).not.toHaveBeenCalled();
      await app.close();
    });

    it('ne régénère PAS une variante déjà en cache', async () => {
      const destPath = watermarkedVariantPath(uploadBasePath, MEDIA_ID, '.jpg');
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, 'cached-bytes');

      const { app } = await buildApp({ uploadBasePath });
      const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/media/${MEDIA_ID}/export` });

      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('cached-bytes');
      expect(applyImageWatermark).not.toHaveBeenCalled();
      await app.close();
    });

    it('rend 404 quand la génération échoue, sans lever', async () => {
      applyImageWatermark.mockRejectedValueOnce(new Error('sharp: input file is missing'));
      const { app } = await buildApp({ uploadBasePath: path.join(os.tmpdir(), `meeshy-export-${Date.now()}-fail`) });

      const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/media/${MEDIA_ID}/export` });

      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('replie sur @meeshy quand l’auteur n’est plus résolvable', async () => {
      const destPath = watermarkedVariantPath(uploadBasePath, MEDIA_ID, '.jpg');
      applyImageWatermark.mockImplementationOnce(async () => {
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.writeFile(destPath, 'x');
      });

      const app = Fastify({ logger: false });
      // `mayConsumePost` (porte d'audience) et la route (résolution du handle)
      // appellent TOUTES DEUX `post.findFirst` — la première a besoin de la
      // tranche ACL, la seconde de l'auteur seul. On les distingue par la
      // forme du `select`, exactement comme le ferait un double Prisma qui
      // évalue vraiment sa requête.
      const postFindFirst = jest.fn<any>(async (args: any) =>
        args?.select?.author ? null : post(),
      );
      const mediaFindFirst = jest.fn<any>(async () => media());
      const prisma = {
        post: { findFirst: postFindFirst },
        postMedia: { findFirst: mediaFindFirst },
        postComment: {}, friendRequest: {}, communityMember: {}, participant: {}, postMention: {},
      } as any;
      registerPostMediaExportRoutes(app, prisma, makePreValidationAuth(AUTHOR_ID), uploadBasePath);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/media/${MEDIA_ID}/export` });

      expect(res.statusCode).toBe(200);
      expect(applyImageWatermark).toHaveBeenCalledWith(
        expect.objectContaining({ handle: '@meeshy' }),
      );
      await app.close();
    });

    it('rend 500 quand la porte d’audience lève de façon inattendue', async () => {
      const app = Fastify({ logger: false });
      const postFindFirst = jest.fn<any>(async () => { throw new Error('Mongo down'); });
      const prisma = {
        post: { findFirst: postFindFirst },
        postMedia: { findFirst: jest.fn() },
        postComment: {}, friendRequest: {}, communityMember: {}, participant: {}, postMention: {},
      } as any;
      registerPostMediaExportRoutes(app, prisma, makePreValidationAuth(AUTHOR_ID), uploadBasePath);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/media/${MEDIA_ID}/export` });

      expect(res.statusCode).toBe(500);
      await app.close();
    });

    it('déduplique deux requêtes concurrentes pour la MÊME variante — une seule génération', async () => {
      const destPath = watermarkedVariantPath(uploadBasePath, MEDIA_ID, '.jpg');
      let resolveGeneration: () => void = () => {};
      applyImageWatermark.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveGeneration = () => {
              fs.mkdir(path.dirname(destPath), { recursive: true })
                .then(() => fs.writeFile(destPath, 'once'))
                .then(() => resolve());
            };
          }),
      );

      const { app } = await buildApp({ uploadBasePath });
      const first = app.inject({ method: 'GET', url: `/posts/${POST_ID}/media/${MEDIA_ID}/export` });
      // Laisse la première requête entrer dans `ensureWatermarkedVariant` et
      // poser sa promesse dans `generationsInFlight` avant que la seconde ne parte.
      await new Promise((r) => setTimeout(r, 10));
      const second = app.inject({ method: 'GET', url: `/posts/${POST_ID}/media/${MEDIA_ID}/export` });

      resolveGeneration();
      const [resFirst, resSecond] = await Promise.all([first, second]);

      expect(resFirst.statusCode).toBe(200);
      expect(resSecond.statusCode).toBe(200);
      expect(applyImageWatermark).toHaveBeenCalledTimes(1);
      await app.close();
    });
  });

  describe('génération — vidéo', () => {
    const uploadBasePath = path.join(os.tmpdir(), `meeshy-export-${Date.now()}-vid`);

    afterEach(async () => {
      await fs.rm(uploadBasePath, { recursive: true, force: true });
    });

    it('route un mimeType vidéo vers applyVideoWatermark, jamais applyImageWatermark', async () => {
      const destPath = watermarkedVariantPath(uploadBasePath, MEDIA_ID, '.mp4');
      applyVideoWatermark.mockImplementationOnce(async () => {
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.writeFile(destPath, 'video-bytes');
      });

      const { app } = await buildApp({
        uploadBasePath,
        mediaRow: media({ filePath: 'clip.mp4', mimeType: 'video/mp4' }),
      });
      const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/media/${MEDIA_ID}/export` });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('video/mp4');
      expect(applyVideoWatermark).toHaveBeenCalledWith({
        sourcePath: path.join(uploadBasePath, 'clip.mp4'),
        destPath,
        handle: '@alice',
        mediaId: MEDIA_ID,
      });
      expect(applyImageWatermark).not.toHaveBeenCalled();
      await app.close();
    });
  });
});
