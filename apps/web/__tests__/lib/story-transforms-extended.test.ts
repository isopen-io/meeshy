/**
 * Extended tests for story-transforms.ts covering branches not covered by story-transforms.test.ts
 */

import { postToStoryItem, postToStoryData, groupStoriesByAuthor, groupToStoryItem, computeStoryDurationMs, timeRemaining } from '@/lib/story-transforms';
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
    ...overrides,
  };
}

// =============================================================================
// postToStoryItem
// =============================================================================

describe('postToStoryItem - extended branches', () => {
  it('falls back to "Unknown" when author is undefined', () => {
    const post = createPost({ author: undefined });
    const result = postToStoryItem(post, 'x', new Set());
    expect(result.author.name).toBe('Unknown');
    expect(result.author.avatar).toBeUndefined();
  });

  it('uses fileUrl as thumbnail when thumbnailUrl is null', () => {
    const post = createPost({
      media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'https://img.jpg', thumbnailUrl: null, order: 0 }],
    });
    const result = postToStoryItem(post, 'x', new Set());
    expect(result.thumbnailUrl).toBe('https://img.jpg');
  });

  it('thumbnailUrl is undefined when no media', () => {
    const post = createPost({ media: [] });
    const result = postToStoryItem(post, 'x', new Set());
    expect(result.thumbnailUrl).toBeUndefined();
  });

  it('hasUnviewed is false when id is in viewedIds', () => {
    const post = createPost({ id: 'viewed-1' });
    const result = postToStoryItem(post, 'other', new Set(['viewed-1']));
    expect(result.hasUnviewed).toBe(false);
  });

  it('hasUnviewed is true when id is NOT in viewedIds', () => {
    const post = createPost({ id: 'unviewed-1' });
    const result = postToStoryItem(post, 'other', new Set(['other-id']));
    expect(result.hasUnviewed).toBe(true);
  });
});

// =============================================================================
// postToStoryData - extended branches
// =============================================================================

describe('postToStoryData - translations', () => {
  it('parses translations as plain string', () => {
    const post = createPost({ translations: { en: 'Hello', fr: 'Bonjour' } });
    const result = postToStoryData(post);
    expect(result.translations).toEqual([
      { languageCode: 'en', languageName: 'en', content: 'Hello' },
      { languageCode: 'fr', languageName: 'fr', content: 'Bonjour' },
    ]);
  });

  it('parses translations as { text: string } object', () => {
    const post = createPost({
      translations: {
        en: { text: 'Hello world', translationModel: 'nllb', createdAt: '2026-01-01' },
      },
    });
    const result = postToStoryData(post);
    expect(result.translations).toEqual([
      { languageCode: 'en', languageName: 'en', content: 'Hello world' },
    ]);
  });

  it('skips invalid translation entries', () => {
    const post = createPost({ translations: { en: 42, fr: 'Bonjour' } });
    const result = postToStoryData(post);
    expect(result.translations).toEqual([
      { languageCode: 'fr', languageName: 'fr', content: 'Bonjour' },
    ]);
  });

  it('returns undefined translations when translations is null', () => {
    const post = createPost({ translations: null });
    const result = postToStoryData(post);
    expect(result.translations).toBeUndefined();
  });

  it('returns undefined translations when all entries are invalid', () => {
    const post = createPost({ translations: { en: 42, fr: null } });
    const result = postToStoryData(post);
    expect(result.translations).toBeUndefined();
  });
});

describe('postToStoryData - expiresAt', () => {
  it('uses string expiresAt as-is', () => {
    const post = createPost({ expiresAt: '2026-05-01T00:00:00Z' });
    const result = postToStoryData(post);
    expect(result.expiresAt).toBe('2026-05-01T00:00:00Z');
  });

  it('converts Date expiresAt to ISO string', () => {
    const expDate = new Date('2026-05-01T00:00:00Z');
    const post = createPost({ expiresAt: expDate });
    const result = postToStoryData(post);
    expect(result.expiresAt).toBe(expDate.toISOString());
  });

  it('defaults expiresAt to +24h when null', () => {
    const before = Date.now();
    const post = createPost({ expiresAt: null });
    const result = postToStoryData(post);
    const after = Date.now();
    const expiresMs = new Date(result.expiresAt).getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000 - 10);
    expect(expiresMs).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000 + 10);
  });
});

describe('postToStoryData - createdAt', () => {
  it('converts Date createdAt to ISO string', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    const post = createPost({ createdAt: d });
    const result = postToStoryData(post);
    expect(result.createdAt).toBe(d.toISOString());
  });
});

describe('postToStoryData - storyEffects', () => {
  it('handles empty storyEffects object', () => {
    const post = createPost({ storyEffects: {} });
    const result = postToStoryData(post);
    expect(result.storyEffects).toBeDefined();
    expect(result.storyEffects?.background).toBeUndefined();
    expect(result.storyEffects?.textStyle).toBeUndefined();
    expect(result.storyEffects?.filter).toBeUndefined();
    expect(result.storyEffects?.stickers).toBeUndefined();
  });

  it('parses background, textColor, textPosition', () => {
    const post = createPost({
      storyEffects: {
        backgroundColor: '#ff0000',
        textColor: '#ffffff',
        textPosition: { x: 0.5, y: 0.5 },
      },
    });
    const result = postToStoryData(post);
    expect(result.storyEffects?.background).toBe('#ff0000');
    expect(result.storyEffects?.textColor).toBe('#ffffff');
    expect(result.storyEffects?.textPosition).toEqual({ x: 0.5, y: 0.5 });
  });

  it('ignores invalid textPosition (missing fields)', () => {
    const post = createPost({
      storyEffects: { textPosition: { x: 0.5 } }, // missing y
    });
    const result = postToStoryData(post);
    expect(result.storyEffects?.textPosition).toBeUndefined();
  });

  it('ignores invalid textPosition (not an object)', () => {
    const post = createPost({
      storyEffects: { textPosition: 'center' },
    });
    const result = postToStoryData(post);
    expect(result.storyEffects?.textPosition).toBeUndefined();
  });

  it('parses valid filter values', () => {
    const validFilters = ['vintage', 'bw', 'warm', 'cool', 'dramatic'];
    for (const f of validFilters) {
      const post = createPost({ storyEffects: { filter: f } });
      const result = postToStoryData(post);
      expect(result.storyEffects?.filter).toBe(f);
    }
  });

  it('parses filter = null explicitly', () => {
    const post = createPost({ storyEffects: { filter: null } });
    const result = postToStoryData(post);
    expect(result.storyEffects?.filter).toBeNull();
  });

  it('ignores invalid filter value', () => {
    const post = createPost({ storyEffects: { filter: 'invalid-filter' } });
    const result = postToStoryData(post);
    expect(result.storyEffects?.filter).toBeUndefined();
  });

  it('parses valid stickers', () => {
    const stickers = [{ emoji: '🎉', x: 0.5, y: 0.5, scale: 1, rotation: 0 }];
    const post = createPost({ storyEffects: { stickers } });
    const result = postToStoryData(post);
    expect(result.storyEffects?.stickers).toEqual(stickers);
  });

  it('filters out invalid stickers', () => {
    const stickers = [
      { emoji: '🎉', x: 0.5, y: 0.5, scale: 1, rotation: 0 }, // valid
      { emoji: '🎉', x: 0.5, y: '0.5', scale: 1, rotation: 0 }, // invalid y
      'not an object', // invalid
    ];
    const post = createPost({ storyEffects: { stickers } });
    const result = postToStoryData(post);
    expect(result.storyEffects?.stickers).toHaveLength(1);
  });

  it('handles non-array stickers as undefined', () => {
    const post = createPost({ storyEffects: { stickers: 'not-array' } });
    const result = postToStoryData(post);
    expect(result.storyEffects?.stickers).toBeUndefined();
  });

  it('ignores the legacy slideDuration field and uses the content-derived timeline duration', () => {
    const post = createPost({ storyEffects: { slideDuration: 10 } });
    const result = postToStoryData(post);
    // No media, no text → 6s static default (NOT the arbitrary legacy 10s).
    expect(result.storyEffects?.slideDurationMs).toBe(6000);
  });

  it('honors an author-pinned timelineDuration over content', () => {
    const post = createPost({
      storyEffects: {
        timelineDuration: 3,
        mediaObjects: [{ id: 'm1', postMediaId: 'p1', mediaType: 'video', isBackground: true, x: 0, y: 0, duration: 14 }],
      },
    });
    const result = postToStoryData(post);
    expect(result.storyEffects?.slideDurationMs).toBe(3000);
  });

  it('uses a background video full natural duration', () => {
    const post = createPost({
      storyEffects: {
        mediaObjects: [{ id: 'm1', postMediaId: 'p1', mediaType: 'video', isBackground: true, x: 0, y: 0, duration: 13.5 }],
      },
    });
    const result = postToStoryData(post);
    expect(result.storyEffects?.slideDurationMs).toBe(13500);
  });
});

describe('postToStoryData - textObjects', () => {
  it('parses valid textObjects', () => {
    const post = createPost({
      storyEffects: {
        textObjects: [
          {
            id: 'txt-1',
            content: 'Hello',
            x: 0.3,
            y: 0.5,
            scale: 1,
            rotation: 0,
            textStyle: 'bold',
            textColor: '#ff0000',
            textSize: 24,
            textAlign: 'center',
            textBg: '#000000',
            zIndex: 10,
            translations: { en: 'Hello' },
            sourceLanguage: 'fr',
          },
        ],
      },
    });
    const result = postToStoryData(post);
    expect(result.storyEffects?.textObjects).toHaveLength(1);
    const obj = result.storyEffects!.textObjects![0];
    expect(obj.id).toBe('txt-1');
    expect(obj.content).toBe('Hello');
    expect(obj.textStyle).toBe('bold');
    expect(obj.textColor).toBe('#ff0000');
    expect(obj.textSize).toBe(24);
    expect(obj.textBg).toBe('#000000');
    expect(obj.zIndex).toBe(10);
    expect(obj.translations).toEqual({ en: 'Hello' });
    expect(obj.sourceLanguage).toBe('fr');
  });

  it('uses defaults when optional numeric fields are missing', () => {
    const post = createPost({
      storyEffects: {
        textObjects: [{ id: 'txt-1', content: 'Hi', x: 0.5, y: 0.5 }],
      },
    });
    const result = postToStoryData(post);
    const obj = result.storyEffects!.textObjects![0];
    expect(obj.scale).toBe(1);
    expect(obj.rotation).toBe(0);
  });

  it('ignores invalid textObjects (missing required fields)', () => {
    const post = createPost({
      storyEffects: {
        textObjects: [
          { id: 'txt-1', content: 'Hello' }, // missing x, y
          { content: 'Hello', x: 0.5, y: 0.5 }, // missing id
          null,
          'not-object',
        ],
      },
    });
    const result = postToStoryData(post);
    expect(result.storyEffects?.textObjects).toBeUndefined();
  });

  it('ignores textObjects with invalid translations (array)', () => {
    const post = createPost({
      storyEffects: {
        textObjects: [
          { id: 't1', content: 'Hi', x: 0.1, y: 0.1, translations: ['en', 'fr'] },
        ],
      },
    });
    const result = postToStoryData(post);
    expect(result.storyEffects?.textObjects![0].translations).toBeUndefined();
  });

  it('ignores invalid textStyle', () => {
    const post = createPost({
      storyEffects: {
        textObjects: [{ id: 't1', content: 'Hi', x: 0.1, y: 0.1, textStyle: 'invalid' }],
      },
    });
    const result = postToStoryData(post);
    expect(result.storyEffects?.textObjects![0].textStyle).toBeUndefined();
  });

  it('returns undefined for empty textObjects array', () => {
    const post = createPost({ storyEffects: { textObjects: [] } });
    const result = postToStoryData(post);
    expect(result.storyEffects?.textObjects).toBeUndefined();
  });

  it('handles non-array textObjects', () => {
    const post = createPost({ storyEffects: { textObjects: 'not-array' } });
    const result = postToStoryData(post);
    expect(result.storyEffects?.textObjects).toBeUndefined();
  });
});

describe('postToStoryData - mediaObjects', () => {
  it('parses valid mediaObjects with video type', () => {
    const post = createPost({
      storyEffects: {
        mediaObjects: [
          {
            id: 'med-1',
            postMediaId: 'pm-1',
            mediaType: 'video',
            x: 0.5,
            y: 0.5,
            scale: 1.5,
            rotation: 10,
            isBackground: true,
            zIndex: 5,
          },
        ],
      },
    });
    const result = postToStoryData(post);
    expect(result.storyEffects?.mediaObjects).toHaveLength(1);
    const obj = result.storyEffects!.mediaObjects![0];
    expect(obj.mediaType).toBe('video');
    expect(obj.isBackground).toBe(true);
    expect(obj.zIndex).toBe(5);
  });

  it('defaults to image for unknown mediaType', () => {
    const post = createPost({
      storyEffects: {
        mediaObjects: [{ id: 'med-1', postMediaId: 'pm-1', mediaType: 'audio', x: 0.5, y: 0.5 }],
      },
    });
    const result = postToStoryData(post);
    expect(result.storyEffects?.mediaObjects![0].mediaType).toBe('image');
  });

  it('uses defaults for missing optional fields', () => {
    const post = createPost({
      storyEffects: {
        mediaObjects: [{ id: 'med-1', postMediaId: 'pm-1', x: 0.1, y: 0.2 }],
      },
    });
    const result = postToStoryData(post);
    const obj = result.storyEffects!.mediaObjects![0];
    expect(obj.scale).toBe(1);
    expect(obj.rotation).toBe(0);
    expect(obj.isBackground).toBe(false);
  });

  it('ignores invalid mediaObjects (missing required fields)', () => {
    const post = createPost({
      storyEffects: {
        mediaObjects: [
          { id: 'med-1', x: 0.5, y: 0.5 }, // missing postMediaId
          null,
        ],
      },
    });
    const result = postToStoryData(post);
    expect(result.storyEffects?.mediaObjects).toBeUndefined();
  });

  it('returns undefined for empty mediaObjects', () => {
    const post = createPost({ storyEffects: { mediaObjects: [] } });
    const result = postToStoryData(post);
    expect(result.storyEffects?.mediaObjects).toBeUndefined();
  });
});

describe('postToStoryData - audioObjects', () => {
  it('parses valid audioObjects', () => {
    const post = createPost({
      storyEffects: {
        audioPlayerObjects: [
          {
            id: 'aud-1',
            postMediaId: 'pm-1',
            x: 0.5,
            y: 0.85,
            volume: 0.8,
            isBackground: true,
            zIndex: 3,
          },
        ],
      },
    });
    const result = postToStoryData(post);
    expect(result.storyEffects?.audioObjects).toHaveLength(1);
    const obj = result.storyEffects!.audioObjects![0];
    expect(obj.id).toBe('aud-1');
    expect(obj.volume).toBe(0.8);
    expect(obj.isBackground).toBe(true);
    expect(obj.zIndex).toBe(3);
  });

  it('uses defaults for missing optional fields in audioObjects', () => {
    const post = createPost({
      storyEffects: {
        audioPlayerObjects: [{ id: 'aud-1', postMediaId: 'pm-1' }],
      },
    });
    const result = postToStoryData(post);
    const obj = result.storyEffects!.audioObjects![0];
    expect(obj.x).toBe(0.5);
    expect(obj.y).toBe(0.85);
    expect(obj.volume).toBe(1);
    expect(obj.isBackground).toBe(false);
  });

  it('ignores invalid audioObjects', () => {
    const post = createPost({
      storyEffects: {
        audioPlayerObjects: [
          { id: 'aud-1' }, // missing postMediaId
          null,
        ],
      },
    });
    const result = postToStoryData(post);
    expect(result.storyEffects?.audioObjects).toBeUndefined();
  });

  it('returns undefined for empty audioPlayerObjects', () => {
    const post = createPost({ storyEffects: { audioPlayerObjects: [] } });
    const result = postToStoryData(post);
    expect(result.storyEffects?.audioObjects).toBeUndefined();
  });
});

describe('postToStoryData - mediaById lookup', () => {
  it('builds mediaById map from post.media', () => {
    const post = createPost({
      media: [
        { id: 'pm-1', mimeType: 'image/jpeg', fileUrl: 'https://a.jpg', order: 0 },
        { id: 'pm-2', mimeType: 'video/mp4', fileUrl: 'https://b.mp4', order: 1 },
      ],
    });
    const result = postToStoryData(post);
    expect(result.mediaById?.get('pm-1')).toEqual({ url: 'https://a.jpg', mimeType: 'image/jpeg' });
    expect(result.mediaById?.get('pm-2')).toEqual({ url: 'https://b.mp4', mimeType: 'video/mp4' });
  });

  it('mediaType is undefined when mimeType does not match image or video', () => {
    const post = createPost({
      media: [{ id: 'm1', mimeType: 'application/pdf', fileUrl: 'https://doc.pdf', order: 0 }],
    });
    const result = postToStoryData(post);
    expect(result.mediaType).toBeUndefined();
  });
});

describe('postToStoryData - author fallbacks', () => {
  it('uses displayName from author if available', () => {
    const post = createPost({ author: { id: 'a1', username: 'bob', displayName: 'Bob Smith', avatar: null } });
    const result = postToStoryData(post);
    expect(result.author.name).toBe('Bob Smith');
  });

  it('falls back to username when displayName is null', () => {
    const post = createPost({ author: { id: 'a1', username: 'bob', displayName: null, avatar: null } });
    const result = postToStoryData(post);
    expect(result.author.name).toBe('bob');
  });

  it('falls back to Unknown when author is undefined', () => {
    const post = createPost({ author: undefined });
    const result = postToStoryData(post);
    expect(result.author.name).toBe('Unknown');
  });
});

// =============================================================================
// groupStoriesByAuthor - extended
// =============================================================================

describe('groupStoriesByAuthor - extended', () => {
  it('single author single post', () => {
    const posts = [createPost({ id: 'p1', authorId: 'a1' })];
    const result = groupStoriesByAuthor(posts);
    expect(result.size).toBe(1);
    expect(result.get('a1')).toHaveLength(1);
  });

  it('single author multiple posts', () => {
    const posts = [
      createPost({ id: 'p1', authorId: 'a1' }),
      createPost({ id: 'p2', authorId: 'a1' }),
    ];
    const result = groupStoriesByAuthor(posts);
    expect(result.size).toBe(1);
    expect(result.get('a1')).toHaveLength(2);
  });

  it('two authors', () => {
    const posts = [
      createPost({ id: 'p1', authorId: 'a1' }),
      createPost({ id: 'p2', authorId: 'a2' }),
    ];
    const result = groupStoriesByAuthor(posts);
    expect(result.size).toBe(2);
  });
});

// =============================================================================
// groupToStoryItem - one tray bubble per author
// =============================================================================

describe('groupToStoryItem', () => {
  it('uses the authorId as the group bubble id', () => {
    const group = [
      createPost({ id: 'p1', authorId: 'a1' }),
      createPost({ id: 'p2', authorId: 'a1' }),
    ];
    const result = groupToStoryItem(group, 'me', new Set());
    expect(result.id).toBe('a1');
  });

  it('marks the bubble as own when the author is the current user', () => {
    const group = [createPost({ id: 'p1', authorId: 'me' })];
    const result = groupToStoryItem(group, 'me', new Set());
    expect(result.isOwn).toBe(true);
  });

  it('hasUnviewed is true when at least one story in the group is unviewed', () => {
    const group = [
      createPost({ id: 'p1', authorId: 'a1' }),
      createPost({ id: 'p2', authorId: 'a1' }),
    ];
    const result = groupToStoryItem(group, 'me', new Set(['p1']));
    expect(result.hasUnviewed).toBe(true);
  });

  it('hasUnviewed is false only when every story in the group is viewed', () => {
    const group = [
      createPost({ id: 'p1', authorId: 'a1' }),
      createPost({ id: 'p2', authorId: 'a1' }),
    ];
    const result = groupToStoryItem(group, 'me', new Set(['p1', 'p2']));
    expect(result.hasUnviewed).toBe(false);
  });

  it('uses the first story media as the bubble thumbnail', () => {
    const group = [
      createPost({
        id: 'p1',
        authorId: 'a1',
        media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'https://first.jpg', thumbnailUrl: null, order: 0 }],
      }),
      createPost({
        id: 'p2',
        authorId: 'a1',
        media: [{ id: 'm2', mimeType: 'image/jpeg', fileUrl: 'https://second.jpg', thumbnailUrl: null, order: 0 }],
      }),
    ];
    const result = groupToStoryItem(group, 'me', new Set());
    expect(result.thumbnailUrl).toBe('https://first.jpg');
  });

  it('falls back to "Unknown" author name when author is undefined', () => {
    const group = [createPost({ id: 'p1', authorId: 'a1', author: undefined })];
    const result = groupToStoryItem(group, 'me', new Set());
    expect(result.author.name).toBe('Unknown');
  });
});

// =============================================================================
// computeStoryDurationMs - timeline-aware story duration (ported from iOS)
// =============================================================================

describe('computeStoryDurationMs', () => {
  it('defaults to 6s for an empty / undefined timeline', () => {
    expect(computeStoryDurationMs(undefined)).toBe(6000);
    expect(computeStoryDurationMs({})).toBe(6000);
  });

  it('uses a background video natural duration when ≥ 6s', () => {
    expect(
      computeStoryDurationMs({ mediaObjects: [{ mediaType: 'video', isBackground: true, duration: 13.97 }] }),
    ).toBe(13970);
  });

  it('loops a short background clip up to the next full repetition past 6s', () => {
    // 4s clip → ceil(6/4)=2 repetitions → 8s.
    expect(
      computeStoryDurationMs({ mediaObjects: [{ mediaType: 'video', isBackground: true, duration: 4 }] }),
    ).toBe(8000);
  });

  it('grants extra reading time for long text (>30 words)', () => {
    const text = Array.from({ length: 42 }, (_, i) => `w${i}`).join(' '); // 42 words
    // 6 + (42-30)/6 = 6 + 2 = 8s.
    expect(computeStoryDurationMs({ textObjects: [{ text }] })).toBe(8000);
  });

  it('keeps 6s for short text', () => {
    expect(computeStoryDurationMs({ textObjects: [{ text: 'Bravo à vous' }] })).toBe(6000);
  });

  it('grants reading time for long text encoded under the legacy `content` alias', () => {
    // Legacy overlays (and the decoder-only alias) key the text under `content`.
    // parseTextObjects reads `text ?? content`; the duration must mirror that.
    const content = Array.from({ length: 42 }, (_, i) => `w${i}`).join(' '); // 42 words
    expect(computeStoryDurationMs({ textObjects: [{ content }] })).toBe(8000);
  });

  it('prefers the canonical `text` key over the legacy `content` alias', () => {
    const long = Array.from({ length: 42 }, (_, i) => `w${i}`).join(' '); // 42 words
    // Canonical `text` is short → 6s; the long legacy `content` must be ignored.
    expect(computeStoryDurationMs({ textObjects: [{ text: 'court', content: long }] })).toBe(6000);
  });

  it('author pin (timelineDuration) wins over a longer video', () => {
    expect(
      computeStoryDurationMs({
        timelineDuration: 4,
        mediaObjects: [{ mediaType: 'video', isBackground: true, duration: 20 }],
      }),
    ).toBe(4000);
  });

  it('covers a foreground (non-background) video natural duration', () => {
    expect(
      computeStoryDurationMs({ mediaObjects: [{ mediaType: 'video', isBackground: false, duration: 12 }] }),
    ).toBe(12000);
  });

  it('takes the max of a long background video and its reading time', () => {
    // 10s video + short text → max(10, 6) = 10s.
    expect(
      computeStoryDurationMs({
        mediaObjects: [{ mediaType: 'video', isBackground: true, duration: 10 }],
        textObjects: [{ text: 'court' }],
      }),
    ).toBe(10000);
  });
});

// =============================================================================
// timeRemaining - extended
// =============================================================================

describe('timeRemaining - extended', () => {
  it('returns exactly 30m for ~30 minutes remaining', () => {
    const future = new Date(Date.now() + 30 * 60 * 1000 + 500).toISOString();
    const result = timeRemaining(future);
    expect(result).toMatch(/^30m$/);
  });

  it('returns 1h30m for ~90 minutes remaining', () => {
    const future = new Date(Date.now() + 90 * 60 * 1000 + 500).toISOString();
    const result = timeRemaining(future);
    expect(result).toMatch(/^1h30m$/);
  });

  it('returns 2h for exactly 120 minutes (no minutes remainder)', () => {
    const future = new Date(Date.now() + 120 * 60 * 1000 + 500).toISOString();
    const result = timeRemaining(future);
    expect(result).toMatch(/^2h$/);
  });

  it('returns null for past date', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(timeRemaining(past)).toBeNull();
  });
});
