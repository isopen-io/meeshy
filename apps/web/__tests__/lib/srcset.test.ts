import { buildImageSrcSet } from '@/lib/images/srcset';
import type { ImageVariant } from '@meeshy/shared/types/attachment';

const variant = (width: number, url: string): ImageVariant => ({
  width,
  height: Math.round(width * 0.75),
  url,
  size: width * 10,
  format: 'webp',
});

describe('buildImageSrcSet', () => {
  it('returns undefined when there are no variants', () => {
    expect(buildImageSrcSet(undefined, '/full.jpg')).toBeUndefined();
    expect(buildImageSrcSet([], '/full.jpg')).toBeUndefined();
  });

  it('builds an ascending-width srcset from variants', () => {
    const srcSet = buildImageSrcSet(
      [variant(1280, '/a-1280.webp'), variant(320, '/a-320.webp'), variant(640, '/a-640.webp')],
      '/full.jpg'
    );
    expect(srcSet).toBe('/a-320.webp 320w, /a-640.webp 640w, /a-1280.webp 1280w');
  });

  it('appends the full-resolution original as the largest candidate', () => {
    const srcSet = buildImageSrcSet([variant(640, '/a-640.webp')], '/full.jpg', {
      fullWidth: 2000,
    });
    expect(srcSet).toBe('/a-640.webp 640w, /full.jpg 2000w');
  });

  it('does NOT append the original when it is not larger than the biggest variant', () => {
    const srcSet = buildImageSrcSet([variant(640, '/a-640.webp')], '/full.jpg', {
      fullWidth: 640,
    });
    expect(srcSet).toBe('/a-640.webp 640w');
  });

  it('applies resolveUrl to map relative variant urls to absolute', () => {
    const srcSet = buildImageSrcSet([variant(320, '/a-320.webp')], '/full.jpg', {
      resolveUrl: (u) => `https://cdn.test${u}`,
    });
    expect(srcSet).toBe('https://cdn.test/a-320.webp 320w');
  });

  it('skips malformed variants (no url / non-positive width)', () => {
    const srcSet = buildImageSrcSet(
      [
        variant(320, '/ok.webp'),
        { width: 0, height: 0, url: '/bad.webp', format: 'webp', size: 0 },
        { width: 800, height: 600, url: '', format: 'webp', size: 0 },
      ],
      '/full.jpg'
    );
    expect(srcSet).toBe('/ok.webp 320w');
  });
});
