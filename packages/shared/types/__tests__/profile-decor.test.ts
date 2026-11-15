import { describe, expect, it } from 'vitest';
import { formatProfileDecorRef, parseProfileDecorRef, parseServedProfileDecor, EMPTY_PROFILE_DECOR, PROFILE_DECOR_SIDES, PROFILE_DECOR_SIDE_DOMAIN } from '../profile-decor';

describe('ProfileDecorRef — stocké « pack/item »', () => {
  it('formate et relit', () => {
    expect(formatProfileDecorRef({ pack: 'contours-essentiels', item: 'laurier' })).toBe('contours-essentiels/laurier');
    expect(parseProfileDecorRef('contours-essentiels/laurier')).toEqual({ pack: 'contours-essentiels', item: 'laurier' });
  });

  it.each(['', 'laurier', 'a/b/c', '/laurier', 'pack/', 'Pack/Item', 'pack/it em', null, 3, undefined])('refuse %j', (input) => {
    expect(parseProfileDecorRef(input)).toBeNull();
  });
});

describe('ServedProfileDecor', () => {
  const served = {
    avatarRing: { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null },
    banner: { pack: 'p', item: 'i', origin: 'official', contract: 'a1b2c3d4e5f60718.json' },
    bannerFrame: { pack: 'cadres-heritages', item: 'haussmannien', origin: 'builtin', contract: null },
  };

  it('lit un décor servi, cadre de bannière compris (#10932)', () => {
    expect(parseServedProfileDecor(served)).toEqual(served);
    expect(parseServedProfileDecor(EMPTY_PROFILE_DECOR)).toEqual({ avatarRing: null, banner: null, bannerFrame: null });
  });

  it('un ancien serveur sans cadre de bannière se lit, le côté absent vaut null', () => {
    expect(parseServedProfileDecor({ avatarRing: served.avatarRing, banner: served.banner })).toEqual({ ...served, bannerFrame: null });
  });

  it('trois côtés, chacun dans SON domaine — le cadre est distinct du fond', () => {
    expect([...PROFILE_DECOR_SIDES]).toEqual(['avatarRing', 'banner', 'bannerFrame']);
    expect(PROFILE_DECOR_SIDE_DOMAIN).toEqual({ avatarRing: 'avatar-ring', banner: 'banner', bannerFrame: 'banner-frame' });
  });

  it('retombe sur le décor vide pour tout ce qui est illisible — un profil ne casse jamais', () => {
    [undefined, null, 'x', { avatarRing: { pack: 'p' } }, { avatarRing: { ...served.avatarRing, origin: 'martien' }, banner: null }].forEach((input) =>
      expect(parseServedProfileDecor(input)).toEqual(EMPTY_PROFILE_DECOR),
    );
  });

  it('un seul côté illisible n’emporte pas l’autre', () => {
    expect(parseServedProfileDecor({ avatarRing: { pack: 'p' }, banner: served.banner })).toEqual({ avatarRing: null, banner: served.banner, bannerFrame: null });
    expect(parseServedProfileDecor({ ...served, bannerFrame: { pack: 'p', origin: 'x' } })).toEqual({ ...served, bannerFrame: null });
  });
});
