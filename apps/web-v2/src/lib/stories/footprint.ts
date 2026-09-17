import { declaredAspect } from '@/lib/feed/scene-framing';
import { resolveSceneText } from '@/lib/canvas/text';
import type { CanvasObject } from '@/lib/canvas/document';

import type { Footprint } from './image-only';

/**
 * `sceneFootprint` (T11, #6899) — LE MESUREUR DE PRODUCTION que
 * `StorySceneLayer` injecte dans `imageOnlyPresentation` (`image-only.ts`),
 * miroir de `StorySceneFootprint.swift` (§ 1.4 de la spécification
 * `stories-lecteur`, mesureur injecté).
 *
 * Un `media` se DÉDUIT de sa formule — la MÊME que `MediaLayer`
 * (`components/scene-player.tsx:159-182` : ancre × canvas, 60 % de la
 * largeur, hauteur au rapport déclaré) — jamais du DOM : le rendu réel
 * dépend du chargement de l'image, que la loi d'image-seule ne doit pas
 * attendre.
 *
 * Un `text` se MESURE réellement : un nœud hors-écran, stylé comme
 * `TextLayer` (même police, même `white-space`), rendu dans l'HÔTE fourni
 * par l'appelant, puis retiré. **Échoue FERMÉ** : sous un hôte qui ne fait
 * pas de vraie mise en page (`happy-dom`, un hôte non encore attaché), la
 * mesure rend 0×0 et ce module rend `null` — jamais un cadre inventé.
 *
 * `sticker`/`place`/`drawing` : le moteur de scène ne les peint pas encore
 * (#6901) — non mesurables, `null`, comme la puce de son côté iOS
 * (`StorySceneFootprint.swift:20-22`).
 */
export type SceneFootprintParams = {
  readonly object: CanvasObject;
  readonly canvasSize: { readonly width: number; readonly height: number };
  readonly preferredLanguages: readonly string[];
  /** Un élément DÉJÀ attaché au document, de la largeur du canvas rendu —
   * le mesureur y pose un nœud hors-écran puis le retire, sans jamais
   * laisser de résidu. */
  readonly host: HTMLElement;
};

function anchorFraction(object: CanvasObject): readonly [number, number] {
  return object.anchor.t === 'free' ? [object.anchor.x, object.anchor.y] : [0.5, object.anchor.edge === 'top' ? 0.12 : 0.88];
}

function mediaFootprint(object: CanvasObject, canvasSize: SceneFootprintParams['canvasSize']): Footprint {
  const [x, y] = anchorFraction(object);
  const width = canvasSize.width * 0.6;
  const aspect = declaredAspect(object) ?? 1;
  return { position: { x: x * canvasSize.width, y: y * canvasSize.height }, size: { width, height: width / aspect } };
}

function textFootprint(params: SceneFootprintParams): Footprint | null {
  const { object, canvasSize, preferredLanguages, host } = params;
  const resolved = resolveSceneText({ object, preferredLanguages });
  if (resolved.text === '') return null;

  const [x, y] = anchorFraction(object);
  const node = host.ownerDocument.createElement('span');
  node.style.position = 'absolute';
  node.style.visibility = 'hidden';
  node.style.pointerEvents = 'none';
  node.style.whiteSpace = 'pre-wrap';
  node.style.textAlign = 'center';
  node.style.maxWidth = '85%';
  node.style.lineHeight = '1.2';
  // `TextLayer` rend en `font-semibold` : une mesure en graisse normale
  // sous-estimerait la largeur, et un texte qui déborde passerait pour tenir.
  node.style.fontWeight = '600';
  // `fontSize` de `TextLayer` est posé en `cqw` (fraction de la LARGEUR DU
  // CANVAS RENDU) : hors du conteneur `container-type: inline-size` du
  // moteur, l'équivalent en pixels du même pourcentage de la même largeur
  // est la MÊME valeur numérique.
  node.style.fontSize = `${resolved.widthFraction * canvasSize.width}px`;
  node.textContent = resolved.text;
  host.appendChild(node);
  // La boîte de MISE EN PAGE (`offsetWidth`/`offsetHeight`), jamais
  // `getBoundingClientRect()` : l'hôte est la scène dans ses bornes
  // intrinsèques, que la carte du lecteur réduit par un `transform: scale()`
  // (`readerCardFraming`) — un rectangle client mesurerait le texte RÉDUIT,
  // et un texte qui déborde de quelques pour cent passerait pour tenir.
  const width = node.offsetWidth;
  const height = node.offsetHeight;
  node.remove();

  if (!(width > 0) || !(height > 0)) return null;
  return { position: { x: x * canvasSize.width, y: y * canvasSize.height }, size: { width, height } };
}

export function sceneFootprint(params: SceneFootprintParams): Footprint | null {
  const { object } = params;
  if (object.kind === 'media') return mediaFootprint(object, params.canvasSize);
  if (object.kind === 'text') return textFootprint(params);
  // `sticker`/`place`/`drawing`/`audio`/`mention` : non peints par ce moteur
  // (#6901) — fail-closed, jamais une mesure devinée.
  return null;
}
