/**
 * `toPostReferences` — la forme sous laquelle une référence quitte le serveur.
 *
 * Le `displayName` est celui DU MOMENT, résolu au chargement : une personne qui
 * change de nom d'affichage doit apparaître sous son nom actuel, pas sous celui
 * qu'elle portait à la publication.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { toPostReferences, withMentions } from '../../../../services/posts/postReferences';

const ROW = {
  display: 'NOTE' as const,
  mentionedUser: { id: 'u-alice', username: 'alice', displayName: 'Alice B.', avatar: 'a.png' },
};

describe('toPostReferences', () => {
  it('aplatit la relation en une entrée porteuse du mode', () => {
    expect(toPostReferences([ROW])).toEqual([
      { userId: 'u-alice', username: 'alice', displayName: 'Alice B.', avatar: 'a.png', display: 'NOTE' },
    ]);
  });

  it('lit une ligne sans mode comme INLINE', () => {
    expect(toPostReferences([{ ...ROW, display: null }])[0].display).toBe('INLINE');
  });

  it('ignore une ligne dont l\'utilisateur n\'a pas pu être chargé', () => {
    expect(toPostReferences([{ ...ROW, mentionedUser: null }])).toEqual([]);
  });

  it('rend un tableau vide pour une relation absente', () => {
    expect(toPostReferences(undefined)).toEqual([]);
  });
});

describe('withMentions', () => {
  it('aplatit la relation en clé exposée', () => {
    expect(withMentions({ id: 'p1', postMentions: [ROW] })).toEqual({
      id: 'p1',
      mentions: [
        { userId: 'u-alice', username: 'alice', displayName: 'Alice B.', avatar: 'a.png', display: 'NOTE' },
      ],
    });
  });

  it('ne détruit pas une charge DÉJÀ aplatie', () => {
    // `POST /posts` sert le même remappage sur deux formes : le post fraîchement
    // créé, qui porte encore la relation, et — au rejeu d'idempotence — celui
    // que `getPostById` a déjà aplati et PROJETÉ pour son lecteur. Repasser
    // dessus rendrait [] et effacerait des références que l'auteur voit.
    const already = {
      id: 'p1',
      mentions: [
        { userId: 'u-carol', username: 'carol', displayName: 'Carol', avatar: null, display: 'SILENT' as const },
      ],
    };

    expect(withMentions(already).mentions).toEqual(already.mentions);
  });
});
