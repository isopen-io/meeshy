/**
 * #9478 — les routes PAR IDENTIFIANT posent le même cache que la route par
 * chemin pour un média protégé.
 *
 * `GET /attachments/:id` et `/thumbnail` envoyaient `private, max-age=31536000,
 * immutable` pour TOUT média : une vue unique ou un éphémère restait relisible
 * un an depuis le cache du client, sans jamais revalider. La route par chemin
 * (#9315) dit déjà `private, no-store` / `private, no-cache` ; les deux portes
 * d'un même fichier doivent dire la même chose — une seule source,
 * `fileRouteVerdict.ts`.
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
    getFilePath: async () => '/uploads/attachments/photo.jpg',
    getThumbnailPath: async () => '/uploads/attachments/photo_thumb.webp',
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
import {
  EPHEMERAL_ATTACHMENT_CACHE,
  VIEW_ONCE_ATTACHMENT_CACHE,
} from '../../../services/attachments/fileRouteVerdict';

const ID = 'aaaaaaaaaaaaaaaaaaaaaaa0';
const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e-3c55-4f5e-9a51-0f6b3a9d2f10.jpg';
const FUTURE = () => new Date(Date.now() + 3_600_000);

type Row = { id: string; filePath: string; messageId: string | null; isViewOnce?: boolean };
type Carrier = { id: string; expiresAt?: Date | null; viewOnceBurnAt?: Date | null; isViewOnce?: boolean };
type Query = { where: Record<string, unknown>; select?: Record<string, boolean> };

/** Le faux magasin PROJETTE comme le vrai : une colonne hors `select` est absente. */
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
      findMany: jest.fn<any>().mockImplementation(async ({ where, select }: Query) =>
        rows.filter((r) => r.filePath === where.filePath).map((r) => project(r, select))
      ),
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
    // #9589 — ce lecteur n'a ni décompte ni ouverture : sa ligne de statut n'existe pas.
    messageStatusEntry: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  };
}

async function buildApp(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
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

beforeEach(() => {
  mockStat.mockReset();
  mockStat.mockResolvedValue({ size: 4096, mtimeMs: 1700000000000 });
  mockGetAttachment.mockReset();
  mockGetAttachment.mockResolvedValue({
    id: ID,
    mimeType: 'image/jpeg',
    originalName: 'photo.jpg',
    messageId: 'm1',
    uploadedBy: 'user-1',
  });
});

const ROUTES = [
  ['original', `/attachments/${ID}`],
  ['miniature', `/attachments/${ID}/thumbnail`],
] as const;

describe.each(ROUTES)('#9478 — %s par identifiant', (_label, url) => {
  it('garde un média ordinaire en cache long et immuable', async () => {
    const app = await buildApp(makePrisma([{ id: ID, filePath: KEY, messageId: 'm1' }], [{ id: 'm1' }]));
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    await app.close();
  });

  it('ne laisse pas stocker une vue unique encore dans son sursis', async () => {
    const app = await buildApp(
      makePrisma([{ id: ID, filePath: KEY, messageId: 'm1', isViewOnce: true }], [{ id: 'm1', isViewOnce: true }])
    );
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe(VIEW_ONCE_ATTACHMENT_CACHE);
    await app.close();
  });

  it('fait revalider un éphémère vivant à chaque usage', async () => {
    const app = await buildApp(makePrisma([{ id: ID, filePath: KEY, messageId: 'm1' }], [{ id: 'm1', expiresAt: FUTURE() }]));
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe(EPHEMERAL_ATTACHMENT_CACHE);
    await app.close();
  });

  it('suit la vue unique d’un autre porteur qui partage les mêmes octets (transfert)', async () => {
    const app = await buildApp(
      makePrisma(
        [
          { id: ID, filePath: KEY, messageId: 'm1' },
          { id: 'aaaaaaaaaaaaaaaaaaaaaaa9', filePath: KEY, messageId: 'm2', isViewOnce: true },
        ],
        [{ id: 'm1' }, { id: 'm2', isViewOnce: true }]
      )
    );
    const res = await app.inject({ method: 'GET', url });
    expect(res.headers['cache-control']).toBe(VIEW_ONCE_ATTACHMENT_CACHE);
    await app.close();
  });

  it('ne promet aucun cache quand la ligne a disparu entre les deux lectures — fail-closed', async () => {
    const app = await buildApp(makePrisma([], [{ id: 'm1' }]));
    const res = await app.inject({ method: 'GET', url });
    expect(res.headers['cache-control']).toBe(VIEW_ONCE_ATTACHMENT_CACHE);
    await app.close();
  });
});
