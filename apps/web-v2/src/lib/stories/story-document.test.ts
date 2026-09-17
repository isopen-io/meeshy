import { describe, expect, test } from 'bun:test';

import { CanvasV3Schema } from '@meeshy/shared/types/canvas-v3';

import { backgroundMedia, isBackground } from '@/lib/feed/scene-framing';
import { electBackgroundTrack } from '@/lib/canvas/background-sound';
import { parseCanvasDocument } from '@/lib/canvas/document';

import {
  buildPreviewCanvasDocument,
  buildStoryCanvasEffects,
  referencedStoryMediaIds,
  studioMediaIds,
  studioMediaKindOf,
  unclaimedStoryMediaIds,
} from './story-document';

const BACKGROUND = { postMediaId: 'pm-bg', fileUrl: '2026/09/u1/bg.jpg' } as const;
const SOUND = { postMediaId: 'pm-snd', fileUrl: '2026/09/u1/snd.m4a' } as const;

describe('studioMediaKindOf — le MOT, jamais un MIME (StoryModels.swift:129-132)', () => {
  test('un MIME vidéo ⇒ "video"', () => expect(studioMediaKindOf('video/mp4')).toBe('video'));
  test('tout le reste ⇒ "image"', () => {
    expect(studioMediaKindOf('image/jpeg')).toBe('image');
    expect(studioMediaKindOf('image/png')).toBe('image');
  });
});

describe('buildStoryCanvasEffects — rien à publier ⇒ null (O3, core.ts:327-365)', () => {
  test('ni texte, ni fond, ni son', () => {
    expect(buildStoryCanvasEffects({ text: '', locale: 'fr' })).toBeNull();
  });

  test('un texte fait seulement d’espaces ⇒ null', () => {
    expect(buildStoryCanvasEffects({ text: '   ', locale: 'fr' })).toBeNull();
  });
});

describe('buildStoryCanvasEffects — le fond (§0 de la spécification, correction du plan)', () => {
  test('plane "content" + payload.isBackground: true — JAMAIS "bg" (CanvasV3Migration.swift:776-780)', () => {
    const effects = buildStoryCanvasEffects({ text: '', locale: 'fr', background: { ready: BACKGROUND, mediaType: 'image' } });
    expect(effects).not.toBeNull();
    const object = effects!.scenes![0]!.objects[0]!;
    expect(object.plane).toBe('content');
    expect(object.payload.isBackground).toBe(true);
    expect(object.payload.mediaType).toBe('image');
    expect(object.payload.postMediaId).toBe(BACKGROUND.postMediaId);
    expect(object.payload.mediaURL).toBe(BACKGROUND.fileUrl);
  });

  test('passe CanvasV3Schema.safeParse — le contrat exact que la passerelle exige derrière CANVAS_V3_WRITE_STRICT', () => {
    const effects = buildStoryCanvasEffects({ text: 'Bonjour', locale: 'fr', background: { ready: BACKGROUND, mediaType: 'video' } });
    expect(CanvasV3Schema.safeParse(effects).success).toBe(true);
  });

  test('LE MÊME résolveur que le fil (`isBackground`/`backgroundMedia`, lib/feed/scene-framing.ts) reconnaît ce fond', () => {
    const effects = buildStoryCanvasEffects({ text: '', locale: 'fr', background: { ready: BACKGROUND, mediaType: 'image' } });
    const document = parseCanvasDocument(effects)!;
    const scene = document.scenes[0]!;
    expect(isBackground(scene.objects[0]!)).toBe(true);
    expect(backgroundMedia(scene)?.id).toBe('background');
  });
});

describe('buildStoryCanvasEffects — le son de fond', () => {
  test('kind audio, payload.isBackground + placement "background" (electBackgroundTrack le lit, background-sound.ts:59)', () => {
    const effects = buildStoryCanvasEffects({ text: '', locale: 'fr', sound: { ready: SOUND } });
    const document = parseCanvasDocument(effects)!;
    const track = electBackgroundTrack({ document, sceneIndex: 0, carrier: { postId: 'draft', media: [] } });
    expect(track?.src).toContain(SOUND.fileUrl.split('/').pop()!);
  });
});

describe('buildStoryCanvasEffects — le texte', () => {
  test('kind text, plane fg, textColor SANS dièse, fontSize 96, locale portée', () => {
    const effects = buildStoryCanvasEffects({ text: '  Bonjour le monde  ', locale: 'es' });
    const object = effects!.scenes![0]!.objects[0]!;
    expect(object.kind).toBe('text');
    expect(object.plane).toBe('fg');
    expect(object.locale).toBe('es');
    expect(object.payload.text).toBe('Bonjour le monde');
    expect(object.payload.textColor).toBe('FFFFFF');
    expect(object.payload.fontSize).toBe(96);
  });
});

describe('buildStoryCanvasEffects — les trois formes ENSEMBLE', () => {
  test('ordre fond, son, texte — trois objets', () => {
    const effects = buildStoryCanvasEffects({
      text: 'Légende',
      locale: 'fr',
      background: { ready: BACKGROUND, mediaType: 'image' },
      sound: { ready: SOUND },
    })!;
    const kinds = effects.scenes![0]!.objects.map((o) => o.kind);
    expect(kinds).toEqual(['media', 'audio', 'text']);
    expect(CanvasV3Schema.safeParse(effects).success).toBe(true);
  });
});

describe('referencedStoryMediaIds / unclaimedStoryMediaIds — la contre-épreuve (§3.3, MEDIA_NOT_CLAIMED)', () => {
  test('cite chaque postMediaId du document', () => {
    const effects = buildStoryCanvasEffects({
      text: '',
      locale: 'fr',
      background: { ready: BACKGROUND, mediaType: 'image' },
      sound: { ready: SOUND },
    })!;
    expect(new Set(referencedStoryMediaIds(effects))).toEqual(new Set([BACKGROUND.postMediaId, SOUND.postMediaId]));
  });

  test('un média RÉFÉRENCÉ mais ABSENT de mediaIds ⇒ signalé (le port refuse d’envoyer)', () => {
    const effects = buildStoryCanvasEffects({ text: '', locale: 'fr', background: { ready: BACKGROUND, mediaType: 'image' } })!;
    expect(unclaimedStoryMediaIds(effects, [])).toEqual([BACKGROUND.postMediaId]);
    expect(unclaimedStoryMediaIds(effects, [BACKGROUND.postMediaId])).toEqual([]);
  });
});

describe('studioMediaIds — le fond D’ABORD, le son ENSUITE (StoryViewModel+PublicationUpload.swift:336-338)', () => {
  test('les deux présents', () => {
    expect(studioMediaIds({ background: BACKGROUND, sound: SOUND })).toEqual([BACKGROUND.postMediaId, SOUND.postMediaId]);
  });
  test('seulement le son', () => {
    expect(studioMediaIds({ sound: SOUND })).toEqual([SOUND.postMediaId]);
  });
  test('aucun', () => {
    expect(studioMediaIds({})).toEqual([]);
  });
});

describe('buildPreviewCanvasDocument — l’aperçu, sur des URL LOCALES (§1.4, l’aperçu ne dépend pas de la montée)', () => {
  test('rien encore posé ⇒ null', () => {
    expect(buildPreviewCanvasDocument({ text: '', locale: 'fr' })).toBeNull();
  });

  test('le fond LOCAL est reconnu par le MÊME résolveur que le fil', () => {
    const document = buildPreviewCanvasDocument({ text: '', locale: 'fr', background: { previewUrl: 'blob:local-1', mediaType: 'image' } })!;
    const scene = document.scenes[0]!;
    expect(isBackground(scene.objects[0]!)).toBe(true);
    expect(scene.objects[0]!.payload.mediaURL).toBe('blob:local-1');
  });

  test('les trois formes composées, dans le même ordre que le document publié', () => {
    const document = buildPreviewCanvasDocument({
      text: 'Bonjour',
      locale: 'fr',
      background: { previewUrl: 'blob:bg', mediaType: 'video' },
      sound: { previewUrl: 'blob:snd' },
    })!;
    expect(document.scenes[0]!.objects.map((o) => o.kind)).toEqual(['media', 'audio', 'text']);
  });
});
