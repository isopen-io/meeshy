/**
 * Fidelity tests for story-transforms.ts — guard the canonical iOS/gateway
 * StoryEffects wire keys against the web reader.
 *
 * The iOS composer + gateway persist `background` (not `backgroundColor`),
 * `textObjects[].text` (not `content`), and `textObjects[].fontSize` (design
 * pixels, 1080 reference — not `textSize`). The web transform historically read
 * only the legacy keys, so every text overlay and every solid/gradient
 * background authored on iOS was silently dropped on web. These tests pin the
 * canonical keys while keeping the legacy fallbacks alive for old payloads.
 */

import { postToStoryData } from '@/lib/story-transforms';
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

describe('postToStoryData - background canonical key', () => {
  it('reads the canonical `background` key (what iOS/gateway persist)', () => {
    const post = createPost({ storyEffects: { background: '#C4704B' } });
    expect(postToStoryData(post).storyEffects?.background).toBe('#C4704B');
  });

  it('still reads the legacy `backgroundColor` key when `background` is absent', () => {
    const post = createPost({ storyEffects: { backgroundColor: '#112233' } });
    expect(postToStoryData(post).storyEffects?.background).toBe('#112233');
  });

  it('prefers the canonical `background` over the legacy `backgroundColor`', () => {
    const post = createPost({ storyEffects: { background: '#AAAAAA', backgroundColor: '#000000' } });
    expect(postToStoryData(post).storyEffects?.background).toBe('#AAAAAA');
  });

  it('supports gradient and image background strings via the canonical key', () => {
    const post = createPost({ storyEffects: { background: 'gradient:#fff,#000' } });
    expect(postToStoryData(post).storyEffects?.background).toBe('gradient:#fff,#000');
  });
});

describe('postToStoryData - textObjects canonical `text` key', () => {
  it('reads the canonical `text` key (what the iOS composer encodes)', () => {
    const post = createPost({
      storyEffects: { textObjects: [{ id: 't1', text: 'Bonjour', x: 0.5, y: 0.4 }] },
    });
    const objs = postToStoryData(post).storyEffects?.textObjects;
    expect(objs).toHaveLength(1);
    expect(objs?.[0].content).toBe('Bonjour');
  });

  it('still reads the legacy `content` key when `text` is absent', () => {
    const post = createPost({
      storyEffects: { textObjects: [{ id: 't1', content: 'Legacy', x: 0.5, y: 0.4 }] },
    });
    expect(postToStoryData(post).storyEffects?.textObjects?.[0].content).toBe('Legacy');
  });

  it('prefers the canonical `text` over the legacy `content`', () => {
    const post = createPost({
      storyEffects: { textObjects: [{ id: 't1', text: 'New', content: 'Old', x: 0.5, y: 0.4 }] },
    });
    expect(postToStoryData(post).storyEffects?.textObjects?.[0].content).toBe('New');
  });

  it('drops a text object that has neither `text` nor `content`', () => {
    const post = createPost({
      storyEffects: { textObjects: [{ id: 't1', x: 0.5, y: 0.4 }] },
    });
    expect(postToStoryData(post).storyEffects?.textObjects).toBeUndefined();
  });
});

describe('postToStoryData - textObjects canonical `fontSize` (design px)', () => {
  it('reads the canonical `fontSize` into `fontSizeDesign` (1080 design px)', () => {
    const post = createPost({
      storyEffects: { textObjects: [{ id: 't1', text: 'Hi', x: 0.5, y: 0.4, fontSize: 96 }] },
    });
    expect(postToStoryData(post).storyEffects?.textObjects?.[0].fontSizeDesign).toBe(96);
  });

  it('keeps the legacy `textSize` (css px) field independent of `fontSizeDesign`', () => {
    const post = createPost({
      storyEffects: { textObjects: [{ id: 't1', text: 'Hi', x: 0.5, y: 0.4, textSize: 24 }] },
    });
    const obj = postToStoryData(post).storyEffects?.textObjects?.[0];
    expect(obj?.textSize).toBe(24);
    expect(obj?.fontSizeDesign).toBeUndefined();
  });
});
