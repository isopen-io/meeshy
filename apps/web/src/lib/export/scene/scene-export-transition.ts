import type { CanvasScene } from '@/lib/canvas/document';
import { readSceneTransition, sceneTransitionPose, type SceneTransitionPose } from '@/lib/canvas/scene-transition';

import type { ScenePaintable } from './scene-export-paint';

/**
 * **LA TRANSITION DE LA SLIDE, PEINTE** (#13880) — l'ouverture et la fermeture
 * de la scène (`sceneTransitionPose`, les mêmes constantes que la répétition
 * du studio et que `StoryRenderer` iOS) posées sur TOUTE la scène : fondu par
 * l'opacité, zoom et glissement par la transformation autour du centre,
 * révélation par un cercle de découpe. Ce qui est découvert montre le noir du
 * lecteur. Le filigrane n'en fait pas partie : il est peint après.
 */
export function slideTransitionPose(scene: CanvasScene, elapsedMs: number, durationMs: number | undefined): SceneTransitionPose | null {
  if (durationMs === undefined) return null;
  const opening = readSceneTransition(scene.opening);
  const closing = readSceneTransition(scene.closing);
  if (opening === null && closing === null) return null;
  return sceneTransitionPose({ opening, closing, elapsedMs, durationMs });
}

const isIdentity = (pose: SceneTransitionPose): boolean => pose.opacity === 1 && pose.scale === 1 && pose.translateX === 0 && pose.reveal === null;

export function withSceneTransition(
  ctx: ScenePaintable,
  frame: { readonly width: number; readonly height: number; readonly backdrop: string },
  pose: SceneTransitionPose | null,
  paint: () => void,
): void {
  if (pose === null || isIdentity(pose)) {
    paint();
    return;
  }
  const { width, height } = frame;
  ctx.fillStyle = frame.backdrop;
  ctx.fillRect(0, 0, width, height);
  if (pose.opacity <= 0 || pose.reveal === 0) return;
  ctx.save();
  ctx.globalAlpha = ctx.globalAlpha * pose.opacity;
  if (pose.reveal !== null) {
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, Math.max(1, (pose.reveal * Math.hypot(width, height)) / 2), 0, Math.PI * 2);
    ctx.clip();
  }
  if (pose.scale !== 1 || pose.translateX !== 0) {
    ctx.translate(width / 2 + pose.translateX * width, height / 2);
    ctx.scale(pose.scale, pose.scale);
    ctx.translate(-width / 2, -height / 2);
  }
  paint();
  ctx.restore();
}
