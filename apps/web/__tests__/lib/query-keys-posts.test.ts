import { queryKeys } from '@/lib/react-query/query-keys';

describe('queryKeys.posts', () => {
  it('produces correct all key', () => {
    expect(queryKeys.posts.all).toEqual(['posts']);
  });

  it('produces correct lists key', () => {
    expect(queryKeys.posts.lists()).toEqual(['posts', 'list']);
  });

  it('produces correct feed key without filters', () => {
    expect(queryKeys.posts.feed()).toEqual(['posts', 'list', 'feed', undefined]);
  });

  it('produces correct feed key with filters', () => {
    expect(queryKeys.posts.feed({ type: 'POST' })).toEqual(['posts', 'list', 'feed', { type: 'POST' }]);
  });

  it('produces correct infinite key', () => {
    expect(queryKeys.posts.infinite('POST')).toEqual(['posts', 'list', 'infinite', 'POST']);
  });

  it('produces correct detail key', () => {
    expect(queryKeys.posts.detail('abc')).toEqual(['posts', 'detail', 'abc']);
  });

  it('produces correct comments key', () => {
    expect(queryKeys.posts.comments('post-1')).toEqual(['posts', 'detail', 'post-1', 'comments']);
  });

  it('produces correct commentsInfinite key', () => {
    expect(queryKeys.posts.commentsInfinite('post-1')).toEqual(['posts', 'detail', 'post-1', 'comments', 'infinite']);
  });

  it('produces correct commentReplies key', () => {
    expect(queryKeys.posts.commentReplies('post-1', 'c-1')).toEqual(['posts', 'detail', 'post-1', 'comments', 'replies', 'c-1']);
  });

  it('produces correct bookmarks key', () => {
    expect(queryKeys.posts.bookmarks()).toEqual(['posts', 'list', 'bookmarks']);
  });

  it('produces correct userPosts key', () => {
    expect(queryKeys.posts.userPosts('u-1')).toEqual(['posts', 'list', 'user', 'u-1']);
  });

  it('produces correct communityPosts key', () => {
    expect(queryKeys.posts.communityPosts('c-1')).toEqual(['posts', 'list', 'community', 'c-1']);
  });

  it('produces correct stories key', () => {
    expect(queryKeys.posts.stories()).toEqual(['posts', 'list', 'stories']);
  });

  it('produces correct statuses key', () => {
    expect(queryKeys.posts.statuses()).toEqual(['posts', 'list', 'statuses']);
  });

  it('invalidating posts.all invalidates all post-related queries', () => {
    const allKey = queryKeys.posts.all;
    const feedKey = queryKeys.posts.feed();
    const detailKey = queryKeys.posts.detail('x');
    const commentsKey = queryKeys.posts.comments('x');

    expect(feedKey.slice(0, allKey.length)).toEqual(allKey);
    expect(detailKey.slice(0, allKey.length)).toEqual(allKey);
    expect(commentsKey.slice(0, allKey.length)).toEqual(allKey);
  });
});
