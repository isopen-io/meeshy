import { describe, expect, test } from 'bun:test';

import { ADMIN_FICHES, ADMIN_SECTION_TABLE } from './admin-routes';
import { adminEntityOfRouteKey, adminTrailOf } from './admin-trail';

/**
 * LE FIL D'ARIANE SE DÉRIVE DE LA TABLE (#12670) — il était écrit à la main sur
 * vingt-neuf écrans, et dérivait déjà du menu (« Barème de points » contre
 * `admin.scale.title`). Ce que ces témoins gardent : le fil dit groupe › section ›
 * objet pour CHAQUE route de la table, dans les deux espaces, et rien pour le hub.
 */
describe('le fil d’une liste : groupe › section', () => {
  test('les comptes, dans l’un et l’autre espace', () => {
    const attendu = [
      { kind: 'group', group: 'people' },
      { kind: 'section', section: 'users', current: true },
    ];
    expect(adminTrailOf('admUsers')).toEqual(attendu);
    expect(adminTrailOf('adminUsers')).toEqual(attendu);
  });

  test('chaque liste de la table, sauf le hub, porte son groupe puis elle-même', () => {
    for (const row of ADMIN_SECTION_TABLE) {
      if (row.id === 'dashboard') continue;
      expect(adminTrailOf(row.list.adm)).toEqual([
        { kind: 'group', group: row.group },
        { kind: 'section', section: row.id, current: true },
      ]);
    }
  });
});

describe('le fil d’une fiche : groupe › section › objet', () => {
  test('la section devient un lien, l’objet est le lieu courant', () => {
    expect(adminTrailOf('admUser', 'Käthe Vogel')).toEqual([
      { kind: 'group', group: 'people' },
      { kind: 'section', section: 'users', current: false },
      { kind: 'entity', entity: 'user', label: 'Käthe Vogel' },
    ]);
  });

  test('sans nom encore lu (chargement), le fil s’arrête à la section, qui reste un lien', () => {
    expect(adminTrailOf('admConversation')).toEqual([
      { kind: 'group', group: 'exchanges' },
      { kind: 'section', section: 'conversations', current: false },
    ]);
  });

  test('chaque fiche de la table, dans les deux espaces', () => {
    for (const fiche of ADMIN_FICHES) {
      for (const key of [fiche.adm, fiche.admin]) {
        expect(adminTrailOf(key, 'x').at(-1)).toEqual({ kind: 'entity', entity: fiche.entity, label: 'x' });
        expect(adminEntityOfRouteKey(key)).toBe(fiche.entity);
      }
    }
  });
});

describe('ce qui n’a pas de fil', () => {
  test('le tableau de bord est la racine : aucun maillon', () => {
    expect(adminTrailOf('adm')).toEqual([]);
    expect(adminTrailOf('admin')).toEqual([]);
  });

  test('une route hors administration n’en invente aucun', () => {
    expect(adminTrailOf('list')).toEqual([]);
    expect(adminEntityOfRouteKey('admUsers')).toBeNull();
    expect(adminEntityOfRouteKey('list')).toBeNull();
  });
});
