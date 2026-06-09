import type { ImageVariant } from '@meeshy/shared/types/attachment';

/**
 * D4 — build an `<img srcset>` value from an attachment's responsive WebP
 * variants so the browser fetches the smallest sufficient image (tens of KB)
 * instead of the multi-MB original for inline previews.
 *
 * Pure: given the variants + the full-resolution URL/width, returns the
 * `srcSet` string (or `undefined` when there's nothing to offer). The
 * full-resolution `fullUrl` is always appended as the largest candidate when
 * its width exceeds the biggest variant, so high-DPI / fullscreen still gets
 * the original.
 *
 * `resolveUrl` lets the caller map a server-relative variant url to an
 * absolute one (mirrors how the gallery wraps `fileUrl`).
 */
export function buildImageSrcSet(
  variants: readonly ImageVariant[] | null | undefined,
  fullUrl: string,
  options?: { fullWidth?: number; resolveUrl?: (url: string) => string }
): string | undefined {
  if (!variants || variants.length === 0) return undefined;

  const resolve = options?.resolveUrl ?? ((u: string) => u);

  const entries = variants
    .filter((v) => v && typeof v.url === 'string' && v.url.length > 0 && v.width > 0)
    .slice()
    .sort((a, b) => a.width - b.width);

  if (entries.length === 0) return undefined;

  // Dedupe by width (last write wins is fine — same width ⇒ interchangeable).
  const byWidth = new Map<number, string>();
  for (const v of entries) byWidth.set(v.width, `${resolve(v.url)} ${v.width}w`);

  const largestVariantWidth = entries[entries.length - 1].width;
  const parts = Array.from(byWidth.values());

  if (fullUrl && options?.fullWidth && options.fullWidth > largestVariantWidth) {
    parts.push(`${resolve(fullUrl)} ${options.fullWidth}w`);
  }

  return parts.length > 0 ? parts.join(', ') : undefined;
}
