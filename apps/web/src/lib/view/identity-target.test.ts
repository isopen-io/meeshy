import { describe, expect, test } from 'bun:test';

import { identityTarget } from './identity-target';

/**
 * **L'AVATAR ET LE NOM MÈNENT AU MÊME ENDROIT** (#7241).
 *
 * La règle vivait dans `Avatar` depuis #7185. Le jour où le NOM devient tapable
 * à côté de lui, deux décisions parallèles se mettent à dériver — et **rien ne
 * rougit** quand un avatar ouvre une story pendant que le nom juste à côté
 * ouvre un profil. C'est la forme exacte des trois familles de résolveurs de
 * Prisme que ce dépôt a laissé diverger en trois cycles.
 *
 * D'où une LOI, et ces témoins sur elle plutôt que sur chaque composant.
 */

const RING = { entryStoryId: 'st-1', unseen: true } as const;

describe('une story NON VUE prime, parce que l’anneau plein l’annonce', () => {
  test('avec une story non vue, l’identité ouvre la story', () => {
    expect(identityTarget({ username: 'nour', storyRing: RING })).toEqual({ kind: 'story', post: 'st-1' });
  });

  /**
   * LE CŒUR DE LA PRIORITÉ : un avatar cerclé qui mènerait au profil
   * contredirait ce que le lecteur VOIT. L'anneau annonce ce qu'il ouvre.
   */
  test('la story non vue gagne même quand le pseudo est là', () => {
    expect(identityTarget({ username: 'nour', storyRing: RING })).not.toEqual({ kind: 'profile', username: 'nour' });
  });

  /** Et une story non vue SANS pseudo reste ouvrable : les deux sont indépendants. */
  test('une story non vue sans pseudo s’ouvre quand même', () => {
    expect(identityTarget({ storyRing: RING })).toEqual({ kind: 'story', post: 'st-1' });
  });
});

describe('sans story, l’identité mène au profil', () => {
  test('le pseudo suffit', () => {
    expect(identityTarget({ username: 'nour' })).toEqual({ kind: 'profile', username: 'nour' });
  });
});

describe('et sans rien, elle ne mène NULLE PART', () => {
  /**
   * LE CONTRE-TÉMOIN DE LA LOI 4, et le cas NOMINAL sur bien des surfaces : un
   * participant anonyme n'a pas de pseudo, un message système n'a pas d'auteur.
   * Rendre leur identité tapable poserait un contrôle sans destination — et
   * `/u/` n'est pas une adresse.
   */
  test('pas de pseudo, pas de cible', () => {
    expect(identityTarget({})).toBe(null);
    expect(identityTarget({ username: undefined })).toBe(null);
    expect(identityTarget({ username: null })).toBe(null);
    expect(identityTarget({ username: '' })).toBe(null);
  });
});

describe('une story DÉJÀ VUE laisse le toucher au profil (#7828, #7830, jumelle iOS #7831)', () => {
  const SEEN = { entryStoryId: 'st-1', unseen: false } as const;

  /** Miroir `MeeshyAvatar.swift:361-365` : `.unread` ⇒ story, sinon profil. */
  test('story vue + pseudo ⇒ profil', () => {
    expect(identityTarget({ username: 'nour', storyRing: SEEN })).toEqual({ kind: 'profile', username: 'nour' });
  });

  /** Sans pseudo, une story vue ne rend rien tapable : elle reste au menu d'appui long. */
  test('story vue sans pseudo ⇒ nulle part', () => {
    expect(identityTarget({ storyRing: SEEN })).toBe(null);
  });
});
