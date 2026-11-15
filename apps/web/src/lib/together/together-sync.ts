import type { TogetherPlayback } from '@meeshy/shared/types/together';

/**
 * **LA LOI DE SYNCHRONISATION DE « ENSEMBLE »** (#17055, contrat
 * `packages/shared/types/together.ts`) — pure, sans horloge ni lecteur.
 *
 * - La position COURANTE vaut `positionMs + (horloge serveur − at)` en lecture,
 *   `positionMs` en pause. Une horloge locale en retard ne la fait jamais reculer.
 * - L'écart d'horloge serveur − local s'estime par les `at` reçus : un événement
 *   arrive toujours APRÈS son `at`, donc chaque échantillon sous-estime l'écart
 *   de la latence ; le plus grand est le plus juste.
 * - La dérive se rattrape sans à-coup quand elle est petite (vitesse ±5 %), par
 *   un saut au-delà d'une seconde ; en pause, aucun mouvement ne la rattraperait :
 *   on saute dès qu'elle se voit.
 */

export type PlaybackCorrection =
  | { readonly kind: 'none' }
  | { readonly kind: 'rate'; readonly rate: number }
  | { readonly kind: 'seek'; readonly toMs: number };

const NUDGE_FROM_MS = 150;
const SEEK_FROM_MS = 1_000;
const PAUSED_TOLERANCE_MS = 100;
const NUDGE = 0.05;

export function servedPositionMs(playback: Pick<TogetherPlayback, 'playing' | 'positionMs' | 'at'>, serverNowMs: number): number {
  if (!playback.playing) return playback.positionMs;
  return playback.positionMs + Math.max(0, serverNowMs - playback.at);
}

export function estimateClockOffset(current: number | null, sample: { readonly serverAt: number; readonly localAt: number }): number {
  const measured = sample.serverAt - sample.localAt;
  return current === null ? measured : Math.max(current, measured);
}

export function playbackCorrection({ localMs, targetMs, playing }: { readonly localMs: number; readonly targetMs: number; readonly playing: boolean }): PlaybackCorrection {
  const drift = localMs - targetMs;
  const distance = Math.abs(drift);
  if (!playing) return distance > PAUSED_TOLERANCE_MS ? { kind: 'seek', toMs: targetMs } : { kind: 'none' };
  if (distance >= SEEK_FROM_MS) return { kind: 'seek', toMs: targetMs };
  if (distance >= NUDGE_FROM_MS) return { kind: 'rate', rate: drift < 0 ? 1 + NUDGE : 1 - NUDGE };
  return { kind: 'none' };
}

export type LocalGesture = 'play' | 'pause' | 'seek';

/**
 * Un geste fait ICI (commandes du lecteur) ne part chez l'autre que s'il CHANGE
 * l'état partagé : lecture ↔ pause, ou un déplacement d'au moins une seconde. Sinon
 * il ne fait que réaligner ce lecteur — une lecture refusée par le navigateur puis
 * relancée à la main ne ramène pas l'autre au début.
 */
export function localGestureEffect({
  gesture,
  localMs,
  targetMs,
  sharedPlaying,
}: {
  readonly gesture: LocalGesture;
  readonly localMs: number;
  readonly targetMs: number;
  readonly sharedPlaying: boolean;
}): 'send' | 'align' {
  if (gesture === 'play') return sharedPlaying ? 'align' : 'send';
  if (gesture === 'pause') return sharedPlaying ? 'send' : 'align';
  return Math.abs(localMs - targetMs) >= SEEK_FROM_MS ? 'send' : 'align';
}
