import { useCallback, useRef, useState } from 'react';

import { mediaCoordinator, type MediaCoordinator } from './media-coordinator';

/**
 * LA LECTURE D'UN MÉDIA, DERRIÈRE UN `<audio>` OU UN `<video>` RÉEL (#5805,
 * renommé #6221 étape 0) — miroir `AudioBubbleRouter.swift`/
 * `CoordinatedAudioPlayer.swift` : un widget REÇOIT `bind` comme `ref` de son
 * élément, et le hook écoute les événements NATIFS plutôt que de gérer un
 * minuteur à lui — c'est le navigateur qui sait quand la lecture avance, se
 * termine ou échoue.
 *
 * `HTMLMediaElement` — la classe COMMUNE à `<audio>` et `<video>`, jamais
 * `HTMLAudioElement` (#6221) : ce hook ne sait rien du TYPE de média qu'il
 * pilote, seulement qu'il expose `play`/`pause`/`load` et les événements que
 * les deux éléments partagent. L'image dans l'image est la seule capacité
 * propre à `<video>`, et elle se déclare `unsupported` partout ailleurs.
 *
 * `idle` (rien ne joue, ou vient de se terminer) → `playing` → `paused` (tap
 * pendant la lecture, OU un AUTRE média vient de réclamer l'exclusivité via
 * le coordinateur, qui appelle `pause()` sur CET élément) → `error` (le
 * fichier ne se décode pas) ; `toggle()` depuis `error` REESSAIE (`load()`
 * puis `play()`) plutôt que de rester bloqué.
 */
export type MediaPlaybackStatus = 'idle' | 'playing' | 'paused' | 'error';

/** L'image dans l'image : absente (`<audio>`, navigateur qui ne l'offre pas), offerte, ou en cours. */
export type PictureInPictureState = 'unsupported' | 'inactive' | 'active';

export type MediaPlayback = {
  readonly status: MediaPlaybackStatus;
  /** [0..1] — la fraction déjà écoutée/regardée de la lecture EN COURS. */
  readonly progress: number;
  /** La position, en secondes ENTIÈRES — suivie seulement avec `tracksTime`, `0` sinon. */
  readonly position: number;
  /** La durée de l'élément, en secondes — suivie seulement avec `tracksTime`, `0` tant qu'elle est inconnue. */
  readonly duration: number;
  readonly muted: boolean;
  readonly rate: number;
  readonly pictureInPicture: PictureInPictureState;
  readonly toggle: () => void;
  /** Déplace RÉELLEMENT la lecture, bornée à `[0, durée]`. */
  readonly seek: (seconds: number) => void;
  readonly setMuted: (muted: boolean) => void;
  readonly setRate: (rate: number) => void;
  readonly togglePictureInPicture: () => void;
  /** Le `ref` de l'élément (`<audio>` ou `<video>`) que ce hook pilote. */
  readonly bind: (element: HTMLMediaElement | null) => void;
};

/**
 * `timeupdate` peut tirer plusieurs fois par seconde — mettre à jour l'état
 * React à cette cadence re-rendrait la rangée hôte pour rien (dimension 4,
 * « Zero Unnecessary Re-render »). L'onde d'un vocal ne porte que 22 barres
 * (`waveformOf`, `view/message.ts`) : un pas de 1/50 (2 %) reste bien plus
 * fin qu'une barre (1/22 ≈ 4,5 %) sans jamais re-rendre à chaque frame.
 */
const PROGRESS_UPDATE_STEP = 1 / 50;

type PictureInPictureDocument = Document & {
  readonly pictureInPictureEnabled?: boolean;
  readonly pictureInPictureElement?: Element | null;
  readonly exitPictureInPicture?: () => Promise<void>;
};

type PictureInPictureVideo = HTMLVideoElement & {
  readonly requestPictureInPicture?: () => Promise<unknown>;
  readonly disablePictureInPicture?: boolean;
};

function pictureInPictureSupport(element: HTMLMediaElement): PictureInPictureState {
  if (!(element instanceof HTMLVideoElement)) return 'unsupported';
  const video = element as PictureInPictureVideo;
  const doc = document as PictureInPictureDocument;
  if (doc.pictureInPictureEnabled !== true || typeof video.requestPictureInPicture !== 'function' || video.disablePictureInPicture === true) {
    return 'unsupported';
  }
  return doc.pictureInPictureElement === element ? 'active' : 'inactive';
}

const knownDuration = (element: HTMLMediaElement): number =>
  Number.isFinite(element.duration) && element.duration > 0 ? element.duration : 0;

type Listeners = Readonly<Record<string, () => void>>;

export function useMediaPlayback(params: {
  readonly attachmentId: string;
  readonly coordinator?: MediaCoordinator;
  /**
   * Suivre la position à la seconde et la durée (#6359). OPT-IN : seule la
   * barre de lecture de la visionneuse les affiche ; une tuile du fil qui les
   * suivrait se re-rendrait chaque seconde pour un chiffre qu'elle ne montre pas.
   */
  readonly tracksTime?: boolean;
}): MediaPlayback {
  const { attachmentId, tracksTime = false } = params;
  const coordinator = params.coordinator ?? mediaCoordinator;

  const [status, setStatus] = useState<MediaPlaybackStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMutedState] = useState(false);
  const [rate, setRateState] = useState(1);
  const [pictureInPicture, setPictureInPicture] = useState<PictureInPictureState>('unsupported');
  const elementRef = useRef<HTMLMediaElement | null>(null);
  const lastEmittedProgressRef = useRef(0);
  const lastEmittedPositionRef = useRef(0);
  const listenersRef = useRef<Listeners | null>(null);

  const detach = useCallback((element: HTMLMediaElement): void => {
    const listeners = listenersRef.current;
    if (listeners === null) return;
    for (const [type, listener] of Object.entries(listeners)) element.removeEventListener(type, listener);
    listenersRef.current = null;
  }, []);

  const emitPosition = useCallback(
    (seconds: number): void => {
      if (!tracksTime) return;
      const whole = Math.floor(seconds);
      if (whole === lastEmittedPositionRef.current) return;
      lastEmittedPositionRef.current = whole;
      setPosition(whole);
    },
    [tracksTime],
  );

  const bind = useCallback(
    (element: HTMLMediaElement | null) => {
      const previous = elementRef.current;
      if (previous !== null) detach(previous);
      elementRef.current = element;

      if (element === null) {
        // DÉMONTAGE — ou CHANGEMENT DE PISTE (revue #5805) : le widget donne
        // une `key` à son élément (`attachment-blocks.tsx`, `video-tile.tsx`),
        // donc changer de langue ou de source REMONTE l'élément et passe ici.
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
        lastEmittedPositionRef.current = 0;
        setProgress(0);
        setPosition(0);
        setDuration(0);
        setPictureInPicture('unsupported');
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
        if (el === null) return;
        emitPosition(el.currentTime);
        const total = knownDuration(el);
        if (total === 0) return;
        const raw = el.currentTime / total;
        if (Math.abs(raw - lastEmittedProgressRef.current) < PROGRESS_UPDATE_STEP) return;
        lastEmittedProgressRef.current = raw;
        setProgress(raw);
      };
      const onMetadata = (): void => {
        if (tracksTime) setDuration(knownDuration(element));
        setPictureInPicture(pictureInPictureSupport(element));
      };
      const onVolumeChange = (): void => setMutedState(element.muted);
      const onRateChange = (): void => setRateState(element.playbackRate);
      const onEnterPictureInPicture = (): void => setPictureInPicture('active');
      const onLeavePictureInPicture = (): void => setPictureInPicture(pictureInPictureSupport(element) === 'unsupported' ? 'unsupported' : 'inactive');

      const listeners: Listeners = {
        play: onPlay,
        pause: onPause,
        ended: onEnded,
        error: onError,
        timeupdate: onTimeUpdate,
        loadedmetadata: onMetadata,
        durationchange: onMetadata,
        volumechange: onVolumeChange,
        ratechange: onRateChange,
        enterpictureinpicture: onEnterPictureInPicture,
        leavepictureinpicture: onLeavePictureInPicture,
      };
      listenersRef.current = listeners;
      for (const [type, listener] of Object.entries(listeners)) element.addEventListener(type, listener);
      setMutedState(element.muted);
      setPictureInPicture(pictureInPictureSupport(element));
    },
    [attachmentId, coordinator, detach, emitPosition, tracksTime],
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

  const seek = useCallback(
    (seconds: number): void => {
      const element = elementRef.current;
      if (element === null || !Number.isFinite(seconds)) return;
      const total = knownDuration(element);
      const target = total > 0 ? Math.min(total, Math.max(0, seconds)) : Math.max(0, seconds);
      element.currentTime = target;
      emitPosition(target);
      if (total > 0) {
        lastEmittedProgressRef.current = target / total;
        setProgress(target / total);
      }
    },
    [emitPosition],
  );

  const setMuted = useCallback((next: boolean): void => {
    const element = elementRef.current;
    if (element === null) return;
    element.muted = next;
    setMutedState(next);
  }, []);

  const setRate = useCallback((next: number): void => {
    const element = elementRef.current;
    if (element === null) return;
    element.playbackRate = next;
    setRateState(next);
  }, []);

  const togglePictureInPicture = useCallback((): void => {
    const element = elementRef.current;
    if (element === null || pictureInPicture === 'unsupported') return;
    if (pictureInPicture === 'active') {
      void (document as PictureInPictureDocument).exitPictureInPicture?.().catch(() => {});
      return;
    }
    void (element as PictureInPictureVideo).requestPictureInPicture?.().catch(() => {});
  }, [pictureInPicture]);

  return {
    status,
    progress,
    position,
    duration,
    muted,
    rate,
    pictureInPicture,
    toggle,
    seek,
    setMuted,
    setRate,
    togglePictureInPicture,
    bind,
  };
}
