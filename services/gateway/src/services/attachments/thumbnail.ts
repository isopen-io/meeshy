/**
 * Image thumbnail generation + serving helpers (bandwidth sprint Phase D4).
 *
 * Thumbnails are among the most frequently fetched assets (every conversation
 * row, every image-message preview). Encoding them as WebP instead of JPEG-80
 * cuts ~25-35% off each thumbnail at equivalent perceptual quality, for free,
 * on a universally supported format (iOS 16+, every modern browser, Android).
 *
 * Backward compatibility: every legacy thumbnail was piped through sharp's
 * `.jpeg()` encoder and therefore carries JPEG bytes regardless of the
 * extension it was stored under (`_thumb.jpg`, `_thumb.png`, …). New
 * thumbnails are stored as `_thumb.webp`. `thumbnailContentType` keys off the
 * `.webp` extension alone, so legacy thumbnails keep being served as
 * `image/jpeg` and new ones as `image/webp` — no migration needed.
 */
import sharp from 'sharp';
import { promises as fs } from 'fs';
import * as path from 'path';
import { encodeHdrAvif, hasGainMap, type HdrAvifEncoder } from './hdr-avif';

export const THUMBNAIL_MAX_SIZE = 300;
export const THUMBNAIL_WEBP_QUALITY = 80;

/**
 * Target widths (px) for full-resolution responsive variants (bandwidth
 * sprint D4). A phone on a narrow viewport over a metered connection pulls a
 * 640px WebP (~tens of KB) instead of a multi-MB original. Only widths
 * STRICTLY smaller than the source are emitted — the original (served via
 * `fileUrl`) always remains the largest entry of any client `srcset`.
 */
export const RESPONSIVE_VARIANT_WIDTHS = [640, 1080, 1920] as const;
export const VARIANT_WEBP_QUALITY = 78;

export type ImageVariant = {
  readonly width: number;
  readonly height: number;
  readonly format: 'webp';
  readonly buffer: Buffer;
};

/**
 * #11262 — AVIF variants, stored NEXT TO the WebP ones (never inside
 * `imageVariants`, which older clients read without filtering the format).
 * q60 / effort 4 is a perceptual quality comparable to WebP q78 at a smaller
 * weight (verdict #11247: one perceptual generation, colour profile kept):
 * the source ICC profile (Display P3 on every recent phone) is KEPT, where the
 * WebP variants convert to sRGB. A source carrying an HDR gain map gets
 * HDR AVIF variants (10-bit BT.2100 PQ, `hdr-avif.ts`, #12290) — or none.
 */
export const AVIF_VARIANT_QUALITY = 60;
export const AVIF_VARIANT_EFFORT = 4;

export type AvifImageVariant = {
  readonly width: number;
  readonly height: number;
  readonly format: 'avif';
  readonly buffer: Buffer;
};


/**
 * Resize (fit inside, never enlarge) and encode an image to a WebP thumbnail.
 * `input` is a source file path or an in-memory buffer (encrypted uploads).
 */
export async function createImageThumbnail(
  input: Buffer | string,
  opts: { size?: number; quality?: number } = {}
): Promise<Buffer> {
  const size = opts.size ?? THUMBNAIL_MAX_SIZE;
  const quality = opts.quality ?? THUMBNAIL_WEBP_QUALITY;
  return sharp(input)
    .resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}

/**
 * Generate responsive WebP variants of a full-resolution image, one per
 * target width strictly smaller than the source width (never upscale).
 * `input` is a source file path or an in-memory buffer. Variants are returned
 * ascending by width; an empty array means the source is already small enough
 * that no downscaled variant is worthwhile (caller keeps just the original).
 *
 * AVIF variants are produced separately by `createAvifVariants` (#11262).
 */
export async function createResponsiveVariants(
  input: Buffer | string,
  opts: { widths?: readonly number[]; quality?: number } = {}
): Promise<ImageVariant[]> {
  const widths = opts.widths ?? RESPONSIVE_VARIANT_WIDTHS;
  const quality = opts.quality ?? VARIANT_WEBP_QUALITY;

  // Decode the source once, then fan out to each target width.
  const source = typeof input === 'string' ? await fs.readFile(input) : input;
  const srcWidth = (await sharp(source).metadata()).width ?? 0;

  const targets = [...new Set(widths)]
    .filter((w) => w > 0 && w < srcWidth)
    .sort((a, b) => a - b);

  const variants: ImageVariant[] = [];
  for (const width of targets) {
    const { data, info } = await sharp(source)
      .resize(width, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    variants.push({ width: info.width, height: info.height, format: 'webp', buffer: data });
  }
  return variants;
}

/**
 * Generate responsive AVIF variants, one per target width strictly smaller
 * than the source width — the same widths as the WebP ones (#11262).
 */
export async function createAvifVariants(
  input: Buffer | string,
  opts: { widths?: readonly number[]; quality?: number; encodeHdr?: HdrAvifEncoder } = {}
): Promise<AvifImageVariant[]> {
  const widths = opts.widths ?? RESPONSIVE_VARIANT_WIDTHS;
  const quality = opts.quality ?? AVIF_VARIANT_QUALITY;
  const source = typeof input === 'string' ? await fs.readFile(input) : input;
  const srcWidth = (await sharp(source).metadata()).width ?? 0;
  const targets = [...new Set(widths)].filter((w) => w > 0 && w < srcWidth).sort((a, b) => a - b);
  const hdr = await hasGainMap(source);
  const encodeHdr = opts.encodeHdr ?? encodeHdrAvif;

  const variants: AvifImageVariant[] = [];
  for (const width of targets) {
    if (hdr) {
      // #12290 — une source HDR rend un AVIF HDR, ou AUCUN AVIF : jamais un SDR.
      const encoded = await encodeHdr(source, width);
      if (encoded === null) return [];
      const meta = await sharp(encoded).metadata();
      variants.push({ width: meta.width ?? width, height: meta.height ?? 0, format: 'avif', buffer: encoded });
      continue;
    }
    const { data, info } = await sharp(source)
      .resize(width, null, { fit: 'inside', withoutEnlargement: true })
      .keepIccProfile()
      .avif({ quality, effort: AVIF_VARIANT_EFFORT })
      .toBuffer({ resolveWithObject: true });
    variants.push({ width: info.width, height: info.height, format: 'avif', buffer: data });
  }
  return variants;
}

/** Stored path for an AVIF variant: `<base>_<width>w.avif` (#11262). */
export function avifVariantPathFor(imagePath: string, width: number): string {
  const ext = path.extname(imagePath);
  const base = ext ? imagePath.slice(0, imagePath.length - ext.length) : imagePath;
  return `${base}_${width}w.avif`;
}

/**
 * Stored path for a responsive variant of a source image. Always `.webp`,
 * suffixed `_{width}w` (e.g. `photo_640w.webp`) so the existing
 * `/attachments/file/*` route serves it with no new endpoint.
 */
export function variantPathFor(imagePath: string, width: number): string {
  const ext = path.extname(imagePath);
  const base = ext ? imagePath.slice(0, imagePath.length - ext.length) : imagePath;
  return `${base}_${width}w.webp`;
}

/**
 * Stored thumbnail path for a source image path. Always `.webp`, suffixed
 * `_thumb` to mirror the historical naming.
 */
export function thumbnailPathFor(imagePath: string): string {
  const ext = path.extname(imagePath);
  const base = ext ? imagePath.slice(0, imagePath.length - ext.length) : imagePath;
  return `${base}_thumb.webp`;
}

/**
 * Content-Type for a stored thumbnail. `.webp` → image/webp (new), everything
 * else → image/jpeg (legacy bytes are always JPEG). Backward compatible.
 */
export function thumbnailContentType(thumbPath: string): string {
  return path.extname(thumbPath).toLowerCase() === '.webp' ? 'image/webp' : 'image/jpeg';
}
