/**
 * `resolveRiverModeFlag` — résolveur pur du drapeau `riviere_mode` (R-134).
 * MÊME patron/gamme de vecteurs que `resolve-reading-modes-flag.test.ts`
 * (WF-110) et `resolve-lentille-flag.test.ts` (WL-100), appliqué au troisième
 * drapeau indépendant.
 */
import {
  resolveRiverModeFlag,
  RIVER_MODE_FLAG_NAME,
  RIVER_MODE_COOKIE_NAME,
  RIVER_MODE_SEARCH_PARAM,
} from '../resolve-river-mode-flag';

describe('resolveRiverModeFlag', () => {
  describe('les cinq branches', () => {
    it('?riviere_mode=1 → actif, pose le cookie', () => {
      expect(
        resolveRiverModeFlag({ searchParam: '1', cookie: undefined, env: undefined })
      ).toEqual({ active: true, cookieEffect: 'set' });
    });

    it('?riviere_mode=0 → inactif, efface le cookie', () => {
      expect(
        resolveRiverModeFlag({ searchParam: '0', cookie: undefined, env: undefined })
      ).toEqual({ active: false, cookieEffect: 'clear' });
    });

    it('cookie=1 (sans searchParam) → actif, aucun effet', () => {
      expect(
        resolveRiverModeFlag({ searchParam: null, cookie: '1', env: undefined })
      ).toEqual({ active: true, cookieEffect: 'none' });
    });

    it('env=true (sans searchParam ni cookie) → actif, aucun effet', () => {
      expect(
        resolveRiverModeFlag({ searchParam: null, cookie: undefined, env: 'true' })
      ).toEqual({ active: true, cookieEffect: 'none' });
    });

    it('rien de tout ça → inactif par défaut (OFF), aucun effet', () => {
      expect(
        resolveRiverModeFlag({ searchParam: null, cookie: undefined, env: undefined })
      ).toEqual({ active: false, cookieEffect: 'none' });
    });
  });

  describe('précédence searchParam > cookie > env', () => {
    it('searchParam=0 gagne sur un cookie=1 ET un env=true déjà présents', () => {
      expect(
        resolveRiverModeFlag({ searchParam: '0', cookie: '1', env: 'true' })
      ).toEqual({ active: false, cookieEffect: 'clear' });
    });

    it('cookie=1 gagne sur env=true en l\'absence de searchParam', () => {
      expect(
        resolveRiverModeFlag({ searchParam: null, cookie: '1', env: 'true' })
      ).toEqual({ active: true, cookieEffect: 'none' });
    });
  });

  describe('pureté', () => {
    it('est déterministe : même entrée, même sortie, appelée deux fois', () => {
      const input = { searchParam: '1' as const, cookie: undefined, env: undefined };
      expect(resolveRiverModeFlag(input)).toEqual(resolveRiverModeFlag(input));
    });
  });
});

describe('constantes exportées — indépendantes de lentille_list ET reading_modes', () => {
  it('RIVER_MODE_FLAG_NAME vaut exactement "riviere_mode"', () => {
    expect(RIVER_MODE_FLAG_NAME).toBe('riviere_mode');
  });

  it('RIVER_MODE_COOKIE_NAME vaut exactement "meeshy_riviere_mode"', () => {
    expect(RIVER_MODE_COOKIE_NAME).toBe('meeshy_riviere_mode');
  });

  it('RIVER_MODE_SEARCH_PARAM vaut exactement "riviere_mode"', () => {
    expect(RIVER_MODE_SEARCH_PARAM).toBe('riviere_mode');
  });

  it('le nom du drapeau diffère des deux autres drapeaux (trois drapeaux indépendants)', () => {
    expect(RIVER_MODE_FLAG_NAME).not.toBe('lentille_list');
    expect(RIVER_MODE_FLAG_NAME).not.toBe('reading_modes');
  });
});
