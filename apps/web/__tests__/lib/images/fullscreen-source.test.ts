/**
 * Décision de source pour le plein écran d'une image — miroir web du
 * patron iOS `FullscreenImageSource.resolve` (#3871 → #3878). Deux cas, et
 * deux seulement : le plein format est RÉSIDENT (affiché tel quel, sans
 * spinner ni fond) ou il se CHARGE (fond = la vignette, floue, JAMAIS
 * l'image affichée nette elle-même).
 */
import { resolveFullscreenImageSource } from '@/lib/images/fullscreen-source';

describe('resolveFullscreenImageSource', () => {
  it('returns null without a full-resolution URL — the caller renders its empty state', () => {
    expect(
      resolveFullscreenImageSource({ fullUrl: null, thumbnailUrl: 'https://cdn.example/thumb.jpg', isFullResident: false })
    ).toBeNull();
    expect(
      resolveFullscreenImageSource({ fullUrl: undefined, thumbnailUrl: undefined, isFullResident: false })
    ).toBeNull();
    expect(
      resolveFullscreenImageSource({ fullUrl: '', thumbnailUrl: 'https://cdn.example/thumb.jpg', isFullResident: false })
    ).toBeNull();
  });

  it('resident full image: no backdrop, no spinner-equivalent — cache non vide', () => {
    const mount = resolveFullscreenImageSource({
      fullUrl: 'https://cdn.example/full.jpg',
      thumbnailUrl: 'https://cdn.example/thumb.jpg',
      isFullResident: true,
    });
    expect(mount).toEqual({
      fullUrl: 'https://cdn.example/full.jpg',
      backdropUrl: null,
      isResident: true,
    });
  });

  it('resident full image ignores the thumbnail entirely — never shown, even as backdrop', () => {
    const mount = resolveFullscreenImageSource({
      fullUrl: 'https://cdn.example/full.jpg',
      thumbnailUrl: 'https://cdn.example/thumb.jpg',
      isFullResident: true,
    });
    expect(mount?.backdropUrl).toBeNull();
  });

  it('non-resident full image: thumbnail becomes the blurred backdrop, never the displayed sharp image', () => {
    const mount = resolveFullscreenImageSource({
      fullUrl: 'https://cdn.example/full.jpg',
      thumbnailUrl: 'https://cdn.example/thumb.jpg',
      isFullResident: false,
    });
    expect(mount).toEqual({
      fullUrl: 'https://cdn.example/full.jpg',
      backdropUrl: 'https://cdn.example/thumb.jpg',
      isResident: false,
    });
  });

  it('the mounted fullUrl is always the full-resolution URL, never the thumbnail', () => {
    const mount = resolveFullscreenImageSource({
      fullUrl: 'https://cdn.example/full.jpg',
      thumbnailUrl: 'https://cdn.example/thumb.jpg',
      isFullResident: false,
    });
    expect(mount?.fullUrl).toBe('https://cdn.example/full.jpg');
    expect(mount?.fullUrl).not.toBe('https://cdn.example/thumb.jpg');
  });

  it('non-resident, no thumbnail available: backdrop is null, not a fabricated fallback', () => {
    const mount = resolveFullscreenImageSource({
      fullUrl: 'https://cdn.example/full.jpg',
      thumbnailUrl: null,
      isFullResident: false,
    });
    expect(mount?.backdropUrl).toBeNull();
  });

  it('thumbnailUrl is optional — omitting it behaves like null', () => {
    const mount = resolveFullscreenImageSource({
      fullUrl: 'https://cdn.example/full.jpg',
      isFullResident: false,
    });
    expect(mount?.backdropUrl).toBeNull();
  });
});
