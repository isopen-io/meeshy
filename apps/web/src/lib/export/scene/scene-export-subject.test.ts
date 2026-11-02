import { describe, expect, test } from 'bun:test';

import type { StoryPlaybackStory } from '@/lib/stories/playback';

import { planSceneExport } from './scene-export-plan';
import { gestureAudioContext, mediaExportSubject, postExportSubject, storyExportSubject, storyMediaExportSubject } from './scene-export-subject';

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

  test('un média seul se compose en une scène : son fichier en fond ajusté, à sa durée, son compris', () => {
    const subject = mediaExportSubject({
      key: 'comment:c1:m1',
      fileStem: 'comment-c1',
      media: { id: 'm1', src: 'https://cdn/clip.mp4', mimeType: 'video/mp4', width: 1920, height: 1080, durationMs: 90_000 },
      watermark: '@ana',
    });
    expect(subject).toMatchObject({ key: 'comment:c1:m1', fileStem: 'comment-c1', watermark: '@ana' });
    const plan = planSceneExport({ document: subject!.document, carrier: subject!.carrier, durations: new Map([['https://cdn/clip.mp4', 90_000]]) });
    expect(plan.totalMs).toBe(90_000);
    expect(plan.sounds.map((sound) => sound.role)).toEqual(['background-video']);
    expect(plan.still).toBe(false);
  });

  test('une image seule sort en image fixe ; un son ou un fichier sans adresse n’a rien à composer', () => {
    const image = mediaExportSubject({ key: 'k', fileStem: 's', media: { id: 'i', src: 'https://cdn/a.jpg', mimeType: 'image/jpeg' }, watermark: null });
    expect(planSceneExport({ document: image!.document, carrier: image!.carrier, durations: new Map() }).still).toBe(true);
    expect(mediaExportSubject({ key: 'k', fileStem: 's', media: { id: 'a', src: 'https://cdn/a.m4a', mimeType: 'audio/mp4' }, watermark: null })).toBeNull();
    expect(mediaExportSubject({ key: 'k', fileStem: 's', media: { id: 'v', src: '', mimeType: 'video/mp4' }, watermark: null })).toBeNull();
  });

  test('une story v1 se partage composée depuis son média, filigranée de son auteur', () => {
    const subject = storyMediaExportSubject(story({ author: { id: 'u', username: 'ana' }, media: [{ id: 'm', fileUrl: 'https://cdn/story.mp4', mimeType: 'video/mp4' }] }));
    expect(subject).toMatchObject({ key: 'story:st1', fileStem: 'story-st1', watermark: '@ana' });
    expect(subject?.carrier.media[0]?.src).toBe('https://cdn/story.mp4');
    expect(storyMediaExportSubject(story({}))).toBeNull();
  });

  test('sans Web Audio, l’export n’a pas de contexte — il sortira muet plutôt que pas du tout', () => {
    expect(gestureAudioContext({})).toBeNull();
  });

  test('une story porte son emballage de marque ; un post, un réel et un média de commentaire rendent l’œuvre SEULE', () => {
    const branded = storyExportSubject(story({ storyEffects: document, author: { id: 'u', username: 'ana', displayName: 'Ana', isOnline: true } }), { viewerId: 'moi', mood: { emoji: '🎉' } });
    expect(branded?.branding?.author).toMatchObject({ authorId: 'u', username: 'ana', self: false, moodEmoji: '🎉', presence: { isOnline: true } });
    const scene = { document: { v: 3 as const, scenes: [] }, carrier: { postId: 'p1', media: [] } };
    expect(postExportSubject({ id: 'p1', isReel: false, scene, author: { id: 'u', username: 'ana' } } as unknown as Parameters<typeof postExportSubject>[0])?.branding).toBeUndefined();
    expect(mediaExportSubject({ key: 'k', fileStem: 's', media: { id: 'a', src: 'https://cdn/a.png', mimeType: 'image/png' }, watermark: null })?.branding).toBeUndefined();
  });

  test('une story sans auteur résolu garde la carte de fin due : branding présent, identité nulle', () => {
    expect(storyExportSubject(story({ storyEffects: document }))?.branding).toEqual({ author: null });
  });

  test('une story v1 composée depuis son média porte aussi la marque, et sa propre story est reconnue', () => {
    const subject = storyMediaExportSubject(story({ author: { id: 'u', username: 'ana' }, media: [{ id: 'm', fileUrl: 'https://cdn/story.mp4', mimeType: 'video/mp4' }] }), { viewerId: 'u' });
    expect(subject?.branding?.author).toMatchObject({ authorId: 'u', self: true });
  });
});
