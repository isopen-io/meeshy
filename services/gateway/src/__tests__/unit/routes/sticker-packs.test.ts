/**
 * `/sticker-packs` (#9141) — la route traverse le VRAI multipart, la VRAIE
 * validation du manifeste et le VRAI sérialiseur : un schéma de réponse qui
 * oublierait un champ le supprimerait en silence.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import sharp from 'sharp';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import { stickerPacksRoutes } from '../../../routes/sticker-packs';
import { StickerPacks } from '../../../services/stickers/StickerPacks';
import type { StickerFileStore } from '../../../services/stickers/StickerLibrary';
import type { StickerImageOutcome } from '../../../services/stickers/stickerImage';
import { memoryPrisma } from './sticker-packs.harness';

const ALICE = '68b0000000000000000000a1';
const BOB = '68b0000000000000000000b2';
const MODO = '68b0000000000000000000c3';

/** Un double de normalisation : les octets qui commencent par « A » sont animés, « X » n'est pas une image. */
const fakeNormalize = async (bytes: Buffer): Promise<StickerImageOutcome> => {
  const tag = bytes.subarray(0, 1).toString();
  if (tag === 'X') return { ok: false, reason: 'not-an-image' };
  return { ok: true, image: { bytes, mimeType: tag === 'A' ? 'image/webp' : 'image/png', width: 512, height: 512, animated: tag === 'A' } };
};

async function buildApp(o: { userId?: string; role?: string; anonymous?: boolean; realNormalize?: boolean; accounts?: Parameters<typeof memoryPrisma>[0] } = {}) {
  const db = memoryPrisma(o.accounts);
  const stored = new Map<string, Buffer>();
  const files: StickerFileStore = {
    write: async (p, b) => void stored.set(p, b),
    remove: async (p) => void stored.delete(p),
  };
  let who = { userId: o.userId ?? ALICE, role: o.role ?? 'USER' };
  const app: FastifyInstance = Fastify({ logger: false });
  await app.register(multipart);
  app.decorate('prisma', db.prisma as never);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as Record<string, unknown>).authContext = o.anonymous
      ? { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: 'p1', participantId: 'p1' }
      : { type: 'user', isAuthenticated: true, isAnonymous: false, userId: who.userId, registeredUser: { id: who.userId, role: who.role } };
  });
  const packs = new StickerPacks({ prisma: db.prisma, files, ...(o.realNormalize ? {} : { normalize: fakeNormalize }) });
  await app.register(stickerPacksRoutes, { packs });
  await app.ready();
  const as = (userId: string, role = 'USER') => {
    who = { userId, role };
  };
  return { app, ...db, stored, as };
}

const zone = {
  slot: 'prenom',
  label: 'Prénom',
  box: { x: 40, y: 400, width: 432, height: 90 },
  defaultText: 'Léa',
  maxLength: 14,
  maxLines: 1,
};

const manifest = (over: Record<string, unknown> = {}) => ({
  slug: 'chats-de-paris',
  name: 'Chats de Paris',
  description: 'Des chats qui flânent sur les quais.',
  author: 'Studio Minou',
  items: [
    { key: 'bonjour', title: 'Bonjour', emoji: '👋', kind: 'static', asset: 'bonjour.png' },
    { key: 'dodo', title: 'Dodo', emoji: '😴', kind: 'cinematic', asset: 'dodo.webp' },
    { key: 'bravo', title: 'Bravo', emoji: '🎉', kind: 'instant', asset: 'bravo.png', zones: [zone] },
  ],
  ...over,
});

const ASSETS: Record<string, Buffer> = { 'bonjour.png': Buffer.from('S-bonjour'), 'dodo.webp': Buffer.from('A-dodo'), 'bravo.png': Buffer.from('S-bravo') };

function submission(m: unknown, assets: Record<string, Buffer> = ASSETS) {
  const boundary = '----meeshy-pack';
  const parts = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n${JSON.stringify(m)}\r\n`),
    ...Object.entries(assets).flatMap(([name, bytes]) => [
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      bytes,
      Buffer.from('\r\n'),
    ]),
    Buffer.from(`--${boundary}--\r\n`),
  ];
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

const submit = (app: FastifyInstance, m: unknown = manifest(), assets?: Record<string, Buffer>) =>
  app.inject({ method: 'POST', url: '/submissions', ...submission(m, assets) });

describe('the built-in packs', () => {
  it('lists Mee, Meo and Mee & Meo first, included: they cannot be removed (#10738)', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((p: { slug: string; installed: boolean; builtin: boolean }) => [p.slug, p.installed, p.builtin])).toEqual([
      ['mee', true, true],
      ['meo', true, true],
      ['mee-et-meo', true, true],
    ]);

    const removed = await app.inject({ method: 'DELETE', url: '/meo/install' });
    expect(removed.statusCode).toBe(409);
    expect(removed.json()).toMatchObject({ code: 'PACK_NOT_REMOVABLE' });
    const installed = await app.inject({ method: 'GET', url: '/installed' });
    expect(installed.json().data.map((p: { slug: string }) => p.slug)).toEqual(['mee', 'meo', 'mee-et-meo']);
    await app.close();
  });
});

describe('POST /submissions', () => {
  it('creates a pending pack with its three kinds and serves the whole detail to its author', async () => {
    const { app, stored } = await buildApp();
    const res = await submit(app);

    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data).toMatchObject({ slug: 'chats-de-paris', status: 'pending', builtin: false, itemCount: 3, kinds: ['static', 'cinematic', 'instant'], installed: false, reviewNote: null });
    expect(data.items[2].zones[0]).toMatchObject({ slot: 'prenom', box: zone.box, maxLength: 14, minFontSize: 14, weight: 'black', align: 'center' });
    expect(data.items.map((i: { fileUrl: string }) => stored.has(i.fileUrl))).toEqual([true, true, true]);
    await app.close();
  });

  it('refuses an Instant whose longest text would overflow, naming the zone, and stores nothing', async () => {
    const { app, packs, stored } = await buildApp();
    const tooLong = { ...zone, box: { x: 10, y: 10, width: 150, height: 40 }, maxLength: 40 };
    const bad = manifest({ items: [...manifest().items.slice(0, 2), { ...manifest().items[2], zones: [tooLong] }] });
    const res = await submit(app, bad);

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'STICKER_PACK_INVALID', problems: [{ path: 'items.2.zones.0.maxLength', code: 'longest-overflows' }] });
    expect(packs).toHaveLength(0);
    expect(stored.size).toBe(0);
    await app.close();
  });

  it('refuses a « cinematic » sticker that does not move — the kind is read in the bytes, never trusted', async () => {
    const { app, packs } = await buildApp();
    const res = await submit(app, manifest(), { ...ASSETS, 'dodo.webp': Buffer.from('S-still') });

    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ code: 'STICKER_PACK_ASSET_REFUSED' });
    expect(res.json().message).toContain('dodo');
    expect(packs).toHaveLength(0);
    await app.close();
  });

  it('with the real normalisation, a still PNG declared cinematic is refused too', async () => {
    const { app } = await buildApp({ realNormalize: true });
    const still = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 9, g: 9, b: 9, alpha: 0.5 } } }).png().toBuffer();
    const res = await submit(app, manifest(), { 'bonjour.png': still, 'dodo.webp': still, 'bravo.png': still });
    expect(res.statusCode).toBe(415);
    await app.close();
  });

  it('refuses a missing file, a taken name and a fourth waiting pack', async () => {
    const { app } = await buildApp();
    const missing = await submit(app, manifest(), { 'bonjour.png': ASSETS['bonjour.png'] });
    expect(missing.statusCode).toBe(415);

    expect((await submit(app)).statusCode).toBe(201);
    expect((await submit(app)).json()).toMatchObject({ code: 'STICKER_PACK_SLUG_TAKEN' });

    await submit(app, manifest({ slug: 'pack-deux' }));
    await submit(app, manifest({ slug: 'pack-trois' }));
    const fourth = await submit(app, manifest({ slug: 'pack-quatre' }));
    expect(fourth.json()).toMatchObject({ code: 'STICKER_PACK_TOO_MANY_PENDING' });
    await app.close();
  });

  it('a guest of a share link cannot submit', async () => {
    const { app } = await buildApp({ anonymous: true });
    expect((await submit(app)).statusCode).toBe(403);
    await app.close();
  });
});

describe('moderation and installation', () => {
  it('a pending pack is hidden from others; approved, it enters the shop and installs', async () => {
    const { app, as } = await buildApp();
    await submit(app);

    as(BOB);
    expect((await app.inject({ method: 'GET', url: '/chats-de-paris' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: '/chats-de-paris/install' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/pending' })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/chats-de-paris/review', payload: { decision: 'approve' } })).statusCode).toBe(403);

    as(MODO, 'MODERATOR');
    const queue = await app.inject({ method: 'GET', url: '/pending' });
    expect(queue.json().data.map((p: { slug: string }) => p.slug)).toEqual(['chats-de-paris']);
    const approved = await app.inject({ method: 'POST', url: '/chats-de-paris/review', payload: { decision: 'approve', note: 'Superbe' } });
    expect(approved.json().data).toMatchObject({ status: 'approved', reviewNote: 'Superbe' });

    as(BOB);
    const shop = await app.inject({ method: 'GET', url: '/' });
    expect(shop.json().data.map((p: { slug: string }) => p.slug)).toEqual(['mee', 'meo', 'mee-et-meo', 'chats-de-paris']);
    const detail = (await app.inject({ method: 'GET', url: '/chats-de-paris' })).json().data;
    expect(detail.reviewNote).toBeUndefined();
    expect(detail.items).toHaveLength(3);

    const installed = await app.inject({ method: 'PUT', url: '/chats-de-paris/install' });
    expect(installed.json().data).toMatchObject({ installed: true, installCount: 1 });
    await app.inject({ method: 'PUT', url: '/chats-de-paris/install' });
    const mine = (await app.inject({ method: 'GET', url: '/installed' })).json().data;
    expect(mine.map((p: { slug: string }) => p.slug)).toEqual(['mee', 'meo', 'mee-et-meo', 'chats-de-paris']);
    expect(mine[3].items.map((i: { key: string }) => i.key)).toEqual(['bonjour', 'dodo', 'bravo']);

    const removed = await app.inject({ method: 'DELETE', url: '/chats-de-paris/install' });
    expect(removed.json().data).toMatchObject({ installed: false, installCount: 0 });
    await app.close();
  });

  it('a rejected pack comes back to its author with the note, who can submit it again under the same name', async () => {
    const { app, as, stored } = await buildApp();
    await submit(app);
    const firstFiles = [...stored.keys()];

    as(MODO, 'ADMIN');
    await app.inject({ method: 'POST', url: '/chats-de-paris/review', payload: { decision: 'reject', note: 'Images floues' } });

    as(ALICE);
    const mine = (await app.inject({ method: 'GET', url: '/submissions' })).json().data;
    expect(mine[0]).toMatchObject({ slug: 'chats-de-paris', status: 'rejected', reviewNote: 'Images floues' });

    expect((await submit(app)).statusCode).toBe(201);
    expect(firstFiles.some((f) => stored.has(f))).toBe(false);

    as(BOB);
    expect((await submit(app, manifest({ name: 'Copie', author: 'Bob Studio' }))).json()).toMatchObject({ code: 'STICKER_PACK_SLUG_TAKEN' });
    await app.close();
  });

  it('only a pending pack can be reviewed', async () => {
    const { app, as } = await buildApp();
    as(MODO, 'MODERATOR');
    expect((await app.inject({ method: 'POST', url: '/inconnu/review', payload: { decision: 'approve' } })).statusCode).toBe(404);
    await app.close();
  });
});

describe('the publisher of a pack (#16274)', () => {
  it('attaches the submission to the publisher of the signed-in account, named by its store name — never its username', async () => {
    const { app, profiles } = await buildApp({ accounts: { [ALICE]: { username: 'alice_secret', emailVerifiedAt: new Date('2026-01-01T00:00:00Z') } } });
    const res = await submit(app);
    expect(res.statusCode).toBe(201);
    expect(res.json().data.publisher).toEqual({ slug: 'studio-minou', name: 'Studio Minou', verified: false, official: false });
    expect(res.body).not.toContain('alice_secret');
    expect(profiles).toEqual([expect.objectContaining({ userId: ALICE, slug: 'studio-minou' })]);
  });

  it('refuses an account that verified neither its email nor its phone: 403 PUBLISHER_ACCOUNT_UNVERIFIED, nothing stored', async () => {
    const { app, packs, stored } = await buildApp({ accounts: { [ALICE]: { username: 'alice' } } });
    const res = await submit(app);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('PUBLISHER_ACCOUNT_UNVERIFIED');
    expect(packs).toEqual([]);
    expect(stored.size).toBe(0);
  });

  it('refuses a submission naming a publisher owned by another account: 403 PUBLISHER_NOT_OWNER', async () => {
    const { app, as, packs } = await buildApp({ userId: BOB });
    expect((await submit(app, manifest({ slug: 'oiseaux', author: 'Bob Studio' }))).json().data.publisher.slug).toBe('bob-studio');
    as(ALICE);
    const res = await submit(app, manifest({ slug: 'usurpe', publisher: 'bob-studio' }));
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('PUBLISHER_NOT_OWNER');
    expect(packs.some((pack) => pack.slug === 'usurpe')).toBe(false);
  });

  it('refuses the Meeshy identity to a third party: 403 PUBLISHER_RESERVED or PUBLISHER_NOT_OWNER', async () => {
    const { app } = await buildApp();
    const byAuthor = await submit(app, manifest({ author: 'Meeshy Officiel' }));
    expect(byAuthor.statusCode).toBe(403);
    expect(byAuthor.json().code).toBe('PUBLISHER_RESERVED');
    const byClaim = await submit(app, manifest({ publisher: 'meeshy' }));
    expect(byClaim.statusCode).toBe(403);
    expect(byClaim.json().code).toBe('PUBLISHER_NOT_OWNER');
  });

  it('refuses a store name another publisher already holds, up to case and accents: 409 PUBLISHER_NAME_TAKEN (audit #16274)', async () => {
    const { app, as, packs } = await buildApp({ userId: BOB });
    await submit(app, manifest({ slug: 'oiseaux', author: 'Bob Studio' }));
    as(ALICE);
    const res = await submit(app, manifest({ slug: 'copie', author: 'BOB studio' }));
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('PUBLISHER_NAME_TAKEN');
    expect(packs.some((pack) => pack.slug === 'copie')).toBe(false);
  });

  it('a submission refused for its slug takes no store name: the publisher is created only once every check passed (re-audit #16274, N1)', async () => {
    const { app, as, profiles } = await buildApp({ userId: BOB });
    await submit(app, manifest({ slug: 'oiseaux', author: 'Bob Studio' }));
    as(ALICE);
    const res = await submit(app, manifest({ slug: 'oiseaux', author: 'Studio Lumière' }));
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('STICKER_PACK_SLUG_TAKEN');
    expect(profiles.filter((row) => row.userId === ALICE)).toEqual([]);
  });

  it('serves the publisher name as the author old clients display, never the free text (re-audit #16274, N5)', async () => {
    const { app } = await buildApp();
    await submit(app, manifest({ slug: 'premier', author: 'Alice Studio' }));
    const second = await submit(app, manifest({ slug: 'second', author: 'Un Autre Nom' }));
    expect(second.statusCode).toBe(201);
    expect(second.json().data).toMatchObject({ author: 'Alice Studio', publisher: { name: 'Alice Studio' } });
    const mine = await app.inject({ method: 'GET', url: '/submissions' });
    expect(mine.json().data.map((pack: { author: string }) => pack.author)).toEqual(['Alice Studio', 'Alice Studio']);
  });

  it('refuses a free-text author that reads as Meeshy in another script: 403 PUBLISHER_RESERVED (re-audit #16274, N5)', async () => {
    const { app } = await buildApp();
    const res = await submit(app, manifest({ author: 'ᎷᎬᎬSHY' }));
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('PUBLISHER_RESERVED');
  });

  it('an inconclusive scan of legacy profiles answers 503 with Retry-After, never 409 (re-audit #16274, N6)', async () => {
    const { app, profiles } = await buildApp();
    profiles.push(...Array.from({ length: 2_000 }, (_, index) => ({ id: `68f0${String(index).padStart(20, '0')}`, userId: `68f1${String(index).padStart(20, '0')}`, displayName: `Studio ${index}`, verifiedAt: null, createdAt: new Date('2026-09-01T00:00:00Z') })));
    const res = await submit(app, manifest({ author: 'Kɔfi Art' }));
    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBe('300');
    expect(res.json().code).toBe('PUBLISHER_RETRY_LATER');
  });

  it('a read never creates a publisher: a submitter without one is served under the neutral name (audit #16274)', async () => {
    const { app, profiles } = await buildApp();
    expect((await submit(app)).statusCode).toBe(201);
    profiles.splice(0);
    const res = await app.inject({ method: 'GET', url: '/submissions' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].publisher).toEqual({ slug: 'editeur', name: 'Éditeur', verified: false, official: false });
    expect(profiles).toEqual([]);
  });

  it('refuses a guest of a link: 403 REGISTERED_USER_REQUIRED', async () => {
    const { app } = await buildApp({ anonymous: true });
    const res = await submit(app);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('REGISTERED_USER_REQUIRED');
  });

  it('serves the publisher in the shop for built-in and published packs, without the owner account', async () => {
    const { app, as } = await buildApp({ accounts: { [ALICE]: { username: 'alice_secret', emailVerifiedAt: new Date('2026-01-01T00:00:00Z') } } });
    await submit(app);
    as(MODO, 'MODERATOR');
    await app.inject({ method: 'POST', url: '/chats-de-paris/review', payload: { decision: 'approve' } });
    as(BOB);
    const shop = await app.inject({ method: 'GET', url: '/' });
    const bySlug = new Map(shop.json().data.map((pack: { slug: string; publisher: unknown }) => [pack.slug, pack.publisher]));
    expect(bySlug.get('mee')).toEqual({ slug: 'meeshy', name: 'Meeshy', verified: true, official: true });
    expect(bySlug.get('chats-de-paris')).toEqual({ slug: 'studio-minou', name: 'Studio Minou', verified: false, official: false });
    expect(shop.body).not.toContain(ALICE);
    expect(shop.body).not.toContain('alice_secret');
  });
});
