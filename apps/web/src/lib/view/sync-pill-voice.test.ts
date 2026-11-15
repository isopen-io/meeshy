import { describe, expect, test } from 'bun:test';

import { pillAnnouncesOffline } from './sync-pill-voice';

/**
 * **DEUX NOTIFICATIONS POUR UN MÊME ÉVÉNEMENT** (revue #7083, défaut majeur 5)
 * — la pastille globale peignait « Hors ligne » PAR-DESSUS le titre « Hors
 * ligne » de la carte de l'écran, mesuré sur `/u/` comme sur `/me`. D-11
 * nomme exactement ce cas.
 */
describe('pillAnnouncesOffline — une seule voix pour l’état réseau', () => {
  test('les deux routes de PROFIL portent déjà leur propre carte : la pastille s’y tait', () => {
    expect(pillAnnouncesOffline('userProfile')).toBe(false);
    expect(pillAnnouncesOffline('profile')).toBe(false);
  });

  /**
   * **REVUE-CORRECTION #6149, défaut majeur 5** — mesuré aux captures
   * `10-offline-dark.png` / `21-offline-light.png` : le bandeau
   * `[data-my-stories-offline]` (« Hors ligne — la suppression sera possible
   * au retour du réseau. », rectangle plein-largeur `[0,64,390,23]`) était
   * recouvert par la pastille globale « Hors ligne » posée par-dessus,
   * centrée vers `y≈72-98` — même chevauchement, même verdict que `/u/` et
   * `/me` : la carte de l'écran dit un SUR-ENSEMBLE de ce que dirait la
   * pastille, elle se tait donc ici aussi (D-11).
   */
  test('« Mes stories » porte déjà sa propre carte hors ligne : la pastille s’y tait', () => {
    expect(pillAnnouncesOffline('storiesMine')).toBe(false);
  });

  test('partout ailleurs la pastille reste la voix de l’état réseau', () => {
    expect(pillAnnouncesOffline('list')).toBe(true);
    expect(pillAnnouncesOffline('thread')).toBe(true);
    expect(pillAnnouncesOffline('feed')).toBe(true);
  });

  test('la liste est FERMÉE : une route inconnue ne fait pas taire la pastille', () => {
    expect(pillAnnouncesOffline('ecran-qui-nexiste-pas-encore')).toBe(true);
  });
});
