/**
 * thumbnail utility tests
 *
 * Tests pure helper functions only. createImageThumbnail and
 * createResponsiveVariants are excluded (they require sharp I/O).
 *
 * @jest-environment node
 */

import {
  variantPathFor,
  thumbnailPathFor,
  thumbnailContentType,
  THUMBNAIL_MAX_SIZE,
  THUMBNAIL_WEBP_QUALITY,
  RESPONSIVE_VARIANT_WIDTHS,
  VARIANT_WEBP_QUALITY,
} from '../../../services/attachments/thumbnail';

describe('module constants', () => {
  it('THUMBNAIL_MAX_SIZE is 300', () => expect(THUMBNAIL_MAX_SIZE).toBe(300));
  it('THUMBNAIL_WEBP_QUALITY is 80', () => expect(THUMBNAIL_WEBP_QUALITY).toBe(80));
  it('RESPONSIVE_VARIANT_WIDTHS contains 640, 1080, 1920', () => {
    expect(RESPONSIVE_VARIANT_WIDTHS).toEqual([640, 1080, 1920]);
  });
  it('VARIANT_WEBP_QUALITY is 78', () => expect(VARIANT_WEBP_QUALITY).toBe(78));
});

describe('variantPathFor', () => {
  it('replaces extension and appends _<width>w.webp', () => {
    expect(variantPathFor('/uploads/photo.jpg', 640)).toBe('/uploads/photo_640w.webp');
  });

  it('works with .png extension', () => {
    expect(variantPathFor('/uploads/image.png', 1080)).toBe('/uploads/image_1080w.webp');
  });

  it('works with no extension', () => {
    expect(variantPathFor('/uploads/image', 640)).toBe('/uploads/image_640w.webp');
  });

  it('handles nested paths', () => {
    expect(variantPathFor('/a/b/c/photo.jpeg', 1920)).toBe('/a/b/c/photo_1920w.webp');
  });

  it('handles multiple dots in filename', () => {
    expect(variantPathFor('/uploads/my.photo.jpg', 640)).toBe('/uploads/my.photo_640w.webp');
  });
});

describe('thumbnailPathFor', () => {
  it('appends _thumb.webp for .jpg input', () => {
    expect(thumbnailPathFor('/uploads/photo.jpg')).toBe('/uploads/photo_thumb.webp');
  });

  it('appends _thumb.webp for .png input', () => {
    expect(thumbnailPathFor('/uploads/photo.png')).toBe('/uploads/photo_thumb.webp');
  });

  it('works with no extension', () => {
    expect(thumbnailPathFor('/uploads/photo')).toBe('/uploads/photo_thumb.webp');
  });

  it('handles nested path', () => {
    expect(thumbnailPathFor('/a/b/img.jpeg')).toBe('/a/b/img_thumb.webp');
  });
});

describe('thumbnailContentType', () => {
  it('returns image/webp for .webp extension', () => {
    expect(thumbnailContentType('/path/thumb.webp')).toBe('image/webp');
  });

  it('returns image/jpeg for .jpg extension (legacy)', () => {
    expect(thumbnailContentType('/path/thumb.jpg')).toBe('image/jpeg');
  });

  it('returns image/jpeg for .png extension (legacy)', () => {
    expect(thumbnailContentType('/path/thumb.png')).toBe('image/jpeg');
  });

  it('returns image/jpeg for no extension', () => {
    expect(thumbnailContentType('/path/thumb')).toBe('image/jpeg');
  });

  it('is case-insensitive for .WEBP', () => {
    expect(thumbnailContentType('/path/thumb.WEBP')).toBe('image/webp');
  });
});
