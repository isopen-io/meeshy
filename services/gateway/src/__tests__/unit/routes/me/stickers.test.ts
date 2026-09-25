/**
 * `/me/stickers` (#7938) — la route traverse le VRAI multipart et le VRAI
 * sérialiseur : un schéma de réponse qui oublierait un champ de la définition
 * le supprimerait en silence, et c'est ce que ces témoins lisent.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import { meStickersRoutes } from '../../../../routes/me/stickers';
import { StickerLibrary, type StickerFileStore } from '../../../../services/stickers/StickerLibrary';

const ALICE = '68b0000000000000000000a1';
const BOB = '68b0000000000000000000b2';

type Row = Record<string, unknown> & { id: string; userId: string; lastUsedAt: Date };

function memoryPrisma() {
  const rows: Row[] = [];
  let seq = 0;
  const matches = (row: Row, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => row[k] === v);
  const userSticker = {
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      rows.filter((r) => matches(r, where)).sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime()),
    count: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)).length,
    findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find((r) => matches(r, where)) ?? null,
    create: async ({ data }: { data: Omit<Row, 'id'> }) => {
      seq += 1;
      const row = { ...data, id: `68b00000000000000000${String(seq).padStart(4, '0')}` } as Row;
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const i = rows.findIndex((r) => r.id === where.id);
      rows[i] = { ...rows[i], ...data } as Row;
      return rows[i];
    },
    delete: async ({ where }: { where: { id: string } }) => rows.splice(rows.findIndex((r) => r.id === where.id), 1)[0],
  };
  return { prisma: { userSticker } as unknown as PrismaClient, rows };
}

async function buildApp(options: { userId?: string; anonymous?: boolean } = {}) {
  const db = memoryPrisma();
  const stored = new Map<string, Buffer>();
  const files: StickerFileStore = {
    write: async (p, b) => void stored.set(p, b),
    remove: async (p) => void stored.delete(p),
  };
  const app: FastifyInstance = Fastify({ logger: false });
  await app.register(multipart);
  app.decorate('prisma', db.prisma as never);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as Record<string, unknown>).authContext = options.anonymous
      ? { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: 'p1', participantId: 'p1' }
      : {
          type: 'user',
          isAuthenticated: true,
          isAnonymous: false,
          userId: options.userId ?? ALICE,
          registeredUser: { id: options.userId ?? ALICE, role: 'USER' },
        };
  });
  await app.register(meStickersRoutes, { library: new StickerLibrary({ prisma: db.prisma, files }) });
  await app.ready();
  return { app, ...db, stored };
}

function multipartBody(bytes: Buffer, fields: Record<string, string> = {}) {
  const boundary = '----meeshy-sticker';
  const head = Object.entries(fields)
    .map(([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)
    .join('');
  const payload = Buffer.concat([
    Buffer.from(
      `${head}--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="pasted.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

const png = (red: number) =>
  sharp({ create: { width: 80, height: 40, channels: 4, background: { r: red, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();

describe('POST /stickers', () => {
  it('creates a sticker from a pasted image and serves the whole definition', async () => {
    const { app, stored } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/stickers', ...multipartBody(await png(1), { origin: 'paste', name: 'Coucou' }) });

    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data).toMatchObject({
      name: 'Coucou',
      origin: 'paste',
      mimeType: 'image/png',
      width: 80,
      height: 40,
      animated: false,
    });
    expect(Object.keys(data).sort()).toEqual(
      ['animated', 'createdAt', 'fileUrl', 'height', 'id', 'lastUsedAt', 'mimeType', 'name', 'origin', 'sizeBytes', 'width'].sort(),
    );
    expect(stored.has(data.fileUrl)).toBe(true);
    await app.close();
  });

  it('answers 200 with the same sticker when the image is already in the library', async () => {
    const { app, rows } = await buildApp();
    const bytes = await png(2);
    const first = await app.inject({ method: 'POST', url: '/stickers', ...multipartBody(bytes) });
    const again = await app.inject({ method: 'POST', url: '/stickers', ...multipartBody(bytes, { origin: 'paste' }) });

    expect(again.statusCode).toBe(200);
    expect(again.json().data.id).toBe(first.json().data.id);
    expect(rows).toHaveLength(1);
    await app.close();
  });

  it('an unknown origin falls back to upload rather than refusing the sticker', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/stickers', ...multipartBody(await png(3), { origin: 'hack' }) });

    expect(res.json().data.origin).toBe('upload');
    await app.close();
  });

  it('refuses what is not an image with 415 and a named code', async () => {
    const { app, rows } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/stickers', ...multipartBody(Buffer.from('<svg/>')) });

    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ success: false, code: 'STICKER_NOT_AN_IMAGE' });
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('a guest of a share link has no library', async () => {
    const { app, rows } = await buildApp({ anonymous: true });
    const res = await app.inject({ method: 'POST', url: '/stickers', ...multipartBody(await png(4)) });

    expect(res.statusCode).toBe(403);
    expect(rows).toHaveLength(0);
    await app.close();
  });
});

describe('GET /stickers, POST /stickers/:id/use, DELETE /stickers/:id', () => {
  it('lists only my stickers, and never lets someone else remove one', async () => {
    const alice = await buildApp();
    const created = (await alice.app.inject({ method: 'POST', url: '/stickers', ...multipartBody(await png(5)) })).json().data;
    alice.rows.push({ id: '68b0000000000000000000ff', userId: BOB, lastUsedAt: new Date() });

    const list = await alice.app.inject({ method: 'GET', url: '/stickers' });
    expect(list.json().data.map((s: { id: string }) => s.id)).toEqual([created.id]);

    const foreign = await alice.app.inject({ method: 'DELETE', url: '/stickers/68b0000000000000000000ff' });
    expect(foreign.statusCode).toBe(404);
    expect(alice.rows).toHaveLength(2);

    const used = await alice.app.inject({ method: 'POST', url: `/stickers/${created.id}/use` });
    expect(used.statusCode).toBe(200);

    const removed = await alice.app.inject({ method: 'DELETE', url: `/stickers/${created.id}` });
    expect(removed.json().data).toEqual({ id: created.id, removed: true });
    expect(alice.stored.size).toBe(0);
    await alice.app.close();
  });
});
