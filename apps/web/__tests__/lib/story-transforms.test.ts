import { postToStoryItem, postToStoryData, groupStoriesByAuthor, timeRemaining } from '@/lib/story-transforms';
import type { Post } from '@meeshy/shared/types/post';

function createPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    authorId: 'author-1',
    type: 'STORY',
    visibility: 'FRIENDS',
    content: 'Test story',
    originalLanguage: 'fr',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 10,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    createdAt: '2026-03-28T10:00:00Z',
    updatedAt: '2026-03-28T10:00:00Z',
    expiresAt: '2026-03-29T10:00:00Z',
    author: {
      id: 'author-1',
      username: 'testuser',
      displayName: 'Test User',
      avatar: 'https://example.com/avatar.jpg',
    },
    storyEffects: {
      backgroundColor: '#C4704B',
      textStyle: 'bold',
      textColor: '#ffffff',
    },
    ...overrides,
  };
}

describe('postToStoryItem', () => {
  it('maps Post to StoryItem with correct author info', () => {
    const post = createPost();
    const result = postToStoryItem(post, 'other-user', new Set());

    expect(result.id).toBe('post-1');
    expect(result.author.name).toBe('Test User');
    expect(result.author.avatar).toBe('https://example.com/avatar.jpg');
    expect(result.isOwn).toBe(false);
    expect(result.hasUnviewed).toBe(true);
  });

  it('marks story as own when authorId matches currentUserId', () => {
    const post = createPost();
    const result = postToStoryItem(post, 'author-1', new Set());

    expect(result.isOwn).toBe(true);
  });

  it('marks story as viewed when id is in viewedIds', () => {
    const post = createPost();
    const result = postToStoryItem(post, 'other-user', new Set(['post-1']));

    expect(result.hasUnviewed).toBe(false);
  });

  it('falls back to username when displayName is null', () => {
    const post = createPost({
      author: { id: 'a1', username: 'john', displayName: null, avatar: null },
    });
    const result = postToStoryItem(post, 'x', new Set());

    expect(result.author.name).toBe('john');
    expect(result.author.avatar).toBeUndefined();
  });

  it('uses first media thumbnailUrl when available', () => {
    const post = createPost({
      media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'https://img.jpg', thumbnailUrl: 'https://thumb.jpg', order: 0 }],
    });
    const result = postToStoryItem(post, 'x', new Set());

    expect(result.thumbnailUrl).toBe('https://thumb.jpg');
  });
});

describe('postToStoryData', () => {
  it('maps Post to StoryData with correct story effects', () => {
    const post = createPost();
    const result = postToStoryData(post);

    expect(result.id).toBe('post-1');
    expect(result.content).toBe('Test story');
    expect(result.originalLanguage).toBe('fr');
    expect(result.viewCount).toBe(10);
    expect(result.storyEffects?.background).toBe('#C4704B');
    expect(result.storyEffects?.textStyle).toBe('bold');
  });

  it('handles post without storyEffects', () => {
    const post = createPost({ storyEffects: undefined });
    const result = postToStoryData(post);

    expect(result.storyEffects).toBeUndefined();
  });

  it('maps first image media to mediaUrl/mediaType', () => {
    const post = createPost({
      media: [{ id: 'm1', mimeType: 'image/png', fileUrl: 'https://image.png', order: 0, thumbnailUrl: null }],
    });
    const result = postToStoryData(post);

    expect(result.mediaUrl).toBe('https://image.png');
    expect(result.mediaType).toBe('image');
  });

  it('maps first video media to mediaUrl/mediaType', () => {
    const post = createPost({
      media: [{ id: 'm1', mimeType: 'video/mp4', fileUrl: 'https://video.mp4', order: 0, thumbnailUrl: null }],
    });
    const result = postToStoryData(post);

    expect(result.mediaUrl).toBe('https://video.mp4');
    expect(result.mediaType).toBe('video');
  });

  it('provides default expiresAt when post has none', () => {
    const post = createPost({ expiresAt: null });
    const result = postToStoryData(post);

    expect(result.expiresAt).toBeDefined();
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('groupStoriesByAuthor', () => {
  it('groups posts by authorId', () => {
    const posts = [
      createPost({ id: '1', authorId: 'a1' }),
      createPost({ id: '2', authorId: 'a2' }),
      createPost({ id: '3', authorId: 'a1' }),
    ];
    const grouped = groupStoriesByAuthor(posts);

    expect(grouped.size).toBe(2);
    expect(grouped.get('a1')?.length).toBe(2);
    expect(grouped.get('a2')?.length).toBe(1);
  });

  it('returns empty map for empty array', () => {
    const grouped = groupStoriesByAuthor([]);
    expect(grouped.size).toBe(0);
  });
});

describe('timeRemaining', () => {
  it('returns null for expired dates', () => {
    const past = new Date(Date.now() - 60000).toISOString();
    expect(timeRemaining(past)).toBeNull();
  });

  it('returns minutes for less than an hour', () => {
    const future = new Date(Date.now() + 30 * 60000).toISOString();
    const result = timeRemaining(future);
    expect(result).toMatch(/^\d+m$/);
  });

  it('returns hours and minutes for more than an hour', () => {
    const future = new Date(Date.now() + 90 * 60000).toISOString();
    const result = timeRemaining(future);
    expect(result).toMatch(/^\d+h\d*m?$/);
  });
});
