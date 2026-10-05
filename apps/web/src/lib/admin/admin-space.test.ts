import { describe, expect, test } from 'bun:test';

import { ADMIN_FICHES, ADMIN_SECTION_TABLE } from './admin-routes';
import { activeAdminSectionId, adminSpaceOf, routeInSpace } from './admin-space';

describe('le menu d’administration reste dans l’espace d’où l’on vient', () => {
  test('une adresse /adm ouvre les sections de /adm, une adresse /admin celles de /admin', () => {
    expect(adminSpaceOf('admUsers')).toBe('adm');
    expect(adminSpaceOf('adm')).toBe('adm');
    expect(adminSpaceOf('adminUsers')).toBe('admin');
    expect(adminSpaceOf('admin')).toBe('admin');
  });

  test('hors d’une route connue, l’espace par défaut est /admin', () => {
    expect(adminSpaceOf(null)).toBe('admin');
    expect(adminSpaceOf('list')).toBe('admin');
  });

  test('la route d’une section se traduit dans l’espace courant', () => {
    expect(routeInSpace('admin', 'adm')).toBe('adm');
    expect(routeInSpace('adminUsers', 'adm')).toBe('admUsers');
    expect(routeInSpace('adminAnonymous', 'adm')).toBe('admAnonymous');
    expect(routeInSpace('adminUsers', 'admin')).toBe('adminUsers');
  });

  test('chaque section neuve se traduit, elle aussi — la table est la seule source', () => {
    for (const row of ADMIN_SECTION_TABLE) {
      expect(routeInSpace(row.list.admin, 'adm')).toBe(row.list.adm);
      expect(routeInSpace(row.list.admin, 'admin')).toBe(row.list.admin);
    }
  });

  test('un espace se lit sur la clé de CHAQUE route d’administration, liste ou fiche', () => {
    for (const row of ADMIN_SECTION_TABLE) {
      expect(adminSpaceOf(row.list.admin)).toBe('admin');
      expect(adminSpaceOf(row.list.adm)).toBe('adm');
    }
    for (const fiche of ADMIN_FICHES) {
      expect(adminSpaceOf(fiche.admin)).toBe('admin');
      expect(adminSpaceOf(fiche.adm)).toBe('adm');
    }
  });
});

describe('la section active se lit depuis la route, fiche comprise', () => {
  test('la fiche d’un membre surligne la section des comptes', () => {
    expect(activeAdminSectionId('admUser')).toBe('users');
    expect(activeAdminSectionId('adminUsers')).toBe('users');
  });

  test('la lecture d’une conversation surligne les conversations', () => {
    expect(activeAdminSectionId('adminConversation')).toBe('conversations');
  });

  test('la fiche d’un anonyme surligne les anonymes', () => {
    expect(activeAdminSectionId('admAnonymousOne')).toBe('anonymous');
  });

  test('une fiche garde la section de sa liste — pour chaque genre d’entité, dans les deux espaces', () => {
    for (const fiche of ADMIN_FICHES) {
      expect(activeAdminSectionId(fiche.admin)).toBe(fiche.section);
      expect(activeAdminSectionId(fiche.adm)).toBe(fiche.section);
    }
  });

  test('le tableau de bord est actif sur la racine, et rien hors administration', () => {
    expect(activeAdminSectionId('adm')).toBe('dashboard');
    expect(activeAdminSectionId('admin')).toBe('dashboard');
    expect(activeAdminSectionId('list')).toBeNull();
    expect(activeAdminSectionId(null)).toBeNull();
    expect(activeAdminSectionId('adminNope')).toBeNull();
  });
});
