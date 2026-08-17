/**
 * `resolveReadingModesFlag` — résolveur pur du drapeau `reading_modes`
 * (WF-110). MÊME patron/gamme de vecteurs que `resolve-lentille-flag.test.ts`
 * (WL-100), appliqué au second drapeau indépendant du fil.
 */
import {
  resolveReadingModesFlag,
  READING_MODES_FLAG_NAME,
  READING_MODES_COOKIE_NAME,
  READING_MODES_SEARCH_PARAM,
} from '../resolve-reading-modes-flag';

describe('resolveReadingModesFlag', () => {
  describe('les cinq branches', () => {
    it('?reading_modes=1 → actif, pose le cookie', () => {
      expect(
        resolveReadingModesFlag({ searchParam: '1', cookie: undefined, env: undefined })
      ).toEqual({ active: true, cookieEffect: 'set' });
    });

    it('?reading_modes=0 → inactif, efface le cookie', () => {
      expect(
        resolveReadingModesFlag({ searchParam: '0', cookie: undefined, env: undefined })
      ).toEqual({ active: false, cookieEffect: 'clear' });
    });

    it('cookie=1 (sans searchParam) → actif, aucun effet', () => {
      expect(
        resolveReadingModesFlag({ searchParam: null, cookie: '1', env: undefined })
      ).toEqual({ active: true, cookieEffect: 'none' });
    });

    it('env=true (sans searchParam ni cookie) → actif, aucun effet', () => {
      expect(
        resolveReadingModesFlag({ searchParam: null, cookie: undefined, env: 'true' })
      ).toEqual({ active: true, cookieEffect: 'none' });
    });

    it('rien de tout ça → inactif par défaut (OFF), aucun effet', () => {
      expect(
        resolveReadingModesFlag({ searchParam: null, cookie: undefined, env: undefined })
      ).toEqual({ active: false, cookieEffect: 'none' });
    });
  });

  describe('précédence searchParam > cookie > env', () => {
    it('searchParam=0 gagne sur un cookie=1 ET un env=true déjà présents', () => {
      expect(
        resolveReadingModesFlag({ searchParam: '0', cookie: '1', env: 'true' })
      ).toEqual({ active: false, cookieEffect: 'clear' });
    });

    it('cookie=1 gagne sur env=true en l\'absence de searchParam', () => {
      expect(
        resolveReadingModesFlag({ searchParam: null, cookie: '1', env: 'true' })
      ).toEqual({ active: true, cookieEffect: 'none' });
    });
  });

  describe('pureté', () => {
    it('est déterministe : même entrée, même sortie, appelée deux fois', () => {
      const input = { searchParam: '1' as const, cookie: undefined, env: undefined };
      expect(resolveReadingModesFlag(input)).toEqual(resolveReadingModesFlag(input));
    });
  });
});

describe('constantes exportées — indépendantes de lentille_list', () => {
  it('READING_MODES_FLAG_NAME vaut exactement "reading_modes"', () => {
    expect(READING_MODES_FLAG_NAME).toBe('reading_modes');
  });

  it('READING_MODES_COOKIE_NAME vaut exactement "meeshy_reading_modes"', () => {
    expect(READING_MODES_COOKIE_NAME).toBe('meeshy_reading_modes');
  });

  it('READING_MODES_SEARCH_PARAM vaut exactement "reading_modes"', () => {
    expect(READING_MODES_SEARCH_PARAM).toBe('reading_modes');
  });

  it('le nom du drapeau diffère du drapeau Lentille liste (deux drapeaux indépendants)', () => {
    expect(READING_MODES_FLAG_NAME).not.toBe('lentille_list');
  });
});
