import { describe, expect, test } from 'bun:test';

import { publicationShareUrl } from './share-url';

describe('publicationShareUrl — l’adresse qu’on partage d’une publication (#6278)', () => {
  /** L'adresse CANONIQUE que les deux autres clients reconnaissent déjà :
   * le repli de partage d'iOS (`FeedView.swift:22-29`), revendiquée par
   * l'app en lien universel (`DeepLinkRouter.swift:106`) et servie par le
   * legacy en production (`apps/web/app/feeds/post/[postId]`). */
  test('une publication se partage sous https://meeshy.me/feeds/post/<id>', () => {
    expect(publicationShareUrl('64f1c2a9e8b7d6c5b4a39281')).toBe('https://meeshy.me/feeds/post/64f1c2a9e8b7d6c5b4a39281');
  });

  test('l’identifiant est ENCODÉ — un id hostile ne sort jamais du chemin', () => {
    expect(publicationShareUrl('a/../b?x=1')).toBe('https://meeshy.me/feeds/post/a%2F..%2Fb%3Fx%3D1');
  });
});
