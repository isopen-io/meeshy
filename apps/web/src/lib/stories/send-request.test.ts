import { describe, expect, test } from 'bun:test';

import type { StoryPlaybackStory } from './playback';
import { storySendRequest } from './send-request';

/**
 * #8884 — LA STORY ENTRE DANS LA FEUILLE D'ENVOI COMME UNE PUBLICATION.
 * `postType` dit STORY (la passerelle sait la republier en story), l'adresse
 * est l'adresse canonique, et l'aperçu montre ce que le lecteur voit : sa
 * vignette et son texte, jamais une description inventée.
 */
const story = (partial: Partial<StoryPlaybackStory> = {}): StoryPlaybackStory => ({
  id: 'st-1',
  createdAt: '2026-09-30T10:00:00.000Z',
  ...partial,
});

describe('storySendRequest', () => {
  test('une story est une publication STORY, partagée, avec son adresse pour le partage système', () => {
    const request = storySendRequest(story());
    expect(request.intent).toBe('share');
    expect(request.payload).toMatchObject({ kind: 'publication', postId: 'st-1', postType: 'STORY', url: 'https://meeshy.me/feeds/post/st-1' });
    expect(request.moreOptions).toEqual({ url: 'https://meeshy.me/feeds/post/st-1' });
  });

  test('l’aperçu porte la vignette du média (vignette d’abord, fichier sinon) et le texte de la story', () => {
    const withThumb = storySendRequest(
      story({ content: '  Bonjour  ', media: [{ id: 'm', fileUrl: 'https://cdn.example/m.mp4', thumbnailUrl: 'https://cdn.example/m.jpg', mimeType: 'video/mp4' }] }),
    );
    expect(withThumb.payload).toMatchObject({ preview: { kind: 'publication', text: 'Bonjour', thumbUrl: 'https://cdn.example/m.jpg' } });
    const image = storySendRequest(story({ media: [{ id: 'm', url: 'https://cdn.example/m.jpg', mimeType: 'image/jpeg' }] }));
    expect(image.payload).toMatchObject({ preview: { thumbUrl: 'https://cdn.example/m.jpg' } });
  });

  test('une vidéo sans vignette ne fait pas de son fichier une image : pas d’aperçu image', () => {
    const request = storySendRequest(story({ media: [{ id: 'm', fileUrl: 'https://cdn.example/m.mp4', mimeType: 'video/mp4' }] }));
    if (request.payload.kind !== 'publication') throw new Error('publication attendue');
    expect(request.payload.preview.thumbUrl).toBeUndefined();
  });

  test('sans texte ni média, l’aperçu ne porte ni texte ni vignette (rien d’inventé)', () => {
    const request = storySendRequest(story({ content: '   ' }));
    if (request.payload.kind !== 'publication') throw new Error('publication attendue');
    expect(request.payload.preview).toEqual({ kind: 'publication' });
  });
});

describe('storySendRequest — le partage est compté une fois parti', () => {
  test('`onShared` compte le partage de CETTE story', () => {
    const recorded: string[] = [];
    const request = storySendRequest(story(), (postId) => void recorded.push(postId));
    expect(recorded).toEqual([]);
    request.onShared?.();
    expect(recorded).toEqual([story().id]);
  });
});
