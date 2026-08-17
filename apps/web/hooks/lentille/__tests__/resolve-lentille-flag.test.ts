/**
 * `resolveLentilleFlag` — résolveur pur du drapeau `lentille_list` (WL-100).
 *
 * Cinq branches, précédence stricte searchParam > cookie > env > OFF,
 * et le tri set/clear/none de l'effet cookie DÉCRIT (jamais appliqué ici —
 * ce fichier n'importe ni `document` ni React).
 */
import {
  resolveLentilleFlag,
  parseCookieValue,
  LENTILLE_FLAG_NAME,
  LENTILLE_COOKIE_NAME,
  LENTILLE_SEARCH_PARAM,
} from '../resolve-lentille-flag';

describe('resolveLentilleFlag', () => {
  describe('les cinq branches', () => {
    it('?lentille=1 → actif, pose le cookie', () => {
      expect(
        resolveLentilleFlag({ searchParam: '1', cookie: undefined, env: undefined })
      ).toEqual({ active: true, cookieEffect: 'set' });
    });

    it('?lentille=0 → inactif, efface le cookie', () => {
      expect(
        resolveLentilleFlag({ searchParam: '0', cookie: undefined, env: undefined })
      ).toEqual({ active: false, cookieEffect: 'clear' });
    });

    it('cookie=1 (sans searchParam) → actif, aucun effet', () => {
      expect(
        resolveLentilleFlag({ searchParam: null, cookie: '1', env: undefined })
      ).toEqual({ active: true, cookieEffect: 'none' });
    });

    it('env=true (sans searchParam ni cookie) → actif, aucun effet', () => {
      expect(
        resolveLentilleFlag({ searchParam: null, cookie: undefined, env: 'true' })
      ).toEqual({ active: true, cookieEffect: 'none' });
    });

    it('rien de tout ça → inactif par défaut (OFF), aucun effet', () => {
      expect(
        resolveLentilleFlag({ searchParam: null, cookie: undefined, env: undefined })
      ).toEqual({ active: false, cookieEffect: 'none' });
    });
  });

  describe('précédence searchParam > cookie > env', () => {
    it('searchParam=0 gagne sur un cookie=1 ET un env=true déjà présents', () => {
      expect(
        resolveLentilleFlag({ searchParam: '0', cookie: '1', env: 'true' })
      ).toEqual({ active: false, cookieEffect: 'clear' });
    });

    it('searchParam=1 gagne même si env=false', () => {
      expect(
        resolveLentilleFlag({ searchParam: '1', cookie: undefined, env: 'false' })
      ).toEqual({ active: true, cookieEffect: 'set' });
    });

    it('cookie=1 gagne sur env=true en l\'absence de searchParam', () => {
      expect(
        resolveLentilleFlag({ searchParam: null, cookie: '1', env: 'true' })
      ).toEqual({ active: true, cookieEffect: 'none' });
    });

    it('cookie absent ⇒ l\'env décide, même avec un searchParam ignoré (non 0/1)', () => {
      expect(
        resolveLentilleFlag({ searchParam: 'oui', cookie: undefined, env: 'true' })
      ).toEqual({ active: true, cookieEffect: 'none' });
    });
  });

  describe('effacement', () => {
    it('?lentille=0 efface même si le cookie ne portait pas 1 (idempotent)', () => {
      expect(
        resolveLentilleFlag({ searchParam: '0', cookie: undefined, env: undefined })
      ).toEqual({ active: false, cookieEffect: 'clear' });
    });

    it('un cookie à toute autre valeur que \'1\' ne persiste rien (traité comme absent)', () => {
      expect(
        resolveLentilleFlag({ searchParam: null, cookie: '0', env: undefined })
      ).toEqual({ active: false, cookieEffect: 'none' });
    });
  });

  describe('pureté', () => {
    it('est déterministe : même entrée, même sortie, appelée deux fois', () => {
      const input = { searchParam: '1' as const, cookie: undefined, env: undefined };
      expect(resolveLentilleFlag(input)).toEqual(resolveLentilleFlag(input));
    });
  });
});

describe('parseCookieValue', () => {
  it('lit la valeur quand le cookie est seul dans la chaîne', () => {
    expect(parseCookieValue('meeshy_lentille=1', 'meeshy_lentille')).toBe('1');
  });

  it('lit la valeur quand le cookie est entouré d\'autres cookies', () => {
    expect(
      parseCookieValue('a=b; meeshy_lentille=1; c=d', 'meeshy_lentille')
    ).toBe('1');
  });

  it('renvoie undefined quand le cookie est absent', () => {
    expect(parseCookieValue('a=b; c=d', 'meeshy_lentille')).toBeUndefined();
  });

  it('renvoie undefined pour une chaîne vide', () => {
    expect(parseCookieValue('', 'meeshy_lentille')).toBeUndefined();
  });
});

describe('constantes exportées', () => {
  it('LENTILLE_FLAG_NAME vaut exactement "lentille_list"', () => {
    expect(LENTILLE_FLAG_NAME).toBe('lentille_list');
  });

  it('LENTILLE_COOKIE_NAME vaut exactement "meeshy_lentille"', () => {
    expect(LENTILLE_COOKIE_NAME).toBe('meeshy_lentille');
  });

  it('LENTILLE_SEARCH_PARAM vaut exactement "lentille"', () => {
    expect(LENTILLE_SEARCH_PARAM).toBe('lentille');
  });
});
