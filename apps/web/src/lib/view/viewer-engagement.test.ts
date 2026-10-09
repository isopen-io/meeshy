import { describe, expect, test } from 'bun:test';

import { viewerEngagementMarks } from './viewer-engagement';

/** #9727 — ce que la feuille « Vues » dessine sous chaque nom. */
describe('viewerEngagementMarks', () => {
  test('toutes les marques, dans l’ordre de la feuille iOS', () => {
    expect(
      viewerEngagementMarks({ reaction: '😂', reactions: ['❤️', '😂'], shareCount: 1, repostCount: 2, commentCount: 3, replyCount: 4 }),
    ).toEqual([
      { kind: 'reactions', emojis: ['❤️', '😂'] },
      { kind: 'comments', count: 3 },
      { kind: 'replies', count: 4 },
      { kind: 'reposts', count: 2 },
      { kind: 'shares', count: 1 },
    ]);
  });

  test('le favori ne se montre jamais, même servi par une passerelle d’avant la décision du 2026-10-09', () => {
    const fromOlderGateway = { reaction: null, commentCount: 1, bookmarked: true as const };
    expect(viewerEngagementMarks(fromOlderGateway)).toEqual([{ kind: 'comments', count: 1 }]);
  });

  test('un compteur à zéro ne produit aucune marque', () => {
    expect(viewerEngagementMarks({ reaction: null, shareCount: 0, repostCount: 0, commentCount: 0, replyCount: 0 })).toEqual([]);
  });

  test('un serveur d’avant #9727 ne sert que `reaction` : elle reste affichée', () => {
    expect(viewerEngagementMarks({ reaction: '👍' })).toEqual([{ kind: 'reactions', emojis: ['👍'] }]);
  });
});
