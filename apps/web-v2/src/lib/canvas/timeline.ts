import { hasTimeWindow } from '@/lib/feed/scene-motion';

import type { CanvasScene } from './document';
import { visibilityWindow } from './pose';

/**
 * L'HORLOGE D'UNE SCÈNE (#6901, D6) — décide QUAND une scène a besoin d'une
 * horloge du tout : une scène sans objet temporisé ne planifie AUCUN `rAF`
 * (T-E5). `hasTimeWindow` (`lib/feed/scene-motion.ts:24-32`) est RÉUTILISÉE,
 * jamais recopiée — c'est le site UNIQUE déjà partagé par
 * `background-sound.ts` (D11, dette assumée et CONSIGNÉE : § 9, Q6 de la
 * spécification — déplacer `scene-motion` sous `lib/canvas/` est un lot de
 * rangement séparé).
 */
export function hasTimedObjects(scene: CanvasScene): boolean {
  return scene.objects.some(hasTimeWindow);
}

/**
 * `sceneDurationSeconds` — `timelineDuration` (AUTORITAIRE quand positif
 * fini, #6899 T5) sinon la fin résolue la plus tardive parmi les objets
 * temporisés, sinon `null` (aucune durée connue — une scène sans horloge n'a
 * rien à jouer en boucle).
 */
export function sceneDurationSeconds(scene: CanvasScene): number | null {
  if (typeof scene.timelineDuration === 'number' && Number.isFinite(scene.timelineDuration) && scene.timelineDuration > 0) {
    return scene.timelineDuration;
  }
  let max: number | null = null;
  for (const object of scene.objects) {
    if (!hasTimeWindow(object)) continue;
    const { end } = visibilityWindow(object);
    if (!Number.isFinite(end)) continue;
    if (max === null || end > max) max = end;
  }
  return max;
}
