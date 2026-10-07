/**
 * #9600 — un fichier protégé se télécharge par une adresse SIGNÉE pour son
 * lecteur, et l'adresse nue d'un fichier protégé se mesure, puis se refuse.
 *
 * Les témoins montent les deux montages réels (`/api/v1` et l'alias legacy
 * `/api`) sur un faux magasin qui PROJETTE comme Prisma : une ligne
 * `MessageAttachment`, son message porteur, des participants et leurs lignes
 * de statut. Aucune session n'est transmise — c'est ce que font une `<img>`
 * et un lecteur média ; la signature est la seule identité.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

const mockStat = jest.fn<any>();
const mockInfo = jest.fn<any>();

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ error: jest.fn(), warn: jest.fn(), info: (...a: unknown[]) => mockInfo(...a), debug: jest.fn() }),
  },
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
import { attachmentLegacyFileRoutes } from '../../../routes/attachments';
import { readSigningKeys, readerFileUrlSigner } from '../../../services/attachments/readerFileSignature';
import { UNSIGNED_READER_BOUND_FILE_EVENT } from '../../../services/attachments/readerFileGate';

// ─── Faux magasin ────────────────────────────────────────────────────────────

const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/voice_8b1f0c1e.m4a';
const OTHER_KEY = '2026/10/68f2a81417a557e8ce4ddfc1/autre_8b1f0c1e.jpg';
const PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const MESSAGE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const CONVERSATION = 'dddddddddddddddddddddd01';
const READER = 'cccccccccccccccccccccc01';
const OUTSIDER = 'cccccccccccccccccccccc09';
const SENDER = 'cccccccccccccccccccccc02';
const SIGNING_KEY = Buffer.alloc(32, 5).toString('base64');
const MINUTE = 60_000;

type Carrier = Record<string, unknown> & { id: string };
type Entry = { messageId: string; participantId: string; ephemeralExpiresAt: Date | null; viewedOnceAt: Date | null };

const carrier = (over: Record<string, unknown> = {}): Carrier => ({
  id: MESSAGE,
  conversationId: CONVERSATION,
  senderId: SENDER,
  createdAt: new Date(Date.now() - 10 * MINUTE),
  deletedAt: null,
  expiresAt: null,
  viewOnceBurnAt: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ephemeralDuration: null,
  ...over,
});

const VIEW_ONCE = () => carrier({ isViewOnce: true, effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE });
const TIMED_FLAME = () =>
  carrier({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30, expiresAt: new Date(Date.now() + 60 * MINUTE) });

function project<T extends object>(row: T, select?: Record<string, unknown>): Partial<T> {
  if (!select) return row;
  return Object.fromEntries(Object.entries(row).filter(([key]) => select[key])) as Partial<T>;
}

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === 'OR') return (condition as Record<string, unknown>[]).some((branch) => matches(row, branch));
    const value = row[field];
    if (condition !== null && typeof condition === 'object') {
      const c = condition as { startsWith?: string; in?: unknown[] };
      if (c.startsWith !== undefined) return typeof value === 'string' && value.startsWith(c.startsWith);
      if (c.in !== undefined) return c.in.includes(value);
      return false;
    }
    return value === condition;
  });
}

type Query = { where: Record<string, unknown>; select?: Record<string, unknown> };

function makePrisma(input: { message: Carrier; entries?: Entry[]; pieceViewOnce?: boolean }) {
  const pieces = [{ id: PIECE, filePath: KEY, thumbnailPath: null, messageId: MESSAGE, isViewOnce: input.pieceViewOnce ?? false, isBlurred: false, effectFlags: 0 }];
  const carriers = [input.message];
  const participants = [
    { id: READER, conversationId: CONVERSATION, isActive: true },
    { id: SENDER, conversationId: CONVERSATION, isActive: true },
    { id: OUTSIDER, conversationId: 'dddddddddddddddddddddd02', isActive: true },
  ];
  const entries = input.entries ?? [];
  return {
    messageAttachment: {
      findMany: jest.fn(async ({ where, select }: Query) => pieces.filter((r) => matches(r, where)).map((r) => project(r, select))),
      findUnique: jest.fn(async ({ where, select }: Query) => {
        const row = pieces.find((r) => r.id === where.id);
        return row ? project(row, select) : null;
      }),
    },
    message: {
      findMany: jest.fn(async ({ where, select }: Query) => carriers.filter((c) => matches(c, where)).map((c) => project(c, select))),
      findUnique: jest.fn(async ({ where, select }: Query) => {
        const row = carriers.find((c) => c.id === where.id);
        return row ? project(row, select) : null;
      }),
    },
    participant: {
      findFirst: jest.fn(async ({ where, select }: Query) => {
        const row = participants.find((p) => matches(p, where));
        return row ? project(row, select) : null;
      }),
    },
    messageStatusEntry: {
      findFirst: jest.fn(async ({ where, select }: Query) => {
        const row = entries.find((e) => matches(e, where));
        return row ? project(row, select) : null;
      }),
    },
  };
}

async function buildApp(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async () => {});
  app.decorate('prisma', prisma as never);
  await app.register(async (scope) => registerDownloadRoutes(scope, prisma as never), { prefix: '/api/v1' });
  await app.register(attachmentLegacyFileRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

const signedUrlFor = (reader: string, storageKey = KEY, at = new Date()) =>
  readerFileUrlSigner({ keys: readSigningKeys(), now: at })!.sign({ storageKey, attachmentId: PIECE, readerParticipantId: reader });

const bareUrls = [
  ['/api/v1', `/api/v1/attachments/file/${encodeURIComponent(KEY)}`],
  ['/api (legacy)', `/api/attachments/file/${encodeURIComponent(KEY)}`],
] as const;

beforeEach(() => {
  process.env.ATTACHMENT_URL_SIGNING_KEY = SIGNING_KEY;
  delete process.env.ATTACHMENT_URL_SIGNING_KEY_PREVIOUS;
  delete process.env.ATTACHMENT_URL_SIGNATURE_ENFORCE;
  mockStat.mockReset();
  mockStat.mockResolvedValue({ size: 4096, mtimeMs: 1700000000000 });
  mockInfo.mockReset();
});

afterEach(() => {
  delete process.env.ATTACHMENT_URL_SIGNING_KEY;
  delete process.env.ATTACHMENT_URL_SIGNATURE_ENFORCE;
});

// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/attachments/signed/:token/* — l’adresse signée par lecteur', () => {
  it('sert le fichier au lecteur dont le contenu vit, sans le laisser stocker, embarquable depuis le web', async () => {
    const app = await buildApp(makePrisma({ message: VIEW_ONCE() }));
    const res = await app.inject({ method: 'GET', url: signedUrlFor(READER) });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('audio/mp4');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    await app.close();
  });

  it('sert une plage d’octets — un lecteur audio ou vidéo se positionne', async () => {
    const app = await buildApp(makePrisma({ message: TIMED_FLAME() }));
    const res = await app.inject({ method: 'GET', url: signedUrlFor(READER), headers: { range: 'bytes=0-99' } });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 0-99/4096');
    await app.close();
  });

  it('refuse à CE lecteur une vue unique qu’il a ouverte, même si le fichier vit pour les autres', async () => {
    const opened = { messageId: MESSAGE, participantId: READER, ephemeralExpiresAt: null, viewedOnceAt: new Date(Date.now() - 10 * MINUTE) };
    const app = await buildApp(makePrisma({ message: VIEW_ONCE(), entries: [opened] }));
    expect((await app.inject({ method: 'GET', url: signedUrlFor(READER) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: bareUrls[0][1] })).statusCode).toBe(200);
    await app.close();
  });

  it('refuse à CE lecteur une flamme dont son décompte est fini', async () => {
    const lapsed = { messageId: MESSAGE, participantId: READER, ephemeralExpiresAt: new Date(Date.now() - 1_000), viewedOnceAt: null };
    const app = await buildApp(makePrisma({ message: TIMED_FLAME(), entries: [lapsed] }));
    expect((await app.inject({ method: 'GET', url: signedUrlFor(READER) })).statusCode).toBe(404);
    await app.close();
  });

  it('refuse une adresse signée pour un participant d’une AUTRE conversation', async () => {
    const app = await buildApp(makePrisma({ message: VIEW_ONCE() }));
    expect((await app.inject({ method: 'GET', url: signedUrlFor(OUTSIDER) })).statusCode).toBe(404);
    await app.close();
  });

  it('refuse le fichier d’un message rappelé', async () => {
    const app = await buildApp(makePrisma({ message: carrier({ isViewOnce: true, deletedAt: new Date(Date.now() - 1_000) }) }));
    expect((await app.inject({ method: 'GET', url: signedUrlFor(READER) })).statusCode).toBe(404);
    await app.close();
  });

  it.each([
    ['une signature réécrite', (url: string) => url.replace(/\.([A-Za-z0-9_-]{22})\//, (_m, sig: string) => `.${sig.startsWith('A') ? 'B' : 'A'}${sig.slice(1)}/`)],
    ['un lecteur réécrit', (url: string) => url.replace(READER, OUTSIDER)],
    ['la signature d’une pièce posée sur un AUTRE fichier', (url: string) => url.replace(encodeURIComponent(KEY), encodeURIComponent(OTHER_KEY))],
    ['un jeton tronqué', (url: string) => url.replace(/\.[A-Za-z0-9_-]{22}\//, '/')],
  ])('refuse %s, de la même réponse qu’un fichier absent', async (_label, forge) => {
    const app = await buildApp(makePrisma({ message: VIEW_ONCE() }));
    const res = await app.inject({ method: 'GET', url: forge(signedUrlFor(READER)) });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false });
    await app.close();
  });

  it('refuse une adresse signée échue', async () => {
    const app = await buildApp(makePrisma({ message: VIEW_ONCE() }));
    const stale = signedUrlFor(READER, KEY, new Date(Date.now() - 8 * 60 * MINUTE));
    expect((await app.inject({ method: 'GET', url: stale })).statusCode).toBe(404);
    await app.close();
  });

  it('accepte la clé PRÉCÉDENTE pendant une rotation', async () => {
    const url = signedUrlFor(READER);
    process.env.ATTACHMENT_URL_SIGNING_KEY_PREVIOUS = SIGNING_KEY;
    process.env.ATTACHMENT_URL_SIGNING_KEY = Buffer.alloc(32, 6).toString('base64');
    const app = await buildApp(makePrisma({ message: VIEW_ONCE() }));
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    await app.close();
  });

  it('refuse toute adresse signée quand aucune clé n’est posée', async () => {
    const url = signedUrlFor(READER);
    delete process.env.ATTACHMENT_URL_SIGNING_KEY;
    const app = await buildApp(makePrisma({ message: VIEW_ONCE() }));
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    await app.close();
  });

  it('n’existe pas sous l’alias legacy non versionné', async () => {
    const app = await buildApp(makePrisma({ message: VIEW_ONCE() }));
    const legacy = signedUrlFor(READER).replace('/api/v1/', '/api/');
    expect((await app.inject({ method: 'GET', url: legacy })).statusCode).toBe(404);
    await app.close();
  });
});

describe.each(bareUrls)('%s — l’adresse NUE d’un fichier protégé pendant la transition', (_label, url) => {
  it('répond encore, et laisse une trace d’usage sans identité', async () => {
    const app = await buildApp(makePrisma({ message: VIEW_ONCE() }));
    const res = await app.inject({ method: 'GET', url, headers: { 'user-agent': 'AppleCoreMedia/1.0.0 (iPhone; U; CPU OS 17_0 like Mac OS X)' } });
    expect(res.statusCode).toBe(200);
    expect(mockInfo).toHaveBeenCalledWith(UNSIGNED_READER_BOUND_FILE_EVENT, expect.objectContaining({ route: expect.any(String), platform: expect.any(String), version: expect.any(String) }));
    const logged = JSON.stringify(mockInfo.mock.calls);
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain(READER);
    await app.close();
  });

  it('est refusée une fois la bascule posée', async () => {
    process.env.ATTACHMENT_URL_SIGNATURE_ENFORCE = 'true';
    const app = await buildApp(makePrisma({ message: TIMED_FLAME() }));
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    await app.close();
  });

  it('ne trace ni ne refuse le fichier d’un message ordinaire, même bascule posée', async () => {
    process.env.ATTACHMENT_URL_SIGNATURE_ENFORCE = 'true';
    const app = await buildApp(makePrisma({ message: carrier() }));
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    expect(mockInfo).not.toHaveBeenCalledWith(UNSIGNED_READER_BOUND_FILE_EVENT, expect.anything());
    await app.close();
  });

  it('ne trace ni ne refuse le fichier d’un message seulement flouté', async () => {
    process.env.ATTACHMENT_URL_SIGNATURE_ENFORCE = 'true';
    const app = await buildApp(makePrisma({ message: carrier({ isBlurred: true, effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }) }));
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    await app.close();
  });

  it('refuse aussi la revalidation (304) de l’adresse nue une fois la bascule posée', async () => {
    process.env.ATTACHMENT_URL_SIGNATURE_ENFORCE = 'true';
    const app = await buildApp(makePrisma({ message: VIEW_ONCE() }));
    const res = await app.inject({ method: 'GET', url, headers: { 'if-none-match': 'W/"4096-1700000000000"' } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
