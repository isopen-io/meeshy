import { describe, expect, test } from 'bun:test';

import { adminUserTabOf, adminUserTabsFor, withAdminUserTab } from './user-tabs';

describe('l’onglet de la fiche d’un membre vit dans l’adresse', () => {
  test('sans onglet, ou avec un onglet inconnu, la fiche ouvre le profil', () => {
    expect(adminUserTabOf(new URLSearchParams(''))).toBe('profile');
    expect(adminUserTabOf(new URLSearchParams('tab=passwords'))).toBe('profile');
  });

  test('un onglet connu se relit', () => {
    expect(adminUserTabOf(new URLSearchParams('tab=voice'))).toBe('voice');
    expect(adminUserTabOf(new URLSearchParams('tab=preferences'))).toBe('preferences');
  });

  test('choisir un onglet garde le reste de l’adresse, et le profil n’écrit rien', () => {
    expect(withAdminUserTab(new URLSearchParams('x=1'), 'security').toString()).toBe('x=1&tab=security');
    expect(withAdminUserTab(new URLSearchParams('tab=security'), 'profile').toString()).toBe('');
  });
});

/**
 * #8003 — les préférences d'un membre ne se lisent que sous `canViewSensitiveData`
 * (BIGBOSS, ADMIN). Un onglet qui mènerait à un 403 est un contrôle sans effet :
 * il n'est pas offert, et une adresse qui le demande retombe sur le profil.
 */
describe('l’onglet Préférences n’est offert qu’au rang qui peut le lire', () => {
  test('au rang d’administration, les neuf onglets sont offerts', () => {
    expect(adminUserTabsFor({ sensitive: true })).toContain('preferences');
    expect(adminUserTabsFor({ sensitive: true })).toHaveLength(9);
  });

  test('sans les données sensibles, Préférences disparaît et l’ordre des autres ne bouge pas', () => {
    expect(adminUserTabsFor({ sensitive: false })).toEqual(
      ['profile', 'conversations', 'media', 'contacts', 'communities', 'voice', 'security', 'reports'],
    );
  });

  test('une adresse ?tab=preferences ouvre le profil à qui ne peut pas la lire', () => {
    const adresse = new URLSearchParams('tab=preferences');
    expect(adminUserTabOf(adresse, adminUserTabsFor({ sensitive: false }))).toBe('profile');
    expect(adminUserTabOf(adresse, adminUserTabsFor({ sensitive: true }))).toBe('preferences');
  });
});
