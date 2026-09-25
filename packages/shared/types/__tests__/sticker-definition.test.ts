import { describe, it, expect } from 'vitest';
import {
  STICKER_LIMITS,
  stickerFitWithin,
  stickerMimeFromSignature,
  isStickerAnimatedGif,
} from '../sticker-definition';

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const png = (): Uint8Array => bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d);
const gif = (): Uint8Array => bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0);
const webp = (): Uint8Array => bytes(0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
const jpeg = (): Uint8Array => bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);

describe('stickerMimeFromSignature', () => {
  it('reads the real type from the bytes, whatever the file claims', () => {
    expect(stickerMimeFromSignature(png())).toBe('image/png');
    expect(stickerMimeFromSignature(gif())).toBe('image/gif');
    expect(stickerMimeFromSignature(webp())).toBe('image/webp');
  });

  it('refuses a JPEG, which cannot carry transparency, and anything unknown', () => {
    expect(stickerMimeFromSignature(jpeg())).toBeNull();
    expect(stickerMimeFromSignature(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull();
    expect(stickerMimeFromSignature(bytes())).toBeNull();
  });

  it('refuses a RIFF container that is not WebP', () => {
    expect(stickerMimeFromSignature(bytes(0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))).toBeNull();
  });
});

describe('stickerFitWithin', () => {
  it('keeps an image that already fits', () => {
    expect(stickerFitWithin({ width: 300, height: 200 })).toEqual({ width: 300, height: 200 });
  });

  it('shrinks the longest side to the sticker edge and keeps the ratio', () => {
    expect(stickerFitWithin({ width: 2048, height: 1024 })).toEqual({ width: STICKER_LIMITS.maxEdge, height: 256 });
    expect(stickerFitWithin({ width: 1000, height: 4000 })).toEqual({ width: 128, height: STICKER_LIMITS.maxEdge });
  });

  it('never returns a zero side for an extreme ratio', () => {
    expect(stickerFitWithin({ width: 10000, height: 3 })).toEqual({ width: 512, height: 1 });
  });
});

describe('isStickerAnimatedGif', () => {
  const frame = [0x21, 0xf9, 0x04, 0, 0, 0, 0, 0, 0x2c];
  it('sees more than one graphic control block as an animation', () => {
    expect(isStickerAnimatedGif(bytes(...gif(), ...frame, ...frame))).toBe(true);
  });

  it('treats a single-frame GIF and any other format as still', () => {
    expect(isStickerAnimatedGif(bytes(...gif(), ...frame))).toBe(false);
    expect(isStickerAnimatedGif(png())).toBe(false);
  });
});
