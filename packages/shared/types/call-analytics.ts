/**
 * La télémétrie d'un appel, émise par chaque client au raccrochage
 * (`call:analytics`) — extraite de `video-call.ts` (#11277), qui la
 * ré-exporte : l'adresse `@meeshy/shared/types/video-call` reste valable.
 *
 * L'autorité d'exécution est `socketCallAnalyticsSchema` (Zod, passerelle) :
 * ces types en sont la transcription, et se modifient avec lui.
 */

import type { AudioEffectType } from './call-audio-effects.js';

/**
 * Répartition du temps d'appel entre les quatre paliers de qualité, en
 * FRACTIONS sommant à 1 — jamais en secondes (`socketCallAnalyticsSchema` borne
 * chaque membre à `[0, 1]`).
 */
export interface CallQualityDistribution {
  readonly excellent: number;
  readonly good: number;
  readonly fair: number;
  readonly poor: number;
}

/**
 * Client → Server: le rapport de télémétrie terminal d'un appel, émis UNE fois
 * au raccrochage (« fire-and-forget », sans ack).
 *
 * Déclaré au cycle 107. Il ne l'était nulle part jusque-là : ni dans
 * `CLIENT_EVENTS`, ni dans `ClientToServerEvents`. Il ne vivait que dans
 * `CALL_EVENTS.ANALYTICS` et dans la signature en ligne de son listener — dix-neuf
 * champs transcrits à la main — pendant que les TROIS clients l'émettaient,
 * chacun contre sa propre transcription de la forme.
 *
 * C'est `conversation:join-error` (cycle 99) dans l'autre sens : là, huit
 * émetteurs serveur sans déclaration ; ici, un listener sans déclaration. La
 * réception est le sens le plus cher des deux — la forme y vient du réseau, donc
 * d'un émetteur que le dépôt ne contrôle pas.
 *
 * **L'autorité d'exécution reste `socketCallAnalyticsSchema`** (Zod, côté
 * passerelle) : cette interface en est la transcription au type, pas une seconde
 * source. Les deux se modifient ensemble — c'est le schéma qui REFUSE, ce type ne
 * fait que dire ce qui est attendu.
 */
export interface CallAnalyticsEvent {
  readonly callId: string;
  /** Sonnerie humaine INCLUSE. `-1` = jamais connecté (manqué, rejeté, échec). */
  readonly setupTimeMs: number;
  /**
   * Négociation WebRTC SEULE (answer/join → connected), sans le temps de
   * sonnerie. Optionnel : absent des builds iOS antérieurs au 2026-07-03.
   */
  readonly negotiationTimeMs?: number;
  readonly durationSeconds: number;
  readonly reconnectionCount: number;
  readonly networkTransitions: number;
  readonly averageRtt: number;
  readonly averagePacketLoss: number;
  readonly maxPacketLoss: number;
  readonly codec: string;
  readonly effectsUsed: readonly string[];
  readonly filtersUsed: boolean;
  readonly transcriptionUsed: boolean;
  readonly qualityDistribution: CallQualityDistribution;
  readonly platform: string;
  readonly deviceModel: string;
  readonly isVideo: boolean;
  readonly endReason: string;
}

/** @deprecated Forme d'avant le cycle 107, lue par aucun site : `CallAnalyticsEvent` fait foi. */
export interface CallAnalytics {
  readonly setupTimeMs: number
  /**
   * answer/join → connected : la négociation WebRTC seule, SANS le temps de
   * sonnerie humain inclus dans `setupTimeMs`. Optionnel (absent des builds
   * iOS < 2026-07-03) ; -1 = jamais connecté / ancrage manquant.
   */
  readonly negotiationTimeMs?: number
  readonly iceMethod: 'direct' | 'stun' | 'turn'
  readonly codec: { readonly audio: string; readonly video: string }
  readonly averageRtt: number
  readonly averagePacketLoss: number
  readonly maxPacketLoss: number
  readonly averageBitrate: { readonly audio: number; readonly video: number }
  readonly reconnectionCount: number
  readonly networkTransitions: number
  readonly effectsUsed: readonly AudioEffectType[]
  readonly filtersUsed: boolean
  readonly transcriptionEnabled: boolean
  readonly translationEnabled: boolean
  readonly qualityDistribution: { readonly excellent: number; readonly good: number; readonly fair: number; readonly poor: number }
  readonly platform: 'ios' | 'web'
  readonly deviceModel?: string
}
