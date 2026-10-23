/**
 * Les images servies ont un rendu AVIF à côté du WebP (#11262).
 *
 * Les variantes AVIF vivent dans un tableau SÉPARÉ (`avifVariants`) : les
 * anciens clients lisent `imageVariants` sans filtrer le format, ils n'y
 * trouveront donc jamais un AVIF. Le profil couleur large (Display P3) reste,
 * la qualité est perceptuelle (q60, effort 4), et un fichier `_<w>w.avif`
 * appartient à sa pièce jointe pour la route de fichier — sinon une variante
 * de vue unique se servirait comme un fichier quelconque.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { promises as fs, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { AVIF_VARIANT_QUALITY, avifVariantPathFor, createAvifVariants } from '../thumbnail';
import { MetadataManager } from '../MetadataManager';
import { produceMediaRenditions } from '../media-renditions';
import { resolveFileRouteVerdict, type FileRouteVerdictPrisma } from '../fileRouteVerdict';
import { derivedFileCandidates } from '../derivedAttachmentFiles';
import { copiedAttachmentFields } from '../../messaging/copiedAttachmentFields';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function photo(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 230, g: 80, b: 40 } } })
    .withIccProfile('p3')
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('createAvifVariants (#11262)', () => {
  it('rend un AVIF par largeur strictement plus petite que la source, sans agrandir', async () => {
    const variants = await createAvifVariants(await photo(2000, 1000));

    expect(variants.map((v) => v.width)).toEqual([640, 1080, 1920]);
    for (const variant of variants) {
      const meta = await sharp(variant.buffer).metadata();
      expect(variant.format).toBe('avif');
      expect(meta.format).toBe('heif');
      expect(meta.compression).toBe('av1');
      expect(meta.width).toBe(variant.width);
    }
  });

  it('garde le profil couleur large de la source (Display P3), là où le WebP le perdait', async () => {
    const [variant] = await createAvifVariants(await photo(800, 600));

    expect((await sharp(variant.buffer).metadata()).icc).toBeDefined();
  });

  it('vise une qualité perceptuelle (q60) et pèse moins que le WebP de même largeur', async () => {
    const source = await photo(1600, 1200);
    const [avif] = await createAvifVariants(source, { widths: [1080] });
    const webp = await sharp(source).resize(1080).webp({ quality: 78 }).toBuffer();

    expect(AVIF_VARIANT_QUALITY).toBe(60);
    expect(avif.buffer.length).toBeLessThanOrEqual(webp.length);
  });

  it('nomme la variante `<base>_<largeur>w.avif`', () => {
    expect(avifVariantPathFor('2026/10/u/photo_abc.jpg', 640)).toBe('2026/10/u/photo_abc_640w.avif');
  });
});

describe('produceMediaRenditions — AVIF à côté du WebP, jamais dedans (#11262)', () => {
  it('écrit les variantes AVIF sur disque et les rend dans `avifVariants`, pas dans `imageVariants`', async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'avif-renditions-'));
    dirs.push(base);
    const relPath = 'photo_1.jpg';
    await fs.writeFile(path.join(base, relPath), await photo(1500, 1000));
    const metadataManager = new MetadataManager(base);

    const rendered = await produceMediaRenditions(
      { uploadBasePath: base, metadataManager, runFfmpeg: async () => undefined },
      { relPath, mimeType: 'image/jpeg', attachmentType: 'image', fileSize: 1, metadata: { width: 1500, height: 1000 } },
    );

    expect(rendered.imageVariants?.every((v) => v.format === 'webp')).toBe(true);
    expect(rendered.avifVariants?.map((v) => [v.url, v.format])).toEqual([
      ['photo_1_640w.avif', 'avif'],
      ['photo_1_1080w.avif', 'avif'],
    ]);
    for (const variant of rendered.avifVariants ?? []) {
      expect((await fs.stat(path.join(base, variant.url))).size).toBe(variant.size);
    }
  });

  it('une image déjà petite n’a AUCUNE variante AVIF : le champ reste absent', async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'avif-renditions-'));
    dirs.push(base);
    await fs.writeFile(path.join(base, 'small.jpg'), await photo(300, 200));

    const rendered = await produceMediaRenditions(
      { uploadBasePath: base, metadataManager: new MetadataManager(base), runFfmpeg: async () => undefined },
      { relPath: 'small.jpg', mimeType: 'image/jpeg', attachmentType: 'image', fileSize: 1, metadata: {} },
    );

    expect(rendered).not.toHaveProperty('avifVariants');
  });
});

describe('route de fichier — une variante AVIF appartient à sa pièce jointe (#11262)', () => {
  const owner = { messageId: 'bbbbbbbbbbbbbbbbbbbbbbb1', isViewOnce: true, isBlurred: false, effectFlags: 0 };
  const prisma = {
    messageAttachment: {
      findMany: async ({ where }: { where: { OR?: Array<{ filePath?: unknown }> } }) =>
        (where.OR ?? []).some((branch) => branch.filePath === '2026/10/u/secret_abc') ? [owner] : [],
      findUnique: async () => null,
    },
    message: {
      findMany: async () => [{ id: owner.messageId, deletedAt: new Date('2026-10-01'), expiresAt: null, viewOnceBurnAt: null, isViewOnce: true, isBlurred: false, effectFlags: 0, ephemeralDuration: null }],
    },
  } as unknown as FileRouteVerdictPrisma;

  it('la variante AVIF d’une vue unique rappelée est refusée comme son original, jamais servie comme un fichier quelconque', async () => {
    expect(await resolveFileRouteVerdict('2026/10/u/secret_abc_640w.avif', prisma, new Date('2026-10-23'))).toEqual({ kind: 'gone' });
    expect(await resolveFileRouteVerdict('2026/10/u/secret_abc_640w.webp', prisma, new Date('2026-10-23'))).toEqual({ kind: 'gone' });
  });
});

describe('ce qui voyage AVEC une pièce porte aussi ses variantes AVIF (#11262)', () => {
  const avifVariants = [{ width: 640, height: 480, url: '2026/10/u/p_640w.avif', size: 8, format: 'avif' }];

  it('la suppression d’une pièce efface ses fichiers AVIF', () => {
    expect(derivedFileCandidates({ imageVariants: [], avifVariants })).toEqual(['2026/10/u/p_640w.avif']);
  });

  it('le transfert recopie les variantes AVIF avec les octets qu’il partage', () => {
    const copy = copiedAttachmentFields({ fileName: 'p.jpg', originalName: 'p.jpg', mimeType: 'image/jpeg', fileSize: 1, filePath: '2026/10/u/p.jpg', fileUrl: '2026/10/u/p.jpg', avifVariants } as never);
    expect(copy.avifVariants).toEqual(avifVariants);
  });
});

describe('createAvifVariants — une photo HDR garde son HDR en AVIF (#12290)', () => {
  const HDR = readFileSync(path.join(__dirname, 'fixtures', 'gain-map', 'apple-gain-map-xmp-headroom.jpg'));

  /** La boîte `colr`/`nclx` d'un HEIF : primaires, transfert, matrice (CICP). */
  function nclx(avif: Buffer): readonly number[] | null {
    const at = avif.indexOf(Buffer.from('colrnclx', 'latin1'));
    return at === -1 ? null : [avif.readUInt16BE(at + 8), avif.readUInt16BE(at + 10), avif.readUInt16BE(at + 12)];
  }

  it('une source à carte de gain rend des AVIF 10 bits BT.2100 PQ (CICP 9/16/9), jamais un AVIF SDR', async () => {
    const variants = await createAvifVariants(HDR, { widths: [256] });

    expect(variants).toHaveLength(1);
    expect(nclx(variants[0].buffer)).toEqual([9, 16, 9]);
    expect((await sharp(variants[0].buffer).metadata()).bitsPerSample).toBe(10);
  });

  it('ses hautes lumières dépassent le blanc SDR (203 cd/m² en PQ) : l’effet HDR survit', async () => {
    const [variant] = await createAvifVariants(HDR, { widths: [256] });
    const pixels = await sharp(variant.buffer).toColourspace('rgb16').raw().toBuffer();
    const codes = new Uint16Array(pixels.buffer, pixels.byteOffset, pixels.length / 2);
    const sdrWhite = 0.5807 * 65535;

    expect(Math.max(...codes)).toBeGreaterThan(sdrWhite * 1.1);
  });

  it('sans encodeur HDR, AUCUN AVIF n’est servi pour une source HDR (jamais un AVIF délavé)', async () => {
    expect(await createAvifVariants(HDR, { widths: [256], encodeHdr: async () => null })).toEqual([]);
  });
});
