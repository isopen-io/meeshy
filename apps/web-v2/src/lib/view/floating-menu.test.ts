import { describe, expect, test } from 'bun:test';

import { ROUTES } from '@/routes/route-table';
import {
  FEED_DESTINATION,
  MENU_LADDER,
  PROFILE_DESTINATION,
  allFloatingDestinations,
} from './floating-menu';

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
   * Les huit, pas seulement les six — le Flux et le profil sont des
   * destinations à part entière, et ce sont précisément celles qu'une
   * énumération centrée sur l'échelle oublie.
   */
  test('les huit destinations sont comptées', () => {
    expect(allFloatingDestinations()).toHaveLength(8);
    expect(allFloatingDestinations()).toContain(FEED_DESTINATION);
    expect(allFloatingDestinations()).toContain(PROFILE_DESTINATION);
  });
});

describe('chaque destination se dit', () => {
  /**
   * Un libellé vide rendrait un barreau muet pour VoiceOver comme pour l'œil :
   * le disque coloré ne dit rien de ce qu'il ouvre. Et la promesse est ce qui
   * distingue un écran d'attente d'une panne (#6214).
   */
  test('porte un libellé et une promesse non vides', () => {
    for (const destination of allFloatingDestinations()) {
      expect(destination.label.trim().length).toBeGreaterThan(0);
      expect(destination.promise.trim().length).toBeGreaterThan(0);
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
