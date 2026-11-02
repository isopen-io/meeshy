import { describe, expect, test } from 'bun:test';

import { ADMIN_FICHES, ADMIN_SECTION_TABLE } from './admin-routes';
import { adminEntityOfSection, adminTrailOf } from './admin-trail';

/**
 * LE FIL D'ARIANE SE DÉRIVE DE LA TABLE (#12670) — il était écrit à la main sur
 * vingt-neuf écrans, et dérivait déjà du menu (« Barème de points » contre
 * `admin.scale.title`). Ce que ces témoins gardent : le fil dit groupe › section ›
 * objet pour CHAQUE section de la table, et rien pour le tableau de bord.
 */
describe('le fil d’une liste : groupe › section', () => {
  test('les comptes', () => {
    expect(adminTrailOf({ section: 'users' })).toEqual([
      { kind: 'group', group: 'people' },
      { kind: 'section', section: 'users', current: true },
    ]);
  });

  test('chaque section de la table, sauf le tableau de bord, porte son groupe puis elle-même', () => {
    for (const row of ADMIN_SECTION_TABLE) {
      if (row.id === 'dashboard') continue;
      expect(adminTrailOf({ section: row.id })).toEqual([
        { kind: 'group', group: row.group },
        { kind: 'section', section: row.id, current: true },
      ]);
    }
  });
});

describe('le fil d’une fiche : groupe › section › objet', () => {
  test('la section devient un lien, l’objet est le lieu courant', () => {
    expect(adminTrailOf({ section: 'users', fiche: true }, 'Käthe Vogel')).toEqual([
      { kind: 'group', group: 'people' },
      { kind: 'section', section: 'users', current: false },
      { kind: 'entity', entity: 'user', label: 'Käthe Vogel' },
    ]);
  });

  test('sans nom encore lu, le fil s’arrête à la section, qui reste un lien', () => {
    expect(adminTrailOf({ section: 'conversations', fiche: true })).toEqual([
      { kind: 'group', group: 'exchanges' },
      { kind: 'section', section: 'conversations', current: false },
    ]);
  });

  test('chaque fiche de la table nomme son genre d’objet', () => {
    for (const fiche of ADMIN_FICHES) {
      expect(adminEntityOfSection(fiche.section)).toBe(fiche.entity);
      expect(adminTrailOf({ section: fiche.section, fiche: true }, 'x').at(-1)).toEqual({ kind: 'entity', entity: fiche.entity, label: 'x' });
    }
  });

  test('une section sans fiche reste une liste, même si l’écran se dit fiche', () => {
    expect(adminEntityOfSection('audit')).toBeNull();
    expect(adminTrailOf({ section: 'audit', fiche: true }, 'x')).toEqual([
      { kind: 'group', group: 'moderation' },
      { kind: 'section', section: 'audit', current: true },
    ]);
  });
});

describe('le tableau de bord est la racine', () => {
  test('aucun maillon', () => {
    expect(adminTrailOf({ section: 'dashboard' })).toEqual([]);
  });
});
