/**
 * La lecture AGRÉGÉE de la qualité de lecture (#11280) : temps-à-première-image
 * et rebuffer en p50/p95, par surface × tier d'appareil × jour, servie par
 * `GET /api/v1/admin/analytics/playback`.
 *
 * k-anonymat : une cellule n'est servie qu'au-delà de `minDevices` comptes
 * distincts. Une session sans compte (lecteur anonyme, analyse non consentie)
 * nourrit les quantiles mais ne compte jamais dans ce seuil : on ne compte que
 * ce que l'on peut prouver distinct. Aucun identifiant ne quitte l'agrégat.
 */
import type { DeviceTier } from './social-events-v2';

export const PLAYBACK_QOE_MIN_DEVICES = 20;
export const PLAYBACK_QOE_MAX_WINDOW_DAYS = 30;
export const PLAYBACK_QOE_DEFAULT_WINDOW_DAYS = 7;

export type QuantilePair = { readonly p50: number; readonly p95: number };

export type PlaybackQoeCell = {
  /** `AAAA-MM-JJ` UTC. */
  readonly day: string;
  /** Une valeur de `CONTENT_SURFACES`, ou `unknown` pour un client qui ne la dit pas. */
  readonly surface: string;
  readonly deviceTier: DeviceTier | 'unknown';
  readonly sessions: number;
  /** Comptes distincts — une borne BASSE du nombre d'appareils. */
  readonly devices: number;
  readonly timeToFirstFrameMs: QuantilePair | null;
  readonly rebufferMs: QuantilePair | null;
  /** Part du temps passé à rebufferiser : `rebufferMs / (playedMs + rebufferMs)`. */
  readonly rebufferRatio: QuantilePair | null;
  /** Part des sessions qui ont rebufferisé au moins une fois. */
  readonly rebufferedRate: number | null;
};

export type PlaybackQoeSummary = {
  readonly windowDays: number;
  /** La fenêtre a atteint le plafond de lecture : les jours les plus anciens sont incomplets. */
  readonly sampled: boolean;
  readonly minDevices: number;
  readonly cells: readonly PlaybackQoeCell[];
  /** Cellules retenues sous le seuil de k-anonymat — leur nombre seul, jamais leur contenu. */
  readonly suppressedCells: number;
};
