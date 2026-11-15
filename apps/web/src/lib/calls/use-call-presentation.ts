import { useEffect, type RefObject } from 'react';
import { useStore } from 'zustand/react';

import { useConversationViewingSuspension } from '@/lib/view/use-conversation-viewing';

import { callCoversScreen, interruptPlayback, presentationModeFor } from './call-presentation';
import { callStore, isCallLive } from './call-store';

/**
 * **LA COUCHE D'APPEL MONTE AU-DESSUS DE CE QUI LA COUVRIRAIT** (#8727) — le
 * branchement DOM de `call-presentation.ts`, posé par `CallLayer` sur son
 * `<dialog>` englobant (ouvert NON modal par son attribut `open` : aucune
 * étape de focus, on continue d'écrire sous la pastille).
 *
 * - l'écran d'appel couvre et une feuille MODALE étrangère est ouverte ⇒ la
 *   couche se rouvre en modale : dernière de la couche supérieure, elle passe
 *   au-dessus et la feuille devient inerte le temps de l'appel ;
 * - réduite ou raccrochée ⇒ elle redevient NON modale (attribut `open`, sans
 *   voler le focus) : la feuille d'en dessous revit, intacte ;
 * - un élément étranger en plein écran (`requestFullscreen`) est quitté à
 *   l'arrivée de l'écran d'appel ;
 * - à l'arrivée de l'appel, ce qui joue hors de la couche se met en pause ;
 * - tant que l'écran d'appel couvre, l'utilisateur quitte « ici » (#9065) :
 *   réduire l'appel le rend à la conversation qu'il a sous les yeux.
 */

const isModal = (dialog: HTMLDialogElement): boolean => {
  try {
    return dialog.matches(':modal');
  } catch {
    return false;
  }
};

const foreignModalOpen = (dialog: HTMLDialogElement): boolean =>
  [...document.querySelectorAll('dialog')].some((other) => other !== dialog && !dialog.contains(other) && other.open && isModal(other));

function leaveForeignFullscreen(dialog: HTMLDialogElement): void {
  const element = document.fullscreenElement;
  if (element === null || element === undefined || dialog.contains(element)) return;
  void document.exitFullscreen?.().catch(() => undefined);
}

export function useCallPresentation(layer: RefObject<HTMLDialogElement | null>): void {
  const covers = useStore(callStore, (state) => callCoversScreen(state.call));
  const live = useStore(callStore, (state) => isCallLive(state.call));
  useConversationViewingSuspension(covers);

  useEffect(() => {
    const dialog = layer.current;
    if (dialog === null || typeof dialog.showModal !== 'function') return;
    if (covers) leaveForeignFullscreen(dialog);
    const mode = presentationModeFor({ covers, foreignModalOpen: foreignModalOpen(dialog) });
    if (mode === 'modal' && !isModal(dialog)) {
      dialog.close();
      dialog.showModal();
      return;
    }
    if (mode === 'inline' && isModal(dialog)) {
      dialog.close();
      dialog.setAttribute('open', '');
    }
  }, [covers, layer]);

  useEffect(() => {
    const dialog = layer.current;
    if (dialog === null) return;
    const keep = (event: Event) => event.preventDefault();
    dialog.addEventListener('cancel', keep);
    return () => dialog.removeEventListener('cancel', keep);
  }, [layer]);

  useEffect(() => {
    if (!live || typeof document === 'undefined') return;
    const dialog = layer.current;
    interruptPlayback(document.querySelectorAll<HTMLMediaElement>('video, audio'), (element) => dialog?.contains(element) === true);
  }, [live, layer]);
}
