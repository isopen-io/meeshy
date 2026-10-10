import { describe, expect, test } from 'bun:test';

import type { CardMedia } from './message-card-media';
import { MAX_GIF_MS, MAX_VIDEO_MS, cardOutputsOf, extensionOfType, motionDurationOf, pickRecorderType } from './message-card-output';

const photo: CardMedia = { kind: 'image', width: 10, height: 10 };
const clip: CardMedia = { kind: 'video', width: 16, height: 9 };
const voice: CardMedia = { kind: 'audio', durationMs: 5_000, name: 'n.m4a', peaks: [1] };

describe('ce qu’« Imager » peut rendre', () => {
  test('un texte ou une photo : une image, rien d’autre', () => {
    expect(cardOutputsOf([])).toEqual(['image']);
    expect(cardOutputsOf([photo])).toEqual(['image']);
  });

  test('une vidéo : Image · GIF · Vidéo', () => {
    expect(cardOutputsOf([photo, clip])).toEqual(['image', 'gif', 'video']);
  });

  test('un audio : Image · Vidéo — jamais de GIF, muet', () => {
    expect(cardOutputsOf([voice])).toEqual(['image', 'video']);
  });

  test('la durée animée suit le média, bornée par le format', () => {
    expect(motionDurationOf({ output: 'video', mediaDurationMs: 12_000 })).toBe(12_000);
    expect(motionDurationOf({ output: 'video', mediaDurationMs: 600_000 })).toBe(MAX_VIDEO_MS);
    expect(motionDurationOf({ output: 'gif', mediaDurationMs: 12_000 })).toBe(MAX_GIF_MS);
    expect(motionDurationOf({ output: 'video', mediaDurationMs: null })).toBe(6_000);
    expect(motionDurationOf({ output: 'video', mediaDurationMs: Number.NaN })).toBe(6_000);
  });

  test('le conteneur : MP4 d’abord, WebM sinon, rien quand l’enregistreur ne sait rien écrire', () => {
    expect(pickRecorderType((type) => type.startsWith('video/'))).toBe('video/mp4;codecs=avc1,mp4a.40.2');
    expect(pickRecorderType((type) => type.startsWith('video/webm'))).toBe('video/webm;codecs=vp9,opus');
    expect(pickRecorderType(() => false)).toBeNull();
    expect(extensionOfType('video/webm;codecs=vp9')).toBe('webm');
    expect(extensionOfType('video/mp4')).toBe('mp4');
    expect(extensionOfType('image/gif')).toBe('gif');
  });
});
