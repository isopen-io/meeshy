import { describe, expect, it } from 'vitest';
import { formatProfileDecorRef, parseProfileDecorRef, parseServedProfileDecor, EMPTY_PROFILE_DECOR } from '../profile-decor';

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
  };

  it('lit un décor servi', () => {
    expect(parseServedProfileDecor(served)).toEqual(served);
    expect(parseServedProfileDecor(EMPTY_PROFILE_DECOR)).toEqual({ avatarRing: null, banner: null });
  });

  it('retombe sur le décor vide pour tout ce qui est illisible — un profil ne casse jamais', () => {
    [undefined, null, 'x', { avatarRing: { pack: 'p' } }, { avatarRing: { ...served.avatarRing, origin: 'martien' }, banner: null }].forEach((input) =>
      expect(parseServedProfileDecor(input)).toEqual(EMPTY_PROFILE_DECOR),
    );
  });

  it('un seul côté illisible n’emporte pas l’autre', () => {
    expect(parseServedProfileDecor({ avatarRing: { pack: 'p' }, banner: served.banner })).toEqual({ avatarRing: null, banner: served.banner });
  });
});
