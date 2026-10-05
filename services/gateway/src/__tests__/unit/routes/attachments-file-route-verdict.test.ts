/**
 * #9315 — la route PAR CHEMIN suit la vie du message porteur, comme les routes
 * par identifiant.
 *
 * `GET /attachments/file/*` est l'adresse que les clients composent pour
 * afficher un média (web : `media-url.ts` ; iOS : `MeeshyConfig.resolveMediaURL`).
 * Elle servait tout fichier du volume tant qu'il existait sur le disque : la
 * photo d'un message rappelé, expiré ou dont la vue unique est consommée se
 * relisait par son adresse aussi longtemps que ses octets n'étaient pas effacés
 * — et pour toujours pour une miniature, une variante WebP ou une piste traduite.
 *
 * Ces témoins montent les DEUX montages (`/api/v1` et l'alias legacy `/api`) sur
 * le MÊME faux magasin : une ligne `MessageAttachment` et son message porteur.
 * Aucune identité n'est transmise — c'est ce que font une `<img>`, un
 * `AVPlayer` et l'extension de notification d'aujourd'hui, et le verdict d'ÉTAT
 * ne doit pas en dépendre.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

const mockStat = jest.fn<any>();

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }),
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

// ─── Faux magasin ────────────────────────────────────────────────────────────

type Row = {
  id: string;
  filePath: string;
  thumbnailPath: string | null;
  messageId: string | null;
  isViewOnce?: boolean;
};

type Carrier = {
  id: string;
  deletedAt?: Date | null;
  expiresAt?: Date | null;
  viewOnceBurnAt?: Date | null;
  isViewOnce?: boolean;
};

const PAST = () => new Date(Date.now() - 60_000);
const FUTURE = () => new Date(Date.now() + 3_600_000);

const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e-3c55-4f5e-9a51-0f6b3a9d2f10.jpg';
const THUMB = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e-3c55-4f5e-9a51-0f6b3a9d2f10_thumb.webp';
const VARIANT = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e-3c55-4f5e-9a51-0f6b3a9d2f10_640w.webp';
const AUDIO_KEY = '2026/10/68f2a81417a557e8ce4ddfc1/voice_1f2e3d4c-5b6a-4789-8abc-def012345678.m4a';
const AUDIO_ID = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const TRACK = `translated/${AUDIO_ID}_en.mp3`;

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === 'OR') {
      return (condition as Record<string, unknown>[]).some((branch) => matches(row, branch));
    }
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

function makePrisma(rows: Row[], carriers: Carrier[]) {
  const findMany = jest.fn<any>().mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    rows.filter((r) => matches(r, where))
  );
  const findUnique = jest.fn<any>().mockImplementation(async ({ where }: { where: { id: string } }) =>
    rows.find((r) => r.id === where.id) ?? null
  );
  const messageFindMany = jest.fn<any>().mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    carriers.filter((c) => matches(c, where))
  );
  return {
    prisma: {
      messageAttachment: { findMany, findUnique },
      message: { findMany: messageFindMany, findUnique: jest.fn<any>() },
      participant: { findFirst: jest.fn<any>() },
    },
    findMany,
    findUnique,
    messageFindMany,
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

const MOUNTS = [
  ['/api/v1', '/api/v1/attachments/file/'],
  ['/api (legacy)', '/api/attachments/file/'],
] as const;

const encodeKey = (key: string) => encodeURIComponent(key);

function photoRow(messageId: string | null, extra: Partial<Row> = {}): Row {
  return { id: 'aaaaaaaaaaaaaaaaaaaaaaa0', filePath: KEY, thumbnailPath: THUMB, messageId, ...extra };
}

beforeEach(() => {
  mockStat.mockReset();
  mockStat.mockResolvedValue({ size: 4096, mtimeMs: 1700000000000 });
});

// ═════════════════════════════════════════════════════════════════════════════

describe.each(MOUNTS)('#9315 — %s : un fichier de message suit son porteur', (_label, base) => {
  it('sert le média d’un message vivant — un ancien client le voit toujours', async () => {
    const { prisma } = makePrisma([photoRow('m1')], [{ id: 'm1' }]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: base + encodeKey(KEY) });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('private, max-age=31536000');
    await app.close();
  });

  it.each([
    ['rappelé (supprimé)', { deletedAt: PAST() }],
    ['éphémère expiré', { expiresAt: PAST() }],
    ['vue unique consommée (sursis de purge écoulé)', { isViewOnce: true, viewOnceBurnAt: PAST() }],
  ])('refuse en 404 le fichier d’un message %s', async (_l, lifecycle) => {
    const { prisma } = makePrisma([photoRow('m1')], [{ id: 'm1', ...lifecycle }]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: base + encodeKey(KEY) });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false });
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['cache-control'] ?? '').not.toMatch(/max-age=31536000/);
    await app.close();
  });

  it('refuse le fichier d’une ligne dont le message porteur a disparu', async () => {
    const { prisma } = makePrisma([photoRow('m-disparu')], []);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: base + encodeKey(KEY) });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('rend la MÊME réponse qu’un fichier déjà effacé du disque', async () => {
    const { prisma } = makePrisma([photoRow('m1')], [{ id: 'm1', deletedAt: PAST() }]);
    const app = await buildApp(prisma);
    const refused = await app.inject({ method: 'GET', url: base + encodeKey(KEY) });
    mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const unlinked = await app.inject({ method: 'GET', url: base + encodeKey(KEY) });
    expect(refused.statusCode).toBe(unlinked.statusCode);
    expect(refused.json()).toEqual(unlinked.json());
    await app.close();
  });
});

describe('#9315 — un média protégé ne se garde pas un an dans un cache', () => {
  it('sert une vue unique encore dans son sursis, sans la laisser stocker', async () => {
    const { prisma } = makePrisma([photoRow('m1', { isViewOnce: true })], [{ id: 'm1', isViewOnce: true }]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/api/v1/attachments/file/' + encodeKey(KEY) });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    await app.close();
  });

  it('sert un éphémère vivant en revalidation à chaque usage — le jour de l’échéance, le cache reçoit 404', async () => {
    const { prisma } = makePrisma([photoRow('m1')], [{ id: 'm1', expiresAt: FUTURE() }]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/api/v1/attachments/file/' + encodeKey(KEY) });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-cache');
    await app.close();
  });

  it('ne rend pas 304 à la revalidation d’un fichier devenu inservable', async () => {
    const { prisma } = makePrisma([photoRow('m1')], [{ id: 'm1', expiresAt: PAST() }]);
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/attachments/file/' + encodeKey(KEY),
      headers: { 'if-none-match': `W/"4096-1700000000000"` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('#9315 — les fichiers dérivés suivent l’original', () => {
  it('refuse la miniature d’un message rappelé', async () => {
    const { prisma } = makePrisma([photoRow('m1')], [{ id: 'm1', deletedAt: PAST() }]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/api/v1/attachments/file/' + encodeKey(THUMB) });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('refuse une variante WebP responsive d’un message rappelé', async () => {
    const { prisma } = makePrisma([photoRow('m1')], [{ id: 'm1', deletedAt: PAST() }]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/api/v1/attachments/file/' + encodeKey(VARIANT) });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('sert la variante WebP d’un message vivant', async () => {
    const { prisma } = makePrisma([photoRow('m1')], [{ id: 'm1' }]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/api/v1/attachments/file/' + encodeKey(VARIANT) });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('refuse la piste traduite d’un vocal expiré — même par plage', async () => {
    const audio: Row = { id: AUDIO_ID, filePath: AUDIO_KEY, thumbnailPath: null, messageId: 'm2' };
    const { prisma } = makePrisma([audio], [{ id: 'm2', expiresAt: PAST() }]);
    const app = await buildApp(prisma);
    const full = await app.inject({ method: 'GET', url: '/api/v1/attachments/file/' + encodeKey(TRACK) });
    const ranged = await app.inject({
      method: 'GET',
      url: '/api/attachments/file/' + encodeKey(TRACK),
      headers: { range: 'bytes=0-99' },
    });
    expect(full.statusCode).toBe(404);
    expect(ranged.statusCode).toBe(404);
    await app.close();
  });

  it('sert la piste traduite d’un vocal vivant, plage comprise', async () => {
    const audio: Row = { id: AUDIO_ID, filePath: AUDIO_KEY, thumbnailPath: null, messageId: 'm2' };
    const { prisma } = makePrisma([audio], [{ id: 'm2' }]);
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/attachments/file/' + encodeKey(TRACK),
      headers: { range: 'bytes=0-99' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 0-99/4096');
    await app.close();
  });

  it('suit la piste d’un original encore porté par une copie transférée vivante', async () => {
    const original: Row = { id: AUDIO_ID, filePath: AUDIO_KEY, thumbnailPath: null, messageId: 'm2' };
    const copy: Row = { id: 'aaaaaaaaaaaaaaaaaaaaaaa9', filePath: AUDIO_KEY, thumbnailPath: null, messageId: 'm3' };
    const { prisma } = makePrisma([original, copy], [{ id: 'm2', deletedAt: PAST() }, { id: 'm3' }]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/api/v1/attachments/file/' + encodeKey(TRACK) });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('#9315 — les octets partagés vivent tant qu’un porteur vit', () => {
  it('sert un fichier dont l’original est rappelé mais qu’une copie transférée porte encore', async () => {
    const original = photoRow('m1');
    const copy = { ...photoRow('m4'), id: 'aaaaaaaaaaaaaaaaaaaaaaa8' };
    const { prisma } = makePrisma([original, copy], [{ id: 'm1', deletedAt: PAST() }, { id: 'm4' }]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/api/v1/attachments/file/' + encodeKey(KEY) });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('sert à son déposant une pièce jointe pas encore rattachée à un message', async () => {
    const { prisma } = makePrisma([photoRow(null)], []);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/api/v1/attachments/file/' + encodeKey(KEY) });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('#9315 — ce qui n’est pas une pièce jointe garde son régime', () => {
  it('sert un fichier qu’aucune ligne MessageAttachment ne référence (post, sticker, son)', async () => {
    const { prisma } = makePrisma([], []);
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/attachments/file/' + encodeKey('2026/10/68f2a81417a557e8ce4ddfc1/post_0b4c1d2e-aaaa-4bbb-8ccc-123456789abc.jpg'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=31536000');
    await app.close();
  });

  it('sert un avatar sans aucune lecture en base', async () => {
    const { prisma, findMany, findUnique } = makePrisma([], []);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/api/v1/attachments/file/avatars%2Fuser%2F68f2a81417a557e8ce4ddfc1.jpg' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, no-cache');
    expect(findMany).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    await app.close();
  });

  it('n’interroge pas la base pour un fichier absent du disque', async () => {
    const { prisma, findMany } = makePrisma([], []);
    mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/api/v1/attachments/file/' + encodeKey(KEY) });
    expect(res.statusCode).toBe(404);
    expect(findMany).not.toHaveBeenCalled();
    await app.close();
  });
});

/**
 * Le verdict se rend sur la clé NORMALISÉE — celle que le disque résout — et
 * jamais sur la chaîne reçue : toute écriture qui atteint le même fichier doit
 * atteindre le même refus.
 */
describe('#9315 — une autre écriture du même chemin n’échappe pas au verdict', () => {
  const deleted = () => makePrisma([photoRow('m1')], [{ id: 'm1', deletedAt: PAST() }]);

  it.each([
    ['barres non encodées (forme iOS)', KEY],
    ['double barre', KEY.replace('2026/10/', '2026//10/')],
    ['segment courant', KEY.replace('2026/10/', '2026/./10/')],
    ['remontée qui revient au même fichier', KEY.replace('2026/10/', '2026/xx/../10/')],
    ['remontée encodée', encodeKey(KEY.replace('2026/10/', '2026/xx/../10/'))],
    ['double encodage', encodeKey(encodeKey(KEY))],
    ['barre initiale', encodeKey('/' + KEY)],
    ['barre finale', encodeKey(KEY + '/')],
  ])('refuse le fichier rappelé atteint par %s', async (_l, raw) => {
    const { prisma } = deleted();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/api/v1/attachments/file/' + raw });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.json()).toMatchObject({ success: false });
    await app.close();
  });

  it('refuse le fichier rappelé en HEAD', async () => {
    const { prisma } = deleted();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'HEAD', url: '/api/v1/attachments/file/' + encodeKey(KEY) });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('refuse le fichier rappelé demandé par plage', async () => {
    const audio: Row = { id: AUDIO_ID, filePath: AUDIO_KEY, thumbnailPath: null, messageId: 'm2' };
    const { prisma } = makePrisma([audio], [{ id: 'm2', deletedAt: PAST() }]);
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/attachments/file/' + encodeKey(AUDIO_KEY),
      headers: { range: 'bytes=0-' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
