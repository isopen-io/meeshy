import { postToStatusItem } from '@/lib/status-transforms';
import type { Post } from '@meeshy/shared/types/post';

function makeStatusPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'st-1',
    authorId: 'author-1',
    type: 'STATUS',
    visibility: 'PUBLIC',
    content: 'Trop contente !',
    moodEmoji: '🎉',
    originalLanguage: 'fr',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    createdAt: '2026-06-24T10:00:00Z',
    updatedAt: '2026-06-24T10:00:00Z',
    author: { id: 'author-1', username: 'marie', displayName: 'Marie D.', avatar: 'a.png' },
    ...overrides,
  } as Post;
}

describe('postToStatusItem', () => {
  it('maps the core status fields', () => {
    const item = postToStatusItem(makeStatusPost(), 'viewer-1');
    expect(item.id).toBe('st-1');
    expect(item.author).toEqual({ name: 'Marie D.', avatar: 'a.png' });
    expect(item.moodEmoji).toBe('🎉');
    expect(item.content).toBe('Trop contente !');
    expect(item.originalLanguage).toBe('fr');
  });

  it('falls back to username when displayName is empty or whitespace', () => {
    expect(
      postToStatusItem(makeStatusPost({ author: { id: 'author-1', username: 'marie', displayName: '', avatar: 'a.png' } }), 'me').author.name,
    ).toBe('marie');
    expect(
      postToStatusItem(makeStatusPost({ author: { id: 'author-1', username: 'marie', displayName: '   ', avatar: 'a.png' } }), 'me').author.name,
    ).toBe('marie');
  });

  it('normalizes an empty-string avatar to undefined', () => {
    const item = postToStatusItem(
      makeStatusPost({ author: { id: 'author-1', username: 'marie', displayName: 'Marie D.', avatar: '' } }),
      'me',
    );
    expect(item.author.avatar).toBeUndefined();
  });

  it('marks isOwn when the viewer authored the status', () => {
    expect(postToStatusItem(makeStatusPost({ authorId: 'me' }), 'me').isOwn).toBe(true);
    expect(postToStatusItem(makeStatusPost({ authorId: 'other' }), 'me').isOwn).toBe(false);
  });

  it('falls back to a default mood emoji when none is set', () => {
    expect(postToStatusItem(makeStatusPost({ moodEmoji: null }), 'me').moodEmoji).toBe('💭');
  });

  it('maps Prisme translations from both string and {text} shapes', () => {
    const item = postToStatusItem(
      makeStatusPost({ translations: { en: 'So happy!', es: { text: '¡Muy feliz!' } } as unknown as Post['translations'] }),
      'me',
    );
    expect(item.translations).toEqual([
      { languageCode: 'en', languageName: 'en', content: 'So happy!' },
      { languageCode: 'es', languageName: 'es', content: '¡Muy feliz!' },
    ]);
  });

  it('leaves translations undefined when there are none', () => {
    expect(postToStatusItem(makeStatusPost({ translations: undefined }), 'me').translations).toBeUndefined();
  });

  it('passes through the expiry and synthesises one when missing', () => {
    expect(postToStatusItem(makeStatusPost({ expiresAt: '2026-06-24T11:00:00Z' }), 'me').expiresAt).toBe('2026-06-24T11:00:00Z');
    expect(typeof postToStatusItem(makeStatusPost({ expiresAt: null }), 'me').expiresAt).toBe('string');
  });
});
