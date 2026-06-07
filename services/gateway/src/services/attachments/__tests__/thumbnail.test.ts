import sharp from 'sharp';
import {
  createImageThumbnail,
  thumbnailPathFor,
  thumbnailContentType,
  THUMBNAIL_MAX_SIZE,
} from '../thumbnail';

// A non-trivial source image so JPEG vs WebP sizing is meaningful.
const sourceImage = async (): Promise<Buffer> =>
  sharp({
    create: {
      width: 1200,
      height: 800,
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
