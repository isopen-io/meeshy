/**
 * « CHUTE DÉTECTÉE » — les fonctions PURES de l'épisode (#18748) : l'âge d'un rapport, la
 * déduplication, et la projection servie à un Sang, TRONQUÉE À LA MINUTE. Aucun délai n'est écrit
 * ici : tout vient de `FallDetectionConfig`.
 */
import { FALL_CONSENT_VERSION, FALL_DETECTION_CONFIG, type FallAnnouncement, type FallDetectionConfig, type FallState } from '../types/fall-detection.js';

/** L'épisode d'UN émetteur, rangé côté serveur (Redis scellé, aucun historique). */
export type FallRecord = { readonly detectedAt: string; readonly openedAt: string };

export type FallReportVerdict = 'accepted' | 'too-old' | 'in-future';

export type FallStepResult = { readonly state: FallRecord; readonly opened: boolean };

const MINUTE_MS = 60_000;
const ms = (iso: string): number => Date.parse(iso);
const floorMinute = (iso: string): string => new Date(Math.floor(ms(iso) / MINUTE_MS) * MINUTE_MS).toISOString();

export const fallReportVerdict = (detectedAt: string, now: string, config: FallDetectionConfig = FALL_DETECTION_CONFIG): FallReportVerdict => {
  const age = ms(now) - ms(detectedAt);
  if (age > config.maxReportAgeMinutes * MINUTE_MS) return 'too-old';
  if (-age > config.maxFutureSkewMinutes * MINUTE_MS) return 'in-future';
  return 'accepted';
};

/** L'heure où l'épisode cesse d'être servi : la chute à la minute, plus sa durée de vie. */
export const fallExpiresAt = (record: FallRecord, config: FallDetectionConfig = FALL_DETECTION_CONFIG): string =>
  new Date(ms(floorMinute(record.detectedAt)) + config.episodeTtlMinutes * MINUTE_MS).toISOString();

export const isFallLive = (record: FallRecord | null, now: string, config: FallDetectionConfig = FALL_DETECTION_CONFIG): record is FallRecord =>
  record !== null && ms(now) < ms(fallExpiresAt(record, config));

/**
 * Une chute rapportée : elle ouvre un épisode, sauf si elle tombe dans l'épisode en cours (moins de
 * `dedupeWindowMinutes` après sa chute, ou avant elle) — rien n'est alors repoussé, ni l'état ni le push.
 */
export const fallStep = (previous: FallRecord | null, input: { readonly detectedAt: string; readonly at: string }, config: FallDetectionConfig = FALL_DETECTION_CONFIG): FallStepResult => {
  const live = isFallLive(previous, input.at, config) ? previous : null;
  if (live && ms(input.detectedAt) - ms(live.detectedAt) < config.dedupeWindowMinutes * MINUTE_MS) return { state: live, opened: false };
  return { state: { detectedAt: input.detectedAt, openedAt: input.at }, opened: true };
};

/** Ce qu'un Sang lit : la chute à la minute et l'expiration — jamais l'instant exact. */
export const servedFall = (userId: string, record: FallRecord, config: FallDetectionConfig = FALL_DETECTION_CONFIG): FallState => ({
  userId,
  detectedAt: floorMinute(record.detectedAt),
  expiresAt: fallExpiresAt(record, config),
});

export const fallAnnouncementOf = (record: FallRecord): FallAnnouncement => ({ kind: 'detected', at: floorMinute(record.detectedAt) });

/** L'accord ne vaut que daté ET donné sur la version COURANTE du texte : un texte changé se reconsent. */
export const isFallConsentCurrent = (consent: { readonly consentedAt: Date | string | null | undefined; readonly version: string | null | undefined }): boolean =>
  Boolean(consent.consentedAt) && consent.version === FALL_CONSENT_VERSION;

/** La trace d'un épisode CLOS (réponse, retrait) : son instant seul, pour qu'un rapport rejoué ne le rouvre pas. */
export type FallTombstone = { readonly detectedAt: string };

/** Un rapport couvert par la pierre tombale : même fenêtre que la déduplication de l'épisode en cours. */
export const fallTombstoneCovers = (tombstone: FallTombstone | null, detectedAt: string, config: FallDetectionConfig = FALL_DETECTION_CONFIG): boolean =>
  tombstone !== null && ms(detectedAt) - ms(tombstone.detectedAt) < config.dedupeWindowMinutes * MINUTE_MS;

/** La pierre tombale vit tant qu'un rapport du même instant peut encore être accepté. */
export const fallTombstoneExpiresAt = (tombstone: FallTombstone, config: FallDetectionConfig = FALL_DETECTION_CONFIG): string =>
  new Date(ms(tombstone.detectedAt) + config.maxReportAgeMinutes * MINUTE_MS).toISOString();

const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Un épisode s'ouvre : perce-t-il ? Au plus `maxUrgentEpisodesPerDay` épisodes sur 24 h glissantes
 * percent (time-sensitive) ; au-delà, l'alerte est servie et poussée sans percer.
 */
export const fallUrgencyStep = (
  openings: readonly string[],
  now: string,
  config: FallDetectionConfig = FALL_DETECTION_CONFIG,
): { readonly urgent: boolean; readonly openings: readonly string[] } => {
  const recent = openings.filter((at) => ms(now) - ms(at) < DAY_MS);
  return { urgent: recent.length < config.maxUrgentEpisodesPerDay, openings: [...recent, now] };
};
