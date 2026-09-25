import { describe, expect, test } from 'bun:test';

import type { StickerDefinition } from '@meeshy/shared/types/sticker-definition';

import { stickerFileOf, stickerRefusalKey } from './library-file';

/**
 * UN STICKER DE LA BIBLIOTHÈQUE PART COMME L'IMAGE QU'IL EST (#7938) — son
 * fichier est relu une fois, puis voyage en pièce jointe du message.
 */

const sticker = (overrides: Partial<StickerDefinition> = {}): StickerDefinition => ({
  id: 'abc',
  name: null,
  origin: 'paste',
  mimeType: 'image/webp',
  fileUrl: 'stickers/u1/abc.webp',
  width: 512,
  height: 512,
  sizeBytes: 3,
  animated: false,
  createdAt: '2026-09-25T10:00:00.000Z',
  lastUsedAt: '2026-09-25T10:00:00.000Z',
  ...overrides,
});

describe('stickerFileOf', () => {
  test('rend un fichier du type du sticker, nommé par son identifiant', async () => {
    const seen: string[] = [];
    const fetcher = async (url: string) => {
      seen.push(url);
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    };

    const file = await stickerFileOf(sticker({ mimeType: 'image/gif', fileUrl: 'stickers/u1/abc.gif' }), fetcher);

    expect(file?.type).toBe('image/gif');
    expect(file?.name).toBe('sticker-abc.gif');
    expect(file?.size).toBe(3);
    expect(seen[0]).toContain('stickers%2Fu1%2Fabc.gif');
  });

  test('un fichier introuvable ou un réseau coupé rend null, jamais une exception', async () => {
    expect(await stickerFileOf(sticker(), async () => new Response(null, { status: 404 }))).toBeNull();
    expect(
      await stickerFileOf(sticker(), async () => {
        throw new TypeError('offline');
      }),
    ).toBeNull();
  });
});

describe('stickerRefusalKey', () => {
  test('chaque refus de la passerelle a sa phrase, le reste retombe sur l’échec générique', () => {
    expect(stickerRefusalKey('STICKER_NOT_AN_IMAGE')).toBe('composer.sticker.error.notImage');
    expect(stickerRefusalKey('STICKER_TOO_LARGE')).toBe('composer.sticker.error.tooLarge');
    expect(stickerRefusalKey('STICKER_LIBRARY_FULL')).toBe('composer.sticker.error.full');
    expect(stickerRefusalKey(undefined)).toBe('composer.sticker.error.failed');
  });
});
