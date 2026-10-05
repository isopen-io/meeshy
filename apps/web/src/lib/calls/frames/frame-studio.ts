import type { Size } from '../call-montage-shapes';
import { captureFrames } from './frame-catalogue';
import { framesFor, moodsFor, reconcileFrame } from './frame-filter';
import { loadFrameFonts } from './frame-fonts';
import { paintFrame, type FrameFace } from './frame-paint';
import type { Surface2D } from './frame-paint-kit';
import { composeFrame, defaultCanvasFactory, frameLayerCache, type CanvasFactory } from './frame-render';
import type { CaptureFrame, FrameMood } from './frame-spec';
import type { FramePerson, FrameTexts } from './frame-text';

/**
 * **L'ATELIER DES CADRES** (#8742, #8743) — l'entrée du chunk que le mode
 * Montage charge À SON ENTRÉE (`budgets.json` › `call_frame_studio`), jamais
 * avec l'écran d'appel : le catalogue, le filtre par nombre de personnes, la
 * réconciliation quand ce nombre change, et le rendu en couches.
 *
 * Deux caches de couches, bornés par l'usage : les VIGNETTES (petites, la
 * fenêtre visible du carrousel et ses retours) et l'APERÇU (deux entrées :
 * le cadre choisi et celui qu'on vient de quitter — à 540 × 960, deux
 * toiles de 2 Mo chacune). La photo à pleine résolution se peint d'un seul
 * trait, sans cache : la garder coûterait 16 Mo pour une image prise une fois.
 *
 * Les polices des cadres se chargent à la création de l'atelier ; les
 * couches peintes avant elles sont jetées quand elles arrivent, et se
 * repeignent à l'image suivante.
 */

/** Une vidéo de l'appel, telle que `visibleTiles` la lit : à qui elle est, et ce qu'elle montre. */
export type FrameFaceTile = {
  readonly source: CanvasImageSource;
  readonly size: Size;
  readonly fit: 'cover' | 'contain';
  readonly member: string | null;
  readonly self: boolean;
};

const showsPerson = (person: FramePerson) => (tile: FrameFaceTile): boolean => (person.isSelf ? tile.self : !tile.self && tile.member === person.id);

/**
 * Le visage de chaque personne, dans l'ordre des personnes : sa caméra
 * plutôt que son écran partagé, `null` sans vidéo — le cadre peint alors
 * son initiale, jamais une case retirée (spec § 2).
 */
export function frameFaces(people: readonly FramePerson[], tiles: readonly FrameFaceTile[]): readonly (FrameFace | null)[] {
  return people.map((person) => {
    const shown = tiles.filter(showsPerson(person));
    const best = shown.find((tile) => tile.fit === 'cover') ?? shown[0];
    return best === undefined ? null : { source: best.source, size: best.size };
  });
}

/** Ce qu'une image d'un cadre peint : les personnes, leurs visages (même ordre), les textes, la taille de la toile. */
export type FrameShot = {
  readonly people: readonly FramePerson[];
  readonly faces: readonly (FrameFace | null)[];
  readonly texts: FrameTexts;
  readonly size: Size;
};

/** `thumb` et `preview` réutilisent leurs couches ; `still` (la photo) se peint entière. */
export type FrameTier = 'thumb' | 'preview' | 'still';

export type FrameStudio = {
  readonly frames: readonly CaptureFrame[];
  /** Les ambiances qui ont au moins un cadre pour `people` personnes, dans l'ordre canonique. */
  readonly moods: (people: number) => readonly FrameMood[];
  readonly framesOf: (people: number, mood: FrameMood) => readonly CaptureFrame[];
  /** Le cadre `id` servi à `people` personnes, ou la variante de son motif, ou un cadre de son ambiance ; `null` sinon. */
  readonly reconcile: (id: string, people: number) => CaptureFrame | null;
  readonly find: (id: string) => CaptureFrame | null;
  /** `frameFaces`, remis à qui n'importe pas ce chunk. */
  readonly faces: typeof frameFaces;
  readonly draw: (context: Surface2D, frame: CaptureFrame, shot: FrameShot, tier: FrameTier) => void;
  /** Les polices des cadres, chargées (ou abandonnées : un échec rend la pile native). */
  readonly ready: Promise<void>;
};

const THUMB_LAYERS = 24;

const PREVIEW_LAYERS = 2;

type StudioOptions = {
  readonly frames?: readonly CaptureFrame[];
  readonly factory?: CanvasFactory;
  readonly fonts?: Pick<FontFaceSet, 'load'> | undefined;
};

export function createFrameStudio(options: StudioOptions = {}): FrameStudio {
  const frames = options.frames ?? captureFrames();
  const factory = options.factory ?? defaultCanvasFactory;
  const caches = { thumb: frameLayerCache(factory, THUMB_LAYERS), preview: frameLayerCache(factory, PREVIEW_LAYERS) };
  const fonts = 'fonts' in options ? options.fonts : typeof document === 'undefined' ? undefined : document.fonts;
  const ready = loadFrameFonts(frames, fonts).then(() => {
    caches.thumb.clear();
    caches.preview.clear();
  });
  const byId = new Map(frames.map((frame) => [frame.id, frame]));
  return {
    frames,
    moods: (people) => moodsFor(frames, people),
    framesOf: (people, mood) => framesFor(frames, people, mood),
    reconcile: (id, people) => reconcileFrame(frames, id, people),
    find: (id) => byId.get(id) ?? null,
    faces: frameFaces,
    draw: (context, frame, shot, tier) => {
      const layers = tier === 'still' ? null : caches[tier].get(frame, shot.people, shot.size, shot.texts);
      if (layers === null) paintFrame(context, frame, shot.people, shot.faces, shot.texts, shot.size);
      else composeFrame(context, layers, shot.faces);
    },
    ready,
  };
}
