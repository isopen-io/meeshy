/**
 * #11267 — UNE URL EXISTANTE CONTINUE DE SERVIR pendant la migration vers le
 * seau : quand le disque n'a plus les octets, la route de fichiers les sert
 * depuis le seau S3 — par la passerelle, sous les MÊMES gardes (lecteur,
 * cycle de vie, cache), avec plages et ETag. Le seau n'est jamais adressé
 * directement par un client.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';

const mockGetAttachment = jest.fn<any>();
const mockStat = jest.fn<any>();

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    getAttachment: (...a: any[]) => mockGetAttachment(...a),
    getFilePath: async () => '/uploads/attachments/2026/10/clip.mp4',
    getThumbnailPath: async () => '/uploads/attachments/2026/10/clip_thumb.webp',
  })),
}));

jest.mock('../../../services/attachments/thumbnail', () => ({ thumbnailContentType: jest.fn<any>().mockReturnValue('image/webp') }));

jest.mock('fs/promises', () => ({ stat: (...a: any[]) => mockStat(...a) }));

import { registerDownloadRoutes } from '../../../routes/attachments/download';
import { VIEW_ONCE_ATTACHMENT_CACHE } from '../../../services/attachments/fileRouteVerdict';
import type { ByteRange, MediaObjectStore } from '../../../services/storage/objects/MediaObjectStore';

const ID = 'aaaaaaaaaaaaaaaaaaaaaaa0';
const KEY = '2026/10/clip.mp4';
const BYTES = Buffer.from('0123456789'.repeat(20));
const MIRROR_ETAG = '"d41d8cd98f00b204e9800998ecf8427e"';

function mirrorWith(objects: Record<string, Buffer>) {
  const reads: Array<{ key: string; range?: ByteRange }> = [];
  const store: MediaObjectStore = {
    head: async (key) => (objects[key] ? { size: objects[key]!.length, etag: MIRROR_ETAG, lastModified: null, contentType: null } : null),
    read: async (key, range) => {
      reads.push({ key, ...(range ? { range } : {}) });
      const bytes = objects[key];
      if (!bytes) return null;
      return Readable.from([range ? bytes.subarray(range.start, range.end + 1) : bytes]);
    },
    write: async () => undefined,
    remove: async () => undefined,
  };
  return { store, reads };
}

function makePrisma(isViewOnce = false) {
  const row = { id: ID, filePath: KEY, messageId: 'm1', isViewOnce };
  const carrier = { id: 'm1', isViewOnce };
  return {
    messageAttachment: {
      findUnique: jest.fn<any>().mockResolvedValue(row),
      findMany: jest.fn<any>().mockImplementation(async ({ where }: any) => {
        const clauses = (where.OR as Record<string, unknown>[] | undefined) ?? [where];
        return clauses.some((clause) => clause.filePath === KEY) ? [row] : [];
      }),
    },
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: 'conv-1', ...carrier }),
      findMany: jest.fn<any>().mockResolvedValue([carrier]),
    },
    participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'part-1' }) },
    messageStatusEntry: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  };
}

async function buildApp(mirror: MediaObjectStore | null, isViewOnce = false): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as unknown as Record<string, unknown>).authContext = { isAuthenticated: true, isAnonymous: false, userId: 'user-1' };
  });
  registerDownloadRoutes(app, makePrisma(isViewOnce) as never, { uploadRoot: '/uploads/attachments', mirror });
  await app.ready();
  return app;
}

beforeEach(() => {
  mockStat.mockReset();
  mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  mockGetAttachment.mockReset();
  mockGetAttachment.mockResolvedValue({ id: ID, mimeType: 'video/mp4', originalName: 'clip.mp4', messageId: 'm1', uploadedBy: 'user-1' });
});

describe('#11267 — le disque n’a plus le fichier : la passerelle le sert depuis le seau', () => {
  it('par identifiant : les octets du seau, son ETag, le type de la pièce', async () => {
    const mirror = mirrorWith({ [KEY]: BYTES });
    const app = await buildApp(mirror.store);

    const res = await app.inject({ method: 'GET', url: `/attachments/${ID}` });

    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(BYTES)).toBe(true);
    expect(res.headers['etag']).toBe(MIRROR_ETAG);
    expect(res.headers['content-length']).toBe(String(BYTES.length));
    expect(res.headers['content-type']).toBe('video/mp4');
    await app.close();
  });

  it('une plage se demande au seau : 206, seulement les octets demandés', async () => {
    const mirror = mirrorWith({ [KEY]: BYTES });
    const app = await buildApp(mirror.store);

    const res = await app.inject({ method: 'GET', url: `/attachments/${ID}`, headers: { range: 'bytes=10-19' } });

    expect(res.statusCode).toBe(206);
    expect(res.payload).toBe('0123456789');
    expect(res.headers['content-range']).toBe(`bytes 10-19/${BYTES.length}`);
    expect(mirror.reads).toEqual([{ key: KEY, range: { start: 10, end: 19 } }]);
    await app.close();
  });

  it('un If-None-Match qui désigne la copie du seau rend 304 sans lire ses octets', async () => {
    const mirror = mirrorWith({ [KEY]: BYTES });
    const app = await buildApp(mirror.store);

    const res = await app.inject({ method: 'GET', url: `/attachments/${ID}`, headers: { 'if-none-match': MIRROR_ETAG } });

    expect(res.statusCode).toBe(304);
    expect(mirror.reads).toEqual([]);
    await app.close();
  });

  it('par chemin : la même clé, les mêmes octets', async () => {
    const mirror = mirrorWith({ [KEY]: BYTES });
    const app = await buildApp(mirror.store);

    const res = await app.inject({ method: 'GET', url: `/attachments/file/${encodeURIComponent(KEY)}` });

    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(BYTES)).toBe(true);
    await app.close();
  });

  it('les gardes ne bougent pas : une vue unique servie du seau garde no-store', async () => {
    const app = await buildApp(mirrorWith({ [KEY]: BYTES }).store, true);

    const res = await app.inject({ method: 'GET', url: `/attachments/${ID}` });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe(VIEW_ONCE_ATTACHMENT_CACHE);
    await app.close();
  });

  it('absent du disque ET du seau : 404', async () => {
    const app = await buildApp(mirrorWith({}).store);
    expect((await app.inject({ method: 'GET', url: `/attachments/${ID}` })).statusCode).toBe(404);
    await app.close();
  });

  it('sans seau configuré, rien ne change : 404 quand le disque n’a pas le fichier', async () => {
    const app = await buildApp(null);
    expect((await app.inject({ method: 'GET', url: `/attachments/${ID}` })).statusCode).toBe(404);
    await app.close();
  });

  it('une remontée hors des dépôts n’interroge jamais le seau', async () => {
    const mirror = mirrorWith({ 'etc/passwd': Buffer.from('root') });
    const app = await buildApp(mirror.store);

    const res = await app.inject({ method: 'GET', url: `/attachments/file/${encodeURIComponent('../../etc/passwd')}` });

    expect([403, 404]).toContain(res.statusCode);
    expect(mirror.reads).toEqual([]);
    await app.close();
  });
});
