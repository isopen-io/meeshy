import { describe, expect, test } from 'bun:test';

import { announceBackgroundSound } from '@/lib/canvas/sound-announcement';

import { hasRenderableStoryContent, playedStoryScene, type StoryPlaybackStory } from './playback';

/**
 * LA SCÈNE QU'UNE STORY JOUE RÉELLEMENT (#9678) — la sienne, ou, quand
 * l'enveloppe d'une story REPARTAGÉE n'a pas d'effets propres, celle de sa
 * SOURCE, avec les médias de la source pour porteur. Le crédit du son se lit
 * sur cette scène-là : le son annoncé est celui qui joue.
 */

const borrowedSound = (name: string) => ({
  v: 3,
  scenes: [
    {
      id: 's1',
      objects: [
        {
          id: 'bgsound',
          kind: 'audio',
          anchor: { t: 'free', x: 0.5, y: 0.5 },
          plane: 'bg',
          z: 0,
          transform: { scale: 1, rotation: 0, opacity: 1 },
          payload: { isBackground: true, soundId: 'snd1', name, soundAuthorUsername: 'sam', mediaURL: 'sounds/a.m4a' },
        },
      ],
    },
  ],
});

const story = (overrides: Partial<StoryPlaybackStory>): StoryPlaybackStory => ({ id: 'envelope', createdAt: '2026-10-08T08:00:00.000Z', ...overrides });

describe('playedStoryScene', () => {
  test('une story à document joue SA scène, ses médias pour porteur', () => {
    const played = playedStoryScene(story({ storyEffects: borrowedSound('Pluie'), media: [{ id: 'm1', fileUrl: 'a.jpg' }] }));
    expect(played?.carrierStory).toEqual({ id: 'envelope', media: [{ id: 'm1', fileUrl: 'a.jpg' }] });
    expect(announceBackgroundSound({ document: played!.document, sceneIndex: 0 })).toEqual({ kind: 'credit', text: 'Pluie · @sam' });
  });

  test('une story REPARTAGÉE sans effets propres joue la scène de sa SOURCE, avec les médias de la source', () => {
    const played = playedStoryScene(
      story({
        storyEffects: null,
        media: [],
        repostOf: { id: 'source', storyEffects: borrowedSound('Orage'), media: [{ id: 'm-src', fileUrl: 'src.jpg' }] },
      }),
    );
    expect(played?.carrierStory).toEqual({ id: 'source', media: [{ id: 'm-src', fileUrl: 'src.jpg' }] });
    expect(announceBackgroundSound({ document: played!.document, sceneIndex: 0 })).toEqual({ kind: 'credit', text: 'Orage · @sam' });
  });

  test('l’enveloppe qui a ses PROPRES effets prime sur la source', () => {
    const played = playedStoryScene(
      story({ storyEffects: borrowedSound('Enveloppe'), repostOf: { id: 'source', storyEffects: borrowedSound('Source') } }),
    );
    expect(announceBackgroundSound({ document: played!.document, sceneIndex: 0 })).toEqual({ kind: 'credit', text: 'Enveloppe · @sam' });
  });

  test('ni l’enveloppe ni la source n’ont de document ⇒ null (chemin v1)', () => {
    expect(playedStoryScene(story({ storyEffects: { background: '#000' }, repostOf: { id: 'source', storyEffects: null } }))).toBeNull();
  });

  test('une republication dont SEULE la source a une scène n’est plus sautée comme vide', () => {
    expect(hasRenderableStoryContent(story({ media: [], repostOf: { id: 'source', storyEffects: borrowedSound('Orage') } }))).toBe(true);
  });
});
