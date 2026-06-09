import sharp from 'sharp';
import {
  createImageThumbnail,
  createResponsiveVariants,
  variantPathFor,
  thumbnailPathFor,
  thumbnailContentType,
  THUMBNAIL_MAX_SIZE,
  RESPONSIVE_VARIANT_WIDTHS,
} from '../thumbnail';

// A non-trivial source image so JPEG vs WebP sizing is meaningful.
const sourceImage = async (width = 1200, height = 800): Promise<Buffer> =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 90, b: 30 },
    },
  })
    .png()
    .toBuffer();

const isWebp = (buf: Buffer): boolean =>
  buf.length > 12 &&
  buf.toString('ascii', 0, 4) === 'RIFF' &&
  buf.toString('ascii', 8, 12) === 'WEBP';

describe('createImageThumbnail', () => {
  it('produces a WebP-encoded buffer (RIFF/WEBP magic bytes)', async () => {
    const thumb = await createImageThumbnail(await sourceImage());
    expect(isWebp(thumb)).toBe(true);
  });

  it('fits the thumbnail within the max size without enlarging', async () => {
    const thumb = await createImageThumbnail(await sourceImage());
    const meta = await sharp(thumb).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(THUMBNAIL_MAX_SIZE);
  });

  it('is meaningfully smaller than the equivalent JPEG-80 thumbnail', async () => {
    const src = await sourceImage();
    const webpThumb = await createImageThumbnail(src);
    const jpegThumb = await sharp(src)
      .resize(THUMBNAIL_MAX_SIZE, THUMBNAIL_MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    expect(webpThumb.length).toBeLessThan(jpegThumb.length);
  });
});

describe('createResponsiveVariants', () => {
  it('emits a WebP variant per target width strictly smaller than the source', async () => {
    // 1600px source: 640 and 1080 are smaller; 1920 is larger → dropped.
    const variants = await createResponsiveVariants(await sourceImage(1600, 1000));
    expect(variants.map((v) => v.width)).toEqual([640, 1080]);
    expect(variants.every((v) => v.format === 'webp')).toBe(true);
    expect(variants.every((v) => isWebp(v.buffer))).toBe(true);
  });

  it('preserves aspect ratio for each variant', async () => {
    const variants = await createResponsiveVariants(await sourceImage(1600, 1000));
    for (const v of variants) {
      expect(v.height).toBe(Math.round((v.width * 1000) / 1600));
    }
  });

  it('never upscales — a source smaller than every target yields no variants', async () => {
    const variants = await createResponsiveVariants(await sourceImage(500, 300));
    expect(variants).toEqual([]);
  });

  it('orders variants ascending by width (and thus by byte size)', async () => {
    const variants = await createResponsiveVariants(await sourceImage(2400, 1600));
    const widths = variants.map((v) => v.width);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    for (let i = 1; i < variants.length; i++) {
      expect(variants[i].buffer.length).toBeGreaterThanOrEqual(variants[i - 1].buffer.length);
    }
  });

  it('honours custom widths', async () => {
    const variants = await createResponsiveVariants(await sourceImage(1600, 1000), {
      widths: [320, 800],
    });
    expect(variants.map((v) => v.width)).toEqual([320, 800]);
  });

  it('exposes the default responsive width ladder', () => {
    expect([...RESPONSIVE_VARIANT_WIDTHS]).toEqual([640, 1080, 1920]);
  });
});

describe('variantPathFor', () => {
  it('suffixes the source path with _{width}w.webp', () => {
    expect(variantPathFor('2026/06/u1/photo.png', 640)).toBe('2026/06/u1/photo_640w.webp');
    expect(variantPathFor('2026/06/u1/photo.jpeg', 1080)).toBe('2026/06/u1/photo_1080w.webp');
  });

  it('handles a path without extension', () => {
    expect(variantPathFor('2026/06/u1/photo', 640)).toBe('2026/06/u1/photo_640w.webp');
  });
});

describe('thumbnailPathFor', () => {
  it('replaces the source extension with _thumb.webp', () => {
    expect(thumbnailPathFor('2026/06/u1/photo.png')).toBe('2026/06/u1/photo_thumb.webp');
    expect(thumbnailPathFor('2026/06/u1/photo.jpeg')).toBe('2026/06/u1/photo_thumb.webp');
  });

  it('handles a path without extension', () => {
    expect(thumbnailPathFor('2026/06/u1/photo')).toBe('2026/06/u1/photo_thumb.webp');
  });
});

describe('thumbnailContentType', () => {
  it('serves new .webp thumbnails as image/webp', () => {
    expect(thumbnailContentType('photo_thumb.webp')).toBe('image/webp');
  });

  it('serves legacy thumbnails (always JPEG bytes) as image/jpeg', () => {
    expect(thumbnailContentType('photo_thumb.jpg')).toBe('image/jpeg');
    expect(thumbnailContentType('photo_thumb.png')).toBe('image/jpeg');
    expect(thumbnailContentType('photo_thumb.jpeg')).toBe('image/jpeg');
  });
});
