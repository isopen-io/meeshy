/**
 * L'administrateur pose la photo et la bannière d'un membre (#8217).
 *
 * Deux voies, une seule adresse — `PUT /admin/users/:userId/profile-images/:kind` :
 *
 *   - `upload` : une image que l'ADMINISTRATEUR vient de téléverser
 *     (`POST /attachments/upload`), reconnue par sa ligne — jamais une URL
 *     arbitraire, qui ferait de la fiche d'un membre un pixel de suivi ;
 *   - `media`  : une image que le MEMBRE a déjà publiée, et seulement une
 *     image déjà PUBLIQUE (post ou reel `PUBLIC`, non supprimé). Une pièce
 *     jointe de message, une story, un post réservé aux amis ne deviennent
 *     jamais une photo de profil — visible de tous — par ce geste.
 *
 * Les témoins assertent sur l'EFFET (la ligne écrite, l'événement émis, la
 * trace d'audit) et sur la REQUÊTE qui décide de l'éligibilité : un double
 * Prisma rend ce qu'on lui dit, seule la forme du `where` porte la garde.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

const cacheDel = jest.fn(async (_cle: string) => undefined);
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ del: cacheDel, get: jest.fn(), set: jest.fn() }),
}));

import { registerUserProfileImageRoutes } from '../../../../routes/admin/user-profile-images';

const ADMIN_ID = '507f1f77bcf86cd799439011';
const CIBLE_ID = '507f1f77bcf86cd799439022';
const MEDIA_ID = '507f1f77bcf86cd799439033';

type Row = Record<string, unknown>;
type AsyncMock = jest.Mock<(args: Row) => Promise<unknown>>;

const cibleRow = (overrides: Row = {}): Row => ({
  id: CIBLE_ID,
  username: 'cible',
  role: 'USER',
  displayName: 'Cible',
  bio: '',
  phoneNumber: null,
  email: 'cible@meeshy.me',
  avatar: null,
  banner: null,
  isActive: true,
  ...overrides,
});

function fakePrisma(options: { cible?: Row | null; media?: Row | null; upload?: Row | null; candidates?: Row[] } = {}) {
  const cible = options.cible === undefined ? cibleRow() : options.cible;
  return {
    user: {
      findUnique: jest.fn(async (args: Row) => {
        const select = (args.select ?? {}) as Row;
        if (cible === null) return null;
        if (Object.keys(select).length === 1 && select.role === true) return { role: cible.role };
        return cible;
      }) as AsyncMock,
      update: jest.fn(async (args: Row) => ({ ...cible, ...(args.data as Row) })) as AsyncMock,
    },
    postMedia: {
      findFirst: jest.fn(async () => (options.media === undefined ? { fileUrl: '/api/v1/attachments/file/post/p.jpg' } : options.media)) as AsyncMock,
      findMany: jest.fn(async () => options.candidates ?? []) as AsyncMock,
      count: jest.fn(async () => (options.candidates ?? []).length) as AsyncMock,
    },
    participant: {
      updateMany: jest.fn(async () => ({ count: 2 })) as AsyncMock,
    },
    messageAttachment: {
      findFirst: jest.fn(async () => (options.upload === undefined ? { fileUrl: '/api/v1/attachments/file/up/a.webp' } : options.upload)) as AsyncMock,
    },
  };
}

type FakePrisma = ReturnType<typeof fakePrisma>;

const createAuditLog = jest.fn(async (_entree: Row) => undefined);
const emitUserUpdated = jest.fn(async (_params: Row) => undefined);

async function buildApp(prisma: FakePrisma, role = 'ADMIN'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: { authContext?: unknown }) => {
    req.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role },
    };
  });
  app.decorate('prisma', prisma as never);
  app.decorate('notificationService', { emitUserUpdated } as never);
  registerUserProfileImageRoutes(app, { userAuditService: { createAuditLog } as never });
  await app.ready();
  return app;
}

const put = (app: FastifyInstance, kind: string, payload: Row) =>
  app.inject({ method: 'PUT', url: `/admin/users/${CIBLE_ID}/profile-images/${kind}`, payload });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PUT /admin/users/:userId/profile-images/:kind — choisir parmi les médias du membre', () => {
  it("écrit l'URL du média choisi, recalcule la complétion, émet user:updated et trace l'audit", async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);

    const res = await put(app, 'avatar', { source: 'media', mediaId: MEDIA_ID, reason: 'photo demandée par le membre' });

    expect(res.statusCode).toBe(200);
    const ecrit = prisma.user.update.mock.calls[0]?.[0] as { where: Row; data: Row };
    expect(ecrit.where).toEqual({ id: CIBLE_ID });
    expect(ecrit.data.avatar).toBe('/api/v1/attachments/file/post/p.jpg');
    expect(typeof ecrit.data.profileCompletionRate).toBe('number');
    expect(emitUserUpdated).toHaveBeenCalledWith({ userId: CIBLE_ID, changes: { avatar: '/api/v1/attachments/file/post/p.jpg' } });
    expect(prisma.participant.updateMany).toHaveBeenCalledWith({
      where: { userId: CIBLE_ID, type: 'user', avatar: { not: null } },
      data: { avatar: null },
    });
    expect(cacheDel).toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      userId: CIBLE_ID,
      adminId: ADMIN_ID,
      action: 'UPDATE_PROFILE',
      changes: { avatar: { before: null, after: '/api/v1/attachments/file/post/p.jpg' } },
      metadata: { reason: 'photo demandée par le membre', source: 'media', mediaId: MEDIA_ID },
    }));
    expect(res.json()).toMatchObject({ success: true, data: { avatar: '/api/v1/attachments/file/post/p.jpg' } });
    await app.close();
  });

  it("ne cherche le média que parmi les images PUBLIQUES du membre, jamais parmi ses pièces jointes de message", async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);

    await put(app, 'banner', { source: 'media', mediaId: MEDIA_ID });

    const where = (prisma.postMedia.findFirst.mock.calls[0]?.[0] as { where: Row }).where;
    expect(where).toMatchObject({
      id: MEDIA_ID,
      mimeType: { startsWith: 'image/' },
      post: { is: expect.objectContaining({ authorId: CIBLE_ID, visibility: 'PUBLIC', type: { in: ['POST', 'REEL'] } }) },
    });
    expect(prisma.messageAttachment.findFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuse en 400 typé un média qui n'est pas une image publique du membre, sans rien écrire", async () => {
    const prisma = fakePrisma({ media: null });
    const app = await buildApp(prisma);

    const res = await put(app, 'avatar', { source: 'media', mediaId: MEDIA_ID });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: 'PROFILE_IMAGE_NOT_ELIGIBLE' });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(emitUserUpdated).not.toHaveBeenCalled();
    await app.close();
  });

  it('la bannière ne touche pas au taux de complétion — elle n’en fait pas partie', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);

    await put(app, 'banner', { source: 'media', mediaId: MEDIA_ID });

    const data = (prisma.user.update.mock.calls[0]?.[0] as { data: Row }).data;
    expect(data).toEqual({ banner: '/api/v1/attachments/file/post/p.jpg' });
    await app.close();
  });
});

describe('PUT /admin/users/:userId/profile-images/:kind — téléverser une nouvelle image', () => {
  it("pose l'image que l'ADMINISTRATEUR vient de téléverser", async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);

    const res = await put(app, 'avatar', { source: 'upload', url: '/api/v1/attachments/file/up/a.webp' });

    expect(res.statusCode).toBe(200);
    const where = (prisma.messageAttachment.findFirst.mock.calls[0]?.[0] as { where: Row }).where;
    expect(where).toMatchObject({
      fileUrl: '/api/v1/attachments/file/up/a.webp',
      uploadedBy: ADMIN_ID,
      mimeType: { startsWith: 'image/' },
    });
    expect((prisma.user.update.mock.calls[0]?.[0] as { data: Row }).data.avatar).toBe('/api/v1/attachments/file/up/a.webp');
    await app.close();
  });

  it("refuse une URL qui n'est pas un téléversement de l'administrateur — jamais une adresse arbitraire", async () => {
    const prisma = fakePrisma({ upload: null });
    const app = await buildApp(prisma);

    const res = await put(app, 'avatar', { source: 'upload', url: 'https://tracker.example/pixel.gif' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: 'PROFILE_IMAGE_UPLOAD_UNKNOWN' });
    expect(prisma.user.update).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('PUT /admin/users/:userId/profile-images/:kind — retirer', () => {
  it("efface l'image et le dit aux clients", async () => {
    const prisma = fakePrisma({ cible: cibleRow({ banner: '/old.jpg' }) });
    const app = await buildApp(prisma);

    const res = await put(app, 'banner', { source: 'none' });

    expect(res.statusCode).toBe(200);
    expect((prisma.user.update.mock.calls[0]?.[0] as { data: Row }).data).toEqual({ banner: null });
    expect(prisma.participant.updateMany).not.toHaveBeenCalled();
    expect(emitUserUpdated).toHaveBeenCalledWith({ userId: CIBLE_ID, changes: { banner: null } });
    await app.close();
  });
});

describe('PUT /admin/users/:userId/profile-images/:kind — gardes', () => {
  it('refuse un emplacement inconnu', async () => {
    const app = await buildApp(fakePrisma());
    const res = await put(app, 'cover', { source: 'none' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('refuse un corps malformé', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await put(app, 'avatar', { source: 'media' });
    expect(res.statusCode).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuse en 403 un rôle sans le droit de modifier les comptes", async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma, 'AUDIT');
    const res = await put(app, 'avatar', { source: 'none' });
    expect(res.statusCode).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse en 403 une cible de rang supérieur ou égal (hiérarchie)', async () => {
    const prisma = fakePrisma({ cible: cibleRow({ role: 'BIGBOSS' }) });
    const app = await buildApp(prisma);
    const res = await put(app, 'avatar', { source: 'none' });
    expect(res.statusCode).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /admin/users/:userId/profile-image-candidates', () => {
  it('liste les images PUBLIQUES du membre, et elles seules', async () => {
    const prisma = fakePrisma({
      candidates: [{
        id: MEDIA_ID,
        fileUrl: '/api/v1/attachments/file/post/p.jpg',
        thumbnailUrl: '/api/v1/attachments/file/post/p-thumb.jpg',
        mimeType: 'image/jpeg',
        width: 800,
        height: 600,
        createdAt: new Date('2026-09-01T10:00:00.000Z'),
        postId: '507f1f77bcf86cd799439044',
      }],
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/admin/users/${CIBLE_ID}/profile-image-candidates` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: [{ id: MEDIA_ID, fileUrl: '/api/v1/attachments/file/post/p.jpg', thumbnailUrl: '/api/v1/attachments/file/post/p-thumb.jpg' }],
      pagination: { total: 1, hasMore: false },
    });
    const where = (prisma.postMedia.findMany.mock.calls[0]?.[0] as { where: Row }).where;
    expect(where).toMatchObject({
      mimeType: { startsWith: 'image/' },
      post: { is: expect.objectContaining({ authorId: CIBLE_ID, visibility: 'PUBLIC' }) },
    });
    await app.close();
  });

  it('se garde comme l’écriture qu’il prépare', async () => {
    const app = await buildApp(fakePrisma(), 'AUDIT');
    const res = await app.inject({ method: 'GET', url: `/admin/users/${CIBLE_ID}/profile-image-candidates` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
