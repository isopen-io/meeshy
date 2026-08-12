import { postToStoryItem, groupToStoryItem, postToStoryData, groupStoriesByAuthor, timeRemaining } from '@/lib/story-transforms';
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

  it('falls back to username when displayName is an empty string', () => {
    const post = createPost({
      author: { id: 'a1', username: 'john', displayName: '', avatar: 'a.jpg' },
    });
    const result = postToStoryItem(post, 'x', new Set());

    expect(result.author.name).toBe('john');
  });

  it('falls back to username when displayName is whitespace only', () => {
    const post = createPost({
      author: { id: 'a1', username: 'john', displayName: '   ', avatar: 'a.jpg' },
    });
    const result = postToStoryItem(post, 'x', new Set());

    expect(result.author.name).toBe('john');
  });

  it('normalizes an empty-string avatar to undefined (no blank <img src="">)', () => {
    const post = createPost({
      author: { id: 'a1', username: 'john', displayName: 'John', avatar: '' },
    });
    const result = postToStoryItem(post, 'x', new Set());

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

describe('groupToStoryItem', () => {
  it('uses the first story author display name', () => {
    const group = [createPost({ id: '1', authorId: 'a1' }), createPost({ id: '2', authorId: 'a1' })];
    const result = groupToStoryItem(group, 'x', new Set());

    expect(result.id).toBe('a1');
    expect(result.author.name).toBe('Test User');
  });

  it('falls back to username when the first author displayName is empty', () => {
    const group = [
      createPost({ id: '1', authorId: 'a1', author: { id: 'a1', username: 'john', displayName: '', avatar: '' } }),
    ];
    const result = groupToStoryItem(group, 'x', new Set());

    expect(result.author.name).toBe('john');
    expect(result.author.avatar).toBeUndefined();
  });
});

describe('postToStoryData', () => {
  it('falls back to username when displayName is empty', () => {
    const post = createPost({
      author: { id: 'a1', username: 'john', displayName: '   ', avatar: '' },
    });
    const result = postToStoryData(post);

    expect(result.author.name).toBe('john');
    expect(result.author.avatar).toBeUndefined();
  });

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

// ── W1 — portage 1:1 de KeyframeInterpolator.swift ────────────────────────────

import {
  interpolateKeyframeChannel,
  resolveKeyframeState,
  applyStoryEasing,
  resolveClipTransitionOpacity,
  safeBackgroundImageUrl,
  type StoryClipTransitionData,
} from '@/lib/story-transforms';

describe('interpolateKeyframeChannel (W1 iOS parity)', () => {
  const lin = 'linear' as const;

  it('single keyframe is a constant', () => {
    expect(interpolateKeyframeChannel([{ time: 2, value: 0.7, easing: lin }], 0)).toBe(0.7);
    expect(interpolateKeyframeChannel([{ time: 2, value: 0.7, easing: lin }], 9)).toBe(0.7);
  });

  it('clamps before the first and after the last keyframe', () => {
    const ch = [
      { time: 1, value: 0.2, easing: lin },
      { time: 3, value: 0.8, easing: lin },
    ];
    expect(interpolateKeyframeChannel(ch, 0)).toBe(0.2);
    expect(interpolateKeyframeChannel(ch, 5)).toBe(0.8);
  });

  it('interpolates linearly inside a segment', () => {
    const ch = [
      { time: 0, value: 0, easing: lin },
      { time: 2, value: 1, easing: lin },
    ];
    expect(interpolateKeyframeChannel(ch, 1)).toBeCloseTo(0.5);
  });

  it('applies the LOW keyframe easing to the segment (iOS semantics)', () => {
    const ch = [
      { time: 0, value: 0, easing: 'easeIn' as const },
      { time: 2, value: 1, easing: lin },
    ];
    // u = 0.5, easeIn → 0.25
    expect(interpolateKeyframeChannel(ch, 1)).toBeCloseTo(0.25);
  });

  it('empty channel yields undefined', () => {
    expect(interpolateKeyframeChannel([], 1)).toBeUndefined();
  });
});

describe('resolveKeyframeState (W1)', () => {
  it('resolves channels independently and offsets by startTime', () => {
    const state = resolveKeyframeState(
      [
        { time: 0, x: 0.1, opacity: 0 },
        { time: 2, x: 0.9, opacity: 1 },
      ],
      3, // playhead 3s
      2  // startTime 2s → local 1s = milieu du segment
    );
    expect(state?.x).toBeCloseTo(0.5);
    expect(state?.opacity).toBeCloseTo(0.5);
    expect(state?.scale).toBeUndefined();
  });

  it('returns null without keyframes (static pose fallback)', () => {
    expect(resolveKeyframeState(undefined, 1, 0)).toBeNull();
    expect(resolveKeyframeState([], 1, 0)).toBeNull();
  });
});

describe('applyStoryEasing (W1)', () => {
  it('matches the iOS formulas', () => {
    expect(applyStoryEasing('linear', 0.5)).toBeCloseTo(0.5);
    expect(applyStoryEasing('easeIn', 0.5)).toBeCloseTo(0.25);
    expect(applyStoryEasing('easeOut', 0.5)).toBeCloseTo(0.75);
    expect(applyStoryEasing('easeInOut', 0.25)).toBeCloseTo(0.125);
  });
});

describe('resolveClipTransitionOpacity (W1 inc.4 — ReaderTransitionResolver parity)', () => {
  const clipA = { id: 'clip-a', startTime: 0, duration: 4 };
  const clipB = { id: 'clip-b', startTime: 4, duration: 4 };
  const crossfade: StoryClipTransitionData = {
    fromClipId: 'clip-a', toClipId: 'clip-b', kind: 'crossfade', duration: 1,
  };

  it('fades the outgoing clip 1→0 over [end-d, end]', () => {
    expect(resolveClipTransitionOpacity(clipA, [crossfade], 3.5)).toBeCloseTo(0.5);
    expect(resolveClipTransitionOpacity(clipA, [crossfade], 3.8)).toBeCloseTo(0.2);
  });

  it('fades the incoming clip 0→1 over [start, start+d]', () => {
    expect(resolveClipTransitionOpacity(clipB, [crossfade], 4.5)).toBeCloseTo(0.5);
    expect(resolveClipTransitionOpacity(clipB, [crossfade], 4.9)).toBeCloseTo(0.9);
  });

  it('returns 1 outside the transition window but inside the media window', () => {
    expect(resolveClipTransitionOpacity(clipA, [crossfade], 1.0)).toBe(1);
    expect(resolveClipTransitionOpacity(clipB, [crossfade], 6.0)).toBe(1);
  });

  it('returns 0 outside the media [start, end] window (transitions present)', () => {
    expect(resolveClipTransitionOpacity(clipA, [crossfade], 5.0)).toBe(0);
    expect(resolveClipTransitionOpacity(clipB, [crossfade], 1.0)).toBe(0);
  });

  it('ignores dissolve (compositor-only, iOS reader parity) and uninvolved clips', () => {
    const dissolve: StoryClipTransitionData = {
      fromClipId: 'clip-a', toClipId: 'clip-b', kind: 'dissolve', duration: 1,
    };
    expect(resolveClipTransitionOpacity(clipA, [dissolve], 3.5)).toBe(1);
    const other = { id: 'clip-z', startTime: 0, duration: 8 };
    expect(resolveClipTransitionOpacity(other, [crossfade], 3.5)).toBe(1);
  });

  it('multiplies overlapping matching transitions and clamps to [0, 1]', () => {
    const secondFade: StoryClipTransitionData = {
      fromClipId: 'clip-a', toClipId: 'clip-x', kind: 'crossfade', duration: 1,
    };
    const combined = resolveClipTransitionOpacity(clipA, [crossfade, secondFade], 3.5);
    expect(combined).toBeCloseTo(0.25);
  });

  it('treats no transitions as fully opaque and guards zero-duration', () => {
    expect(resolveClipTransitionOpacity(clipA, undefined, 3.5)).toBe(1);
    expect(resolveClipTransitionOpacity(clipA, [], 3.5)).toBe(1);
    const degenerate: StoryClipTransitionData = {
      fromClipId: 'clip-a', toClipId: 'clip-b', kind: 'crossfade', duration: 0,
    };
    expect(resolveClipTransitionOpacity(clipA, [degenerate], 4.0)).toBe(1);
  });
});

describe('safeBackgroundImageUrl (W7 — viewer IP-leak guard)', () => {
  const allowed = ['https://gate.meeshy.me', 'https://meeshy.me'];

  it('accepts internal relative paths', () => {
    expect(safeBackgroundImageUrl('/api/v1/attachments/file/2026/07/bg.jpg', allowed))
      .toBe('/api/v1/attachments/file/2026/07/bg.jpg');
  });

  it('rejects protocol-relative and external absolute URLs', () => {
    expect(safeBackgroundImageUrl('//evil.tld/pixel.png', allowed)).toBeNull();
    expect(safeBackgroundImageUrl('https://evil.tld/pixel.png', allowed)).toBeNull();
  });

  it('accepts allowed origins only, exact origin match', () => {
    expect(safeBackgroundImageUrl('https://gate.meeshy.me/api/v1/attachments/x.jpg', allowed))
      .toBe('https://gate.meeshy.me/api/v1/attachments/x.jpg');
    expect(safeBackgroundImageUrl('https://gate.meeshy.me.evil.tld/x.jpg', allowed)).toBeNull();
  });

  it('rejects non-http(s) schemes', () => {
    expect(safeBackgroundImageUrl('javascript:alert(1)', allowed)).toBeNull();
    expect(safeBackgroundImageUrl('file:///etc/passwd', allowed)).toBeNull();
  });

  it('rejects CSS metacharacters so nothing escapes the url() context', () => {
    expect(safeBackgroundImageUrl('/x),url(//evil.tld/p', allowed)).toBeNull();
    expect(safeBackgroundImageUrl("/x'y.png", allowed)).toBeNull();
    expect(safeBackgroundImageUrl('/x y.png', allowed)).toBeNull();
  });
});
