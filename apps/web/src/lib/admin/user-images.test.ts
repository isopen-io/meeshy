import { describe, expect, test } from 'bun:test';

import type { AdminMedia } from '@/lib/api/admin-user-media';
import { attachmentSrc } from '@/lib/api/media-url';

import { userImagesOf } from './user-images';

/**
 * LE CARROUSEL D'IMAGES D'UN MEMBRE (#7845 F) — une source PURE : la photo de
 * profil, la bannière, puis les images qu'il a publiées ou envoyées.
 *
 * Deux règles non négociables : un média PROTÉGÉ (vue unique, flouté,
 * éphémère) n'y entre jamais — la passerelle a déjà vidé ses URL, et une vignette
 * vide dans un carrousel dirait « image cassée » là où elle veut dire « secret » —
 * et une même image n'y figure qu'une fois.
 */

const media = (patch: Partial<AdminMedia>): AdminMedia => ({
  id: 'm-1',
  originalName: 'photo.png',
  mimeType: 'image/png',
  fileUrl: 'https://cdn.example.test/photo.png',
  thumbnailUrl: 'https://cdn.example.test/photo-thumb.png',
  fileSize: 100,
  duration: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  source: 'post',
  contextId: 'p-1',
  isProtected: false,
  ...patch,
});

const MEMBRE = {
  displayName: 'Amina',
  avatar: 'https://cdn.example.test/avatar.png',
  banner: 'https://cdn.example.test/banner.png',
};

describe('userImagesOf', () => {
  test('ordre : avatar, bannière, puis les images', () => {
    const images = userImagesOf(MEMBRE, [media({ id: 'm-1' }), media({ id: 'm-2', fileUrl: 'https://cdn.example.test/2.png', thumbnailUrl: null })]);

    expect(images.map((i) => i.kind)).toEqual(['avatar', 'banner', 'media', 'media']);
    expect(images.map((i) => i.id)).toEqual(['avatar', 'banner', 'm-1', 'm-2']);
    expect(images[2]?.thumb).toBe(attachmentSrc('https://cdn.example.test/photo-thumb.png'));
    expect(images[3]?.thumb).toBe(images[3]?.src);
    expect(images[2]?.label).toBe('photo.png');
    expect(images[0]?.label).toBe('Amina');
  });

  test('un média protégé, une vidéo, un média sans fichier n’y entrent pas', () => {
    const images = userImagesOf({ ...MEMBRE, avatar: '', banner: null }, [
      media({ id: 'secret', isProtected: true }),
      media({ id: 'video', mimeType: 'video/mp4', fileUrl: 'https://cdn.example.test/v.mp4' }),
      media({ id: 'vide', fileUrl: null }),
      media({ id: 'ok', fileUrl: 'https://cdn.example.test/ok.png' }),
    ]);

    expect(images.map((i) => i.id)).toEqual(['ok']);
  });

  test('une même URL n’apparaît qu’une fois', () => {
    const images = userImagesOf({ ...MEMBRE, banner: MEMBRE.avatar }, [media({ id: 'm-1', fileUrl: MEMBRE.avatar })]);

    expect(images.map((i) => i.id)).toEqual(['avatar']);
  });

  test('les URL relatives sont résolues contre la passerelle', () => {
    const images = userImagesOf({ ...MEMBRE, avatar: '2026/09/u-1/avatar.png', banner: null }, []);

    expect(images[0]?.src).toBe(attachmentSrc('2026/09/u-1/avatar.png'));
  });

  test('sans aucune image, la liste est vide', () => {
    expect(userImagesOf({ displayName: 'Amina', avatar: '', banner: null }, [])).toEqual([]);
  });
});
