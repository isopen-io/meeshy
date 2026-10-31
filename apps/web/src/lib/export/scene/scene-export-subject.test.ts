import { describe, expect, test } from 'bun:test';

import type { StoryPlaybackStory } from '@/lib/stories/playback';

import { gestureAudioContext, postExportSubject, storyExportSubject } from './scene-export-subject';

const document = { v: 3, scenes: [{ id: 's', objects: [{ id: 't', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'content', z: 1, transform: {}, payload: { text: 'Salut' } }] }] };

const story = (raw: Partial<StoryPlaybackStory>): StoryPlaybackStory => ({ id: 'st1', ...raw }) as StoryPlaybackStory;

describe('ce qu’un export rend', () => {
  test('une story à scène rend SA scène, filigranée du pseudo de son auteur', () => {
    const subject = storyExportSubject(story({ storyEffects: document, author: { id: 'u', username: 'ana' } }));
    expect(subject).toMatchObject({ key: 'story:st1', fileStem: 'story-st1', watermark: '@ana' });
    expect(subject?.document.scenes).toHaveLength(1);
  });

  test('une story repartagée rend la scène de sa SOURCE', () => {
    const subject = storyExportSubject(story({ repostOf: { id: 'src', storyEffects: document } as NonNullable<StoryPlaybackStory['repostOf']> }));
    expect(subject?.carrier.postId).toBe('src');
  });

  test('une story v1, sans document, ne passe pas par la composition', () => {
    expect(storyExportSubject(story({}))).toBeNull();
    expect(storyExportSubject(undefined)).toBeNull();
  });

  test('un réel à scène se nomme réel ; un post sans scène n’a rien à composer', () => {
    const scene = { document: { v: 3 as const, scenes: [] }, carrier: { postId: 'p1', media: [] } };
    const author = { name: 'Ana', initials: 'A', accentColor: '#000', username: 'ana' };
    expect(postExportSubject({ id: 'p1', isReel: true, scene, author })?.fileStem).toBe('reel-p1');
    expect(postExportSubject({ id: 'p1', isReel: false, author })).toBeNull();
  });

  test('sans Web Audio, l’export n’a pas de contexte — il sortira muet plutôt que pas du tout', () => {
    expect(gestureAudioContext({})).toBeNull();
  });
});
