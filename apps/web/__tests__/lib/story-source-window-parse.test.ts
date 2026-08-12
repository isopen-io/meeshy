import { postToStoryData } from '@/lib/story-transforms';
import type { Post } from '@meeshy/shared/types/post';

function createPost(storyEffects: Record<string, unknown>): Post {
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
    author: { id: 'author-1', username: 'testuser', displayName: 'Test User', avatar: '' },
    storyEffects,
  } as Post;
}

/**
 * `parseAudioObjects` ne retenait que position et volume : aucune fenêtre
 * temporelle n'atteignait le lecteur web. Ajouter la fenêtre de SOURCE sans
 * réparer ça n'aurait eu aucun sens.
 */
describe('parseurs — fenêtres timeline et source', () => {
  const audioBase = { id: 'a1', postMediaId: 'pm1' };
  const mediaBase = { id: 'm1', postMediaId: 'pm1', x: 0.5, y: 0.5, mediaType: 'video' };

  it('test_audio_timelineWindowAndLoop_areRead', () => {
    const [audio] = postToStoryData(createPost({
      audioPlayerObjects: [{ ...audioBase, startTime: 2, duration: 8, loop: true }],
    })).storyEffects!.audioObjects!;
    expect(audio.startTime).toBe(2);
    expect(audio.duration).toBe(8);
    expect(audio.loop).toBe(true);
  });

  it('test_audio_sourceWindow_isRead', () => {
    // Fenêtre de SOURCE : où l'on entre dans le fichier. À ne pas confondre
    // avec `startTime`, qui dit quand la piste démarre sur la timeline.
    const [audio] = postToStoryData(createPost({
      audioPlayerObjects: [{ ...audioBase, sourceStart: 12, intrinsicDuration: 90 }],
    })).storyEffects!.audioObjects!;
    expect(audio.sourceStart).toBe(12);
    expect(audio.intrinsicDuration).toBe(90);
  });

  it('test_audio_nonNumericOrAbsentFields_stayUndefined', () => {
    const [audio] = postToStoryData(createPost({
      audioPlayerObjects: [{ ...audioBase, startTime: 'x', duration: null, loop: 'yes' }],
    })).storyEffects!.audioObjects!;
    expect(audio.startTime).toBeUndefined();
    expect(audio.duration).toBeUndefined();
    // `loop` n'est vrai que sur un booléen `true` strict, jamais sur une
    // chaîne : le blob vient du réseau.
    expect(audio.loop).toBeUndefined();
  });

  it('test_media_sourceStart_isRead', () => {
    const [media] = postToStoryData(createPost({
      mediaObjects: [{ ...mediaBase, sourceStart: 3.5 }],
    })).storyEffects!.mediaObjects!;
    expect(media.sourceStart).toBe(3.5);
  });

  it('test_media_absentSourceStart_isUndefined', () => {
    const [media] = postToStoryData(createPost({
      mediaObjects: [mediaBase],
    })).storyEffects!.mediaObjects!;
    expect(media.sourceStart).toBeUndefined();
  });
});
