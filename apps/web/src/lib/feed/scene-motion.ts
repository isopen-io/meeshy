import { isBackgroundAudio, type CanvasDocument, type CanvasObject, type CanvasScene } from '@/lib/canvas/document';
import { authoredDuration } from '@/lib/canvas/pose';

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
 * qualifie le FICHIER, pas une animation posée par l'auteur. L'exclusion
 * elle-même vit dans `authoredDuration` (`lib/canvas/pose.ts`), SITE UNIQUE
 * qu'elle partage avec `visibilityWindow` : les deux la portaient séparément
 * et se contredisaient (revue-correction #6901, T-D3b). */
export function hasTimeWindow(object: CanvasObject): boolean {
  const timing = object.timing;
  if (timing !== undefined && (timing.start !== undefined || timing.end !== undefined || (timing.keyframes?.length ?? 0) > 0)) return true;
  const { payload } = object;
  if (typeof payload.fadeIn === 'number' && payload.fadeIn > 0) return true;
  if (typeof payload.fadeOut === 'number' && payload.fadeOut > 0) return true;
  return authoredDuration(object) !== undefined;
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

/**
 * CE QUI SONNE SUR LA SCÈNE (#9737) — un son de premier plan, une vidéo non
 * muette. Le son de FOND n'en est pas : il ne produit aucun pixel sur la
 * scène, donc ni pastille « son coupé » ni bouton posé dessus ; son crédit,
 * hors scène, le dit et le coupe.
 */
export function documentSoundsOnStage(document: CanvasDocument): boolean {
  return document.scenes.some((scene) => scene.objects.some((object) => objectSounds(object) && !isBackgroundAudio(object)));
}
