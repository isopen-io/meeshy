/**
 * Le rattrapage des comptes DÉJÀ purgés (#10151) : la purge des packs ne
 * s'exécute qu'à l'expiration de la grâce, donc les comptes anonymisés avant
 * LP3 gardent leurs lignes et leurs fichiers. Le rattrapage les retrouve par
 * leur identité anonymisée, ne touche à aucun compte vivant, et `DRY_RUN`
 * compte sans rien écrire.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { backfillPackPurge } from '../../../services/packs/packPurgeBackfill';
import { fakeFileStore, fakePackDb, type Row } from './pack-privacy.fakes';

const PARTI = '507f1f77bcf86cd799439011';
const VIVANT = '507f1f77bcf86cd799439022';
const PARTI_2 = '507f1f77bcf86cd799439033';

function seed() {
  const users: Row[] = [
    { id: PARTI, username: `compte-supprime-${PARTI}` },
    { id: VIVANT, username: 'marie' },
    { id: PARTI_2, username: `compte-supprime-${PARTI_2}` },
  ];
  const db = fakePackDb({
    user: users,
    userStickerPack: [
      { id: 'c1', userId: PARTI, packSlug: 'mee', installedAt: null, updatedAt: new Date() },
      { id: 'c2', userId: VIVANT, packSlug: 'mee', installedAt: new Date(), updatedAt: new Date() },
    ],
    userSticker: [
      { id: 's1', userId: PARTI, filePath: `stickers/${PARTI}/a.webp` },
      { id: 's2', userId: VIVANT, filePath: `stickers/${VIVANT}/b.webp` },
    ],
    stickerPack: [
      { id: 'p1', submitterId: PARTI_2, status: 'pending', author: 'Paul' },
      { id: 'p2', submitterId: PARTI_2, status: 'approved', author: 'Paul' },
    ],
    stickerPackItem: [{ id: 'i1', packId: 'p1', filePath: 'sticker-packs/p1/x.webp' }],
    userPackOwnership: [
      { id: 'o1', userId: PARTI, packKey: 'wallpaper.echantillon', priceMeeshes: 40, requestId: 'achat-0001', acquiredAt: new Date() },
      { id: 'o2', userId: VIVANT, packKey: 'wallpaper.echantillon', priceMeeshes: 40, requestId: 'achat-0002', acquiredAt: new Date() },
    ],
  });
  const files = fakeFileStore([`stickers/${PARTI}/a.webp`, `stickers/${VIVANT}/b.webp`, 'sticker-packs/p1/x.webp']);
  return { db, files };
}

describe('backfillPackPurge — les comptes déjà purgés (#10151)', () => {
  it('à blanc, compte comptes, lignes et fichiers sans rien écrire', async () => {
    const { db, files } = seed();
    const before = JSON.stringify(db.tables);

    const report = await backfillPackPurge(db as never, { files: files.store, dryRun: true, batchSize: 1 });

    expect(report).toEqual({
      accountsScanned: 2,
      accountsWithData: 2,
      totals: { choicesDeleted: 1, libraryDeleted: 1, submissionsDeleted: 1, publishedAnonymized: 1, filesDeleted: 2, ownershipsDeleted: 1 },
    });
    expect(JSON.stringify(db.tables)).toBe(before);
    expect(db.writes).toEqual([]);
    expect(files.removed).toEqual([]);
  });

  it('en écriture, purge les comptes anonymisés et eux seuls', async () => {
    const { db, files } = seed();

    const report = await backfillPackPurge(db as never, { files: files.store, dryRun: false, batchSize: 1 });

    expect(report.totals).toEqual({ choicesDeleted: 1, libraryDeleted: 1, submissionsDeleted: 1, publishedAnonymized: 1, filesDeleted: 2, ownershipsDeleted: 1 });
    expect(db.tables.userPackOwnership.rows.map((row) => row.id)).toEqual(['o2']);
    expect(db.tables.userStickerPack.rows.map((row) => row.id)).toEqual(['c2']);
    expect(db.tables.userSticker.rows.map((row) => row.id)).toEqual(['s2']);
    expect([...files.files]).toEqual([`stickers/${VIVANT}/b.webp`]);
    expect(db.tables.stickerPack.rows.map((row) => [row.id, row.author])).toEqual([['p2', 'Compte supprimé']]);
  });

  it('rejoué, ne trouve plus rien', async () => {
    const { db, files } = seed();
    await backfillPackPurge(db as never, { files: files.store, dryRun: false });

    const again = await backfillPackPurge(db as never, { files: files.store, dryRun: false });

    expect(again).toEqual({
      accountsScanned: 2,
      accountsWithData: 0,
      totals: { choicesDeleted: 0, libraryDeleted: 0, submissionsDeleted: 0, publishedAnonymized: 0, filesDeleted: 0, ownershipsDeleted: 0 },
    });
  });

  it("ne touche pas un compte VIVANT dont le pseudo commence par le préfixe d'anonymisation", async () => {
    const PIEGE = '507f1f77bcf86cd799439044';
    const db = fakePackDb({
      user: [
        { id: PIEGE, username: 'compte-supprime-', email: 'piege@example.com' },
        { id: PARTI, username: `compte-supprime-${PARTI}`, email: `compte-supprime-${PARTI}@deleted.meeshy.invalid` },
      ],
      userStickerPack: [{ id: 'c9', userId: PIEGE, packSlug: 'mee', installedAt: new Date(), updatedAt: new Date() }],
      userSticker: [{ id: 's9', userId: PIEGE, filePath: `stickers/${PIEGE}/z.webp` }],
      stickerPack: [{ id: 'p9', submitterId: PIEGE, status: 'pending', author: 'Piège' }],
      stickerPackItem: [{ id: 'i9', packId: 'p9', filePath: 'sticker-packs/p9/y.webp' }],
    });
    const files = fakeFileStore([`stickers/${PIEGE}/z.webp`, 'sticker-packs/p9/y.webp']);

    const report = await backfillPackPurge(db as never, { files: files.store, dryRun: false });

    expect(report.accountsScanned).toBe(1);
    expect(db.tables.userStickerPack.rows.map((row) => row.id)).toEqual(['c9']);
    expect(db.tables.userSticker.rows.map((row) => row.id)).toEqual(['s9']);
    expect(db.tables.stickerPack.rows.map((row) => row.id)).toEqual(['p9']);
    expect(files.removed).toEqual([]);
  });
});
