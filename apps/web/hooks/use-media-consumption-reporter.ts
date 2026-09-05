'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { apiService } from '@/services/api.service';
import { API_ENDPOINTS } from '@meeshy/shared/api/endpoints';
import type { CurrentUserAttachmentConsumption } from '@meeshy/shared/types/attachment';
import { PlaybackStretchTracker, type StretchEnd } from '@/utils/playback-stretch-tracker';

/**
 * Ce que le web SAIT d'une écoute, et ce qu'il en disait.
 *
 * ## Trois défauts, une seule cause
 *
 * `PlaybackStretchTracker` existe depuis 2026-07, testé, avec son jumeau Swift
 * (`PlaybackStretchTracker.swift`) et son doc-comment qui les déclare miroirs.
 * **Aucun lecteur web ne l'appelait.** Le web n'envoyait que
 * `lastPlayPositionMs`/`complete` — jamais un segment, jamais une langue. Ce
 * n'était pas du code manquant, c'était un CÂBLAGE manquant, et c'est ce qui
 * rendait les trois défauts ci-dessous solidaires :
 *
 * | # | ce qui se perdait |
 * |---|---|
 * | #3909 | rouvrir un vocal repartait de ZÉRO — `currentUserConsumption` était servi et jamais lu (zéro occurrence dans `apps/web`) |
 * | #3911 | faire défiler une bulle EN LECTURE hors de la fenêtre virtualisée la démontait sans rien envoyer |
 * | #3913 | changer de piste traduite remettait la position à zéro sans clore le rapport de la piste quittée |
 *
 * ## La clôture est UN mécanisme, pas trois
 *
 * Démontage (#3911) et changement de piste (#3913) sont le même événement vu de
 * deux endroits : *ce qu'on écoutait cesse d'être ce qu'on écoute*. Un
 * `useEffect` dont la CLÉ est la piste et dont le nettoyage clôt puis envoie les
 * couvre donc tous les deux — et couvrira le troisième cas qu'on n'a pas encore
 * nommé.
 *
 * **Ce hook doit être appelé AVANT tout effet qui touche l'élément média.**
 * React exécute les nettoyages dans l'ordre de déclaration : le lecteur, lui,
 * finit par `removeAttribute('src')` + `load()`, ce qui remet `currentTime` à 0.
 * Lire la position après lui rendrait 0 sur chaque démontage — un rapport
 * parfaitement ponctuel, et parfaitement faux.
 */

export type MediaConsumptionKind = 'audio' | 'video';

type Options = {
  readonly attachmentId: string;
  readonly kind: MediaConsumptionKind;
  readonly mediaRef: React.RefObject<HTMLMediaElement | null>;
  /**
   * L'identité de la PISTE consommée — l'URL jouée, et la langue quand le
   * lecteur en propose plusieurs. Son changement clôt le rapport en cours.
   */
  readonly trackKey: string;
  /** La langue de la piste consommée, telle qu'elle part au serveur. */
  readonly consumedLanguage?: string | null;
  /** Ce que le serveur sait déjà de cette pièce jointe pour ce lecteur. */
  readonly consumption?: CurrentUserAttachmentConsumption | null;
};

type Reporter = {
  /** Une lecture continue commence à la position courante. */
  readonly noteStarted: () => void;
  /** Le curseur a bougé : clôt le segment courant, en rouvre un si on lisait. */
  readonly noteSeek: (fromSeconds: number, toSeconds: number) => void;
  /** Le lecteur signale une position — sans rien clore. */
  readonly noteProgress: (seconds: number) => void;
  /** Clôt le segment courant et ENVOIE le rapport. */
  readonly report: (
    options: { complete: boolean; endedBy: StretchEnd },
    element?: HTMLMediaElement | null,
  ) => void;
  /**
   * La position de reprise, en SECONDES — `null` quand il n'y a rien à
   * reprendre : jamais lu, déjà terminé, ou position aberrante.
   */
  readonly resumeSeconds: number | null;
};

/**
 * La position à laquelle reprendre, ou `null`.
 *
 * Exportée pour être éprouvée seule : c'est une règle de PRODUIT (ne pas
 * reprendre un média terminé, ne pas reprendre à un cheveu de la fin) et non un
 * détail du hook. Une reprise à 200 ms de la fin est pire que pas de reprise —
 * l'utilisateur appuie sur lecture et le média se termine aussitôt.
 */
export function resumePositionSeconds(
  consumption: CurrentUserAttachmentConsumption | null | undefined,
  kind: MediaConsumptionKind
): number | null {
  if (!consumption) return null;
  const complete = kind === 'audio' ? consumption.listenedComplete : consumption.watchedComplete;
  if (complete) return null;
  const positionMs = kind === 'audio' ? consumption.lastPlayPositionMs : consumption.lastWatchPositionMs;
  if (positionMs === null || positionMs === undefined) return null;
  if (!Number.isFinite(positionMs) || positionMs <= 0) return null;
  // Sous une seconde, reprendre et repartir de zéro sont indiscernables — et
  // « reprendre » coûte alors une surprise pour rien.
  if (positionMs < 1000) return null;
  return positionMs / 1000;
}

export function useMediaConsumptionReporter({
  attachmentId,
  kind,
  mediaRef,
  trackKey,
  consumedLanguage,
  consumption,
}: Options): Reporter {
  const trackerRef = useRef(new PlaybackStretchTracker());
  const languageRef = useRef<string | null | undefined>(consumedLanguage);
  languageRef.current = consumedLanguage;

  /**
   * La dernière position et durée LUES sur l'élément.
   *
   * Ce n'est pas un cache de confort : **au démontage, React a déjà détaché le
   * `ref` de l'élément hôte quand le nettoyage d'un effet passif s'exécute.**
   * `mediaRef.current` y vaut `null`, la position y est donc illisible, et le
   * rapport de clôture partait à 0 — c'est-à-dire ne partait pas du tout, la
   * garde « rien à dire » l'absorbant. `PlaybackStretchTracker.observe` existe
   * pour exactement ce cas, et son doc-comment le dit : « pouvoir fermer
   * proprement une écoute dont la position finale serait illisible ».
   */
  const lastKnownRef = useRef({ positionMs: 0, durationMs: 0 });

  const positionMs = useCallback((element?: HTMLMediaElement | null) => {
    const media = element ?? mediaRef.current;
    if (!media || !Number.isFinite(media.currentTime)) return lastKnownRef.current.positionMs;
    const ms = Math.round(media.currentTime * 1000);
    lastKnownRef.current.positionMs = ms;
    if (Number.isFinite(media.duration)) lastKnownRef.current.durationMs = Math.round(media.duration * 1000);
    return ms;
  }, [mediaRef]);

  // Le relevé se fait sur les événements du lecteur, pas sur une horloge : il
  // n'ajoute aucun réveil et suit exactement les frontières que le média
  // franchit de lui-même.
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const note = () => { positionMs(); };
    media.addEventListener('timeupdate', note);
    media.addEventListener('durationchange', note);
    media.addEventListener('loadedmetadata', note);
    return () => {
      media.removeEventListener('timeupdate', note);
      media.removeEventListener('durationchange', note);
      media.removeEventListener('loadedmetadata', note);
    };
  }, [mediaRef, positionMs, trackKey]);

  const report = useCallback((
    { complete, endedBy }: { complete: boolean; endedBy: StretchEnd },
    element?: HTMLMediaElement | null,
  ) => {
    const media = element ?? mediaRef.current;
    const at = positionMs(media);
    const tracker = trackerRef.current;

    // Clore AVANT de vider : un segment encore ouvert n'est pas dans la trace,
    // et c'est précisément celui qu'on est en train de perdre.
    if (tracker.hasOpenStretch) {
      if (endedBy === 'completed') tracker.completed(at);
      else if (endedBy === 'dismissed') tracker.dismissed(at);
      else if (endedBy === 'muted') tracker.muted(at);
      else tracker.pause(at);
    }
    const stretches = tracker.drain();

    // Un rapport sans position ni segment ne dit rien — l'envoyer coûte une
    // requête et brouille la feuille des vues.
    if (at <= 0 && stretches.length === 0 && !complete) return;

    const durationMs = media && Number.isFinite(media.duration)
      ? Math.round(media.duration * 1000)
      : lastKnownRef.current.durationMs;
    apiService.post(API_ENDPOINTS.attachments.byAttachmentIdStatus(attachmentId), {
      action: kind === 'audio' ? 'listened' : 'watched',
      playPositionMs: at,
      durationMs,
      complete,
      ...(stretches.length > 0 ? { stretches } : {}),
      ...(languageRef.current ? { language: languageRef.current } : {}),
    }).catch(() => {});
  }, [attachmentId, kind, mediaRef, positionMs]);

  const noteStarted = useCallback(() => {
    trackerRef.current.begin(positionMs());
  }, [positionMs]);

  /** Le lecteur signale une position — sans rien clore. */
  const noteProgress = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    const ms = Math.round(seconds * 1000);
    lastKnownRef.current.positionMs = ms;
    trackerRef.current.observe(ms);
  }, []);

  const noteSeek = useCallback((fromSeconds: number, toSeconds: number) => {
    trackerRef.current.seek(Math.round(fromSeconds * 1000), Math.round(toSeconds * 1000));
  }, []);

  // La clôture, UNE fois, pour le démontage (#3911) ET le changement de piste
  // (#3913). Le nettoyage lit la position par un ref : la fonction capturée
  // resterait sinon celle du rendu où l'effet a été posé.
  const reportRef = useRef(report);
  reportRef.current = report;
  useEffect(() => {
    // L'ÉLÉMENT est capturé ici, pas relu au nettoyage : React a déjà remis le
    // `ref` à `null` quand un nettoyage passif s'exécute au démontage, si bien
    // qu'une relecture y rendrait la position 0 — et la garde « rien à dire »
    // absorberait le rapport. Le nœud, lui, reste lisible tant que le nettoyage
    // du lecteur (`removeAttribute('src')` + `load()`) n'a pas eu lieu, ce qui
    // est exactement la raison pour laquelle ce hook est déclaré EN PREMIER.
    const media = mediaRef.current;
    return () => {
      reportRef.current({ complete: false, endedBy: 'dismissed' }, media);
    };
  }, [attachmentId, trackKey, mediaRef]);

  const resumeSeconds = useMemo(
    () => resumePositionSeconds(consumption, kind),
    [consumption, kind]
  );

  return { noteStarted, noteSeek, noteProgress, report, resumeSeconds };
}
