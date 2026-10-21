import { beforeEach, describe, expect, test } from 'bun:test';

import {
  addedSnapshot,
  noteStickerAdded,
  receivedStickerFile,
  resetAddedStickersForTests,
  stickerInLibrary,
  stickerKeyOf,
  stickerAddable,
  stickerPackSlugOf,
} from './received';

const picture = { fileUrl: '/attachments/file/a.png' };

beforeEach(() => resetAddedStickersForTests());

describe('stickerInLibrary', () => {
  test('un sticker dont l’identifiant est dans la bibliothèque y est', () => {
    expect(stickerInLibrary({ sticker: { stickerId: 's1' }, picture, library: [{ id: 's1' }], added: new Set() })).toBe(true);
  });

  test('un sticker reçu inconnu n’y est pas', () => {
    expect(stickerInLibrary({ sticker: { stickerId: 'autre' }, picture, library: [{ id: 's1' }], added: new Set() })).toBe(false);
  });

  test('un ajout de la session le rend « dans mes stickers » sans relire la bibliothèque', () => {
    noteStickerAdded(picture.fileUrl);
    expect(stickerInLibrary({ sticker: { stickerId: 'autre' }, picture, library: [], added: addedSnapshot() })).toBe(true);
  });

  test('un sticker sans clé (ni image ni identifiant) n’est jamais « rangé »', () => {
    expect(stickerKeyOf({ emoji: '🔥' }, undefined)).toBeNull();
    expect(stickerInLibrary({ sticker: { emoji: '🔥' }, picture: undefined, library: [], added: new Set(['']) })).toBe(false);
  });
});

describe('stickerPackSlugOf', () => {
  test('le gabarit d’un pack dit son pack', () => {
    expect(stickerPackSlugOf({ templateId: 'pack.fetes.confetti' })).toBe('fetes');
  });
  test('un sticker de bibliothèque ou un emoji n’a pas de pack', () => {
    expect(stickerPackSlugOf({ stickerId: 's1' })).toBeNull();
    expect(stickerPackSlugOf({ emoji: '🔥' })).toBeNull();
  });
});

describe('receivedStickerFile', () => {
  test('relit l’image jointe en fichier', async () => {
    const file = await receivedStickerFile('/a.png', async () => new Response(new Blob(['x'], { type: 'image/webp' })));
    expect(file?.type).toBe('image/webp');
  });
  test('une image illisible rend null', async () => {
    expect(await receivedStickerFile('/a.png', async () => new Response('', { status: 404 }))).toBeNull();
    expect(await receivedStickerFile('/a.png', async () => Promise.reject(new Error('réseau')))).toBeNull();
  });
});

describe('stickerAddable', () => {
  test('seule une image jointe se dépose en bibliothèque', () => {
    expect(stickerAddable(picture)).toBe(true);
    expect(stickerAddable(undefined)).toBe(false);
    expect(stickerAddable({ fileUrl: '' })).toBe(false);
  });
});
