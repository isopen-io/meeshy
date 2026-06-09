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
 * WebP only by design: AVIF (smaller still) is far costlier to encode and is
 * gated on a libheif/aom-enabled build — a config-flippable follow-up.
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
