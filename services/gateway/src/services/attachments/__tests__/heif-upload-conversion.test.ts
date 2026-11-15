/**
 * Un HEIC ou un AVIF est accepté à l'envoi et converti par le serveur
 * (#11263) : l'iPhone cesse de fabriquer un JPEG q0.8 de compatibilité.
 *
 * - accepté : `image/heic`, `image/heif`, `image/avif`, reconnus à leurs
 *   octets (`ftyp` heic / mif1 / avif) ;
 * - servi aux lecteurs en JPEG q90 au profil couleur gardé (`fileUrl`), jamais
 *   en HEIC — un ancien web ou la NSE ne reçoivent jamais `image/heic` ;
 * - l'original est CONSERVÉ, rangé dans `renditions` (codec `heic`/`avif`),
 *   et rattaché à sa pièce pour la route de fichier ;
 * - un fichier que le serveur ne sait pas convertir est REFUSÉ, jamais servi
 *   tel quel.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { promises as fs, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { isImageMimeType } from '@meeshy/shared/types/attachment';
import { matchesImageSignature, verifyDeclaredMimeType } from '../ContentSignature';
import { MetadataManager } from '../MetadataManager';
import { produceMediaRenditions } from '../media-renditions';
import { UnconvertibleImageError, convertHeifBuffer } from '../heif-conversion';
import { resolveFileRouteVerdict, type FileRouteVerdictPrisma } from '../fileRouteVerdict';

const HEIC = readFileSync(path.join(__dirname, 'fixtures', 'heif', 'photo-p3.heic'));
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function avif(): Promise<Buffer> {
  return sharp({ create: { width: 80, height: 60, channels: 3, background: { r: 30, g: 160, b: 90 } } }).withIccProfile('p3').avif({ quality: 70 }).toBuffer();
}

async function render(bytes: Buffer, relPath: string, mimeType: string) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'heif-upload-'));
  dirs.push(base);
  await fs.writeFile(path.join(base, relPath), bytes);
  const rendered = await produceMediaRenditions(
    { uploadBasePath: base, metadataManager: new MetadataManager(base), runFfmpeg: async () => undefined },
    { relPath, mimeType, attachmentType: 'image', fileSize: bytes.length, metadata: {} },
  );
  return { base, rendered };
}

describe('HEIC, HEIF et AVIF sont acceptés à l’envoi (#11263)', () => {
  it.each(['image/heic', 'image/heif', 'image/avif'])('%s est un type image accepté', (mimeType) => {
    expect(isImageMimeType(mimeType)).toBe(true);
  });

  it('les octets d’un HEIC et d’un AVIF sont reconnus comme une image, et confirment le type déclaré', async () => {
    const avifBytes = await avif();
    expect(matchesImageSignature(HEIC)).toBe(true);
    expect(matchesImageSignature(avifBytes)).toBe(true);
    expect(verifyDeclaredMimeType('image/heic', HEIC)).toEqual({ verified: true });
    expect(verifyDeclaredMimeType('image/avif', avifBytes)).toEqual({ verified: true });
    expect(verifyDeclaredMimeType('image/heic', Buffer.from('%PDF-1.4 pas une photo'))).toMatchObject({ verified: false });
  });
});

describe('produceMediaRenditions — un HEIC est servi en JPEG, l’original conservé (#11263)', () => {
  it('HEIC : `fileUrl` est un JPEG q90 au profil P3 gardé, l’original est rangé dans `renditions`', async () => {
    const { base, rendered } = await render(HEIC, 'photo_1.heic', 'image/heic');

    expect(rendered.storedPath).toBe('photo_1.jpg');
    expect(rendered.storedMimeType).toBe('image/jpeg');
    const served = await sharp(path.join(base, rendered.storedPath)).metadata();
    expect(served).toMatchObject({ format: 'jpeg', width: 64, height: 48 });
    expect(served.icc).toBeDefined();
    expect(rendered.storedSize).toBe((await fs.stat(path.join(base, rendered.storedPath))).size);
    expect(rendered.renditions).toEqual([{ codec: 'heic', mimeType: 'image/heic', url: 'photo_1_original.heic', width: 64, height: 48, size: HEIC.length }]);
    expect((await fs.readFile(path.join(base, 'photo_1_original.heic'))).equals(HEIC)).toBe(true);
    await expect(fs.stat(path.join(base, 'photo_1.heic'))).rejects.toThrow();
    expect(rendered.thumbnailPath).toBe('photo_1_thumb.webp');
  });

  it('AVIF : servi en JPEG, l’original AVIF conservé', async () => {
    const bytes = await avif();
    const { rendered } = await render(bytes, 'photo_2.avif', 'image/avif');

    expect(rendered.storedMimeType).toBe('image/jpeg');
    expect(rendered.renditions).toEqual([{ codec: 'avif', mimeType: 'image/avif', url: 'photo_2_original.avif', width: 80, height: 60, size: bytes.length }]);
  });

  it('un JPEG ordinaire ne change pas de chemin et n’a aucun rendu', async () => {
    const jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#888' } }).jpeg().toBuffer();
    const { rendered } = await render(jpeg, 'photo_3.jpg', 'image/jpeg');

    expect(rendered.storedPath).toBe('photo_3.jpg');
    expect(rendered).not.toHaveProperty('renditions');
  });

  it('un HEIC que le serveur ne sait pas lire est REFUSÉ, jamais servi tel quel', async () => {
    const broken = Buffer.concat([HEIC.subarray(0, 40), Buffer.alloc(200)]);

    await expect(render(broken, 'photo_4.heic', 'image/heic')).rejects.toBeInstanceOf(UnconvertibleImageError);
  });
});

describe('convertHeifBuffer — le chemin chiffré côté serveur chiffre un JPEG, jamais un HEIC (#11263)', () => {
  it('rend un JPEG au profil gardé', async () => {
    const jpeg = await convertHeifBuffer(HEIC, 'image/heic');

    expect((await sharp(jpeg).metadata()).format).toBe('jpeg');
    expect((await sharp(jpeg).metadata()).icc).toBeDefined();
  });
});

describe('route de fichier — l’original conservé appartient à sa pièce (#11263)', () => {
  it('`<base>_original.heic` d’une pièce rappelée est refusé, jamais servi comme un fichier quelconque', async () => {
    const owner = { messageId: 'bbbbbbbbbbbbbbbbbbbbbbb1', isViewOnce: true, isBlurred: false, effectFlags: 0 };
    const prisma = {
      messageAttachment: {
        findMany: async ({ where }: { where: { OR?: Array<{ filePath?: unknown }> } }) =>
          (where.OR ?? []).some((branch) => branch.filePath === '2026/10/u/photo_1') ? [owner] : [],
        findUnique: async () => null,
      },
      message: { findMany: async () => [{ id: owner.messageId, deletedAt: new Date('2026-10-01'), expiresAt: null, viewOnceBurnAt: null, isViewOnce: true, isBlurred: false, effectFlags: 0, ephemeralDuration: null }] },
    } as unknown as FileRouteVerdictPrisma;

    expect(await resolveFileRouteVerdict('2026/10/u/photo_1_original.heic', prisma, new Date('2026-10-23'))).toEqual({ kind: 'gone' });
  });
});
