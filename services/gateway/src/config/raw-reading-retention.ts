/**
 * La durée de conservation du BRUT de lecture — `PostImpression` et
 * `PostEngagement` — et la seule source de cette durée (#10510, décision
 * porteur, commentaire 6222116672).
 *
 * Défaut : 25 mois (760 jours). Elle se règle par `RAW_READING_RETENTION_DAYS`
 * (entier de jours, > 0), lue à chaque appel : l'hôte la change sans nouvelle
 * image. Une valeur vide ou illisible sert le défaut. La création des lignes
 * ET la migration qui date l'existant la lisent toutes deux ici.
 *
 * Les événements v2 bruts et `AnonymousPostOpen` gardent leurs propres durées.
 */

import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'raw-reading-retention' });

export const RAW_READING_RETENTION_ENV = 'RAW_READING_RETENTION_DAYS';

export const DEFAULT_RAW_READING_RETENTION_DAYS = 760;

const DAY_MS = 24 * 60 * 60 * 1000;

const WHOLE_DAYS = /^\d+$/;

export function parseRawReadingRetentionDays(raw: string | undefined): number {
  const value = raw?.trim() ?? '';
  if (value === '') return DEFAULT_RAW_READING_RETENTION_DAYS;
  const days = WHOLE_DAYS.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(days) || days <= 0) {
    logger.warn(
      `[retention] ${RAW_READING_RETENTION_ENV} illisible ("${value}") — conservation par défaut (${DEFAULT_RAW_READING_RETENTION_DAYS} j)`,
    );
    return DEFAULT_RAW_READING_RETENTION_DAYS;
  }
  return days;
}

export const rawReadingRetentionMs = (): number =>
  parseRawReadingRetentionDays(process.env[RAW_READING_RETENTION_ENV]) * DAY_MS;
