import { describe, expect, test } from 'bun:test';

import { scriptedGateway } from '@/test-support/scripted-transport';

import { createSticker, decodeSticker, deleteSticker, loadMyStickers, markStickerUsed, withStickerFirst } from './stickers';

/**
 * LE PORT DE « MES STICKERS » (#7938) — `/api/v1/me/stickers`. Chaque témoin
 * relit la requête PARTIE, pas seulement ce qui revient.
 */

const wire = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: null,
  origin: 'paste',
  mimeType: 'image/png',
  fileUrl: `stickers/u1/${id}.png`,
  width: 512,
  height: 256,
  sizeBytes: 1234,
  animated: false,
  createdAt: '2026-09-25T10:00:00.000Z',
  lastUsedAt: '2026-09-25T10:00:00.000Z',
  ...overrides,
});

describe('loadMyStickers', () => {
  test('rend la bibliothèque servie, et une ligne malformée tombe seule', async () => {
    const { deps } = scriptedGateway({
      'GET /api/v1/me/stickers': { ok: true, data: [wire('a'), { id: 'broken' }, wire('b', { animated: true, mimeType: 'image/gif' })] },
    });

    const result = await loadMyStickers(deps);

    expect(result.ok && result.data.map((s) => s.id)).toEqual(['a', 'b']);
  });

  test('un refus passe tel quel à l’écran', async () => {
    const { deps } = scriptedGateway({ 'GET /api/v1/me/stickers': { ok: false, status: 403, error: 'Registered user required' } });

    expect(await loadMyStickers(deps)).toEqual({ ok: false, status: 403, error: 'Registered user required' });
  });
});

describe('createSticker', () => {
  test('envoie l’image et son origine en multipart, rend la définition', async () => {
    const { deps, calls } = scriptedGateway({ 'POST /api/v1/me/stickers': { ok: true, data: wire('new') } });
    const file = new File([new Uint8Array([1, 2, 3])], 'pasted.png', { type: 'image/png' });

    const result = await createSticker(deps, { file, origin: 'paste' });

    expect(result.ok && result.data.id).toBe('new');
    const body = calls()[0]?.body as FormData;
    expect(body.get('origin')).toBe('paste');
    expect((body.get('file') as File).name).toBe('pasted.png');
    expect(body.has('name')).toBe(false);
  });

  test('le code de refus de la passerelle arrive jusqu’à l’écran', async () => {
    const { deps } = scriptedGateway({
      'POST /api/v1/me/stickers': { ok: false, status: 415, error: 'Not an image', code: 'STICKER_NOT_AN_IMAGE' },
    });

    const result = await createSticker(deps, { file: new Blob(['x']), origin: 'upload' });

    expect(result.ok === false && result.code).toBe('STICKER_NOT_AN_IMAGE');
  });
});

describe('deleteSticker, markStickerUsed', () => {
  test('visent le sticker par son identifiant', async () => {
    const { deps, calls } = scriptedGateway({
      'DELETE /api/v1/me/stickers/abc': { ok: true, data: { id: 'abc', removed: true } },
      'POST /api/v1/me/stickers/abc/use': { ok: true, data: wire('abc') },
    });

    await deleteSticker(deps, 'abc');
    await markStickerUsed(deps, 'abc');

    expect(calls().map((c) => `${c.method} ${c.path}`)).toEqual(['DELETE /api/v1/me/stickers/abc', 'POST /api/v1/me/stickers/abc/use']);
  });
});

describe('decodeSticker, withStickerFirst', () => {
  test('un nom absent devient null, jamais undefined', () => {
    const { name: _name, ...withoutName } = wire('x');
    expect(decodeSticker(withoutName)?.name).toBeNull();
  });

  test('le sticker utilisé passe en tête, les autres gardent leur ordre', () => {
    const [a, b, c] = ['a', 'b', 'c'].map((id) => decodeSticker(wire(id))!);
    expect(withStickerFirst([a!, b!, c!], c!).map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });
});
