import { readMediaCrop } from '@meeshy/shared/utils/media-crop';

import { fitScene } from '@/lib/canvas/fit';
import type { CanvasObject, CanvasScene } from '@/lib/canvas/document';

/**
 * LE CADRAGE D'UNE SCÈNE DE FIL — miroir de `SceneFraming.swift`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Story/SceneFraming.swift`) et de
 * `SceneCarouselLayout` du même fichier (#6898, § 1.2 et § 5.2 de la
 * spécification).
 *
 * « Une carte de fil cadre la scène sur son CONTENU, pas sur son gabarit »
 * (directive porteur 2026-09-06) : le cadre est l'union de la bande du média
 * de fond et des ancres des objets visibles, jamais la composition 9:16
 * entière. Les sept cotes ci-dessous sont GARDÉES par
 * `scripts/lib/curve-scene-framing.mjs` (PARTIE 13 de `check-curve.mjs`) —
 * toute dérivation d'une valeur y fait tomber le gate.
 */

export const SCENE_ASPECT = 9 / 16;
export const OBJECT_PADDING = 0.16;
export const MINIMUM_SIDE = 0.42;
export const BAND_TOP_Y = 0.12;
export const BAND_BOTTOM_Y = 0.88;
/** Le plafond de hauteur d'une carte de fil (#6767) — SOURCE UNIQUE partagée
 * avec `lib/feed/layout.ts` (`POST_MEDIA_RATIO_BOUNDS.max`, D-70/#6898 § 5.2) :
 * deux cartes voisines ne peuvent pas plafonner à deux hauteurs différentes. */
export const MAX_CARD_HEIGHT_RATIO = 1.4;
/** Le seuil sous lequel un cadre couvre « toute » la scène (`focus`) — la
 * comparaison stricte à 1 rendrait un cadre qui déborde d'un rien par erreur
 * d'arrondi flottant, la même garde que `SceneFraming.swift:262`. */
export const FULL_HEIGHT_THRESHOLD = 0.999;

export const MIN_CARD_ASPECT = 1 / MAX_CARD_HEIGHT_RATIO;

export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
export type Size = { readonly width: number; readonly height: number };

const KNOWN_VISIBLE_KINDS: ReadonlySet<string> = new Set(['text', 'media', 'sticker', 'place', 'drawing']);

/** Un objet qui ne produit aucun pixel ne cadre rien — `audio`, `mention`, et
 * tout `kind` que le lecteur ne reconnaît pas (le catch-all `.reserved`
 * côté Swift). */
export function isVisible(object: CanvasObject): boolean {
  return KNOWN_VISIBLE_KINDS.has(object.kind);
}

/** Le fond ne se reconnaît PAS à son seul plan (#6708, mesuré en
 * production) : un `media` en plan `content` avec `payload.isBackground`
 * compte aussi. */
export function isBackground(object: CanvasObject): boolean {
  return object.kind === 'media' && (object.plane === 'bg' || object.payload.isBackground === true);
}

const nonEmptyString = (value: unknown): boolean => typeof value === 'string' && value !== '';

/** Le rapport DÉCLARÉ par l'objet — `payload.aspectRatio`, positif. */
export function declaredAspect(object: CanvasObject): number | undefined {
  const value = object.payload.aspectRatio;
  return typeof value === 'number' && value > 0 ? value : undefined;
}

/** Un objet porte-t-il des pixels À LUI — une adresse, une identité de média,
 * ou une forme déclarée ? Élargi à `mediaId` (§ 3.3.2, en plus de
 * `postMediaId`) : le web lit les deux clés que la passerelle accepte. */
export function carriesPicture(object: CanvasObject): boolean {
  if (nonEmptyString(object.payload.mediaURL)) return true;
  if (nonEmptyString(object.payload.postMediaId)) return true;
  if (nonEmptyString(object.payload.mediaId)) return true;
  return declaredAspect(object) !== undefined;
}

/** Le fond de la scène : le premier objet de fond qui PORTE une image, sinon
 * le premier objet de fond tout court (le porteur de couleur/cadrage). */
export function backgroundMedia(scene: CanvasScene): CanvasObject | undefined {
  return scene.objects.find((o) => isBackground(o) && carriesPicture(o)) ?? scene.objects.find(isBackground);
}

export function backgroundAspect(scene: CanvasScene): number | undefined {
  const fond = backgroundMedia(scene);
  return fond === undefined ? undefined : declaredAspect(fond);
}

/** Cette scène montre-t-elle quelque chose ? Un fond de couleur nu n'est pas
 * « quelque chose » — il remplit le cadre sans rien y placer. */
export function showsSomething(scene: CanvasScene): boolean {
  return scene.objects.some((object) => {
    if (!isVisible(object)) return false;
    if (!isBackground(object)) return true;
    return carriesPicture(object);
  });
}

/** Un objet qui PEINT quelque chose par-dessus le fond. */
function showsPixels(object: CanvasScene['objects'][number]): boolean {
  if (!isVisible(object)) return false;
  return !isBackground(object) || carriesPicture(object);
}

/** La bande qu'occupe un média de fond posé en boîte aux lettres (`.fit`). */
export function backgroundBand(aspect: number): Rect {
  if (aspect <= SCENE_ASPECT) return { x: 0, y: 0, width: 1, height: 1 };
  const height = SCENE_ASPECT / aspect;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

/** La boîte d'un objet, autour de son ancre et à la marge près — l'échelle de
 * l'objet module la marge, bornée à [0.5, 3]. */
export function anchorBox(object: CanvasObject): Rect {
  const center =
    object.anchor.t === 'free' ? { x: object.anchor.x, y: object.anchor.y } : { x: 0.5, y: object.anchor.edge === 'top' ? BAND_TOP_Y : BAND_BOTTOM_Y };
  const factor = Math.min(Math.max(object.transform.scale, 0.5), 3);
  const margin = OBJECT_PADDING * factor;
  return { x: center.x - margin, y: center.y - margin, width: margin * 2, height: margin * 2 };
}

function unionRect(a: Rect, b: Rect): Rect {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Le plancher ne s'applique QU'à ce qui est DEVINÉ (les ancres d'objets),
 * jamais à une bande MESURÉE — la regonfler rajouterait le vide que le
 * cadrage sert à retirer. */
export function enforceMinimum(rect: Rect): Rect {
  let r = rect;
  if (r.width < MINIMUM_SIDE) {
    const d = (MINIMUM_SIDE - r.width) / 2;
    r = { x: r.x - d, y: r.y, width: r.width + 2 * d, height: r.height };
  }
  if (r.height < MINIMUM_SIDE) {
    const d = (MINIMUM_SIDE - r.height) / 2;
    r = { x: r.x, y: r.y - d, width: r.width, height: r.height + 2 * d };
  }
  return r;
}

/** Le cadre ne resserre QUE la hauteur (directive porteur 2026-09-06) — un
 * cadre plus étroit que la scène forcerait un zoom au rendu. */
export function fullWidth(rect: Rect): Rect {
  return { x: 0, y: rect.y, width: 1, height: rect.height };
}

/** Ramener dans la scène en GLISSANT, jamais en rognant. */
export function clampToScene(rect: Rect): Rect {
  let r = rect;
  if (r.width >= 1) r = { ...r, x: 0, width: 1 };
  else r = { ...r, x: Math.min(Math.max(r.x, 0), 1 - r.width) };
  if (r.height >= 1) r = { ...r, y: 0, height: 1 };
  else r = { ...r, y: Math.min(Math.max(r.y, 0), 1 - r.height) };
  return r;
}

const untouchedTolerance = 0.001;

/** Le fond tel qu'il ENTRE : échelle 1, sans rotation, centré, sans
 * recadrage déclaré — condition d'`imageAspect`. */
function isUntouched(object: CanvasObject): boolean {
  if (Math.abs(object.transform.scale - 1) >= untouchedTolerance) return false;
  if (Math.abs(object.transform.rotation) >= untouchedTolerance) return false;
  if ((object.timing?.keyframes ?? []).length > 0) return false;
  if (object.anchor.t !== 'free') return false;
  if (Math.abs(object.anchor.x - 0.5) >= untouchedTolerance) return false;
  if (Math.abs(object.anchor.y - 0.5) >= untouchedTolerance) return false;
  // `readMediaCrop` rend `null` à la fois pour « aucune clé » et « recadrage
  // plein » (voir son doc-comment) — c'est exactement le fait qu'`isUntouched`
  // vérifie ici : un recadrage RÉEL, seul, casse l'intouché.
  return readMediaCrop(object.payload) === null;
}

/**
 * **La zone à montrer dans une carte de fil** — `null` quand il n'y a rien à
 * resserrer (le cadre couvrirait la scène entière, ou la scène ne porte rien
 * de visible).
 */
export function focus(scene: CanvasScene, backgroundAspectOverride?: number): Rect | null {
  const fond = backgroundMedia(scene);
  let band: Rect | undefined;
  const aspect = fond === undefined ? undefined : (backgroundAspectOverride ?? declaredAspect(fond));
  if (fond !== undefined && aspect !== undefined && aspect > 0) band = backgroundBand(aspect);

  let anchors: Rect | undefined;
  for (const object of scene.objects) {
    if (!showsPixels(object) || object.id === fond?.id) continue;
    const box = anchorBox(object);
    anchors = anchors === undefined ? box : unionRect(anchors, box);
  }
  if (anchors !== undefined) anchors = enforceMinimum(anchors);

  let result: Rect | undefined;
  if (band !== undefined) result = band;
  if (anchors !== undefined) result = result === undefined ? anchors : unionRect(result, anchors);
  if (result === undefined) return null;

  result = clampToScene(fullWidth(result));
  if (result.height >= FULL_HEIGHT_THRESHOLD) return null;
  return result;
}

/** Le rapport que la carte doit adopter — dérivé du cadre, `undefined` ⇒
 * garder le 9:16. */
export function cardAspect(scene: CanvasScene, backgroundAspectOverride?: number): number | undefined {
  const cadre = focus(scene, backgroundAspectOverride);
  if (cadre === null || cadre.height <= 0) return undefined;
  return (cadre.width * SCENE_ASPECT) / cadre.height;
}

/**
 * **Le rapport de l'IMAGE, quand la scène n'est qu'une image plus large
 * qu'elle** (#6697) — échoue FERMÉE : tout objet en plus, un fond touché, une
 * image pas plus large que la scène, ou une scène qui porte déjà son cadre
 * (`carrierAspect`) rendent `undefined`.
 */
export function imageAspect(scene: CanvasScene): number | undefined {
  if (scene.carrierAspect !== undefined) return undefined;
  const fond = backgroundMedia(scene);
  if (fond === undefined || !carriesPicture(fond)) return undefined;
  const rapport = declaredAspect(fond);
  if (rapport === undefined || rapport <= SCENE_ASPECT) return undefined;
  if (!isUntouched(fond)) return undefined;
  const rest = scene.objects.filter((o) => o.id !== fond.id);
  if (rest.some(showsPixels)) return undefined;
  return rapport;
}

/** La fenêtre d'une carte de fil : `focus`, sauf pour une scène qui n'est
 * qu'une image — celle-là se présente à son propre rapport. */
export function cardFocus(scene: CanvasScene): Rect | null {
  return imageAspect(scene) === undefined ? focus(scene) : null;
}

/** `SceneFraming.clampedCardAspect` — le rapport NATUREL, plafonné au
 * `MIN_CARD_ASPECT` (jamais l'inverse : un rapport déjà large n'est pas
 * touché). */
export function clampedCardAspect(naturalAspect: number): number {
  return Math.max(naturalAspect, MIN_CARD_ASPECT);
}

/** `SceneFraming.cappedCardContentSize` — le contenu à son rapport NATUREL,
 * ajusté (aspect-fit) dans la boîte déjà plafonnée. Délègue à `fitScene`
 * (`lib/canvas/fit.ts`) — SOURCE UNIQUE de l'ajustement, partagée avec le
 * moteur de scène (D-79). */
export function cappedContentSize(naturalAspect: number, box: Size): Size {
  return fitScene({ viewport: box, ratio: naturalAspect });
}

/** `SceneCarouselLayout.pageAspect` — une page qui ne montre rien s'abstient
 * (`undefined`), les autres votent leur propre rapport ou le gabarit 9:16. */
export function pageAspect(scene: CanvasScene): number | undefined {
  const propre = cardAspect(scene);
  if (propre !== undefined) return propre;
  return showsSomething(scene) ? SCENE_ASPECT : undefined;
}

/** `SceneCarouselLayout.cardAspect` — la page la plus HAUTE (rapport le plus
 * PETIT) vote pour toutes ; une scène sans exigence ne vote pas ; le gabarit
 * 9:16 sert de défaut si aucune scène ne s'exprime. */
export function carouselAspect(scenes: readonly CanvasScene[]): number {
  const votes = scenes.map(pageAspect).filter((v): v is number => v !== undefined);
  return votes.length === 0 ? SCENE_ASPECT : Math.min(...votes);
}
