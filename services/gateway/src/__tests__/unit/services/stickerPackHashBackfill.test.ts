/**
 * Le rattrapage des empreintes des fichiers de packs de stickers proposés AVANT
 * #10188 : sans elle, un fichier n'a pas d'adresse dans `/pack-assets` et reste
 * servi par son seul ancien chemin. `dryRun` compte sans rien écrire ; rejoué,
 * le rattrapage ne trouve plus rien ; un fichier absent ou dont la taille ne
 * correspond plus à la ligne ne reçoit AUCUNE empreinte (il annoncerait une
 * adresse fausse).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { createHash } from 'crypto';
import { backfillStickerPackHashes } from '../../../services/packs/stickerPackHashBackfill';
import type { StickerPackFileReader } from '../../../services/packs/stickerPackAssets';
import { memoryPrisma } from '../routes/sticker-packs.harness';

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

const item = (id: string, filePath: string, sizeBytes: number, over: Record<string, unknown> = {}) => ({
  id, packId: 'p1', key: id, title: id, emoji: '🙂', kind: 'static', mimeType: 'image/png', filePath, width: 512, height: 512, sizeBytes, zones: null, position: 0, ...over,
});

function seed() {
  const db = memoryPrisma();
  const volume = new Map<string, Buffer>([
    ['sticker-packs/f1/a.png', Buffer.from('aaa')],
    ['sticker-packs/f1/b.png', Buffer.from('bbbb')],
    ['sticker-packs/f1/resized.png', Buffer.from('cc')],
  ]);
  const done = sha256(Buffer.from('déjà'));
  db.items.push(
    item('68b000000000000000000001', 'sticker-packs/f1/a.png', 3),
    item('68b000000000000000000002', 'sticker-packs/f1/b.png', 4, { sha256: null }),
    item('68b000000000000000000003', 'sticker-packs/f1/absent.png', 5),
    item('68b000000000000000000004', 'sticker-packs/f1/resized.png', 9),
    item('68b000000000000000000005', 'sticker-packs/f1/deja.png', 4, { sha256: done }),
  );
  const files: StickerPackFileReader = { read: async (p) => volume.get(p) ?? null };
  return { db, files, done };
}

describe('backfillStickerPackHashes — l’empreinte des fichiers proposés avant #10188', () => {
  it('à blanc, compte ce qu’il graverait sans rien écrire', async () => {
    const { db, files } = seed();
    const report = await backfillStickerPackHashes(db.prisma, { files, dryRun: true, batchSize: 2 });
    expect(report).toEqual({ scanned: 4, hashed: 2, missing: 1, sizeMismatch: 1 });
    expect(db.items.filter((row) => typeof row.sha256 === 'string')).toHaveLength(1);
  });

  it('écrit l’empreinte des octets présents, laisse sans adresse un fichier absent ou d’une autre taille, et ne touche pas une empreinte déjà gravée', async () => {
    const { db, files, done } = seed();
    const report = await backfillStickerPackHashes(db.prisma, { files, dryRun: false, batchSize: 2 });
    expect(report).toEqual({ scanned: 4, hashed: 2, missing: 1, sizeMismatch: 1 });
    expect(db.items.map((row) => row.sha256 ?? null)).toEqual([sha256(Buffer.from('aaa')), sha256(Buffer.from('bbbb')), null, null, done]);
  });

  it('rejoué, ne grave plus rien de neuf', async () => {
    const { db, files } = seed();
    await backfillStickerPackHashes(db.prisma, { files, dryRun: false });
    expect(await backfillStickerPackHashes(db.prisma, { files, dryRun: false })).toEqual({ scanned: 2, hashed: 0, missing: 1, sizeMismatch: 1 });
  });
});
