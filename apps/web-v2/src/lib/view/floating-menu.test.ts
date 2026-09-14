import { describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { ROUTES } from '@/routes/route-table';
import {
  ADMIN_DESTINATION,
  CONVERSATIONS_DESTINATION,
  FEED_DESTINATION,
  MENU_LADDER,
  PROFILE_DESTINATION,
  allFloatingDestinations,
  feedDiscDestination,
  menuLadderFor,
} from './floating-menu';
import { showsFloatingMenus } from './floating-gate';

/**
 * LA TABLE DES DESTINATIONS FLOTTANTES (#6214, #6104) — miroir de
 * `RootMenuLadderEntry.swift`, dont `RootMenuLadderEntryTests.swift:15-19`
 * verrouille l'ordre exactement de cette façon.
 *
 * Ce fichier garde DEUX choses qu'aucune capture ne montre : l'ORDRE des six
 * barreaux — qui est un fait de produit, pas un détail d'implémentation, et
 * qu'un tri accidentel casserait en silence — et le fait que chaque
 * destination MÈNE QUELQUE PART.
 */

describe('les six barreaux de l’échelle', () => {
  /**
   * L'ordre vient d'iOS et ne se renégocie pas au fil des lots. Un témoin
   * écrit sur l'ENSEMBLE (« les six sont là ») resterait vert si deux
   * barreaux permutaient — or permuter Notifications et Appels déplace la
   * cible la plus fréquente sous le doigt de la moins fréquente.
   */
  test('sont exactement ceux d’iOS, dans l’ordre d’iOS', () => {
    expect(MENU_LADDER.map((e) => e.key)).toEqual([
      'links',
      'notifications',
      'calls',
      'discover',
      'communities',
      'settings',
    ]);
  });

  /**
   * LE PROFIL N'EST PAS UN BARREAU. iOS l'ouvre au second tap sur l'avatar
   * (`RootView.swift:1570-1579`) et le documente en toutes lettres dans
   * `RootMenuLadderEntry.swift:13-15`. Lui inventer une septième entrée
   * serait ajouter au produit une porte qu'il n'a pas.
   */
  test('n’incluent pas le profil, qui s’ouvre depuis l’avatar', () => {
    expect(MENU_LADDER.map((e) => e.key)).not.toContain('profile');
  });

  /**
   * Le Flux non plus : il est le bouton de GAUCHE en entier, pas une entrée
   * de l'échelle de droite.
   */
  test('n’incluent pas le Flux, qui est l’autre bouton', () => {
    expect(MENU_LADDER.map((e) => e.key)).not.toContain('feed');
  });
});

/**
 * **LE BARREAU D'ADMINISTRATION** (#6458) — une extension WEB assumée : iOS n'a
 * pas d'espace d'administration. Deux faits se gardent ici, et un témoin écrit
 * sur un seul d'entre eux resterait vert sur la mauvaise implémentation.
 */
describe('le barreau « Administration »', () => {
  /**
   * Sans le droit, l'échelle est celle d'iOS À L'IDENTIQUE — pas « six
   * barreaux », mais les six d'iOS dans l'ordre d'iOS. Une échelle qui
   * insérerait le barreau puis le masquerait en CSS le laisserait dans le
   * parcours de tabulation.
   */
  test('n’existe pas sans le droit : l’échelle est celle d’iOS', () => {
    expect(menuLadderFor({ canAccessAdmin: false }).map((e) => e.key)).toEqual(MENU_LADDER.map((e) => e.key));
  });

  /**
   * AVEC le droit, il vient EN DERNIER : les six barreaux d'iOS gardent leur
   * rang, donc leur place sous le doigt — un administrateur qui passe de l'app
   * native au web retrouve « Réglages » là où il l'a laissé.
   */
  test('vient en dernier avec le droit, les six d’iOS gardant leur rang', () => {
    expect(menuLadderFor({ canAccessAdmin: true }).map((e) => e.key)).toEqual([...MENU_LADDER.map((e) => e.key), 'admin']);
  });

  /**
   * Même mot que la rangée des Réglages et que le titre de l'écran (`admin.title`),
   * même glyphe que la rangée (`key`) : la dimension 6 — « même mot, même
   * icône » — se tient par la CLÉ, pas par une chaîne recopiée.
   */
  test('mène à /admin, se nomme comme l’écran et porte le glyphe de la rangée des Réglages', () => {
    expect(ADMIN_DESTINATION.route).toBe('admin');
    expect(ADMIN_DESTINATION.labelKey).toBe('admin.title');
    expect(ADMIN_DESTINATION.glyph).toEqual({ set: 'socle', name: 'key' });
  });

  /** Sa teinte est un JETON de la palette dérivée d'iOS, jamais un hexadécimal inventé. */
  test('porte une teinte de jeton, distincte des six', () => {
    expect(ADMIN_DESTINATION.tint).toMatch(/^var\(--ios-[a-z0-9-]+\)$/);
    expect(MENU_LADDER.map((e) => e.tint)).not.toContain(ADMIN_DESTINATION.tint);
  });
});

/**
 * **LE DISQUE DU FLUX BASCULE** (#6456) — `onLeftTap: showFeed.toggle()`
 * (`RootView.swift:1557-1565`). Le même disque montre le Flux ou ramène aux
 * conversations ; son nom et son glyphe disent où le tap MÈNE, jamais où l'on
 * est — un disque « Flux » posé sur le Flux annoncerait un geste sans effet.
 */
describe('la destination du disque de gauche', () => {
  test('sur le Flux, il ramène aux conversations', () => {
    expect(feedDiscDestination('feed')).toBe(CONVERSATIONS_DESTINATION);
    expect(CONVERSATIONS_DESTINATION.route).toBe('list');
  });

  /**
   * Toutes les AUTRES routes qui portent les disques, pas seulement la liste :
   * un témoin écrit sur `list` seul resterait vert sur une loi « liste ⇒ Flux,
   * sinon conversations », qui ferait du disque un retour sur les Réglages.
   */
  test('partout ailleurs où les disques paraissent, il ouvre le Flux', () => {
    const autres = ['list', 'links', 'notifications', 'calls', 'discover', 'communities', 'settings', 'profile'];
    for (const route of autres) {
      expect({ route, porte: showsFloatingMenus(route) }).toEqual({ route, porte: true });
      expect({ route, destination: feedDiscDestination(route).key }).toEqual({ route, destination: 'feed' });
    }
  });

  /** « Même mot, même icône » (dimension 6) : le glyphe du retour est la marque, celle qu'iOS peint Flux ouvert. */
  test('les deux faces portent deux noms et deux glyphes distincts', () => {
    expect(CONVERSATIONS_DESTINATION.labelKey).not.toBe(FEED_DESTINATION.labelKey);
    expect(CONVERSATIONS_DESTINATION.glyph).toEqual({ set: 'marque' });
    expect(FEED_DESTINATION.glyph).toEqual({ set: 'flottant', name: 'stack' });
  });
});

describe('aucune destination flottante ne ment', () => {
  /**
   * **LE TÉMOIN QUI JUSTIFIE #6214.** La loi 4 de la planche — « un contrôle
   * existe s'il a un effet » — ne se prouve pas en regardant le bouton : elle
   * se prouve en vérifiant que son adresse est DÉCLARÉE. Ce dépôt a déjà payé
   * l'inverse sur le rail des stories, dont chaque tuile pointait vers un fil
   * « faute de route ».
   *
   * Il rougit sur la faute la plus probable du lot : ajouter un barreau sans
   * ajouter sa route.
   */
  test('chaque destination nomme une route déclarée', () => {
    for (const destination of allFloatingDestinations()) {
      expect(Object.keys(ROUTES)).toContain(destination.route);
    }
  });

  /**
   * Les neuf, pas seulement les six — le Flux et le profil sont des
   * destinations à part entière, et ce sont précisément celles qu'une
   * énumération centrée sur l'échelle oublie. L'administration aussi (#6458) :
   * absente de `MENU_LADDER`, elle échapperait sinon aux deux témoins qui
   * suivent — la route déclarée et le libellé unique dans sept langues.
   */
  test('les dix destinations sont comptées', () => {
    expect(allFloatingDestinations()).toHaveLength(10);
    expect(allFloatingDestinations()).toContain(FEED_DESTINATION);
    expect(allFloatingDestinations()).toContain(CONVERSATIONS_DESTINATION);
    expect(allFloatingDestinations()).toContain(PROFILE_DESTINATION);
    expect(allFloatingDestinations()).toContain(ADMIN_DESTINATION);
  });
});

describe('chaque destination se dit', () => {
  /**
   * Un libellé vide rendrait un barreau muet pour VoiceOver comme pour l'œil :
   * le disque coloré ne dit rien de ce qu'il ouvre.
   */
  test('porte un libellé dans chacune des sept langues', async () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      await loadInterfaceCatalog(language);
      for (const destination of allFloatingDestinations()) {
        expect(translate(language, destination.labelKey).trim().length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * Deux destinations qui se NOMMENT pareil seraient indiscernables au lecteur
   * d'écran — dans chaque langue, pas seulement en français.
   */
  test('porte un libellé qui n’appartient qu’à elle, dans chaque langue', async () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      await loadInterfaceCatalog(language);
      const labels = allFloatingDestinations().map((d) => translate(language, d.labelKey));
      expect({ language, distinct: new Set(labels).size }).toEqual({ language, distinct: labels.length });
    }
  });

  /**
   * Deux barreaux de la même teinte seraient indiscernables au coin de l'œil,
   * qui est exactement la façon dont on lit une échelle qu'on connaît déjà.
   */
  test('porte une teinte qui n’appartient qu’à elle', () => {
    const teintes = MENU_LADDER.map((e) => e.tint);
    expect(new Set(teintes).size).toBe(teintes.length);
  });
});
