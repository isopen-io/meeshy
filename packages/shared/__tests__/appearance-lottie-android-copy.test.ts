import { describe, expect, it } from 'vitest';
import { referencedLottieFiles } from '../scripts/sync-appearance-catalog-android';

describe('les films qu’Android embarque à côté de son catalogue (#13952, #13960)', () => {
  it('copie la couche d’un contour ET les deux films illustrés d’un cadre, chacun une fois', () => {
    const ref = (src: string) => ({ src, bytes: 1, sha256: 'x' });
    const catalog = JSON.stringify({
      rings: [
        { rings: [{ key: 'halo', lottie: ref('aaaaaaaaaaaaaaaa.json') }] },
        { rings: [{ key: 'masque', decor: { reach: 1.4, back: ref('bbbbbbbbbbbbbbbb.json'), front: ref('cccccccccccccccc.json') } }, { key: 'toile', decor: { reach: 1.4, front: ref('cccccccccccccccc.json') } }] },
      ],
    });
    expect(referencedLottieFiles(catalog)).toEqual(['aaaaaaaaaaaaaaaa.json', 'bbbbbbbbbbbbbbbb.json', 'cccccccccccccccc.json']);
  });
});
