import { describe, expect, test } from 'bun:test';

import { parseCanvasDocument, type CanvasObject, type CanvasScene } from '@/lib/canvas/document';

import { footprintFrame, imageOnlyPresentation, sceneOccupants, type Footprint } from './image-only';

/**
 * `imageOnlyPresentation`/`footprintFrame` (T1/T1b, #6899) — transcription
 * vecteur à vecteur de `StoryImageOnlyPresentationTests.swift` (§ 1.4 de la
 * spécification `stories-lecteur`). Les scènes sont construites par
 * `parseCanvasDocument` sur des documents v3, jamais par des `CanvasObject`
 * fabriqués à la main (leçon 615).
 */

const CANVAS = { width: 1080, height: 1920 };
/** 16:9 — la même paysage que la suite Swift. */
const LANDSCAPE_ASPECT = 1920 / 1080;
/** 1080 de large ⇒ 607,5 de haut, centré : il reste 656,25 de chaque côté. */
const RECT_LANDSCAPE = { x: 0, y: 656.25, width: 1080, height: 607.5 };

function sceneOf(scene: unknown): CanvasScene {
  const doc = parseCanvasDocument({ v: 3, scenes: [scene] });
  const parsed = doc?.scenes[0];
  if (parsed === undefined) throw new Error('vecteur de test invalide : la scène ne parse pas');
  return parsed;
}

function background(overrides?: {
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
  readonly rotation?: number;
  readonly fitMode?: string | null;
}) {
  const { x = 0.5, y = 0.5, scale = 1, rotation = 0, fitMode = 'fit' } = overrides ?? {};
  return {
    id: 'fond',
    kind: 'media',
    anchor: { t: 'free', x, y },
    plane: 'bg',
    z: 0,
    transform: { scale, rotation, opacity: 1 },
    payload: { postMediaId: 'pm-fond', ...(fitMode !== null ? { transform: { videoFitMode: fitMode } } : {}) },
  };
}

function measurerOf(frames: Readonly<Record<string, Footprint>>): (object: CanvasObject) => Footprint | null {
  return (object) => frames[object.id] ?? null;
}

function verdictOf(params: {
  readonly scene: CanvasScene;
  readonly mediaAspect?: number | null;
  readonly frames?: Readonly<Record<string, Footprint>>;
  readonly drawing?: Parameters<typeof imageOnlyPresentation>[0]['drawing'];
}) {
  return imageOnlyPresentation({
    scene: params.scene,
    mediaAspect: params.mediaAspect === undefined ? LANDSCAPE_ASPECT : params.mediaAspect,
    canvasSize: CANVAS,
    ...(params.drawing !== undefined ? { drawing: params.drawing } : {}),
    footprint: measurerOf(params.frames ?? {}),
  });
}

describe('imageOnlyPresentation — le cas de la capture', () => {
  test('une image ajustée SEULE se présente comme l’image', () => {
    const scene = sceneOf({ id: 's1', objects: [background()] });
    expect(verdictOf({ scene })).toEqual({ verdict: 'imageOnly', rect: RECT_LANDSCAPE });
  });

  test('une image PORTRAIT plus étroite que la scène se présente comme l’image', () => {
    const scene = sceneOf({ id: 's1', objects: [background()] });
    expect(verdictOf({ scene, mediaAspect: 500 / 1920 })).toEqual({ verdict: 'imageOnly', rect: { x: 290, y: 0, width: 500, height: 1920 } });
  });
});

describe('imageOnlyPresentation — les objets posés', () => {
  test('un texte ENTIÈREMENT dans l’image garde l’image seule', () => {
    const scene = sceneOf({
      id: 's1',
      objects: [background(), { id: 't', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { text: 'Bonjour' } }],
    });
    const frames = { t: { position: { x: 540, y: 960 }, size: { width: 400, height: 120 } } };
    expect(verdictOf({ scene, frames })).toEqual({ verdict: 'imageOnly', rect: RECT_LANDSCAPE });
  });

  test('un texte sur une BANDE garde le canvas', () => {
    const scene = sceneOf({
      id: 's1',
      objects: [background(), { id: 't', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.9 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { text: 'Légende' } }],
    });
    const frames = { t: { position: { x: 540, y: 1728 }, size: { width: 400, height: 120 } } };
    expect(verdictOf({ scene, frames })).toEqual({ verdict: 'canvas' });
  });

  test('le cadre TRANSFORMÉ, pas le cadre posé — un même objet droit tient, tourné 20° déborde', () => {
    const scene = sceneOf({
      id: 's1',
      objects: [background(), { id: 't', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { text: 'Tourné' } }],
    });
    const straight = { t: { position: { x: 540, y: 960 }, size: { width: 1000, height: 500 } } };
    const rotated = { t: { position: { x: 540, y: 960 }, size: { width: 1000, height: 500 }, rotationDegrees: 20 } };
    expect(verdictOf({ scene, frames: straight })).toEqual({ verdict: 'imageOnly', rect: RECT_LANDSCAPE });
    expect(verdictOf({ scene, frames: rotated })).toEqual({ verdict: 'canvas' });
  });

  test('la tolérance est d’UN point', () => {
    const scene = sceneOf({
      id: 's1',
      objects: [background(), { id: 't', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { text: 'Bord' } }],
    });
    const grazes = { t: { position: { x: 540, y: 656.25 + 50 - 0.5 }, size: { width: 200, height: 100 } } };
    const overflows = { t: { position: { x: 540, y: 656.25 + 50 - 2 }, size: { width: 200, height: 100 } } };
    expect(verdictOf({ scene, frames: grazes })).toEqual({ verdict: 'imageOnly', rect: RECT_LANDSCAPE });
    expect(verdictOf({ scene, frames: overflows })).toEqual({ verdict: 'canvas' });
  });

  test('chaque famille (sticker, lieu, média fg, son) posée sur une bande garde le canvas, dans l’image garde l’image seule', () => {
    const onBand: Footprint = { position: { x: 540, y: 200 }, size: { width: 120, height: 120 } };
    const inImage: Footprint = { position: { x: 540, y: 960 }, size: { width: 120, height: 120 } };
    const families: readonly CanvasObject['kind'][] = ['sticker', 'place', 'media', 'audio'];
    for (const kind of families) {
      const object = { id: 'o', kind, anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: {} };
      const scene = sceneOf({ id: 's1', objects: [background(), object] });
      expect(verdictOf({ scene, frames: { o: onBand } })).toEqual({ verdict: 'canvas' });
      expect(verdictOf({ scene, frames: { o: inImage } })).toEqual({ verdict: 'imageOnly', rect: RECT_LANDSCAPE });
    }
  });

  test('un son de FOND ne compte pas comme un objet visible', () => {
    const scene = sceneOf({
      id: 's1',
      objects: [background(), { id: 'a', kind: 'audio', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { isBackground: true } }],
    });
    expect(verdictOf({ scene })).toEqual({ verdict: 'imageOnly', rect: RECT_LANDSCAPE });
  });

  test('fail-closed : un objet qu’on ne sait pas MESURER garde le canvas', () => {
    const scene = sceneOf({
      id: 's1',
      objects: [background(), { id: 't', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { text: '?' } }],
    });
    expect(verdictOf({ scene })).toEqual({ verdict: 'canvas' });
  });

  test('un objet ANIMÉ par images clés garde le canvas', () => {
    const scene = sceneOf({
      id: 's1',
      objects: [
        background(),
        {
          id: 't',
          kind: 'text',
          anchor: { t: 'free', x: 0.5, y: 0.5 },
          plane: 'fg',
          z: 1,
          transform: { scale: 1, rotation: 0, opacity: 1 },
          timing: { keyframes: [{ time: 1, x: 0.5, y: 0.05 }] },
          payload: { text: 'Bouge' },
        },
      ],
    });
    const frames = { t: { position: { x: 540, y: 960 }, size: { width: 200, height: 100 } } };
    expect(verdictOf({ scene, frames })).toEqual({ verdict: 'canvas' });
  });
});

/**
 * LA FORME RÉELLE DU CORPUS (#6899, revue-correction) — relevée sur
 * `gate.staging.meeshy.me` le 2026-09-17 (« F6 story pano ») : l'objet `bg`
 * ne porte QUE le cadrage (`videoFitMode: "fit"`, aucune image), et le fond
 * qui porte l'image est un objet `content` + `isBackground` posé après lui.
 * L'objet `bg` vide ne peint aucun pixel (le moteur ne peint que le fond élu) :
 * le mesurer comme un média de premier plan — 60 % de la largeur, carré —
 * débordait la bande panoramique et rendait `canvas` à TOUTE story de ce
 * corpus, texte dedans ou non.
 */
describe('imageOnlyPresentation — un fond en deux objets (corpus réel)', () => {
  const stagingScene = (textY: number) =>
    sceneOf({
      id: 's1',
      objects: [
        { id: 'bg', kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { transform: { videoFitMode: 'fit' } } },
        { id: 't', kind: 'text', anchor: { t: 'free', x: 0.5, y: textY }, plane: 'fg', z: 2, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { text: 'F6 story pano' } },
        {
          id: 'pic',
          kind: 'media',
          anchor: { t: 'free', x: 0.5, y: 0.5 },
          plane: 'content',
          z: 1,
          transform: { scale: 1, rotation: 0, opacity: 1 },
          payload: { isBackground: true, postMediaId: 'pm-pano', mediaType: 'image', aspectRatio: 4 },
        },
      ],
    });
  /** 4:1 dans 1080×1920 ⇒ 1080×270, centré : y ∈ [825, 1095]. */
  const RECT_PANO = { x: 0, y: 825, width: 1080, height: 270 };
  const textFrame = (y: number) => ({ t: { position: { x: 540, y }, size: { width: 700, height: 110 } } });

  test('le texte DANS la bande panoramique ⇒ l’image seule, l’objet `bg` vide ne compte pas', () => {
    expect(verdictOf({ scene: stagingScene(0.5), mediaAspect: 4, frames: textFrame(960) })).toEqual({ verdict: 'imageOnly', rect: RECT_PANO });
  });

  test('le même texte posé sur la bande basse ⇒ le canvas', () => {
    expect(verdictOf({ scene: stagingScene(0.9), mediaAspect: 4, frames: textFrame(1728) })).toEqual({ verdict: 'canvas' });
  });

  test('`sceneOccupants` ne rend que ce qui PEINT par-dessus le fond élu', () => {
    expect(sceneOccupants(stagingScene(0.5)).map((o) => o.id)).toEqual(['t']);
  });
});

describe('imageOnlyPresentation — le dessin', () => {
  test('un dessin sur une bande garde le canvas, dans l’image ne le garde pas', () => {
    const scene = sceneOf({ id: 's1', objects: [background()] });
    expect(verdictOf({ scene, drawing: { kind: 'bounds', rect: { x: 100, y: 100, width: 200, height: 50 } } })).toEqual({ verdict: 'canvas' });
    expect(verdictOf({ scene, drawing: { kind: 'bounds', rect: { x: 100, y: 800, width: 200, height: 50 } } })).toEqual({
      verdict: 'imageOnly',
      rect: RECT_LANDSCAPE,
    });
    expect(verdictOf({ scene, drawing: { kind: 'unmeasurable' } })).toEqual({ verdict: 'canvas' });
  });
});

describe('imageOnlyPresentation — ce qui garde la carte, par construction', () => {
  test('une image qui REMPLIT (fitMode absent ou "fill") garde le canvas', () => {
    const filled = sceneOf({ id: 's1', objects: [background({ fitMode: 'fill' })] });
    const free = sceneOf({ id: 's1', objects: [background({ fitMode: null })] });
    expect(verdictOf({ scene: filled })).toEqual({ verdict: 'canvas' });
    expect(verdictOf({ scene: free })).toEqual({ verdict: 'canvas' });
  });

  test('un fond COULEUR (sans média à mesurer) garde le canvas', () => {
    const scene = sceneOf({
      id: 's1',
      objects: [{ id: 'bg', kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { background: '#6366F1' } }],
    });
    expect(verdictOf({ scene, mediaAspect: null })).toEqual({ verdict: 'canvas' });
  });

  test('une VIDÉO de fond ajustée suit la même règle que l’image', () => {
    const scene = sceneOf({ id: 's1', objects: [background()] });
    // Le média est une vidéo : `payload.postMediaId` suffit, la loi ne
    // distingue pas image/vidéo (les deux passent par `backgroundMedia`).
    expect(verdictOf({ scene })).toEqual({ verdict: 'imageOnly', rect: RECT_LANDSCAPE });
  });

  test('un ratio INCONNU (`mediaAspect: null`) ne fabrique pas de rectangle', () => {
    const scene = sceneOf({ id: 's1', objects: [background()] });
    expect(verdictOf({ scene, mediaAspect: null })).toEqual({ verdict: 'canvas' });
  });

  test('un média déjà à la forme de la scène (9:16) garde le canvas', () => {
    const scene = sceneOf({ id: 's1', objects: [background()] });
    expect(verdictOf({ scene, mediaAspect: 1080 / 1920 })).toEqual({ verdict: 'canvas' });
  });
});

describe('imageOnlyPresentation — la pose du fond', () => {
  test('un fond ZOOMÉ qui couvre la scène garde le canvas', () => {
    const scene = sceneOf({ id: 's1', objects: [background({ scale: 4 })] });
    expect(verdictOf({ scene })).toEqual({ verdict: 'canvas' });
  });

  test('un fond DÉPLACÉ rend le rectangle déplacé', () => {
    const scene = sceneOf({ id: 's1', objects: [background({ y: 0.4 })] });
    expect(verdictOf({ scene })).toEqual({ verdict: 'imageOnly', rect: { ...RECT_LANDSCAPE, y: RECT_LANDSCAPE.y - 192 } });
  });

  test('un fond TOURNÉ garde le canvas', () => {
    const scene = sceneOf({ id: 's1', objects: [background({ rotation: 12 })] });
    expect(verdictOf({ scene })).toEqual({ verdict: 'canvas' });
  });
});

describe('footprintFrame — la sémantique de CALayer.frame (T1b)', () => {
  test('un quart de tour autour du centre pivote la boîte englobante', () => {
    const frame = footprintFrame({ position: { x: 100, y: 100 }, size: { width: 100, height: 50 }, rotationDegrees: 90 });
    expect(frame.x).toBeCloseTo(75, 3);
    expect(frame.y).toBeCloseTo(50, 3);
    expect(frame.width).toBeCloseTo(50, 3);
    expect(frame.height).toBeCloseTo(100, 3);
  });

  test('une ancre en haut-gauche pose le cadre depuis la position, sans centrage', () => {
    const frame = footprintFrame({ position: { x: 100, y: 100 }, size: { width: 100, height: 50 }, anchor: { x: 0, y: 0 } });
    expect(frame).toEqual({ x: 100, y: 100, width: 100, height: 50 });
  });
});
