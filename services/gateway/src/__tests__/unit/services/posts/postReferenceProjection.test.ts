/**
 * Qui voit qu'une référence SILENT existe.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { projectReferencesForViewer } from '../../../../services/posts/postReferences';
import type { PostReference } from '../../../../services/posts/postReferences';

const ALICE: PostReference = {
  userId: 'u-alice', username: 'alice', displayName: 'Alice', avatar: null, display: 'INLINE',
};
const CAROL: PostReference = {
  userId: 'u-carol', username: 'carol', displayName: 'Carol', avatar: null, display: 'SILENT',
};
const ALL = [ALICE, CAROL];

describe('projectReferencesForViewer', () => {
  it('rend TOUT à l\'auteur — il doit pouvoir retirer une silencieuse', () => {
    expect(projectReferencesForViewer({ references: ALL, authorId: 'u-author', viewerId: 'u-author' }))
      .toEqual(ALL);
  });

  it('rend les visibles PLUS la sienne à la personne silencieusement référencée', () => {
    expect(projectReferencesForViewer({ references: ALL, authorId: 'u-author', viewerId: 'u-carol' }))
      .toEqual([ALICE, CAROL]);
  });

  it('rend les visibles SEULEMENT à un tiers', () => {
    expect(projectReferencesForViewer({ references: ALL, authorId: 'u-author', viewerId: 'u-bob' }))
      .toEqual([ALICE]);
  });

  it('rend les visibles seulement à un lecteur anonyme', () => {
    expect(projectReferencesForViewer({ references: ALL, authorId: 'u-author', viewerId: undefined }))
      .toEqual([ALICE]);
  });
});
