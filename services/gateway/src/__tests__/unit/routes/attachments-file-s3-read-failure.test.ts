/**
 * #11267, audit D1 — une lecture du seau qui échoue après son HEAD ne doit
 * pas partir décrite comme les octets qu'elle n'a pas servis : ni ETag, ni
 * cache d'un an, ni nom de fichier. Témoin de l'auditeur adversarial.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

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
import type { MediaObjectStore } from '../../../services/storage/objects/MediaObjectStore';

const ID = 'aaaaaaaaaaaaaaaaaaaaaaa0';
const KEY = '2026/10/clip.mp4';
const BYTES = Buffer.from('0123456789'.repeat(20));
const MIRROR_ETAG = '"d41d8cd98f00b204e9800998ecf8427e"';

function makePrisma(isViewOnce = false, ownedKeys: readonly string[] = [KEY]) {
  const row = { id: ID, filePath: KEY, messageId: 'm1', isViewOnce };
  const carrier = { id: 'm1', isViewOnce };
  return {
    messageAttachment: {
      findUnique: jest.fn<any>().mockResolvedValue(row),
      findMany: jest.fn<any>().mockImplementation(async ({ where }: any) => {
        const clauses = (where.OR as Record<string, unknown>[] | undefined) ?? [where];
        return clauses.some((clause) => typeof clause.filePath === 'string' && ownedKeys.includes(clause.filePath)) ? [row] : [];
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

async function buildApp(mirror: MediaObjectStore | null, isViewOnce = false, ownedKeys: readonly string[] = [KEY]): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as unknown as Record<string, unknown>).authContext = { isAuthenticated: true, isAnonymous: false, userId: 'user-1' };
  });
  registerDownloadRoutes(app, makePrisma(isViewOnce, ownedKeys) as never, { uploadRoot: '/uploads/attachments', mirror });
  await app.ready();
  return app;
}

beforeEach(() => {
  mockStat.mockReset();
  mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  mockGetAttachment.mockReset();
  mockGetAttachment.mockResolvedValue({ id: ID, mimeType: 'video/mp4', originalName: 'clip.mp4', messageId: 'm1', uploadedBy: 'user-1' });
});

describe('#11267, audit D1 — le seau répond au HEAD puis échoue au GET', () => {
  it('rend 503 no-store, sans ETag ni cache long ni longueur de fichier', async () => {
    const failing: MediaObjectStore = {
      head: async () => ({ size: BYTES.length, etag: MIRROR_ETAG, lastModified: null, contentType: null }),
      read: async () => { throw Object.assign(new Error('socket hang up'), { $metadata: { httpStatusCode: 503 } }); },
      write: async () => undefined,
      remove: async () => undefined,
    };
    const app = await buildApp(failing);
    const res = await app.inject({ method: 'GET', url: `/attachments/${ID}` });
    const ranged = await app.inject({ method: 'GET', url: `/attachments/${ID}`, headers: { range: 'bytes=0-9' } });
    expect(ranged.statusCode).toBe(503);
    expect(ranged.headers['etag']).toBeUndefined();
    expect(ranged.headers['content-range']).toBeUndefined();
    expect(res.statusCode).toBe(503);
    expect(res.headers['etag']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(res.headers['content-length']).not.toBe(String(BYTES.length));
    await app.close();
  });
});
