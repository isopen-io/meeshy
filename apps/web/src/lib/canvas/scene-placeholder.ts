import { backgroundMedia } from '@/lib/feed/scene-framing';
import { thumbHashImage } from '@/lib/media/thumbhash-image';

import type { CanvasObject, CanvasScene } from './document';

/**
 * **L'ATTENTE D'UNE SCÈNE EST DESSINÉE** (#5047) — le `thumbHash` que le
 * contrat transporte se peint tant que les pixels du média n'ont pas
 * paru, comme iOS (`StoryBackgroundLayer.swift`, placeholder synchrone sous
 * l'image et la vidéo de fond, absent sur un cache chaud).
 */

const hashOf = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

/** Sous le MÉDIA de fond : son empreinte, à défaut celle du composite. */
export function backgroundPlaceholderHash(object: CanvasObject, scene: CanvasScene): string | undefined {
  return hashOf(object.payload.thumbHash) ?? hashOf(scene.thumbHash);
}

/** La scène ENTIÈRE, avant le moteur : le composite, à défaut le fond. */
export function scenePlaceholderHash(scene: CanvasScene): string | undefined {
  return hashOf(scene.thumbHash) ?? hashOf(backgroundMedia(scene)?.payload.thumbHash);
}

/** L'image de cette attente, `undefined` sans empreinte lisible. */
export function sceneWaitingImage(scene: CanvasScene): string | undefined {
  return thumbHashImage(scenePlaceholderHash(scene));
}

const ARRIVAL_MEMORY = 512;
const arrived = new Set<string>();

/** Un média déjà peint dans la session se reposera sans placeholder ni fondu. */
export function mediaHasArrived(src: string): boolean {
  return arrived.has(src);
}

export function noteMediaArrived(src: string): void {
  arrived.delete(src);
  arrived.add(src);
  if (arrived.size <= ARRIVAL_MEMORY) return;
  const oldest = arrived.values().next().value;
  if (oldest !== undefined) arrived.delete(oldest);
}
