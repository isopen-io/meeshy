/**
 * Configuration de tolérance du client ZMQ de traduction.
 *
 * Toutes les valeurs sont surchargeables par variable d'environnement afin
 * d'ajuster la résilience en production (timeouts, retries, circuit breaker)
 * SANS redéployer de code.
 *
 * Objectif produit : ne JAMAIS dropper une traduction tant que le translator
 * finit par répondre — même lentement — sans pour autant déclencher une tempête
 * de retries dupliqués qui sature le worker pool ML.
 */

export interface ZmqToleranceConfig {
  /** Timeout par tentative pour une requête de traduction texte (ms). */
  requestTimeoutMs: number;
  /** Nombre de retries avant abandon (tentatives totales = maxRetries + 1). */
  maxRetries: number;
  /** Deadman des pipelines voix longs (Whisper + NLLB + TTS) : un seul tir, pas de retry (ms). */
  voiceTranslateDeadmanMs: number;
  /** Seuil d'ouverture du circuit breaker (erreurs consécutives). */
  cbFailureThreshold: number;
  /** Durée d'ouverture du circuit breaker avant auto-reset (ms). */
  cbCooldownMs: number;
}

/**
 * Défauts volontairement tolérants : on préfère attendre que dropper.
 * - 30 s par tentative × (4 + 1) tentatives = jusqu'à 150 s avant abandon texte.
 * - Circuit breaker plus permissif (8) pour ne pas s'ouvrir sur un simple
 *   ralentissement transitoire du translator.
 */
export const ZMQ_TOLERANCE_DEFAULTS: ZmqToleranceConfig = {
  requestTimeoutMs: 30_000,
  maxRetries: 4,
  voiceTranslateDeadmanMs: 15 * 60_000,
  cbFailureThreshold: 8,
  cbCooldownMs: 30_000,
};

/**
 * Parse un entier depuis l'environnement, en repliant sur `fallback` pour toute
 * valeur absente, vide, non entière, ou strictement inférieure à `min`.
 */
export function parseBoundedInt(
  raw: string | undefined,
  fallback: number,
  min: number
): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (trimmed === '') return fallback;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < min) return fallback;
  return parsed;
}

/**
 * Construit la configuration de tolérance ZMQ à partir d'un environnement donné
 * (`process.env` par défaut). Fonction pure → testable et déterministe.
 */
export function readZmqToleranceConfig(
  env: NodeJS.ProcessEnv = process.env
): ZmqToleranceConfig {
  return {
    requestTimeoutMs: parseBoundedInt(
      env.ZMQ_REQUEST_TIMEOUT_MS,
      ZMQ_TOLERANCE_DEFAULTS.requestTimeoutMs,
      1
    ),
    maxRetries: parseBoundedInt(
      env.ZMQ_MAX_RETRIES,
      ZMQ_TOLERANCE_DEFAULTS.maxRetries,
      0
    ),
    voiceTranslateDeadmanMs: parseBoundedInt(
      env.ZMQ_VOICE_TRANSLATE_DEADMAN_MS,
      ZMQ_TOLERANCE_DEFAULTS.voiceTranslateDeadmanMs,
      1
    ),
    cbFailureThreshold: parseBoundedInt(
      env.CB_FAILURE_THRESHOLD,
      ZMQ_TOLERANCE_DEFAULTS.cbFailureThreshold,
      1
    ),
    cbCooldownMs: parseBoundedInt(
      env.CB_COOLDOWN_MS,
      ZMQ_TOLERANCE_DEFAULTS.cbCooldownMs,
      0
    ),
  };
}
