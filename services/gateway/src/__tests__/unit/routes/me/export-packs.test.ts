/**
 * LA SECTION `packs` DE L'EXPORT (#10151, LP3) — les choix d'installation des
 * domaines, la bibliothèque de stickers, les packs proposés et les packs
 * achetés en Meeshes (#10632), chaque
 * fichier avec son adresse, à travers le VRAI sérialiseur de la route.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { fakePackDb, type FakeDb } from '../../services/pack-privacy.fakes';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

import { dataExportRoutes } from '../../../../routes/me/export';

const USER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439022';
const AT = new Date('2026-10-01T10:00:00.000Z');

function seeded(): FakeDb {
  return fakePackDb({
    userStickerPack: [
      { id: 'c1', userId: USER, packSlug: 'glory-frame.egypte', installedAt: AT, updatedAt: AT },
      { id: 'c2', userId: USER, packSlug: 'meo', installedAt: null, updatedAt: AT },
      { id: 'c3', userId: OTHER, packSlug: 'mee', installedAt: AT, updatedAt: AT },
    ],
    userSticker: [
      {
        id: 's1', userId: USER, name: 'Rire', origin: 'lift', mimeType: 'image/png', filePath: `stickers/${USER}/r.png`,
        width: 320, height: 320, sizeBytes: 900, animated: true, contentHash: 'h', createdAt: AT, lastUsedAt: AT,
      },
    ],
    stickerPack: [
      {
        id: 'p1', slug: 'mes-chats', name: 'Mes chats', description: 'Des chats', author: 'Marie', submitterId: USER,
        status: 'rejected', reviewNote: 'Trop flou', reviewerId: OTHER, reviewedAt: AT, installCount: 0, createdAt: AT,
      },
    ],
    stickerPackItem: [
      {
        id: 'i1', packId: 'p1', key: 'miaou', title: 'Miaou', emoji: '🐱', kind: 'instant', mimeType: 'image/webp',
        filePath: 'sticker-packs/x/miaou.webp', width: 512, height: 512, sizeBytes: 3000,
        zones: [{ id: 'z', x: 0.1, y: 0.2, width: 0.5, height: 0.2 }], position: 0,
      },
    ],
    userPackOwnership: [
      { id: 'o1', userId: USER, packKey: 'avatar-ring.echantillon', priceMeeshes: 30, requestId: 'achat-0001', acquiredAt: AT },
      { id: 'o2', userId: OTHER, packKey: 'wallpaper.echantillon', priceMeeshes: 40, requestId: 'achat-0002', acquiredAt: AT },
    ],
  });
}

async function build(db: FakeDb): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', db as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER, registeredUser: { id: USER } };
  });
  await app.register(dataExportRoutes);
  await app.ready();
  return app;
}

describe('GET /export?types=packs', () => {
  it('traverse le sérialiseur : choix, bibliothèque et propositions sortent avec leurs valeurs', async () => {
    const app = await build(seeded());

    const response = await app.inject({ method: 'GET', url: '/export?types=packs' });
    const packs = response.json().data.packs;

    expect(response.statusCode).toBe(200);
    expect(packs.choices).toEqual(
      expect.arrayContaining([
        { domain: 'glory-frame', slug: 'egypte', installed: true, installedAt: AT.toISOString(), updatedAt: AT.toISOString() },
        { domain: 'sticker', slug: 'meo', installed: false, installedAt: null, updatedAt: AT.toISOString() },
      ]),
    );
    expect(packs.library).toEqual([
      expect.objectContaining({
        id: 's1', name: 'Rire', origin: 'lift', mimeType: 'image/png', animated: true, sizeBytes: 900,
        filePath: `stickers/${USER}/r.png`,
        fileUrl: expect.stringMatching(new RegExp(`/api/v1/attachments/file/stickers%2F${USER}%2Fr\\.png$`)),
      }),
    ]);
    expect(packs.submissions).toEqual([
      expect.objectContaining({
        slug: 'mes-chats', name: 'Mes chats', author: 'Marie', status: 'rejected', reviewNote: 'Trop flou',
        items: [
          expect.objectContaining({
            key: 'miaou', title: 'Miaou', emoji: '🐱', kind: 'instant',
            zones: [{ id: 'z', x: 0.1, y: 0.2, width: 0.5, height: 0.2 }],
            fileUrl: expect.stringMatching(/sticker-packs%2Fx%2Fmiaou\.webp$/),
          }),
        ],
      }),
    ]);
    expect(packs.ownerships).toEqual([{ domain: 'avatar-ring', slug: 'echantillon', priceMeeshes: 30, acquiredAt: AT.toISOString() }]);
    expect(packs.counts).toEqual({ choices: 2, library: 1, submissions: 1, ownerships: 1, appearanceSubmissions: 0 });
    expect(packs.hasMore).toEqual({ choices: false, library: false, submissions: false, ownerships: false, appearanceSubmissions: false });
    expect(JSON.stringify(packs)).not.toContain(OTHER);
    await app.close();
  });

  it('se lit en CSV, une table par liste', async () => {
    const app = await build(seeded());

    const requested = (await app.inject({ method: 'GET', url: '/export?types=packs&format=csv' })).json().data;

    expect(Object.keys(requested.csv)).toEqual(expect.arrayContaining(['packs.choices', 'packs.library', 'packs.submissions', 'packs.ownerships']));
    expect(requested.csv['packs.ownerships']).toContain('echantillon');
    expect(requested.csv['packs.library']).toContain('Rire');
    await app.close();
  });
});
