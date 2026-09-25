import { describe, expect, test } from 'bun:test';

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

  test('le tableau de bord est actif sur la racine, et rien hors administration', () => {
    expect(activeAdminSectionId('adm')).toBe('dashboard');
    expect(activeAdminSectionId('admin')).toBe('dashboard');
    expect(activeAdminSectionId('list')).toBeNull();
    expect(activeAdminSectionId(null)).toBeNull();
  });
});
