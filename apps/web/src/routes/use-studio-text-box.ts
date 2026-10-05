import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

import type { StudioTextLayer } from '@/lib/stories/studio-text';
import { measureSceneText, sameSceneTextBox, type SceneTextBox } from '@/routes/story-compose-text-box';

/**
 * **LA BOÎTE DE LA SAISIE** — extraite de `story-compose.tsx` (#8415/#8416,
 * budget de taille) sans changement de comportement.
 */
export function useStudioTextBox({
  stageRef,
  selectedId,
  texts,
  textAppearance,
}: {
  readonly stageRef: { readonly current: HTMLElement | null };
  readonly selectedId: string | null;
  readonly texts: readonly StudioTextLayer[];
  readonly textAppearance: unknown;
}) {
  /** LA SAISIE ADOPTE LA BOÎTE DU TEXTE SÉLECTIONNÉ, jamais une formule
   * recopiée (défaut 1, revue-correction #6900) — `stageRef` porte l'ancêtre
   * positionné commun aux deux. */
  const [textBox, setTextBox] = useState<SceneTextBox | null>(null);

  const remeasureText = useCallback(() => {
    const stage = stageRef.current;
    if (stage === null) return;
    const next = measureSceneText(stage, selectedId);
    setTextBox((current) => (sameSceneTextBox(current, next) ? current : next));
  }, [selectedId]);

  // Chemin RAPIDE, synchrone AVANT peinture : le texte, la sélection ou le
  // style changent toujours par un état React — `useLayoutEffect` remesure
  // dans le MÊME commit, jamais un instant de curseur désaligné.
  useLayoutEffect(() => {
    remeasureText();
  }, [texts, selectedId, textAppearance, remeasureText]);

  // Chemin de SECOURS : le redimensionnement de la CARTE (rotation, fenêtre)
  // change la police en `cqw` sans toucher l'état — le seul cas que le chemin
  // rapide ne voit pas venir. La résolution ASYNCHRONE du chunk `ScenePlayer`
  // est couverte par `onContentReady`, le contrat déjà posé par le moteur.
  useEffect(() => {
    const stage = stageRef.current;
    if (stage === null) return;
    const resizeObserver = new ResizeObserver(remeasureText);
    resizeObserver.observe(stage);
    return () => resizeObserver.disconnect();
  }, [remeasureText]);

  return { textBox, remeasureText };
}
