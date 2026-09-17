import type { CanvasDocument, CanvasObject, CanvasScene } from '@/lib/canvas/document';

/**
 * LE MOUVEMENT D'UNE SCÈNE — miroir de `SceneMotion.swift`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/SceneMotion.swift`, #6898).
 * Décide QUAND une tuile arrêtée doit montrer un glyphe de lecture, et
 * QUAND l'indicateur « son coupé » a un sens à afficher.
 */

/** Un `media` dont le type MIME commence par `video`. */
export function isVideoObject(object: CanvasObject): boolean {
  return object.kind === 'media' && typeof object.payload.mediaType === 'string' && object.payload.mediaType.startsWith('video');
}

/** Un objet sonne-t-il ? Un audio toujours ; une vidéo sauf `muted: true`. */
export function objectSounds(object: CanvasObject): boolean {
  if (object.kind === 'audio') return true;
  if (isVideoObject(object)) return object.payload.muted !== true;
  return false;
}

/** Une fenêtre temporelle DÉCLARÉE — jamais sur un média, dont `duration`
 * qualifie le FICHIER, pas une animation posée par l'auteur. */
export function hasTimeWindow(object: CanvasObject): boolean {
  const timing = object.timing;
  if (timing !== undefined && (timing.start !== undefined || timing.end !== undefined || (timing.keyframes?.length ?? 0) > 0)) return true;
  const { payload } = object;
  if (typeof payload.fadeIn === 'number' && payload.fadeIn > 0) return true;
  if (typeof payload.fadeOut === 'number' && payload.fadeOut > 0) return true;
  if (object.kind !== 'media' && typeof payload.duration === 'number' && payload.duration > 0) return true;
  return false;
}

/** Un objet BOUGE : audio, vidéo, sticker animé, ou toute fenêtre temporelle. */
export function objectMoves(object: CanvasObject): boolean {
  if (object.kind === 'audio') return true;
  if (isVideoObject(object)) return true;
  if (object.kind === 'sticker' && object.payload.animation !== undefined) return true;
  return hasTimeWindow(object);
}

export function isSceneCinematic(scene: CanvasScene): boolean {
  if (scene.opening !== undefined || scene.closing !== undefined || (scene.clipTransitions?.length ?? 0) > 0) return true;
  return scene.objects.some(objectMoves);
}

export function isDocumentCinematic(document: CanvasDocument): boolean {
  if (document.sound !== undefined) return true;
  return document.scenes.some(isSceneCinematic);
}

export function isDocumentAudible(document: CanvasDocument): boolean {
  if (document.sound !== undefined) return true;
  return document.scenes.some((scene) => scene.objects.some(objectSounds));
}
