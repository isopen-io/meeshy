/**
 * #11265 — les routes PAR IDENTIFIANT servent les octets comme la route par
 * chemin : plages (206), ETag (304), `Vary: Accept`, et le cache de l'identifiant.
 *
 * Un lecteur vidéo posé sur `GET /attachments/:id` doit pouvoir demander une
 * plage avant la fin du téléchargement. Le cache d'un média ordinaire reste
 * `immutable` (#9478) ; une vue unique garde `no-store` même sur une plage.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const mockGetAttachment = jest.fn<any>();
const mockStat = jest.fn<any>();

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    getAttachment: (...a: any[]) => mockGetAttachment(...a),
    getFilePath: async () => '/uploads/attachments/clip.mp4',
    getThumbnailPath: async () => '/uploads/attachments/clip_thumb.webp',
  })),
}));

jest.mock('../../../services/attachments/thumbnail', () => ({
  thumbnailContentType: jest.fn<any>().mockReturnValue('image/webp'),
}));

jest.mock('fs/promises', () => ({
  stat: (...a: any[]) => mockStat(...a),
}));

jest.mock('fs', () => ({
  createReadStream: jest.fn<any>().mockImplementation(() =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('stream').Readable.from(['file content'])
  ),
}));

import { registerDownloadRoutes } from '../../../routes/attachments/download';
import { VIEW_ONCE_ATTACHMENT_CACHE } from '../../../services/attachments/fileRouteVerdict';
import { storedFileETag } from '../../../utils/etag';

const ID = 'aaaaaaaaaaaaaaaaaaaaaaa0';
const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/clip_8b1f0c1e-3c55-4f5e-9a51-0f6b3a9d2f10.mp4';
const SIZE = 4096;
const MTIME = 1700000000000;
const INO = 7340033;
const ETAG = storedFileETag({ size: SIZE, mtimeMs: MTIME, ino: INO });

type Row = { id: string; filePath: string; messageId: string | null; isViewOnce?: boolean };
type Carrier = { id: string; isViewOnce?: boolean };
type Query = { where: Record<string, unknown>; select?: Record<string, boolean> };

function project<T extends Record<string, unknown>>(row: T, select?: Record<string, boolean>): Partial<T> {
  if (!select) return row;
  return Object.fromEntries(Object.entries(row).filter(([key]) => select[key])) as Partial<T>;
}

function makePrisma(rows: Row[], carriers: Carrier[]) {
  const inIds = (where: Record<string, unknown>) => (where.id as { in: string[] }).in;
  return {
    messageAttachment: {
      findUnique: jest.fn<any>().mockImplementation(async ({ where, select }: Query) => {
        const row = rows.find((r) => r.id === where.id);
        return row ? project(row, select) : null;
      }),
      findMany: jest.fn<any>().mockImplementation(async ({ where, select }: Query) => {
        const clauses = (where.OR as Record<string, unknown>[] | undefined) ?? [where];
        return rows
          .filter((r) => clauses.some((clause) => clause.filePath === r.filePath))
          .map((r) => project(r, select));
      }),
    },
    message: {
      findUnique: jest.fn<any>().mockImplementation(async ({ where }: Query) => {
        const carrier = carriers.find((c) => c.id === where.id);
        return carrier ? { conversationId: 'conv-1', ...carrier } : null;
      }),
      findMany: jest.fn<any>().mockImplementation(async ({ where, select }: Query) =>
        carriers.filter((c) => inIds(where).includes(c.id)).map((c) => project(c, select))
      ),
    },
    participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'part-1' }) },
    messageStatusEntry: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  };
}

async function buildApp(prisma: unknown, options: { readonly varyBefore?: string } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  if (options.varyBefore) {
    const vary = options.varyBefore;
    app.addHook('onRequest', async (_req, rep) => {
      rep.header('Vary', vary);
    });
  }
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as unknown as Record<string, unknown>).authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: 'user-1',
    };
  });
  registerDownloadRoutes(app, prisma as never);
  await app.ready();
  return app;
}

const ordinaryRows = () => [{ id: ID, filePath: KEY, messageId: 'm1' }];
const ordinaryCarriers = (): Carrier[] => [{ id: 'm1' }];

beforeEach(() => {
  mockStat.mockReset();
  mockStat.mockResolvedValue({ size: SIZE, mtimeMs: MTIME, ino: INO });
  mockGetAttachment.mockReset();
  mockGetAttachment.mockResolvedValue({
    id: ID,
    mimeType: 'video/mp4',
    originalName: 'clip.mp4',
    messageId: 'm1',
    uploadedBy: 'user-1',
  });
});

const ROUTES = [
  ['original', `/attachments/${ID}`],
  ['miniature', `/attachments/${ID}/thumbnail`],
] as const;

describe.each(ROUTES)('#11265 — %s par identifiant', (_label, url) => {
  it('répond 206 à une plage, pour lire avant la fin du téléchargement', async () => {
    const app = await buildApp(makePrisma(ordinaryRows(), ordinaryCarriers()));
    const res = await app.inject({ method: 'GET', url, headers: { range: 'bytes=0-99' } });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 0-99/${SIZE}`);
    expect(res.headers['content-length']).toBe('100');
    await app.close();
  });

  it('pose un ETag et Accept-Ranges sur la réponse complète', async () => {
    const app = await buildApp(makePrisma(ordinaryRows(), ordinaryCarriers()));
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    expect(res.headers['etag']).toBe(ETAG);
    expect(res.headers['accept-ranges']).toBe('bytes');
    await app.close();
  });

  it('répond 304 à un If-None-Match correspondant, cache immuable conservé', async () => {
    const app = await buildApp(makePrisma(ordinaryRows(), ordinaryCarriers()));
    const res = await app.inject({ method: 'GET', url, headers: { 'if-none-match': ETAG } });
    expect(res.statusCode).toBe(304);
    expect(res.headers['etag']).toBe(ETAG);
    expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    await app.close();
  });

  it('annonce Vary: Accept sur la réponse complète et la plage', async () => {
    const app = await buildApp(makePrisma(ordinaryRows(), ordinaryCarriers()));
    const full = await app.inject({ method: 'GET', url });
    const ranged = await app.inject({ method: 'GET', url, headers: { range: 'bytes=0-9' } });
    expect(full.headers['vary']).toContain('Accept');
    expect(ranged.headers['vary']).toContain('Accept');
    await app.close();
  });

  it('garde no-store sur la plage d une vue unique', async () => {
    const app = await buildApp(
      makePrisma(
        [{ id: ID, filePath: KEY, messageId: 'm1', isViewOnce: true }],
        [{ id: 'm1', isViewOnce: true }]
      )
    );
    const res = await app.inject({ method: 'GET', url, headers: { range: 'bytes=0-99' } });
    expect(res.statusCode).toBe(206);
    expect(res.headers['cache-control']).toBe(VIEW_ONCE_ATTACHMENT_CACHE);
    await app.close();
  });
});

describe('#11265 — original par identifiant : représentation conservée', () => {
  it('garde le type et la disposition inline de la pièce', async () => {
    const app = await buildApp(makePrisma(ordinaryRows(), ordinaryCarriers()));
    const res = await app.inject({ method: 'GET', url: `/attachments/${ID}` });
    expect(res.headers['content-type']).toBe('video/mp4');
    expect(res.headers['content-disposition']).toMatch(/^inline; filename="clip\.mp4"/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    await app.close();
  });
});

describe('#11265 — plage par chemin sur un fichier non média', () => {
  it('répond 206 à une plage sur une image servie par chemin, avec ETag', async () => {
    const app = await buildApp(makePrisma([], []));
    const res = await app.inject({
      method: 'GET',
      url: '/attachments/file/uploads/photo.jpg',
      headers: { range: 'bytes=0-99' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 0-99/${SIZE}`);
    expect(res.headers['etag']).toBe(ETAG);
    await app.close();
  });
});

describe.each(ROUTES)('#11265 — %s par identifiant : en-têtes de transport justes', (_label, url) => {
  it('ne promet aucun cache ni validateur sur un 416', async () => {
    const app = await buildApp(makePrisma(ordinaryRows(), ordinaryCarriers()));
    const res = await app.inject({ method: 'GET', url, headers: { range: `bytes=${SIZE}-${SIZE + 10}` } });
    expect(res.statusCode).toBe(416);
    expect(res.headers['content-range']).toBe(`bytes */${SIZE}`);
    expect(res.headers['etag']).toBeUndefined();
    expect(res.headers['cache-control'] ?? '').not.toMatch(/max-age|immutable/);
    await app.close();
  });

  it('répond 304 quand l ETag figure dans une liste If-None-Match, en comparaison faible', async () => {
    const app = await buildApp(makePrisma(ordinaryRows(), ordinaryCarriers()));
    const listed = await app.inject({ method: 'GET', url, headers: { 'if-none-match': `"autre", ${ETAG}` } });
    const strong = await app.inject({ method: 'GET', url, headers: { 'if-none-match': ETAG.replace(/^W\//, '') } });
    expect(listed.statusCode).toBe(304);
    expect(strong.statusCode).toBe(304);
    await app.close();
  });

  it('sert un ETag FORT — If-Range (RFC 9110 §13.1.5) ne se compare qu’à un validateur fort', async () => {
    const app = await buildApp(makePrisma(ordinaryRows(), ordinaryCarriers()));
    const res = await app.inject({ method: 'GET', url });
    expect(res.headers['etag']).toMatch(/^"[0-9a-f]+"$/);
    await app.close();
  });

  it('honore la plage quand If-Range porte l’ETag servi', async () => {
    const app = await buildApp(makePrisma(ordinaryRows(), ordinaryCarriers()));
    const res = await app.inject({ method: 'GET', url, headers: { range: 'bytes=0-99', 'if-range': ETAG } });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 0-99/${SIZE}`);
    await app.close();
  });

  it('sert le fichier entier quand If-Range porte un validateur FAIBLE, même d’opaque identique', async () => {
    const app = await buildApp(makePrisma(ordinaryRows(), ordinaryCarriers()));
    const res = await app.inject({ method: 'GET', url, headers: { range: 'bytes=0-99', 'if-range': `W/${ETAG}` } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-range']).toBeUndefined();
    expect(res.headers['content-length']).toBe(String(SIZE));
    await app.close();
  });

  it('change d’ETag quand le fichier est remplacé à taille et date égales (autre inode)', async () => {
    const app = await buildApp(makePrisma(ordinaryRows(), ordinaryCarriers()));
    mockStat.mockResolvedValue({ size: SIZE, mtimeMs: MTIME, ino: INO + 1 });
    const res = await app.inject({ method: 'GET', url, headers: { range: 'bytes=0-99', 'if-range': ETAG } });
    expect(res.headers['etag']).not.toBe(ETAG);
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('sert le fichier entier quand If-Range ne désigne pas la version servie', async () => {
    const app = await buildApp(makePrisma(ordinaryRows(), ordinaryCarriers()));
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { range: 'bytes=0-99', 'if-range': 'W/"1-1"' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-range']).toBeUndefined();
    expect(res.headers['content-length']).toBe(String(SIZE));
    await app.close();
  });

  it('sert les N derniers octets pour une plage suffixe bytes=-N', async () => {
    const app = await buildApp(makePrisma(ordinaryRows(), ordinaryCarriers()));
    const suffix = await app.inject({ method: 'GET', url, headers: { range: 'bytes=-100' } });
    const empty = await app.inject({ method: 'GET', url, headers: { range: 'bytes=-' } });
    expect(suffix.statusCode).toBe(206);
    expect(suffix.headers['content-range']).toBe(`bytes ${SIZE - 100}-${SIZE - 1}/${SIZE}`);
    expect(empty.statusCode).toBe(416);
    await app.close();
  });

  it('ajoute Accept au Vary déjà posé au lieu de l effacer', async () => {
    const app = await buildApp(makePrisma(ordinaryRows(), ordinaryCarriers()), { varyBefore: 'Origin' });
    const res = await app.inject({ method: 'GET', url });
    expect(res.headers['vary']).toMatch(/Origin/);
    expect(res.headers['vary']).toMatch(/Accept/);
    await app.close();
  });
});

const UUID_KEY = '2026/10/68f2a81417a557e8ce4ddfc1/post_0b4c1d2e-aaaa-4bbb-8ccc-123456789abc.jpg';

describe('#11265 — par chemin : une clé UUID est écrite une fois, donc immuable', () => {
  it('sert une clé UUID ordinaire avec immutable', async () => {
    const app = await buildApp(makePrisma([], []));
    const res = await app.inject({ method: 'GET', url: `/attachments/file/${encodeURIComponent(UUID_KEY)}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    await app.close();
  });

  it('garde la revalidation possible pour une clé sans UUID', async () => {
    const app = await buildApp(makePrisma([], []));
    const res = await app.inject({ method: 'GET', url: '/attachments/file/uploads/photo.jpg' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=31536000');
    await app.close();
  });

  it('ne rend jamais immuable la clé UUID d une vue unique', async () => {
    const app = await buildApp(
      makePrisma([{ id: ID, filePath: UUID_KEY, messageId: 'm1', isViewOnce: true }], [{ id: 'm1', isViewOnce: true }])
    );
    const res = await app.inject({ method: 'GET', url: `/attachments/file/${encodeURIComponent(UUID_KEY)}` });
    expect(res.headers['cache-control']).toBe(VIEW_ONCE_ATTACHMENT_CACHE);
    await app.close();
  });
});
