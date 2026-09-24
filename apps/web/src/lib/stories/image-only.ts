import { readMediaCrop } from '@meeshy/shared/utils/media-crop';

import { fitScene } from '@/lib/canvas/fit';
import { backgroundFraming } from '@/lib/canvas/background';
import type { CanvasObject, CanvasScene } from '@/lib/canvas/document';
import { backgroundMedia, carriesPicture, isBackground } from '@/lib/feed/scene-framing';

import { letterboxBands } from './letterbox';

/**
 * `imageOnlyPresentation` (#6636, T1/T1b, #6899) — **une story qui n'est
 * qu'une image se présente comme l'image**, miroir de
 * `StoryImageOnlyPresentation.swift` (SDK) transcrit vecteur à vecteur
 * (`StoryImageOnlyPresentationTests.swift`, § 1.4 de la spécification
 * `stories-lecteur`).
 *
 * Une loi PURE qui rend un VERDICT, jamais une vue : elle ne mesure pas les
 * objets — leur cadre dépend du rendu (une police, un gabarit de sticker) —
 * un MESUREUR INJECTÉ le lui donne. **Elle échoue FERMÉE** : un objet qu'on
 * ne sait pas mesurer, animé par images clés, un fond tourné, un ratio
 * inconnu — la carte (`canvas`) reste. Rendre la carte à tort coûte un flou
 * de trop ; la retirer à tort coupe un texte que l'auteur a posé.
 */

export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type ImageOnlyVerdict = { readonly verdict: 'canvas' } | { readonly verdict: 'imageOnly'; readonly rect: Rect };

export type DrawingExtent = { readonly kind: 'none' } | { readonly kind: 'bounds'; readonly rect: Rect } | { readonly kind: 'unmeasurable' };

/**
 * **Ce que le rendu pose sur un calque**, dans le repère du canvas —
 * `Footprint` (Swift) : `position`, `size`, `anchor` (défaut le centre) et la
 * rotation en DEGRÉS (défaut 0).
 */
export type Footprint = {
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly anchor?: { readonly x: number; readonly y: number };
  readonly rotationDegrees?: number;
};

/** Un point : l'arrondi d'une mesure de texte ne ramène pas la carte. */
export const OVERFLOW_TOLERANCE = 1;

/** Sous ce seuil, un fond « tourné » est un zéro flottant, pas une pose. */
const BACKGROUND_ROTATION_TOLERANCE = 0.01;

const growRect = (rect: Rect, amount: number): Rect => ({
  x: rect.x - amount,
  y: rect.y - amount,
  width: rect.width + 2 * amount,
  height: rect.height + 2 * amount,
});

const containsRect = (outer: Rect, inner: Rect): boolean =>
  outer.x <= inner.x && outer.y <= inner.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

const intersectRect = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
};

/**
 * `Footprint.frame` — LA SÉMANTIQUE DE `CALayer.frame` (T1b) : la boîte
 * englobante des bornes tournées AUTOUR DU POINT D'ANCRAGE (jamais du
 * centre de la scène). Une rotation `rotationDegrees` positive suit le sens
 * de `CGAffineTransform(rotationAngle:)`.
 */
export function footprintFrame(footprint: Footprint): Rect {
  const anchor = footprint.anchor ?? { x: 0.5, y: 0.5 };
  const rotation = footprint.rotationDegrees ?? 0;
  const { width, height } = footprint.size;
  const local: Rect = { x: -width * anchor.x, y: -height * anchor.y, width, height };
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corners = [
    { x: local.x, y: local.y },
    { x: local.x + local.width, y: local.y },
    { x: local.x + local.width, y: local.y + local.height },
    { x: local.x, y: local.y + local.height },
  ].map((c) => ({ x: c.x * cos - c.y * sin, y: c.x * sin + c.y * cos }));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX + footprint.position.x, y: minY + footprint.position.y, width: maxX - minX, height: maxY - minY };
}

function drawingStaysInside(drawing: DrawingExtent, envelope: Rect): boolean {
  if (drawing.kind === 'none') return true;
  if (drawing.kind === 'unmeasurable') return false;
  return containsRect(envelope, drawing.rect);
}

/** Une animation par images clés DÉPLACE l'objet : sa pose de départ ne dit
 * rien de là où il passera — seuls `text`/`media`/`audio` portent des
 * `timing.keyframes` dans ce dépôt ; `sticker`/`place`/`drawing` ne sont
 * jamais réputés animés par cette loi (miroir exact du `switch` Swift). */
function isAnimated(object: CanvasObject): boolean {
  if (object.kind !== 'text' && object.kind !== 'media' && object.kind !== 'audio') return false;
  return (object.timing?.keyframes?.length ?? 0) > 0;
}

function anchorFraction(object: CanvasObject): readonly [number, number] {
  return object.anchor.t === 'free' ? [object.anchor.x, object.anchor.y] : [0.5, object.anchor.edge === 'top' ? 0.12 : 0.88];
}

/**
 * `StoryImageOnlyPresentation.visibleImageRect` — le rectangle que le fond
 * peint réellement, `null` quand il n'y a pas de bande à retirer (média qui
 * REMPLIT, tourné, recadré, zoomé jusqu'à couvrir, ratio inconnu…).
 */
function visibleImageRect(params: {
  readonly scene: CanvasScene;
  readonly background: CanvasObject;
  readonly mediaAspect: number | null;
  readonly canvasSize: { readonly width: number; readonly height: number };
}): Rect | null {
  const { scene, background, mediaAspect, canvasSize } = params;
  if (backgroundFraming(scene) !== 'fit') return null;
  if (readMediaCrop(background.payload) !== null) return null;
  if (Math.abs(background.transform.rotation) >= BACKGROUND_ROTATION_TOLERANCE) return null;
  if (!(background.transform.scale > 0)) return null;
  if (mediaAspect === null || !(mediaAspect > 0)) return null;
  if (letterboxBands({ media: { width: mediaAspect, height: 1 }, canvas: canvasSize }).side === 'none') return null;

  const fitted = fitScene({ viewport: canvasSize, ratio: mediaAspect });
  const size = { width: fitted.width * background.transform.scale, height: fitted.height * background.transform.scale };
  const [anchorX, anchorY] = anchorFraction(background);
  const centre = { x: canvasSize.width * anchorX, y: canvasSize.height * anchorY };
  const pose: Rect = { x: centre.x - size.width / 2, y: centre.y - size.height / 2, width: size.width, height: size.height };
  const sceneRect: Rect = { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height };
  const visible = intersectRect(pose, sceneRect);
  if (visible === null || visible.width <= 0 || visible.height <= 0) return null;

  const coversScene = containsRect(growRect(visible, OVERFLOW_TOLERANCE), sceneRect);
  return coversScene ? null : visible;
}

/** Un son de FOND (`kind: 'audio'`, `payload.isBackground: true`) ne se voit
 * sur aucun pixel : il ne compte pas comme un objet à mesurer, contrairement
 * à un son NON-fond (la puce de lecture, mesurable et donc soumise à la
 * même règle que tout autre objet visible). */
const isBackgroundSound = (object: CanvasObject): boolean => object.kind === 'audio' && object.payload.isBackground === true;

/**
 * **CE QUI OCCUPE LA SCÈNE PAR-DESSUS SON FOND** — les objets que la loi doit
 * mesurer, et dont l'absence fait d'une story une image SEULE
 * (`story-scene-layer.tsx` n'y monte alors aucun moteur).
 *
 * Sont écartés : le fond ÉLU (`backgroundMedia`, celui que le moteur peint),
 * un son de fond, et un objet de FOND qui ne porte AUCUNE image — sur le
 * corpus réel (`gate.staging.meeshy.me`, 2026-09-17) l'objet `bg` ne porte
 * que le cadrage et le fond peint est un autre objet `isBackground` : le
 * compter comme un média de premier plan faisait déborder une bande qu'il ne
 * dessine pas. Un fond qui porte une image et n'est PAS élu reste compté
 * (fail-closed : on ne sait pas ce qu'il deviendra).
 */
export function sceneOccupants(scene: CanvasScene): readonly CanvasObject[] {
  const fond = backgroundMedia(scene);
  return scene.objects.filter(
    (o) => o.id !== fond?.id && !isBackgroundSound(o) && !(isBackground(o) && !carriesPicture(o)),
  );
}

export function imageOnlyPresentation(params: {
  readonly scene: CanvasScene;
  /** Le rapport RÉEL du média (largeur/hauteur), tel que décodé — `null`
   * quand il n'est pas encore connu ou que le fond n'est pas une image/vidéo
   * (un fond de couleur, notamment). */
  readonly mediaAspect: number | null;
  readonly canvasSize: { readonly width: number; readonly height: number };
  readonly drawing?: DrawingExtent;
  readonly footprint: (object: CanvasObject) => Footprint | null;
}): ImageOnlyVerdict {
  const { scene, mediaAspect, canvasSize, footprint } = params;
  const drawing = params.drawing ?? { kind: 'none' as const };
  const background = backgroundMedia(scene);
  if (background === undefined) return { verdict: 'canvas' };

  const image = visibleImageRect({ scene, background, mediaAspect, canvasSize });
  if (image === null) return { verdict: 'canvas' };

  const envelope = growRect(image, OVERFLOW_TOLERANCE);
  if (!drawingStaysInside(drawing, envelope)) return { verdict: 'canvas' };

  for (const object of sceneOccupants(scene)) {
    if (isAnimated(object)) return { verdict: 'canvas' };
    const measured = footprint(object);
    if (measured === null) return { verdict: 'canvas' };
    if (!containsRect(envelope, footprintFrame(measured))) return { verdict: 'canvas' };
  }

  return { verdict: 'imageOnly', rect: image };
}
