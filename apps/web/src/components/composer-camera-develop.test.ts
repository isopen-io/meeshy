import { describe, expect, test } from 'bun:test';

import { developShots } from '@/lib/media/develop-shots';

/**
 * LA PHOTO PRISE PAR LA CAMÉRA DU COMPOSEUR (#8695) — elle passe par le
 * développement unique des photos, chargé à part ; si ce chunk ne vient pas
 * (hors ligne, déploiement entre-temps), la photo part originale plutôt que
 * de se perdre.
 */

describe('developShots', () => {
  test('le développement indisponible : la photo prise part quand même, originale', async () => {
    const shot = new File(['x'], 'IMG_0002.jpg', { type: 'image/jpeg' });
    expect(await developShots([shot], () => Promise.reject(new Error('chunk')))).toEqual([shot]);
  });

  test('le développement disponible : chaque photo prise est développée', async () => {
    const shot = new File(['x'], 'IMG_0003.HEIC', { type: 'image/heic' });
    const developed = new File(['y'], 'IMG_0003.jpg', { type: 'image/jpeg' });
    expect(await developShots([shot], async () => ({ developPhotoFile: async () => developed }))).toEqual([developed]);
  });
});
