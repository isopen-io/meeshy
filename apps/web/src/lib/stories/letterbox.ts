import { SCENE_BACKDROP_TINT, type SceneBackdrop, type SceneBackdropTint } from '@/lib/canvas/backdrop';
import type { BackgroundFraming } from '@/lib/canvas/background';
import type { CanvasScene } from '@/lib/canvas/document';
import { thumbHashImage } from '@/lib/media/thumbhash-image';
import { backgroundMedia, isBackground } from '@/lib/feed/scene-framing';

/**
 * `letterboxBands`/`letterboxIsServed`/`letterboxHashes` (T2, #6899) — miroir
 * de `StoryLetterboxFill.swift` (§ 1.5 de la spécification `stories-lecteur`) :
 * ce qu'un média AJUSTÉ (`.fit`) laisse voir du canvas derrière lui, une
 * SURFACE de composition, jamais un vide (directive porteur 2026-08-31).
 */

export type LetterboxBands =
  | { readonly side: 'none'; readonly thickness: 0 }
  /** Au-dessus ET en dessous — un média PAYSAGE dans une scène verticale. */
  | { readonly side: 'horizontal'; readonly thickness: number }
  /** À gauche ET à droite — un média plus vertical encore que la scène. */
  | { readonly side: 'vertical'; readonly thickness: number };

const NONE: LetterboxBands = { side: 'none', thickness: 0 };

/** Sous ce seuil, la bande est un artefact d'arrondi : rien à habiller
 * (`StoryLetterboxFill.minimumBandPoints`, `StoryLetterboxFill.swift:52`). */
export const LETTERBOX_MINIMUM_BAND = 1;

/** L'opacité de la bande peinte (`StoryLetterboxFill.fillOpacity`,
 * `StoryLetterboxFill.swift:138`) : assez pour teinter, jamais assez pour
 * rivaliser avec le média qu'elle encadre. */
export const LETTERBOX_FILL_OPACITY = 0.85;

export function letterboxBands(params: {
  readonly media: { readonly width: number; readonly height: number };
  readonly canvas: { readonly width: number; readonly height: number };
}): LetterboxBands {
  const { media, canvas } = params;
  if (media.width <= 0 || media.height <= 0 || canvas.width <= 0 || canvas.height <= 0) return NONE;
  const mediaRatio = media.width / media.height;
  const canvasRatio = canvas.width / canvas.height;
  if (mediaRatio > canvasRatio) {
    const renderedHeight = canvas.width / mediaRatio;
    const thickness = (canvas.height - renderedHeight) / 2;
    return thickness >= LETTERBOX_MINIMUM_BAND ? { side: 'horizontal', thickness } : NONE;
  }
  if (mediaRatio < canvasRatio) {
    const renderedWidth = canvas.height * mediaRatio;
    const thickness = (canvas.width - renderedWidth) / 2;
    return thickness >= LETTERBOX_MINIMUM_BAND ? { side: 'vertical', thickness } : NONE;
  }
  return NONE;
}

/**
 * `StoryLetterboxFill.isServed` — le remplissage n'existe qu'en mode AJUSTÉ
 * (`"fit"`) ET avec une source à peindre : en mode rempli (le défaut), le
 * média couvre déjà le canvas.
 */
export function letterboxIsServed(params: { readonly fitMode: string | undefined; readonly hasSource: boolean }): boolean {
  return params.fitMode === 'fit' && params.hasSource;
}

const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value !== '';

/**
 * `StoryLetterboxFill.candidateHashes` — la cascade des sources, dans l'ordre
 * où on les essaie : le FOND d'abord (ses pixels touchent le bord de la
 * bande), puis les médias de premier plan par z DÉCROISSANT (le collage le
 * plus haut donne le mieux la teinte quand aucun fond n'existe), le hash de
 * la SCÈNE (le composite entier) en dernier — la source la moins juste pour
 * l'intérieur d'une bande collée à un média précis, la plus juste pour
 * habiller l'extérieur.
 *
 * Le hash d'un objet `media` voyage dans SA PROPRE charge
 * (`payload.thumbHash`, `CanvasV3Migration.swift:587` : reporté à la
 * conversion v1→v3), jamais via le porteur — un document v3 natif peut ne
 * déclarer AUCUN thumbHash sur ses médias, auquel cas seul `scene.thumbHash`
 * reste.
 */
export function letterboxHashes(scene: CanvasScene): readonly string[] {
  // Le fond que le moteur PEINT (`backgroundMedia`, l'élection partagée avec
  // `scene-player.tsx`) — jamais le premier objet de fond venu : sur le corpus
  // réel, un objet `bg` sans image précède le fond qui porte l'image.
  const background = backgroundMedia(scene);
  const foreground = scene.objects
    .filter((o) => o.kind === 'media' && o.id !== background?.id && !isBackground(o))
    .sort((a, b) => b.z - a.z);
  const ordered = [background, ...foreground].map((o) => (typeof o?.payload.thumbHash === 'string' ? o.payload.thumbHash : undefined));
  ordered.push(scene.thumbHash);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const hash of ordered) {
    if (!nonEmptyString(hash) || seen.has(hash)) continue;
    seen.add(hash);
    result.push(hash);
  }
  return result;
}

/** Ce qui se peint dans les bandes d'un fond AJUSTÉ (#8414). */
export type LetterboxFill =
  /** Le média lui-même (une image) ou son thumbhash étiré (une vidéo),
   * floutés à la peinture. */
  | { readonly kind: 'blur'; readonly src: string }
  /** Une teinte pleine du contrat du Cadre (`lib/canvas/backdrop.ts`). */
  | { readonly kind: 'tint'; readonly backdrop: SceneBackdropTint; readonly color: string };

/**
 * **LE FOND CHOISI AU CADRE, PEINT DANS LES BANDES** (#8414) — la loi que le
 * lecteur ET le composer relisent : un fond qui remplit n'a pas de bande ; une
 * teinte se peint telle quelle ; le flou (le défaut) peint l'IMAGE de fond
 * elle-même, ou — pour une vidéo, dont on ne floute pas une seconde lecture —
 * le thumbhash complet de la cascade (`letterboxHashes`). Sans rien de tout
 * cela, aucune bande : la surface reste, comme `StoryLetterboxFill.Source.none`.
 */
export function letterboxFill(params: {
  readonly fitMode: BackgroundFraming;
  readonly backdrop: SceneBackdrop;
  readonly mediaSrc: string | undefined;
  readonly mediaIsImage: boolean;
  readonly hashes: readonly string[];
}): LetterboxFill | undefined {
  if (params.fitMode !== 'fit') return undefined;
  if (params.backdrop !== 'blur') return { kind: 'tint', backdrop: params.backdrop, color: SCENE_BACKDROP_TINT[params.backdrop] };
  if (params.mediaIsImage && params.mediaSrc !== undefined) return { kind: 'blur', src: params.mediaSrc };
  const hashed = params.hashes.map((hash) => thumbHashImage(hash)).find((src): src is string => src !== undefined);
  return hashed === undefined ? undefined : { kind: 'blur', src: hashed };
}
