import { describe, expect, test } from 'bun:test';

import { MY_PROFILE_TABS, USER_PROFILE_TABS, resolveProfileTab, steppedTab, userProfileTabs } from './tabs';

describe('resolveProfileTab — l’onglet que l’adresse demande, s’il est offert', () => {
  test('rend l’onglet demandé quand la fiche l’offre', () => {
    expect(resolveProfileTab({ requested: 'posts', offered: USER_PROFILE_TABS, fallback: 'details' })).toBe('posts');
  });

  test('retombe sur le défaut quand l’adresse ne demande rien', () => {
    expect(resolveProfileTab({ requested: null, offered: USER_PROFILE_TABS, fallback: 'details' })).toBe('details');
  });

  test('retombe sur le défaut quand l’onglet demandé n’existe pas', () => {
    expect(resolveProfileTab({ requested: 'admin', offered: USER_PROFILE_TABS, fallback: 'details' })).toBe('details');
  });

  test('retombe sur le défaut quand l’onglet existe ailleurs mais pas sur cette fiche', () => {
    const offered = userProfileTabs({ conversations: false });
    expect(resolveProfileTab({ requested: 'conversations', offered, fallback: 'details' })).toBe('details');
  });
});

describe('userProfileTabs — l’ordre et la présence des onglets d’autrui (UserProfileSheet)', () => {
  test('Publications, Conversations, Détails — l’ordre d’iOS', () => {
    expect(userProfileTabs({ conversations: true })).toEqual(['posts', 'conversations', 'details']);
  });

  test('sans conversations en commun possibles (soi, sans session), l’onglet disparaît', () => {
    expect(userProfileTabs({ conversations: false })).toEqual(['posts', 'details']);
  });
});

describe('MY_PROFILE_TABS — son propre profil', () => {
  test('Détails, Publications, Activité', () => {
    expect(MY_PROFILE_TABS).toEqual(['details', 'posts', 'activity']);
  });
});

describe('steppedTab — les flèches parcourent la liste en boucle, dans le sens de lecture', () => {
  const tabs = ['posts', 'conversations', 'details'] as const;

  test('la flèche de fin avance, et boucle sur le premier', () => {
    expect(steppedTab({ tabs, current: 'posts', key: 'ArrowRight', rtl: false })).toBe('conversations');
    expect(steppedTab({ tabs, current: 'details', key: 'ArrowRight', rtl: false })).toBe('posts');
  });

  test('la flèche de début recule, et boucle sur le dernier', () => {
    expect(steppedTab({ tabs, current: 'posts', key: 'ArrowLeft', rtl: false })).toBe('details');
  });

  test('en écriture de droite à gauche, la flèche gauche AVANCE', () => {
    expect(steppedTab({ tabs, current: 'posts', key: 'ArrowLeft', rtl: true })).toBe('conversations');
    expect(steppedTab({ tabs, current: 'posts', key: 'ArrowRight', rtl: true })).toBe('details');
  });

  test('Début et Fin vont aux extrémités', () => {
    expect(steppedTab({ tabs, current: 'conversations', key: 'Home', rtl: false })).toBe('posts');
    expect(steppedTab({ tabs, current: 'conversations', key: 'End', rtl: false })).toBe('details');
  });

  test('une autre touche ne fait rien', () => {
    expect(steppedTab({ tabs, current: 'posts', key: 'Enter', rtl: false })).toBeNull();
  });
});
