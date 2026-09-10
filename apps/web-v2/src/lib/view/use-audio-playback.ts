import { useCallback, useRef, useState } from 'react';

import { audioCoordinator, type AudioCoordinator } from './audio-coordinator';

/**
 * LA LECTURE D'UN VOCAL, DERRIÈRE UN `<audio>` RÉEL (#5805) — miroir
 * `AudioBubbleRouter.swift`/`CoordinatedAudioPlayer.swift` : un widget
 * REÇOIT `bind` comme `ref` de son `<audio>`, et le hook écoute les
 * événements NATIFS de l'élément plutôt que de gérer un minuteur à lui —
 * c'est le navigateur qui sait quand la lecture avance, se termine ou échoue.
 *
 * `idle` (rien ne joue, ou vient de se terminer) → `playing` → `paused` (tap
 * pendant la lecture, OU un AUTRE vocal vient de réclamer l'exclusivité via
 * le coordinateur, qui appelle `pause()` sur CET élément) → `error` (le
 * fichier ne se décode pas) ; `toggle()` depuis `error` REESSAIE (`load()`
 * puis `play()`) plutôt que de rester bloqué.
 */
export type AudioPlaybackStatus = 'idle' | 'playing' | 'paused' | 'error';

export type AudioPlayback = {
  readonly status: AudioPlaybackStatus;
  /** [0..1] — la fraction déjà écoutée de la lecture EN COURS. */
  readonly progress: number;
  readonly toggle: () => void;
  /** Le `ref` de l'`<audio>` que ce hook pilote. */
  readonly bind: (element: HTMLAudioElement | null) => void;
};

/**
 * `timeupdate` peut tirer plusieurs fois par seconde — mettre à jour l'état
 * React à cette cadence re-rendrait la rangée hôte pour rien (dimension 4,
 * « Zero Unnecessary Re-render »). L'onde ne porte que 22 barres
 * (`waveformOf`, `view/message.ts`) : un pas de 1/50 (2 %) reste bien plus
 * fin qu'une barre (1/22 ≈ 4,5 %) sans jamais re-rendre à chaque frame.
 */
const PROGRESS_UPDATE_STEP = 1 / 50;

export function useAudioPlayback(params: {
  readonly attachmentId: string;
  readonly coordinator?: AudioCoordinator;
}): AudioPlayback {
  const { attachmentId } = params;
  const coordinator = params.coordinator ?? audioCoordinator;

  const [status, setStatus] = useState<AudioPlaybackStatus>('idle');
  const [progress, setProgress] = useState(0);
  const elementRef = useRef<HTMLAudioElement | null>(null);
  const lastEmittedProgressRef = useRef(0);
  const listenersRef = useRef<{
    readonly play: () => void;
    readonly pause: () => void;
    readonly ended: () => void;
    readonly error: () => void;
    readonly timeupdate: () => void;
  } | null>(null);

  const detach = useCallback((element: HTMLAudioElement): void => {
    const listeners = listenersRef.current;
    if (listeners === null) return;
    element.removeEventListener('play', listeners.play);
    element.removeEventListener('pause', listeners.pause);
    element.removeEventListener('ended', listeners.ended);
    element.removeEventListener('error', listeners.error);
    element.removeEventListener('timeupdate', listeners.timeupdate);
    listenersRef.current = null;
  }, []);

  const bind = useCallback(
    (element: HTMLAudioElement | null) => {
      const previous = elementRef.current;
      if (previous !== null) detach(previous);
      elementRef.current = element;

      if (element === null) {
        // DÉMONTAGE — ou CHANGEMENT DE PISTE (revue #5805) : le widget donne
        // une `key` à son `<audio>` (`attachment-blocks.tsx`), donc changer
        // de langue REMONTE l'élément et passe ici.
        //
        // Aucun son orphelin : on relâche le coordinateur ET on coupe la
        // lecture de l'élément qu'on quitte. Et on REVIENT à `idle` : sans
        // ça, l'état restait `playing` sur un élément que le navigateur
        // venait d'arrêter (le changement de `src` relance l'algorithme de
        // chargement, qui met `paused` à true SANS émettre d'événement
        // `pause`). Le bouton affichait alors « Mettre en pause » pour de
        // bon, et `toggle()` appelait `pause()` sur un élément DÉJÀ en
        // pause — sans effet, sans événement : un contrôle INERTE jusqu'au
        // prochain démontage de la rangée (mesuré au navigateur).
        coordinator.release(attachmentId);
        if (previous !== null) previous.pause();
        lastEmittedProgressRef.current = 0;
        setProgress(0);
        setStatus('idle');
        return;
      }

      const onPlay = (): void => setStatus('playing');
      /**
       * Un `play()` qui échoue déclenche, DANS CET ORDRE, `play` (optimiste)
       * → `error` → `pause` (le navigateur revient seul à l'arrêt) — mesuré
       * sur un `data:` cassé. `onPause` NE DOIT PAS écraser un `error` que
       * `onError` vient de poser dans le MÊME tour : la forme fonctionnelle
       * de `setStatus` lit l'état déjà mis à jour, jamais la valeur figée
       * dans cette fermeture.
       */
      const onPause = (): void => {
        coordinator.release(attachmentId);
        setStatus((current) => (current === 'error' ? current : 'paused'));
      };
      const onEnded = (): void => {
        coordinator.release(attachmentId);
        lastEmittedProgressRef.current = 1;
        setProgress(1);
        setStatus('idle');
      };
      const onError = (): void => {
        coordinator.release(attachmentId);
        setStatus('error');
      };
      const onTimeUpdate = (): void => {
        const el = elementRef.current;
        if (el === null || !Number.isFinite(el.duration) || el.duration <= 0) return;
        const raw = el.currentTime / el.duration;
        if (Math.abs(raw - lastEmittedProgressRef.current) < PROGRESS_UPDATE_STEP) return;
        lastEmittedProgressRef.current = raw;
        setProgress(raw);
      };

      listenersRef.current = { play: onPlay, pause: onPause, ended: onEnded, error: onError, timeupdate: onTimeUpdate };
      element.addEventListener('play', onPlay);
      element.addEventListener('pause', onPause);
      element.addEventListener('ended', onEnded);
      element.addEventListener('error', onError);
      element.addEventListener('timeupdate', onTimeUpdate);
    },
    [attachmentId, coordinator, detach],
  );

  const toggle = useCallback((): void => {
    const element = elementRef.current;
    if (element === null) return;

    if (status === 'playing') {
      element.pause();
      return;
    }

    // Une reprise depuis `error` REESSAIE (`load()` avant `play()`) plutôt
    // que de rejouer un décodeur déjà en échec — miroir du bouton
    // « Réessayer » des autres surfaces du fil.
    if (status === 'error') element.load();

    coordinator.claim(attachmentId, () => element.pause());
    void element.play().catch(() => {
      coordinator.release(attachmentId);
      setStatus('error');
    });
  }, [attachmentId, coordinator, status]);

  return { status, progress, toggle, bind };
}
