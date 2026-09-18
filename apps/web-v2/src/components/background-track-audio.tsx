import { useEffect, useRef } from 'react';

import { protectedMediaDeps, type ProtectedMediaDeps, type ProtectedMediaUnavailableReason } from '@/lib/api/protected-media';
import { useProtectedMediaSrc } from '@/lib/api/use-protected-media';
import type { BackgroundTrack } from '@/lib/canvas/background-sound';

/**
 * `BackgroundTrackAudio` (#6899, extrait en site UNIQUE pour #6903) — LE SON
 * DE FOND D'UNE SCÈNE, miroir de `ReaderAudioMixer+Background.swift` : une
 * piste, qui part `startOffsetMs` après le début de la diapositive (horloge
 * de LECTURE : la pause l'arrête), jouée dans sa fenêtre source (`bounds`,
 * rebouclée dans la fenêtre si `loop`), à son `volume`, sous le muet viewer.
 * Fondus hors lot (question 9.3 de la spécification `stories-lecteur`).
 *
 * DÉPLACÉ tel quel depuis `routes/story-scene-layer.tsx` (§ 5.3 de la
 * spécification `reels-scene`, #6903) : le studio a déjà sa JUMELLE
 * simplifiée (`story-compose.tsx:705`, dette CONSIGNÉE — D-86) et le lecteur
 * des Réels en aurait été la TROISIÈME. Un SITE UNIQUE, consommé par le
 * lecteur de story ET le réel — la clé `key` de l'appelant REMONTE
 * l'élément pour repartir de `startOffsetMs` (un tour de boucle, #6903).
 */
export type BackgroundTrackAudioProps = {
  readonly track: BackgroundTrack;
  readonly playing: boolean;
  readonly muted: boolean;
  readonly onDurationKnown: (durationMs: number) => void;
  readonly onPlaybackBlocked: () => void;
  /**
   * LA PISTE PROTÉGÉE EST DÉFINITIVEMENT INDISPONIBLE (revue-correction
   * #7015, défaut 2) — appelé UNE fois, avec la RAISON (`refused`, `missing`,
   * `muted`, `offline`, `no-identity`), quand `fetchProtectedObjectUrl` rend
   * `unavailable`. Optionnel : un hôte qui ne dessine aucun état dégradé
   * (aucun aujourd'hui hors story/réel) n'a rien à faire de plus qu'avant —
   * `src === null` continue de ne monter aucune balise.
   */
  readonly onUnavailable?: (reason: ProtectedMediaUnavailableReason) => void;
  /** Injectable pour les témoins UNIQUEMENT — la production prend
   * `defaultMediaDeps`, dont l'identité est gardée par un témoin. */
  readonly mediaDeps?: ProtectedMediaDeps;
};

/** `NotAllowedError` — le refus de la politique de lecture automatique. */
export const isAutoplayRefusal = (error: unknown): boolean => error instanceof Error && error.name === 'NotAllowedError';

/** Les dépendances de PRODUCTION du transport protégé — nommées pour qu'un
 * témoin puisse prouver que le composant est BRANCHÉ dessus. */
export const defaultMediaDeps = protectedMediaDeps;

/**
 * #7015 — LA PISTE N'EST PAS TOUJOURS POSABLE TELLE QUELLE.
 *
 * Un son de fond emprunté à la bibliothèque est servi par
 * `GET /api/v1/static/:filename`, une route AUTHENTIFIÉE — et une balise
 * `<audio src>` n'envoie aucun en-tête `Authorization` : mesuré en production,
 * la requête part anonyme et rend **401**. `useProtectedMediaSrc` demande les
 * octets par `fetch` (le seul transport du navigateur qui porte un en-tête) et
 * rend une URL d'OBJET ; il rend la source INCHANGÉE, synchronement, pour tout
 * le reste.
 *
 * `null` ⇒ **aucune balise** : une piste indisponible (refus, fichier absent,
 * son coupé par la modération, réseau tombé) ne monte rien plutôt que de
 * monter un élément qui échouera. C'est la dégradation propre exigée par
 * l'issue — pas de son, pas de casse, aucune promesse rejetée.
 *
 * L'élément vit dans un composant SÉPARÉ pour que ses effets partent d'un
 * élément RÉELLEMENT monté : monté dans ce composant-ci, l'effet de lecture
 * aurait tourné une première fois sur un `ref` nul, sans jamais rejouer quand
 * la résolution arrive.
 */
export function BackgroundTrackAudio({ mediaDeps = defaultMediaDeps, onUnavailable, ...props }: BackgroundTrackAudioProps) {
  const { src, reason } = useProtectedMediaSrc(props.track.src, mediaDeps);
  // `onUnavailable` derrière une ref : un rappel recomposé à chaque rendu de
  // l'hôte (une closure en ligne, motif courant ici) ne doit PAS relancer cet
  // effet — seule la RAISON, qui ne change qu'une fois par résolution,
  // décide de l'appel (même motif que `callbacks` dans l'élément ci-dessous).
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;
  useEffect(() => {
    if (reason !== null) onUnavailableRef.current?.(reason);
  }, [reason]);
  if (src === null) return null;
  return <BackgroundTrackElement {...props} src={src} />;
}

function BackgroundTrackElement({
  track,
  playing,
  muted,
  onDurationKnown,
  onPlaybackBlocked,
  src,
}: Omit<BackgroundTrackAudioProps, 'mediaDeps' | 'onUnavailable'> & { readonly src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedMsRef = useRef(0);
  const callbacks = useRef({ onDurationKnown, onPlaybackBlocked });
  callbacks.current = { onDurationKnown, onPlaybackBlocked };
  const { bounds } = track;

  useEffect(() => {
    const el = audioRef.current;
    if (el !== null) el.volume = track.volume;
  }, [track.volume]);

  useEffect(() => {
    const el = audioRef.current;
    if (el === null) return;
    if (!playing) {
      el.pause();
      return;
    }
    const startedAt = performance.now();
    const start = () => {
      void el.play().catch((error: unknown) => {
        if (!el.muted && isAutoplayRefusal(error)) callbacks.current.onPlaybackBlocked();
      });
    };
    const remaining = Math.max(0, track.startOffsetMs - playedMsRef.current);
    const timer = remaining > 0 ? window.setTimeout(start, remaining) : null;
    if (timer === null) start();
    return () => {
      playedMsRef.current += performance.now() - startedAt;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [playing, muted, track.startOffsetMs]);

  // Le DÉMONTAGE (un hôte qui REMONTE la piste à chaque tour de boucle,
  // #6903 — `key` changée — ou qui quitte l'écran) arrête le son : effet
  // dédié, à dépendances VIDES, pour ne pauser qu'à la disparition réelle de
  // l'élément — jamais à chaque changement de `playing`/`muted`, déjà
  // couvert par l'effet ci-dessus.
  useEffect(() => {
    const el = audioRef.current;
    return () => {
      el?.pause();
    };
  }, []);

  return (
    <audio
      ref={audioRef}
      data-scene-sound-track
      src={src}
      preload="auto"
      muted={muted}
      loop={bounds === undefined && track.loop}
      onLoadedMetadata={(event) => {
        const el = event.currentTarget;
        if (bounds !== undefined) el.currentTime = bounds.startMs / 1000;
        const windowMs = bounds !== undefined ? bounds.endMs - bounds.startMs : el.duration * 1000;
        callbacks.current.onDurationKnown(track.startOffsetMs + windowMs);
      }}
      onTimeUpdate={(event) => {
        if (bounds === undefined) return;
        const el = event.currentTarget;
        if (el.currentTime * 1000 < bounds.endMs) return;
        if (track.loop) el.currentTime = bounds.startMs / 1000;
        else el.pause();
      }}
    />
  );
}
