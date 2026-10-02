/**
 * G5 — single source of truth for the Prisma visibility OR-filter.
 *
 * PostFeedService and PostService each carried a private copy of the same
 * 6-branch OR; drift between them is a content-leak / content-hole risk (the
 * documented G5 concern). This suite pins the canonical shape produced by
 * `buildPostVisibilityOrFilter` so both consumers stay aligned by import,
 * not by discipline.
 */

import { describe, it, expect } from '@jest/globals';
import { buildPostVisibilityOrFilter } from '../postVisibility';
import { PostVisibility } from '@meeshy/shared/prisma/client';
import { matchesMongoWhere, type MongoDocument } from '../../../__tests__/helpers/mongo-where';

describe('buildPostVisibilityOrFilter (G5 canonical shape)', () => {
  const filter = buildPostVisibilityOrFilter('viewer-1', ['friend-a', 'friend-b'], ['co-member-x']);

  it('produces the 6 canonical branches in order', () => {
    expect(filter.OR).toHaveLength(6);
    expect(filter.OR[0]).toEqual({ authorId: 'viewer-1' });
    expect(filter.OR[1]).toEqual({ visibility: PostVisibility.PUBLIC });
    expect(filter.OR[2]).toEqual({
      visibility: PostVisibility.COMMUNITY,
      authorId: { in: ['co-member-x'] },
    });
    expect(filter.OR[3]).toEqual({
      visibility: PostVisibility.FRIENDS,
      authorId: { in: ['friend-a', 'friend-b'] },
    });
    expect(filter.OR[4]).toEqual({
      visibility: PostVisibility.EXCEPT,
      authorId: { in: ['friend-a', 'friend-b'] },
      NOT: { visibilityUserIds: { has: 'viewer-1' } },
    });
    expect(filter.OR[5]).toEqual({
      visibility: PostVisibility.ONLY,
      visibilityUserIds: { has: 'viewer-1' },
    });
  });

  it('defaults community co-members to an empty audience', () => {
    const noCommunity = buildPostVisibilityOrFilter('v', ['f']);
    expect(noCommunity.OR[2]).toEqual({
      visibility: PostVisibility.COMMUNITY,
      authorId: { in: [] },
    });
  });
});

/**
 * La branche EXCEPT lit `visibilityUserIds` sous une négation (#8309). Sur
 * MongoDB, Prisma n'apparie aucune négation quand la clé est ABSENTE : un post
 * EXCEPT sans la liste se FERME à tous les amis — jamais il ne s'ouvre à la
 * personne exclue. Le schéma la fait naître vide (`@default([])`) et la
 * migration 022 la pose sur les posts qui ne la portent pas.
 */
describe('buildPostVisibilityOrFilter — EXCEPT évalué avec les sémantiques MongoDB mesurées (#8309)', () => {
  const visibleTo = (viewer: string, post: MongoDocument) =>
    matchesMongoWhere(post, buildPostVisibilityOrFilter(viewer, ['author-1']) as MongoDocument);
  const except = (overrides: MongoDocument): MongoDocument => ({
    id: 'post-1',
    authorId: 'author-1',
    visibility: PostVisibility.EXCEPT,
    ...overrides,
  });

  it('ouvre le post à un ami que la liste n’exclut pas', () => {
    expect(visibleTo('friend-a', except({ visibilityUserIds: [] }))).toBe(true);
  });

  it('le ferme à l’ami que la liste exclut', () => {
    expect(visibleTo('friend-a', except({ visibilityUserIds: ['friend-a'] }))).toBe(false);
  });

  it('sans la liste, le ferme à tous — jamais ouvert à la personne exclue', () => {
    expect(visibleTo('friend-a', except({}))).toBe(false);
  });
});
