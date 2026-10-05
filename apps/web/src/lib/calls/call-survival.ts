import type { ConnectionQualityLevel } from '@meeshy/shared/types/video-call';

/**
 * **LA SURVIE VIDÉO** (#8047) — la politique de `VideoSurvivalController.swift`
 * portée au web, sans WebRTC : une suite d'échantillons datés devient un stade.
 *
 * - `sending` : la vidéo suit le palier de son lien (`call-quality.ts`) ;
 * - `frozen` : un lien mauvais TENU `FREEZE_AFTER_MS` gèle l'image à 2 i/s,
 *   au plancher de débit — l'image tient, l'audio prend la bande ;
 * - `suspended` : si le gel lui-même ne tient pas `SUSPEND_AFTER_MS` de plus,
 *   la vidéo cesse d'être émise (`active: false`, sans renégociation).
 *
 * La reprise exige un lien bon tenu `RESUME_AFTER_MS`, plus long que la chute
 * (hystérésis : rallumer coûte, osciller coûte plus). Un échantillon mauvais la
 * remet à zéro, un moyen la tient. Seuils en DURÉE, jamais en nombre
 * d'échantillons : la cadence de mesure peut changer sans changer la loi.
 */

export const FREEZE_AFTER_MS = 6_000;
export const SUSPEND_AFTER_MS = 6_000;
export const RESUME_AFTER_MS = 10_000;

export type SurvivalStage = 'sending' | 'frozen' | 'suspended';

export type SurvivalState = {
  readonly stage: SurvivalStage;
  readonly degradedSince: number | null;
  readonly recoveringSince: number | null;
};

export type SurvivalSample = {
  readonly at: number;
  readonly level: ConnectionQualityLevel;
  readonly wantsVideo: boolean;
};

export function initialSurvival(): SurvivalState {
  return { stage: 'sending', degradedSince: null, recoveringSince: null };
}

const isGood = (level: ConnectionQualityLevel): boolean => level === 'good' || level === 'excellent';

function whileDegraded(state: SurvivalState, at: number): SurvivalState {
  if (state.stage === 'suspended') return { ...state, recoveringSince: null };
  const since = state.degradedSince ?? at;
  if (state.stage === 'sending') return at - since >= FREEZE_AFTER_MS ? { stage: 'frozen', degradedSince: at, recoveringSince: null } : { ...state, degradedSince: since };
  return at - since >= SUSPEND_AFTER_MS ? { stage: 'suspended', degradedSince: null, recoveringSince: null } : { ...state, degradedSince: since, recoveringSince: null };
}

function whileRecovering(state: SurvivalState, at: number): SurvivalState {
  if (state.stage === 'sending') return { ...state, degradedSince: null };
  const since = state.recoveringSince ?? at;
  return at - since >= RESUME_AFTER_MS ? initialSurvival() : { ...state, degradedSince: null, recoveringSince: since };
}

export function stepSurvival(state: SurvivalState, sample: SurvivalSample): SurvivalState {
  if (!sample.wantsVideo) return initialSurvival();
  if (sample.level === 'poor') return whileDegraded(state, sample.at);
  if (isGood(sample.level)) return whileRecovering(state, sample.at);
  return { ...state, degradedSince: null };
}
