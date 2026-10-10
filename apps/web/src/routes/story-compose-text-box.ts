import type { StudioWritingBox } from '@/lib/stories/studio-writing';

/**
 * LA MESURE DE LA BOÎTE PEINTE PAR LE TEXTE SÉLECTIONNÉ (#6900, extrait de
 * `story-compose.tsx` par #7683 pour tenir le budget de taille — CLAUDE.md
 * racine § « Budget de taille »). Fonctions PURES, sans état ni réseau :
 * l'orchestration (mesure au bon moment, `useLayoutEffect`/`ResizeObserver`)
 * reste dans l'écran.
 *
 * La boîte est celle RÉELLEMENT peinte par `[data-scene-text]` — ni recopiée
 * ni recalculée : la saisie l'ADOPTE (défaut 1, revue-correction #6900),
 * quel que soit le retour à la ligne que le moteur a effectivement rendu.
 *
 * **Sa taille AVANT transformation** (#8681) : la saisie reprend elle-même la
 * pose de l'objet (`studioWritingStyle`), donc elle lit la largeur et la
 * hauteur de MISE EN PAGE (`getComputedStyle`, fractionnaires), jamais
 * l'enveloppe écran d'un texte tourné et agrandi. Et **seulement celle de CET
 * objet** : un texte neuf ne peint rien, et emprunter la boîte du premier
 * texte de la scène posait son invite sur l'autre texte.
 */
export type SceneTextBox = StudioWritingBox;

/** L'élément que le moteur a peint POUR CET OBJET — `[data-scene-object-id]`,
 * posé par `SceneObjectFrame` (#6943). Avec un seul texte, un
 * `querySelector('[data-scene-text]')` suffisait ; avec plusieurs, il désigne
 * le premier venu. */
export function paintedObject(stage: HTMLElement | null, id: string | null): HTMLElement | null {
  if (stage === null || id === null) return null;
  return stage.querySelector<HTMLElement>(`[data-scene-object-id="${CSS.escape(id)}"]`);
}

export function measureSceneText(stage: HTMLElement, id: string | null): SceneTextBox | null {
  const textEl = paintedObject(stage, id)?.querySelector<HTMLElement>('[data-scene-text]') ?? null;
  if (textEl === null) return null;
  const style = getComputedStyle(textEl);
  const width = Number.parseFloat(style.width);
  const height = Number.parseFloat(style.height);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null;
}

export function sameSceneTextBox(a: SceneTextBox | null, b: SceneTextBox | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a.width - b.width) < 0.05 && Math.abs(a.height - b.height) < 0.05;
}
