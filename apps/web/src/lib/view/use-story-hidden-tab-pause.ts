import { useEffect, useRef } from 'react';

/**
 * **L'ONGLET CACHÉ NE CONSOMME PAS UNE STORY** (#7116, extraction hors budget
 * — miroir web de `scenePhase == .background ⇒ isPresented = false`,
 * `StoryViewerView.swift:614-622`) — EXTRAIT de `routes/story.tsx` (§
 * périmètre de la spécification « L'auteur d'une story voit qui l'a vue, la
 * partage et l'enregistre », déjà à 996 lignes avant ce lot) : une extraction
 * PURE, aucun comportement observable ne change — même motif que
 * `use-comments-sheet-host.ts` (« 1020 → 992 lignes »).
 *
 * `requestAnimationFrame` s'arrête quand l'onglet passe en arrière-plan, mais
 * l'horloge de la story se calcule depuis `performance.now()`, qui, lui,
 * continue : au retour, le PREMIER tick trouvait `ratio >= 1` et avalait la
 * story sans que personne ne l'ait vue. On met donc en pause à la disparition
 * et on ne reprend qu'une pause qu'on a soi-même posée — une pause voulue par
 * l'utilisateur (appui long, double-tap) survit au passage en arrière-plan.
 */
export function useStoryHiddenTabPause(params: { readonly paused: boolean; readonly pause: () => void; readonly resume: () => void }): void {
  const { paused, pause, resume } = params;
  const hiddenPauseRef = useRef(false);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        hiddenPauseRef.current = !paused;
        if (!paused) pause();
        return;
      }
      if (!hiddenPauseRef.current) return;
      hiddenPauseRef.current = false;
      resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [paused, pause, resume]);
}
