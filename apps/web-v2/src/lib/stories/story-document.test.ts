import { describe, expect, test } from 'bun:test';

import { CanvasV3Schema } from '@meeshy/shared/types/canvas-v3';

import { backgroundMedia, isBackground } from '@/lib/feed/scene-framing';
import { electBackgroundTrack } from '@/lib/canvas/background-sound';
import { parseCanvasDocument } from '@/lib/canvas/document';
import { resolveSceneText } from '@/lib/canvas/text';

import {
  buildPreviewCanvasDocument,
  buildStoryCanvasEffects,
  buildStoryCanvasEffectsPages,
  composeStoryCanvasPages,
  referencedStoryMediaIds,
  studioMediaIds,
  studioMediaKindOf,
  unclaimedStoryMediaIds,
} from './story-document';
import { IDENTITY_POSE } from './studio-pose';
import { newTextLayer, type StudioTextLayer } from './studio-text';

const BACKGROUND = { postMediaId: 'pm-bg', fileUrl: '2026/09/u1/bg.jpg' } as const;
const OVERLAY = { postMediaId: 'pm-ov', fileUrl: '2026/09/u1/sticker.png' } as const;
const SOUND = { postMediaId: 'pm-snd', fileUrl: '2026/09/u1/snd.m4a' } as const;

const txt = (text: string, language = 'fr', partial: Partial<StudioTextLayer> = {}): StudioTextLayer => ({
  ...newTextLayer({ id: 'text-1', language, text }),
  ...partial,
});

describe('studioMediaKindOf — le MOT, jamais un MIME (StoryModels.swift:129-132)', () => {
  test('un MIME vidéo ⇒ "video"', () => expect(studioMediaKindOf('video/mp4')).toBe('video'));
  test('tout le reste ⇒ "image"', () => {
    expect(studioMediaKindOf('image/jpeg')).toBe('image');
    expect(studioMediaKindOf('image/png')).toBe('image');
  });
});

describe('buildStoryCanvasEffects — rien à publier ⇒ null (O3, core.ts:327-365)', () => {
  test('ni texte, ni fond, ni son', () => {
    expect(buildStoryCanvasEffects({ texts: [] })).toBeNull();
  });

  test('un texte fait seulement d’espaces ⇒ null', () => {
    expect(buildStoryCanvasEffects({ texts: [txt('   ')] })).toBeNull();
  });
});

describe('buildStoryCanvasEffects — le fond (§0 de la spécification, correction du plan)', () => {
  test('plane "content" + payload.isBackground: true — JAMAIS "bg" (CanvasV3Migration.swift:776-780)', () => {
    const effects = buildStoryCanvasEffects({ texts: [], background: { source: BACKGROUND, mediaType: 'image' } });
    expect(effects).not.toBeNull();
    const object = effects!.scenes![0]!.objects[0]!;
    expect(object.plane).toBe('content');
    expect(object.payload.isBackground).toBe(true);
    expect(object.payload.mediaType).toBe('image');
    expect(object.payload.postMediaId).toBe(BACKGROUND.postMediaId);
    expect(object.payload.mediaURL).toBe(BACKGROUND.fileUrl);
  });

  test('passe CanvasV3Schema.safeParse — le contrat exact que la passerelle exige derrière CANVAS_V3_WRITE_STRICT', () => {
    const effects = buildStoryCanvasEffects({ texts: [txt('Bonjour')], background: { source: BACKGROUND, mediaType: 'video' } });
    expect(CanvasV3Schema.safeParse(effects).success).toBe(true);
  });

  test('LE MÊME résolveur que le fil (`isBackground`/`backgroundMedia`, lib/feed/scene-framing.ts) reconnaît ce fond', () => {
    const effects = buildStoryCanvasEffects({ texts: [], background: { source: BACKGROUND, mediaType: 'image' } });
    const document = parseCanvasDocument(effects)!;
    const scene = document.scenes[0]!;
    expect(isBackground(scene.objects[0]!)).toBe(true);
    expect(backgroundMedia(scene)?.id).toBe('background');
  });
});

describe('buildStoryCanvasEffects — le rapport et l’empreinte du fond (§0, défaut 7)', () => {
  test('aspectRatio (mesure LOCALE) et thumbHash (accusé TUS) voyagent dans payload — SceneFraming.declaredAspect les relit sans rien télécharger', () => {
    const effects = buildStoryCanvasEffects({
      texts: [],
      background: { source: { ...BACKGROUND, thumbHash: 'abc123' }, mediaType: 'image', aspectRatio: 0.5625 },
    })!;
    const object = effects.scenes![0]!.objects[0]!;
    expect(object.payload.aspectRatio).toBe(0.5625);
    expect(object.payload.thumbHash).toBe('abc123');
  });

  test('aucune mesure ⇒ aucun des deux champs (jamais une valeur inventée)', () => {
    const effects = buildStoryCanvasEffects({ texts: [], background: { source: BACKGROUND, mediaType: 'image' } })!;
    const object = effects.scenes![0]!.objects[0]!;
    expect('aspectRatio' in object.payload).toBe(false);
    expect('thumbHash' in object.payload).toBe(false);
  });

  test('passe CanvasV3Schema.safeParse avec les deux champs posés', () => {
    const effects = buildStoryCanvasEffects({
      texts: [],
      background: { source: { ...BACKGROUND, thumbHash: 'abc123' }, mediaType: 'image', aspectRatio: 1.777 },
    });
    expect(CanvasV3Schema.safeParse(effects).success).toBe(true);
  });
});

describe('buildPreviewCanvasDocument — aspectRatio partagé avec la publication, thumbHash HORS de l’aperçu (§0, défaut 7)', () => {
  test('aspectRatio local connu dès la sélection ⇒ porté par l’aperçu aussi', () => {
    const document = buildPreviewCanvasDocument({
      texts: [],
      background: { source: 'blob:local-1', mediaType: 'image', aspectRatio: 0.5625 },
    })!;
    expect(document.scenes[0]!.objects[0]!.payload.aspectRatio).toBe(0.5625);
  });
});

describe('buildStoryCanvasEffects — le son, EN FOND ou POSÉ (#6943)', () => {
  test('en FOND : kind audio, payload.isBackground true (electBackgroundTrack le lit, background-sound.ts:59)', () => {
    const effects = buildStoryCanvasEffects({ texts: [], sound: { source: SOUND, plane: 'background' } });
    const document = parseCanvasDocument(effects)!;
    const track = electBackgroundTrack({ document, sceneIndex: 0, carrier: { postId: 'draft', media: [] } });
    expect(track?.src).toContain(SOUND.fileUrl.split('/').pop()!);
  });

  test('POSÉ : plan fg, isBackground FALSE — l’élection du fond l’ignore', () => {
    const effects = buildStoryCanvasEffects({ texts: [], sound: { source: SOUND, plane: 'foreground' } })!;
    const audio = effects.scenes![0]!.objects.find((o) => o.kind === 'audio')!;
    expect(audio.plane).toBe('fg');
    expect(audio.payload.isBackground).toBe(false);
    expect(audio.payload.placement).toBe('foreground');
    const document = parseCanvasDocument(effects)!;
    expect(electBackgroundTrack({ document, sceneIndex: 0, carrier: { postId: 'draft', media: [] } })).toBeNull();
  });

  test('les deux plans passent le schéma', () => {
    for (const plane of ['background', 'foreground'] as const) {
      expect(CanvasV3Schema.safeParse(buildStoryCanvasEffects({ texts: [], sound: { source: SOUND, plane } })).success).toBe(true);
    }
  });
});

describe('buildStoryCanvasEffects — le CALQUE d’avant-plan (#6943, « une image en fond OU en front »)', () => {
  test('plan fg, SANS isBackground — le résolveur du fil ne le prend jamais pour le fond', () => {
    const effects = buildStoryCanvasEffects({
      texts: [],
      background: { source: BACKGROUND, mediaType: 'image' },
      overlay: { source: OVERLAY, mediaType: 'image', pose: IDENTITY_POSE },
    })!;
    const scene = parseCanvasDocument(effects)!.scenes[0]!;
    const overlay = scene.objects.find((o) => o.id === 'overlay')!;
    expect(overlay.plane).toBe('fg');
    expect('isBackground' in overlay.payload).toBe(false);
    expect(isBackground(overlay)).toBe(false);
    expect(backgroundMedia(scene)?.id).toBe('background');
  });

  test('le calque porte SA pose — c’est ce qui le rend déplaçable, tournable et redimensionnable', () => {
    const effects = buildStoryCanvasEffects({
      texts: [],
      overlay: { source: OVERLAY, mediaType: 'image', pose: { x: 0.2, y: 0.8, scale: 2.5, rotation: -30 } },
    })!;
    const overlay = effects.scenes![0]!.objects.find((o) => o.id === 'overlay')!;
    expect(overlay.anchor).toEqual({ t: 'free', x: 0.2, y: 0.8 });
    expect(overlay.transform).toEqual({ scale: 2.5, rotation: -30, opacity: 1 });
    expect(CanvasV3Schema.safeParse(effects).success).toBe(true);
  });

  test('un calque SEUL fait encore une story — et reçoit son fond de couleur', () => {
    const effects = buildStoryCanvasEffects({ texts: [], overlay: { source: OVERLAY, mediaType: 'image', pose: IDENTITY_POSE } })!;
    expect(effects.scenes![0]!.objects.some((o) => o.plane === 'bg')).toBe(true);
  });
});

describe('buildStoryCanvasEffects — les objets TEXTE, au pluriel (#6943)', () => {
  test('kind text, plane fg, textColor SANS dièse, fontSize 96, locale portée par l’ENVELOPPE', () => {
    const effects = buildStoryCanvasEffects({ texts: [txt('  Bonjour le monde  ', 'es')] });
    const object = effects!.scenes![0]!.objects.find((o) => o.kind === 'text')!;
    expect(object.plane).toBe('fg');
    expect(object.locale).toBe('es');
    expect(object.payload.text).toBe('  Bonjour le monde  ');
    expect(object.payload.textColor).toBe('FFFFFF');
    expect(object.payload.fontSize).toBe(96);
    // `sourceLanguage` ne voyage PAS dans le payload (CanvasV3Migration.swift:273).
    expect('sourceLanguage' in object.payload).toBe(false);
  });

  test('DEUX textes ⇒ deux objets, deux identifiants, deux poses, deux langues', () => {
    const effects = buildStoryCanvasEffects({
      texts: [
        txt('Bonjour', 'fr', { id: 'text-1', pose: { x: 0.2, y: 0.3, scale: 1, rotation: 0 } }),
        txt('Hello', 'en', { id: 'text-2', pose: { x: 0.8, y: 0.7, scale: 2, rotation: 45 } }),
      ],
    })!;
    const texts = effects.scenes![0]!.objects.filter((o) => o.kind === 'text');
    expect(texts.map((o) => o.id)).toEqual(['text-1', 'text-2']);
    expect(texts.map((o) => o.locale)).toEqual(['fr', 'en']);
    expect(texts[1]!.anchor).toEqual({ t: 'free', x: 0.8, y: 0.7 });
    expect(texts[1]!.transform).toEqual({ scale: 2, rotation: 45, opacity: 1 });
    expect(texts[0]!.z).toBeLessThan(texts[1]!.z);
    expect(CanvasV3Schema.safeParse(effects).success).toBe(true);
  });

  test('un texte VIDE au milieu ne devient pas un objet — rien à peindre, rien à traduire', () => {
    const effects = buildStoryCanvasEffects({
      texts: [txt('Bonjour', 'fr', { id: 'text-1' }), txt('   ', 'fr', { id: 'text-2' }), txt('Hello', 'en', { id: 'text-3' })],
    })!;
    expect(effects.scenes![0]!.objects.filter((o) => o.kind === 'text').map((o) => o.id)).toEqual(['text-1', 'text-3']);
  });

  test('le STYLE choisi voyage — effet, couleur, alignement, pastille', () => {
    const effects = buildStoryCanvasEffects({
      texts: [txt('Bonjour', 'fr', { style: 'typewriter', effect: 'neonPink', color: 'F8B500', align: 'left', background: '000000' })],
    })!;
    const payload = effects.scenes![0]!.objects.find((o) => o.kind === 'text')!.payload;
    expect(payload.textStyle).toBe('typewriter');
    expect(payload.textEffect).toBe('neonPink');
    expect(payload.textColor).toBe('F8B500');
    expect(payload.textAlign).toBe('left');
    expect(payload.backgroundStyle).toEqual({ type: 'solid', hex: '000000' });
    expect(CanvasV3Schema.safeParse(effects).success).toBe(true);
  });

  test('au REPOS, aucun champ posé à vide — un document du studio est indiscernable d’un document iOS', () => {
    const payload = buildStoryCanvasEffects({ texts: [txt('Bonjour')] })!.scenes![0]!.objects.find((o) => o.kind === 'text')!.payload;
    expect('textEffect' in payload).toBe(false);
    expect('backgroundStyle' in payload).toBe(false);
  });
});

describe('buildStoryCanvasEffects — les quatre formes ENSEMBLE', () => {
  test('ordre fond, son, calque, textes', () => {
    const effects = buildStoryCanvasEffects({
      texts: [txt('Légende')],
      background: { source: BACKGROUND, mediaType: 'image' },
      overlay: { source: OVERLAY, mediaType: 'image', pose: IDENTITY_POSE },
      sound: { source: SOUND, plane: 'background' },
    })!;
    const kinds = effects.scenes![0]!.objects.map((o) => o.kind);
    expect(kinds).toEqual(['media', 'audio', 'media', 'text']);
    expect(CanvasV3Schema.safeParse(effects).success).toBe(true);
  });
});

describe('referencedStoryMediaIds / unclaimedStoryMediaIds — la contre-épreuve (§3.3, MEDIA_NOT_CLAIMED)', () => {
  test('cite chaque postMediaId du document, CALQUE COMPRIS', () => {
    const effects = buildStoryCanvasEffects({
      texts: [],
      background: { source: BACKGROUND, mediaType: 'image' },
      overlay: { source: OVERLAY, mediaType: 'image', pose: IDENTITY_POSE },
      sound: { source: SOUND, plane: 'background' },
    })!;
    expect(new Set(referencedStoryMediaIds(effects))).toEqual(
      new Set([BACKGROUND.postMediaId, OVERLAY.postMediaId, SOUND.postMediaId]),
    );
  });

  test('un média RÉFÉRENCÉ mais ABSENT de mediaIds ⇒ signalé (le port refuse d’envoyer)', () => {
    const effects = buildStoryCanvasEffects({ texts: [], background: { source: BACKGROUND, mediaType: 'image' } })!;
    expect(unclaimedStoryMediaIds(effects, [])).toEqual([BACKGROUND.postMediaId]);
    expect(unclaimedStoryMediaIds(effects, [BACKGROUND.postMediaId])).toEqual([]);
  });
});

describe('studioMediaIds — le fond D’ABORD, puis ce qui se pose (StoryViewModel+PublicationUpload.swift:336-338)', () => {
  test('les trois présents, sur UNE page', () => {
    expect(studioMediaIds([{ background: BACKGROUND, overlay: OVERLAY, sound: SOUND }])).toEqual([
      BACKGROUND.postMediaId,
      OVERLAY.postMediaId,
      SOUND.postMediaId,
    ]);
  });
  test('seulement le son', () => {
    expect(studioMediaIds([{ sound: SOUND }])).toEqual([SOUND.postMediaId]);
  });
  test('aucune page', () => {
    expect(studioMediaIds([])).toEqual([]);
  });
  test('une page vide', () => {
    expect(studioMediaIds([{}])).toEqual([]);
  });
  test('PLUSIEURS PAGES (#7684) — PAGE PAR PAGE, fond puis calque puis son sur CHACUNE', () => {
    const OTHER_BACKGROUND = { postMediaId: 'pm-bg-2', fileUrl: 'bg2.jpg' };
    expect(studioMediaIds([{ background: BACKGROUND, sound: SOUND }, { background: OTHER_BACKGROUND, overlay: OVERLAY }])).toEqual([
      BACKGROUND.postMediaId,
      SOUND.postMediaId,
      OTHER_BACKGROUND.postMediaId,
      OVERLAY.postMediaId,
    ]);
  });
});

describe('buildPreviewCanvasDocument — l’aperçu, sur des URL LOCALES (§1.4, l’aperçu ne dépend pas de la montée)', () => {
  test('rien encore posé ⇒ null', () => {
    expect(buildPreviewCanvasDocument({ texts: [] })).toBeNull();
  });

  test('le fond LOCAL est reconnu par le MÊME résolveur que le fil', () => {
    const document = buildPreviewCanvasDocument({ texts: [], background: { source: 'blob:local-1', mediaType: 'image' } })!;
    const scene = document.scenes[0]!;
    expect(isBackground(scene.objects[0]!)).toBe(true);
    expect(scene.objects[0]!.payload.mediaURL).toBe('blob:local-1');
  });

  test('les quatre formes composées, dans le même ordre que le document publié', () => {
    const document = buildPreviewCanvasDocument({
      texts: [txt('Bonjour')],
      background: { source: 'blob:bg', mediaType: 'video' },
      overlay: { source: 'blob:ov', mediaType: 'image', pose: IDENTITY_POSE },
      sound: { source: 'blob:snd', plane: 'background' },
    })!;
    expect(document.scenes[0]!.objects.map((o) => o.kind)).toEqual(['media', 'audio', 'media', 'text']);
  });
});

describe('l’aperçu et la publication sortent du MÊME composeur — jamais deux constructions qui divergent', () => {
  test('mêmes objets, mêmes charges ; seules les ADRESSES diffèrent (URL locale contre identité serveur)', () => {
    const texts = [txt('Bonjour', 'fr', { effect: 'glow', align: 'right', pose: { x: 0.3, y: 0.4, scale: 1.5, rotation: 12 } })];
    const published = buildStoryCanvasEffects({
      texts,
      background: { source: BACKGROUND, mediaType: 'video' },
      overlay: { source: OVERLAY, mediaType: 'image', pose: { x: 0.7, y: 0.2, scale: 0.8, rotation: -5 } },
      sound: { source: SOUND, plane: 'foreground' },
    })!;
    const preview = buildPreviewCanvasDocument({
      texts,
      background: { source: 'blob:bg', mediaType: 'video' },
      overlay: { source: 'blob:ov', mediaType: 'image', pose: { x: 0.7, y: 0.2, scale: 0.8, rotation: -5 } },
      sound: { source: 'blob:snd', plane: 'foreground' },
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
      expect(object.anchor).toEqual(twin.anchor);
      expect(object.transform).toEqual(twin.transform);
      expect(object.locale).toBe(twin.locale);
      expect(withoutAddress(object.payload)).toEqual(withoutAddress(twin.payload));
    });
    expect(previewObjects[0]!.payload.mediaURL).toBe('blob:bg');
    expect('postMediaId' in previewObjects[0]!.payload).toBe(false);
  });
});

describe('une vidéo de fond sous un son de fond joue MUETTE (question 9.10, CanvasV3Migration.swift:549-552)', () => {
  test('vidéo + son ⇒ muted true, volume 0 ; vidéo seule ⇒ aucune consigne de muet', () => {
    const withSound = buildStoryCanvasEffects({
      texts: [],
      background: { source: BACKGROUND, mediaType: 'video' },
      sound: { source: SOUND, plane: 'background' },
    })!;
    expect(withSound.scenes![0]!.objects[0]!.payload.muted).toBe(true);
    expect(withSound.scenes![0]!.objects[0]!.payload.volume).toBe(0);
    const alone = buildStoryCanvasEffects({ texts: [], background: { source: BACKGROUND, mediaType: 'video' } })!;
    expect('muted' in alone.scenes![0]!.objects[0]!.payload).toBe(false);
  });
});

describe('le texte composé se RELIT au Prisme du lecteur (leçon 261 : un rang AUTRE que le premier)', () => {
  test('texte écrit en es, lecteur [fr, es], aucune traduction ⇒ servi en es, au rang 2', () => {
    const document = parseCanvasDocument(buildStoryCanvasEffects({ texts: [txt('Hola a todos', 'es')] }))!;
    const served = resolveSceneText({ object: document.scenes[0]!.objects.find((o) => o.kind === 'text')!, preferredLanguages: ['fr', 'es'] });
    expect(served.text).toBe('Hola a todos');
    expect(served.language).toBe('es');
  });

  test('DEUX textes de langues différentes descendent CHACUN son propre prisme', () => {
    const document = parseCanvasDocument(
      buildStoryCanvasEffects({ texts: [txt('Bonjour', 'fr', { id: 'text-1' }), txt('Hola', 'es', { id: 'text-2' })] }),
    )!;
    const objects = document.scenes[0]!.objects.filter((o) => o.kind === 'text');
    expect(resolveSceneText({ object: objects[0]!, preferredLanguages: ['de', 'fr'] }).language).toBe('fr');
    expect(resolveSceneText({ object: objects[1]!, preferredLanguages: ['de', 'fr'] }).language).toBe('es');
  });
});

describe('une story SANS visuel porte un fond de COULEUR — un texte blanc ne se pose jamais sur l’aplat clair d’une carte', () => {
  test('texte seul ⇒ un objet bg de couleur (la forme que CanvasV3Migration.swift:830-833 relit) puis le texte ; valide au schéma', () => {
    const effects = buildStoryCanvasEffects({ texts: [txt('Bonjour')] })!;
    const [plain, text] = effects.scenes![0]!.objects;
    expect(plain!.plane).toBe('bg');
    expect(plain!.kind).toBe('media');
    expect(typeof plain!.payload.background).toBe('string');
    expect(text!.kind).toBe('text');
    expect(CanvasV3Schema.safeParse(effects).success).toBe(true);
    expect(referencedStoryMediaIds(effects)).toEqual([]);
  });

  test('un visuel posé ⇒ AUCUN fond de couleur (le fond est le visuel) ; rien posé ⇒ aucun document', () => {
    const withVisual = buildStoryCanvasEffects({ texts: [txt('Bonjour')], background: { source: BACKGROUND, mediaType: 'image' } })!;
    expect(withVisual.scenes![0]!.objects.some((o) => o.plane === 'bg')).toBe(false);
    expect(buildPreviewCanvasDocument({ texts: [] })).toBeNull();
  });
});

describe('CHAQUE forme que le composeur peut produire passe CanvasV3Schema — la preuve qui remplace une validation à l’exécution', () => {
  const forms: Readonly<Record<string, Parameters<typeof buildStoryCanvasEffects>[0]>> = {
    'texte seul': { texts: [txt('Bonjour')] },
    'deux textes stylés': {
      texts: [
        txt('Bonjour', 'fr', { id: 'text-1', effect: 'longShadow', background: '6366F1' }),
        txt('Hello', 'en', { id: 'text-2', style: 'classic', align: 'right', pose: { x: 0.1, y: 0.9, scale: 0.5, rotation: 180 } }),
      ],
    },
    'son de fond seul': { texts: [], sound: { source: SOUND, plane: 'background' } },
    'son POSÉ et texte': { texts: [txt('Bonjour')], sound: { source: SOUND, plane: 'foreground' } },
    'image seule': { texts: [], background: { source: BACKGROUND, mediaType: 'image' as const } },
    'calque seul': { texts: [], overlay: { source: OVERLAY, mediaType: 'image' as const, pose: IDENTITY_POSE } },
    'vidéo et son': { texts: [], background: { source: BACKGROUND, mediaType: 'video' as const }, sound: { source: SOUND, plane: 'background' } },
    'fond, calque, son et deux textes': {
      texts: [txt('Bonjour', 'ar', { id: 'text-1' }), txt('Hello', 'en', { id: 'text-2' })],
      background: { source: BACKGROUND, mediaType: 'image' as const },
      overlay: { source: OVERLAY, mediaType: 'image' as const, pose: { x: 0.25, y: 0.75, scale: 3, rotation: -90 } },
      sound: { source: SOUND, plane: 'foreground' },
    },
  };
  for (const [name, input] of Object.entries(forms)) {
    test(name, () => {
      const effects = buildStoryCanvasEffects(input);
      expect(effects).not.toBeNull();
      const parsed = CanvasV3Schema.safeParse(effects);
      expect(parsed.success).toBe(true);
      expect(
        unclaimedStoryMediaIds(
          effects!,
          studioMediaIds([{ background: input.background?.source, overlay: input.overlay?.source, sound: input.sound?.source }]),
        ),
      ).toEqual([]);
    });
  }

  test('fond, calque, son et deux textes ⇒ exactement CINQ objets', () => {
    const effects = buildStoryCanvasEffects(forms['fond, calque, son et deux textes']!)!;
    expect(effects.scenes![0]!.objects).toHaveLength(5);
  });
});

describe('composeStoryCanvasPages / buildStoryCanvasEffectsPages — plusieurs SCÈNES et la disposition (#7684)', () => {
  const address = (ref: { readonly postMediaId: string; readonly fileUrl: string }) => ({ postMediaId: ref.postMediaId, mediaURL: ref.fileUrl });

  test('deux pages ⇒ scenes.length === 2, scenes[i].id === page.id, chaque scène avec SES objets', () => {
    const effects = composeStoryCanvasPages(
      [
        { id: 'page-1', texts: [], background: { address: address(BACKGROUND), mediaType: 'image' } },
        { id: 'page-2', texts: [txt('Deux', 'fr', { id: 'text-2' })] },
      ],
      null,
    )!;
    expect(effects.scenes).toHaveLength(2);
    expect(effects.scenes!.map((s) => s.id)).toEqual(['page-1', 'page-2']);
    expect(effects.scenes![0]!.objects[0]!.id).toBe('background');
    expect(effects.scenes![1]!.objects.some((o) => o.kind === 'text')).toBe(true);
  });

  test('les identifiants `background`/`overlay`/`sound` sont CONSERVÉS dans CHAQUE scène', () => {
    const effects = composeStoryCanvasPages(
      [
        { id: 'page-1', texts: [], background: { address: address(BACKGROUND), mediaType: 'image' }, sound: { address: address(SOUND), plane: 'background' } },
        { id: 'page-2', texts: [], overlay: { address: address(OVERLAY), mediaType: 'image', pose: IDENTITY_POSE } },
      ],
      null,
    )!;
    expect(effects.scenes![0]!.objects.map((o) => o.id).includes('background')).toBe(true);
    expect(effects.scenes![0]!.objects.map((o) => o.id).includes('sound')).toBe(true);
    expect(effects.scenes![1]!.objects.map((o) => o.id).includes('overlay')).toBe(true);
  });

  test('une page SANS matière ne produit AUCUNE scène ; toutes vides ⇒ `null`', () => {
    const effects = composeStoryCanvasPages(
      [
        { id: 'page-1', texts: [txt('Une')] },
        { id: 'page-2', texts: [txt('   ')] },
      ],
      null,
    )!;
    expect(effects.scenes).toHaveLength(1);
    expect(effects.scenes![0]!.id).toBe('page-1');
    expect(composeStoryCanvasPages([{ id: 'page-1', texts: [txt('   ')] }], null)).toBeNull();
  });

  test('`layout` : posé quand scenes.length >= 2 ET layout choisi ; ABSENT (clé non présente) sur une scène OU sans choix', () => {
    const twoPages = [{ id: 'page-1', texts: [txt('Une')] }, { id: 'page-2', texts: [txt('Deux', 'fr', { id: 'text-2' })] }];
    const withLayout = composeStoryCanvasPages(twoPages, 'hero')!;
    expect(withLayout.layout).toBe('hero');

    const withoutChoice = composeStoryCanvasPages(twoPages, null)!;
    expect('layout' in withoutChoice).toBe(false);

    const onePage = composeStoryCanvasPages([twoPages[0]!], 'hero')!;
    expect('layout' in onePage).toBe(false);
  });

  test('le document à deux scènes + layout: "hero" passe CanvasV3Schema (le contrat exact de core.ts:112-121)', () => {
    const effects = composeStoryCanvasPages(
      [
        { id: 'page-1', texts: [], background: { address: address(BACKGROUND), mediaType: 'image' } },
        { id: 'page-2', texts: [], background: { address: address(OVERLAY), mediaType: 'image' } },
      ],
      'hero',
    );
    expect(CanvasV3Schema.safeParse(effects).success).toBe(true);
  });

  test('buildStoryCanvasEffectsPages — chaque média porte son identité SERVEUR, ordonné par page', () => {
    const effects = buildStoryCanvasEffectsPages(
      [
        { id: 'page-1', texts: [], background: { source: BACKGROUND, mediaType: 'image' } },
        { id: 'page-2', texts: [], background: { source: OVERLAY, mediaType: 'image' } },
      ],
      'wave',
    )!;
    expect(referencedStoryMediaIds(effects)).toEqual([BACKGROUND.postMediaId, OVERLAY.postMediaId]);
    expect(effects.layout).toBe('wave');
    expect(CanvasV3Schema.safeParse(effects).success).toBe(true);
  });

  test('UNE SEULE page produit exactement le document que composeStoryCanvas aurait produit', () => {
    const single = buildStoryCanvasEffects({ texts: [txt('Bonjour')], background: { source: BACKGROUND, mediaType: 'image' } })!;
    const paged = buildStoryCanvasEffectsPages([{ id: 'scene-0', texts: [txt('Bonjour')], background: { source: BACKGROUND, mediaType: 'image' } }], null)!;
    expect(paged.scenes![0]!.objects).toEqual(single.scenes![0]!.objects);
    expect('layout' in paged).toBe(false);
  });
});
