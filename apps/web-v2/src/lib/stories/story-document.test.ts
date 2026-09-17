import { describe, expect, test } from 'bun:test';

import { CanvasV3Schema } from '@meeshy/shared/types/canvas-v3';

import { backgroundMedia, isBackground } from '@/lib/feed/scene-framing';
import { electBackgroundTrack } from '@/lib/canvas/background-sound';
import { parseCanvasDocument } from '@/lib/canvas/document';
import { resolveSceneText } from '@/lib/canvas/text';

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
    const object = effects!.scenes![0]!.objects.find((o) => o.kind === 'text')!;
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

describe('l’aperçu et la publication sortent du MÊME composeur — jamais deux constructions qui divergent', () => {
  test('mêmes objets, mêmes charges ; seules les ADRESSES diffèrent (URL locale contre identité serveur)', () => {
    const published = buildStoryCanvasEffects({
      text: 'Bonjour',
      locale: 'fr',
      background: { ready: BACKGROUND, mediaType: 'video' },
      sound: { ready: SOUND },
    })!;
    const preview = buildPreviewCanvasDocument({
      text: 'Bonjour',
      locale: 'fr',
      background: { previewUrl: 'blob:bg', mediaType: 'video' },
      sound: { previewUrl: 'blob:snd' },
    })!;
    const withoutAddress = (payload: Readonly<Record<string, unknown>>) =>
      Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'postMediaId' && key !== 'mediaURL'));
    const publishedObjects = published.scenes![0]!.objects;
    const previewObjects = preview.scenes[0]!.objects;
    expect(previewObjects.map((o) => o.id)).toEqual(publishedObjects.map((o) => o.id));
    previewObjects.forEach((object, index) => {
      const twin = publishedObjects[index]!;
      expect(object.plane).toBe(twin.plane);
      expect(object.z).toBe(twin.z);
      expect(withoutAddress(object.payload)).toEqual(withoutAddress(twin.payload));
    });
    expect(previewObjects[0]!.payload.mediaURL).toBe('blob:bg');
    expect('postMediaId' in previewObjects[0]!.payload).toBe(false);
  });
});

describe('une vidéo de fond sous un son de fond joue MUETTE (question 9.10, CanvasV3Migration.swift:549-552)', () => {
  test('vidéo + son ⇒ muted true, volume 0 ; vidéo seule ⇒ aucune consigne de muet', () => {
    const withSound = buildStoryCanvasEffects({ text: '', locale: 'fr', background: { ready: BACKGROUND, mediaType: 'video' }, sound: { ready: SOUND } })!;
    expect(withSound.scenes![0]!.objects[0]!.payload.muted).toBe(true);
    expect(withSound.scenes![0]!.objects[0]!.payload.volume).toBe(0);
    const alone = buildStoryCanvasEffects({ text: '', locale: 'fr', background: { ready: BACKGROUND, mediaType: 'video' } })!;
    expect('muted' in alone.scenes![0]!.objects[0]!.payload).toBe(false);
  });
});

describe('le texte composé se RELIT au Prisme du lecteur (leçon 261 : un rang AUTRE que le premier)', () => {
  test('texte écrit en es, lecteur [fr, es], aucune traduction ⇒ servi en es, au rang 2', () => {
    const document = parseCanvasDocument(buildStoryCanvasEffects({ text: 'Hola a todos', locale: 'es' }))!;
    const served = resolveSceneText({ object: document.scenes[0]!.objects.find((o) => o.kind === 'text')!, preferredLanguages: ['fr', 'es'] });
    expect(served.text).toBe('Hola a todos');
    expect(served.language).toBe('es');
  });
});

describe('une story SANS visuel porte un fond de COULEUR — un texte blanc ne se pose jamais sur l’aplat clair d’une carte', () => {
  test('texte seul ⇒ un objet bg de couleur (la forme que CanvasV3Migration.swift:830-833 relit) puis le texte ; valide au schéma', () => {
    const effects = buildStoryCanvasEffects({ text: 'Bonjour', locale: 'fr' })!;
    const [plain, text] = effects.scenes![0]!.objects;
    expect(plain!.plane).toBe('bg');
    expect(plain!.kind).toBe('media');
    expect(typeof plain!.payload.background).toBe('string');
    expect(text!.kind).toBe('text');
    expect(CanvasV3Schema.safeParse(effects).success).toBe(true);
    expect(referencedStoryMediaIds(effects)).toEqual([]);
  });

  test('un visuel posé ⇒ AUCUN fond de couleur (le fond est le visuel) ; rien posé ⇒ aucun document', () => {
    const withVisual = buildStoryCanvasEffects({ text: 'Bonjour', locale: 'fr', background: { ready: BACKGROUND, mediaType: 'image' } })!;
    expect(withVisual.scenes![0]!.objects.some((o) => o.plane === 'bg')).toBe(false);
    expect(buildPreviewCanvasDocument({ text: '', locale: 'fr' })).toBeNull();
  });
});

describe('CHAQUE forme que le composeur peut produire passe CanvasV3Schema — la preuve qui remplace une validation à l’exécution', () => {
  const forms: Readonly<Record<string, Parameters<typeof buildStoryCanvasEffects>[0]>> = {
    'texte seul': { text: 'Bonjour', locale: 'fr' },
    'son seul': { text: '', locale: 'fr', sound: { ready: SOUND } },
    'son et texte': { text: 'Bonjour', locale: 'fr', sound: { ready: SOUND } },
    'image seule': { text: '', locale: 'fr', background: { ready: BACKGROUND, mediaType: 'image' as const } },
    'vidéo et son': { text: '', locale: 'fr', background: { ready: BACKGROUND, mediaType: 'video' as const }, sound: { ready: SOUND } },
    'image, son et texte': { text: 'Bonjour', locale: 'ar', background: { ready: BACKGROUND, mediaType: 'image' as const }, sound: { ready: SOUND } },
  };
  for (const [name, input] of Object.entries(forms)) {
    test(name, () => {
      const effects = buildStoryCanvasEffects(input);
      expect(effects).not.toBeNull();
      const parsed = CanvasV3Schema.safeParse(effects);
      expect(parsed.success).toBe(true);
      expect(unclaimedStoryMediaIds(effects!, studioMediaIds({ background: input.background?.ready, sound: input.sound?.ready }))).toEqual([]);
    });
  }

  test('image, son et texte ⇒ exactement TROIS objets (critère de recette : scenes[0].objects.length === 3)', () => {
    const effects = buildStoryCanvasEffects(forms['image, son et texte']!)!;
    expect(effects.scenes![0]!.objects).toHaveLength(3);
  });
});
