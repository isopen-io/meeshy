import { useCallback, useRef, useState } from 'react';

import { reportAttachmentStatus, type PlaybackStretch } from '@/lib/api/attachments';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';

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
  /** La fraction consommée la plus haute RAPPORTÉE cette session (max
   * monotone — jamais décroissante, même règle que `MediaConsumptionStore`
   * iOS) ; `0` sans `report`. Combinée par l'hôte à la consommation SERVIE
   * (`attachment.currentUserConsumption`) pour que la barre au repos
   * n'attende pas un aller-retour serveur (optimistic update). */
  readonly reportedFraction: number;
  /** `true` dès qu'un rapport « complet » est parti — collant, comme `reportedFraction`. */
  readonly reportedComplete: boolean;
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

/**
 * LE RAPPORT DE CONSOMMATION (#7225, W6) — OPT-IN, même patron que
 * `tracksTime` : seul un widget qui DOIT reprendre/rapporter (vocal, vidéo)
 * le fournit. `kind` est le verbe EXACT du body
 * (`AttachmentStatusBodySchema.action`,
 * `services/gateway/src/validation/messages-schemas.ts:212-251` —
 * 'listened' pour un vocal, 'watched' pour une vidéo).
 */
export type MediaPlaybackReport = {
  readonly kind: 'listened' | 'watched';
  /** La durée CONNUE côté serveur (ms) — repli quand l'élément n'a pas
   * encore chargé ses métadonnées (`preload="none"`) ; l'élément gagne dès
   * qu'il la connaît. */
  readonly durationMs?: number;
  /** La consommation SERVIE — pour la reprise. Absent/`positionMs: null` :
   * rien à reprendre, `complete: true` : on repart de zéro (rien à rejouer). */
  readonly resume?: { readonly positionMs: number | null; readonly complete: boolean };
  /** INJECTABLE pour les témoins — `apiDeps` (singleton réel) par défaut,
   * même patron que `coordinator ?? mediaCoordinator`. */
  readonly deps?: ConversationsDeps;
};

/** Jamais plus d'un rapport toutes les 5 s (critère de fin #7225) — sauf les
 * DEUX signaux TERMINAUX (fin, démontage), qui doivent toujours atteindre le
 * serveur : un vocal de 3 s ne finirait sinon jamais `complete`. */
const REPORT_THROTTLE_MS = 5_000;

/**
 * LA TRACE DES ÉCOUTES CONTINUES (miroir `PlaybackStretchTracker.swift`,
 * `packages/MeeshySDK/Sources/MeeshySDK/Models/PlaybackStretchTracker.swift` —
 * mêmes cas, même sémantique). Pas d'échantillonnage périodique : le lecteur
 * connaît les frontières EXACTES (lecture, pause, saut, fin, démontage), et
 * chaque intervalle entre deux frontières est un segment exact.
 */
class PlaybackStretchTracker {
  private openedAtMs: number | null = null;
  private lastObservedMs = 0;
  private readonly stretches: PlaybackStretch[] = [];

  get hasOpenStretch(): boolean {
    return this.openedAtMs !== null;
  }

  begin(positionMs: number): void {
    if (this.openedAtMs !== null) this.close(positionMs, 'superseded');
    this.openedAtMs = positionMs;
    this.lastObservedMs = positionMs;
  }

  pause(positionMs?: number): void {
    this.close(positionMs ?? this.lastObservedMs, 'pause');
  }

  completed(positionMs?: number): void {
    this.close(positionMs ?? this.lastObservedMs, 'completed');
  }

  dismissed(positionMs?: number): void {
    this.close(positionMs ?? this.lastObservedMs, 'dismissed');
  }

  /** Déplacer le curseur d'un média EN PAUSE n'ouvre rien : rien n'est
   * écouté tant que la lecture n'a pas repris. */
  seek(fromPositionMs: number, toPositionMs: number): void {
    const wasPlaying = this.openedAtMs !== null;
    this.close(fromPositionMs, 'seek');
    if (wasPlaying) this.openedAtMs = toPositionMs;
    this.lastObservedMs = toPositionMs;
  }

  /** Rend les écoutes terminées et les retire, ordre CHRONOLOGIQUE préservé. */
  drain(): PlaybackStretch[] {
    return this.stretches.splice(0, this.stretches.length);
  }

  private close(positionMs: number, endedBy: PlaybackStretch['endedBy']): void {
    const openedAt = this.openedAtMs;
    this.openedAtMs = null;
    this.lastObservedMs = positionMs;
    if (openedAt === null) return;
    // Durée nulle ou négative : le lecteur se contredit — mieux vaut perdre
    // une observation que fabriquer un segment absurde.
    if (positionMs <= openedAt) return;
    this.stretches.push({ startMs: openedAt, endMs: positionMs, endedBy });
  }
}

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
  readonly report?: MediaPlaybackReport;
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
  const [reportedFraction, setReportedFraction] = useState(0);
  const [reportedComplete, setReportedComplete] = useState(false);
  const elementRef = useRef<HTMLMediaElement | null>(null);
  const lastEmittedProgressRef = useRef(0);
  const lastEmittedPositionRef = useRef(0);
  const listenersRef = useRef<Listeners | null>(null);
  // Toujours la dernière valeur de `params.report`, sans entrer dans les
  // dépendances des `useCallback` ci-dessous — le même besoin que
  // `use-floating-drag.ts` (`onLongPressRef`) : un objet reconstruit à
  // chaque rendu par l'appelant ne doit pas réarmer les écouteurs natifs.
  const reportRef = useRef(params.report);
  reportRef.current = params.report;
  const trackerRef = useRef<PlaybackStretchTracker | null>(null);
  if (trackerRef.current === null) trackerRef.current = new PlaybackStretchTracker();
  const lastReportAtRef = useRef(0);
  const appliedResumeRef = useRef(false);

  const recordConsumption = useCallback((fraction: number, complete: boolean): void => {
    const clamped = complete ? 1 : Math.max(0, Math.min(1, fraction));
    setReportedFraction((previous) => Math.max(previous, clamped));
    setReportedComplete((previous) => previous || complete);
  }, []);

  /**
   * TENTE un envoi — appelée aux QUATRE frontières du critère de fin (pause,
   * saut, fin, démontage). `force` bypass le throttle (fin/démontage —
   * signaux TERMINAUX qui ne doivent jamais se perdre) ; sans lui, un rapport
   * à moins de 5 s du précédent est ABANDONNÉ (les segments restent dans le
   * tracker, ils partiront au prochain rapport qui aboutit).
   */
  const attemptReport = useCallback(
    (options: { readonly element: HTMLMediaElement; readonly positionMs: number; readonly complete: boolean; readonly force: boolean }): void => {
      const reportConfig = reportRef.current;
      if (reportConfig === undefined) return;
      const tracker = trackerRef.current;
      if (tracker === null) return;
      const now = Date.now();
      if (!options.force && now - lastReportAtRef.current < REPORT_THROTTLE_MS) return;
      const stretches = tracker.drain();
      if (stretches.length === 0 && !options.complete) return;
      lastReportAtRef.current = now;
      const known = knownDuration(options.element);
      const durationMs = known > 0 ? Math.round(known * 1000) : reportConfig.durationMs;
      const fraction = durationMs !== undefined && durationMs > 0 ? options.positionMs / durationMs : 0;
      recordConsumption(fraction, options.complete);
      const deps = reportConfig.deps ?? apiDeps;
      void reportAttachmentStatus({
        ...deps,
        attachmentId,
        report: {
          action: reportConfig.kind,
          playPositionMs: options.positionMs,
          complete: options.complete,
          ...(durationMs !== undefined ? { durationMs } : {}),
          ...(stretches.length > 0 ? { stretches } : {}),
        },
      }).catch(() => {
        // Best effort — une trame perdue rejoint la suivante (le tracker
        // continue d'accumuler ; seul CE segment drainé est perdu, comme un
        // `timeupdate` manqué). Aucune file de rattrapage dans ce lot.
      });
    },
    [attachmentId, recordConsumption],
  );

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
        // LE DÉMONTAGE EST UN SIGNAL TERMINAL (#7225) — au même titre que
        // `ended` : l'écran quitté ne rejouera plus cet élément, donc
        // c'est ICI ou jamais que le dernier segment ouvert (le cas
        // échéant) part au serveur. `force: true` bypass le throttle des
        // 5 s ; `attemptReport` n'envoie de toute façon RIEN si le tracker
        // n'a aucun segment à dire (jamais joué).
        if (reportRef.current !== undefined && previous !== null) {
          const tracker = trackerRef.current;
          const positionMs = Math.round(previous.currentTime * 1000);
          tracker?.dismissed(positionMs);
          attemptReport({ element: previous, positionMs, complete: false, force: true });
        }
        lastEmittedProgressRef.current = 0;
        lastEmittedPositionRef.current = 0;
        setProgress(0);
        setPosition(0);
        setDuration(0);
        setPictureInPicture('unsupported');
        setStatus('idle');
        return;
      }

      // LA REPRISE (#7225) — une seule fois par montage : `preload="none"`
      // (VoiceAttachment) n'a encore rien chargé, mais poser `currentTime`
      // avant tout chargement fait retenir la position au navigateur pour
      // quand les métadonnées arrivent (mesuré Chrome/Firefox/Safari — c'est
      // le comportement que HTML5 décrit pour un `seek` avant `HAVE_METADATA`).
      const resume = reportRef.current?.resume;
      if (!appliedResumeRef.current && resume?.positionMs != null && resume.positionMs > 0 && !resume.complete) {
        appliedResumeRef.current = true;
        try {
          element.currentTime = resume.positionMs / 1000;
        } catch {
          // best effort — un navigateur qui refuse le seek pré-chargement
          // rejouera depuis 0, dégradation gracieuse plutôt que crash.
        }
      }

      const onPlay = (): void => {
        setStatus('playing');
        trackerRef.current?.begin(Math.round(element.currentTime * 1000));
      };
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
        const positionMs = Math.round(element.currentTime * 1000);
        trackerRef.current?.pause(positionMs);
        attemptReport({ element, positionMs, complete: false, force: false });
      };
      const onEnded = (): void => {
        coordinator.release(attachmentId);
        lastEmittedProgressRef.current = 1;
        setProgress(1);
        setStatus('idle');
        // SIGNAL TERMINAL — le média est allé jusqu'au bout SEUL, `force`
        // bypass le throttle : un vocal de moins de 5 s ne marquerait sinon
        // jamais `complete` si une pause vient de partir juste avant.
        const positionMs = Math.round(knownDuration(element) * 1000);
        trackerRef.current?.completed(positionMs);
        attemptReport({ element, positionMs, complete: true, force: true });
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
    [attachmentId, attemptReport, coordinator, detach, emitPosition, tracksTime],
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
      const fromMs = Math.round(element.currentTime * 1000);
      element.currentTime = target;
      emitPosition(target);
      if (total > 0) {
        lastEmittedProgressRef.current = target / total;
        setProgress(target / total);
      }
      const toMs = Math.round(target * 1000);
      trackerRef.current?.seek(fromMs, toMs);
      attemptReport({ element, positionMs: toMs, complete: false, force: false });
    },
    [attemptReport, emitPosition],
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
    reportedFraction,
    reportedComplete,
    toggle,
    seek,
    setMuted,
    setRate,
    togglePictureInPicture,
    bind,
  };
}
