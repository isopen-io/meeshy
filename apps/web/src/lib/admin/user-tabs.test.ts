import { describe, expect, test } from 'bun:test';

import { adminUserTabOf, withAdminUserTab } from './user-tabs';

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
