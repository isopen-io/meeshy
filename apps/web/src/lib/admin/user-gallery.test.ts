import { describe, expect, test } from 'bun:test';

import type { AdminMedia } from '@/lib/api/admin-user-media';

import { gallerySlidesOf, stepSlide } from './user-gallery';

const media = (surcharge: Partial<AdminMedia> & { readonly id: string }): AdminMedia => ({
  originalName: '',
  mimeType: 'image/jpeg',
  fileUrl: `/f/${surcharge.id}.jpg`,
  thumbnailUrl: null,
  fileSize: 1,
  duration: null,
  createdAt: null,
  source: 'post',
  contextId: null,
  isProtected: false,
  ...surcharge,
});

describe('les images d’un membre', () => {
  test('la photo, la bannière, puis les images publiées — ni les vidéos ni les sons', () => {
    const diapos = gallerySlidesOf({
      avatar: '/a.jpg',
      banner: '/b.jpg',
      medias: [media({ id: 'm1' }), media({ id: 'm2', mimeType: 'video/mp4' }), media({ id: 'm3', mimeType: 'audio/ogg' })],
    });
    expect(diapos.map((d) => [d.kind, d.id, d.url])).toEqual([
      ['avatar', 'avatar', '/a.jpg'],
      ['banner', 'banner', '/b.jpg'],
      ['media', 'm1', '/f/m1.jpg'],
    ]);
  });

  test('sans photo ni bannière, seules les images restent', () => {
    expect(gallerySlidesOf({ avatar: ' ', banner: '', medias: [media({ id: 'm1' })] }).map((d) => d.id)).toEqual(['m1']);
  });

  test('une image protégée reste une diapositive, sans aucune adresse', () => {
    const [diapo] = gallerySlidesOf({ avatar: '', banner: '', medias: [media({ id: 'p', isProtected: true, fileUrl: '/leak.jpg' })] });
    expect([diapo?.id, diapo?.url]).toEqual(['p', null]);
  });

  test('la vignette sert quand le fichier manque', () => {
    const [diapo] = gallerySlidesOf({ avatar: '', banner: '', medias: [media({ id: 'v', fileUrl: null, thumbnailUrl: '/t.jpg' })] });
    expect(diapo?.url).toBe('/t.jpg');
  });
});

describe('le pas du carrousel', () => {
  test('boucle dans les deux sens', () => {
    expect([stepSlide(2, 1, 3), stepSlide(0, -1, 3), stepSlide(1, 1, 3), stepSlide(0, 1, 0)]).toEqual([0, 2, 2, 0]);
  });
});
