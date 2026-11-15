/**
 * Normalisation serveur d'un sticker (#7938) — sur de VRAIES images produites
 * par sharp : le reniflage, le ré-encodage et l'animation ne se simulent pas.
 *
 * @jest-environment node
 */
import sharp from 'sharp';
import { STICKER_LIMITS } from '@meeshy/shared/types/sticker-definition';
import { normalizeStickerImage } from '../stickerImage';

const solid = (width: number, height: number, red = 200) =>
  sharp({ create: { width, height, channels: 4, background: { r: red, g: 40, b: 90, alpha: 0.5 } } });

/** Des images DIFFÉRENTES : l'encodeur GIF fusionne deux images identiques. */
async function animatedGif(frames: number, size: number): Promise<Buffer> {
  const images = await Promise.all([...Array(frames)].map((_, i) => solid(size, size, 40 + i * 70).png().toBuffer()));
  return sharp(images, { join: { animated: true } }).gif().toBuffer();
}

describe('normalizeStickerImage', () => {
  it('keeps a small transparent PNG as a PNG, at its own size', async () => {
    const outcome = await normalizeStickerImage(await solid(200, 100).png().toBuffer());

    expect(outcome).toMatchObject({ ok: true, image: { mimeType: 'image/png', width: 200, height: 100, animated: false } });
    if (!outcome.ok) throw new Error('unreachable');
    const meta = await sharp(outcome.image.bytes).metadata();
    expect(meta.hasAlpha).toBe(true);
  });

  it('shrinks a full screenshot into the sticker square', async () => {
    const outcome = await normalizeStickerImage(await solid(2048, 1024).png().toBuffer());

    expect(outcome).toMatchObject({ ok: true, image: { width: STICKER_LIMITS.maxEdge, height: 256 } });
  });

  it('turns a pasted JPEG photo into a WebP sticker', async () => {
    const outcome = await normalizeStickerImage(await solid(640, 480).jpeg().toBuffer());

    expect(outcome).toMatchObject({ ok: true, image: { mimeType: 'image/webp', width: 512, height: 384 } });
  });

  it('keeps every frame of an animated GIF, even when it is resized', async () => {
    const outcome = await normalizeStickerImage(await animatedGif(3, 600));

    expect(outcome).toMatchObject({ ok: true, image: { mimeType: 'image/gif', animated: true, width: 512, height: 512 } });
    if (!outcome.ok) throw new Error('unreachable');
    expect((await sharp(outcome.image.bytes, { animated: true }).metadata()).pages).toBe(3);
  });

  it('refuses bytes that only claim to be an image', async () => {
    expect(await normalizeStickerImage(Buffer.from('%PDF-1.7 not an image'))).toEqual({ ok: false, reason: 'not-an-image' });
    expect(await normalizeStickerImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]))).toEqual({
      ok: false,
      reason: 'not-an-image',
    });
  });

  it('refuses a source heavier than the admitted source weight before decoding it', async () => {
    const huge = Buffer.concat([await solid(8, 8).png().toBuffer(), Buffer.alloc(STICKER_LIMITS.maxSourceBytes)]);

    expect(await normalizeStickerImage(huge)).toEqual({ ok: false, reason: 'too-large' });
  });
});
