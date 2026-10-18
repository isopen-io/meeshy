import { describe, expect, test } from 'bun:test';

import { BUILTIN_BANNER_PACKS } from '@/lib/profile-decor/catalog';

import { bannerPaint } from './profile-banner-design';

const design = BUILTIN_BANNER_PACKS[0]!.items[0]!;

describe('ce que la bannière d’un profil peint (#10933) : la photo gagne toujours', () => {
  test('une photo ET un design équipé ⇒ la photo', () => {
    expect(bannerPaint({ image: 'media:banner-1', design })).toEqual({ kind: 'photo', image: 'media:banner-1' });
  });

  test('un design sans photo ⇒ le design', () => {
    expect(bannerPaint({ image: null, design })).toEqual({ kind: 'design', design });
  });

  test('ni photo ni design ⇒ le défaut', () => {
    expect(bannerPaint({ image: null, design: null })).toEqual({ kind: 'plain' });
  });

  test('une photo vide ne compte pas comme une photo', () => {
    expect(bannerPaint({ image: '', design })).toEqual({ kind: 'design', design });
  });
});
