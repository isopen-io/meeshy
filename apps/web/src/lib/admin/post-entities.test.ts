import { beforeAll, describe, expect, test } from 'bun:test';

import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import { communityRef, conversationRef, personRef, postRef } from './post-entities';

beforeAll(async () => {
  await loadAdminInterfaceCatalog('fr');
});

/**
 * LES RÉFÉRENCES D'ENTITÉ DU LOT « CONTENUS » (#8876) — ce que les chips nomment.
 * Un identifiant n'est JAMAIS un libellé : la référence le porte pour le LIEN, le
 * libellé vient de la bibliothèque d'interprétation.
 */
const ID = (n: number) => `64f1c2a9e8b7d6c5b4a3928${n}`;

describe('personRef', () => {
  test('le nom affiché en libellé, @pseudo en secondaire, la photo pour l’avatar', () => {
    expect(personRef({ id: ID(1), username: 'awa', displayName: 'Awa Diop', avatar: 'https://cdn/a.jpg' }, 'fr')).toEqual({
      kind: 'user',
      id: ID(1),
      label: 'Awa Diop',
      secondary: '@awa',
      avatarUrl: 'https://cdn/a.jpg',
    });
  });

  test('sans nom affiché : le pseudo ; sans rien : « Compte sans nom » — jamais l’identifiant', () => {
    expect(personRef({ id: ID(1), username: 'awa', displayName: null, avatar: null }, 'fr')).toMatchObject({ label: '@awa', secondary: '@awa' });
    const unnamed = personRef({ id: ID(1), username: '', displayName: null, avatar: null }, 'fr');
    expect(unnamed).toMatchObject({ label: 'Compte sans nom', secondary: null });
    expect(JSON.stringify([unnamed?.label, unnamed?.secondary])).not.toContain(ID(1));
  });

  test('une personne absente n’a pas de référence', () => {
    expect(personRef(null, 'fr')).toBeNull();
  });
});

describe('postRef', () => {
  test('« {type} de {auteur} » — le vrai nom d’une publication', () => {
    const author = { id: ID(1), username: 'awa', displayName: 'Awa Diop', avatar: null };
    expect(postRef({ id: ID(4), type: 'STORY', author }, 'fr', 'J’aime : 3')).toEqual({
      kind: 'post',
      id: ID(4),
      label: 'Story de Awa Diop',
      secondary: 'J’aime : 3',
    });
  });

  test('sans auteur lisible : « Personne inconnue »', () => {
    expect(postRef({ id: ID(4), type: 'REEL', author: null }, 'fr').label).toBe('Reel de Personne inconnue');
  });
});

describe('communityRef', () => {
  test('le nom, l’identifiant public en secondaire, le logo quand il existe', () => {
    expect(communityRef({ id: ID(3), name: 'Club de jazz', identifier: 'mshy_club-jazz', avatar: 'https://cdn/c.jpg' }, 'fr')).toEqual({
      kind: 'community',
      id: ID(3),
      label: 'Club de jazz',
      secondary: 'mshy_club-jazz',
      avatarUrl: 'https://cdn/c.jpg',
    });
  });

  test('sans logo, la clé `avatarUrl` est ABSENTE (le chip dessine alors le glyphe du genre)', () => {
    expect(Object.keys(communityRef({ id: ID(3), name: 'Club', identifier: '', avatar: null }, 'fr'))).not.toContain('avatarUrl');
  });

  test('sans nom : « Communauté sans nom » ; sans identifiant public, pas de secondaire', () => {
    expect(communityRef({ id: ID(3), name: '  ', identifier: '', avatar: null }, 'fr')).toMatchObject({ label: 'Communauté sans nom', secondary: null });
  });
});

describe('conversationRef', () => {
  test('le titre en libellé ; le secondaire est celui que l’appelant compose', () => {
    expect(conversationRef({ id: ID(5), title: 'Répétitions', type: 'group' }, 'fr', 'Groupe · Membres : 12')).toEqual({
      kind: 'conversation',
      id: ID(5),
      label: 'Répétitions',
      secondary: 'Groupe · Membres : 12',
    });
  });

  test('sans titre : « Conversation sans titre », jamais son identifiant', () => {
    expect(conversationRef({ id: ID(5), title: null, type: 'public' }, 'fr', null).label).toBe('Conversation sans titre');
  });
});
