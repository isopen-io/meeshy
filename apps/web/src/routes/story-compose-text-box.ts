/**
 * LA MESURE DE LA BOÎTE PEINTE PAR LE TEXTE SÉLECTIONNÉ (#6900, extrait de
 * `story-compose.tsx` par #7683 pour tenir le budget de taille — CLAUDE.md
 * racine § « Budget de taille »). Fonctions PURES, sans état ni réseau :
 * l'orchestration (mesure au bon moment, `useLayoutEffect`/`ResizeObserver`)
 * reste dans l'écran.
 *
 * La boîte est celle RÉELLEMENT peinte par `[data-scene-text]`, relative à la
 * carte — ni recopiée ni recalculée : la saisie l'ADOPTE telle quelle (défaut
 * 1, revue-correction #6900), quel que soit le retour à la ligne ou la
 * largeur que le moteur a effectivement rendus.
 */
export type SceneTextBox = { readonly top: number; readonly left: number; readonly width: number; readonly height: number };

/** L'élément que le moteur a peint POUR CET OBJET — `[data-scene-object-id]`,
 * posé par `SceneObjectFrame` (#6943). Avec un seul texte, un
 * `querySelector('[data-scene-text]')` suffisait ; avec plusieurs, il désigne
 * le premier venu. */
export function paintedObject(stage: HTMLElement | null, id: string | null): HTMLElement | null {
  if (stage === null || id === null) return null;
  return stage.querySelector<HTMLElement>(`[data-scene-object-id="${CSS.escape(id)}"]`);
}

export function measureSceneText(stage: HTMLElement, id: string | null): SceneTextBox | null {
  const painted = paintedObject(stage, id);
  const textEl = painted?.querySelector<HTMLElement>('[data-scene-text]') ?? stage.querySelector<HTMLElement>('[data-scene-text]');
  if (textEl === null || textEl === undefined) return null;
  const stageRect = stage.getBoundingClientRect();
  const textRect = textEl.getBoundingClientRect();
  return { top: textRect.top - stageRect.top, left: textRect.left - stageRect.left, width: textRect.width, height: textRect.height };
}

export function sameSceneTextBox(a: SceneTextBox | null, b: SceneTextBox | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a.top - b.top) < 0.05 && Math.abs(a.left - b.left) < 0.05 && Math.abs(a.width - b.width) < 0.05 && Math.abs(a.height - b.height) < 0.05;
}
