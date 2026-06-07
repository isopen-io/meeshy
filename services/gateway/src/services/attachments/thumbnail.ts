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
import * as path from 'path';

export const THUMBNAIL_MAX_SIZE = 300;
export const THUMBNAIL_WEBP_QUALITY = 80;

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
