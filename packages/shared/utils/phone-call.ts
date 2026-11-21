/**
 * « EN APPEL » — la fonction PURE qui range les rapports du téléphone (#18753), et la projection
 * servie à un Sang. Aucun délai n'est écrit ici : tout vient de `PhoneCallConfig`.
 */
import {
  PHONE_CALL_CONFIG,
  type PhoneCallAnnouncement,
  type PhoneCallConfig,
  type PhoneCallState,
} from '../types/phone-call.js';

/** L'état d'UN émetteur, rangé côté serveur (Redis, TTL court, aucun historique) ; nul hors appel. */
export type PhoneCallRecord = { readonly since: string; readonly reportedAt: string };

export type PhoneCallInput = { readonly kind: 'report'; readonly active: boolean; readonly at: string };

export type PhoneCallStepResult = { readonly state: PhoneCallRecord | null; readonly announcement?: PhoneCallAnnouncement };

const MINUTE_MS = 60_000;
const ms = (iso: string): number => Date.parse(iso);

const floorTo = (iso: string, stepMinutes: number): string => {
  const step = stepMinutes * MINUTE_MS;
  return new Date(Math.floor(ms(iso) / step) * step).toISOString();
};

const ceilTo = (iso: string, stepMinutes: number): string => {
  const step = stepMinutes * MINUTE_MS;
  return new Date(Math.ceil(ms(iso) / step) * step).toISOString();
};

const isLive = (record: PhoneCallRecord | null, at: string, config: PhoneCallConfig): record is PhoneCallRecord =>
  record !== null && ms(at) - ms(record.reportedAt) <= config.reportTtlMinutes * MINUTE_MS;

export const phoneCallStep = (previous: PhoneCallRecord | null, input: PhoneCallInput, config: PhoneCallConfig = PHONE_CALL_CONFIG): PhoneCallStepResult => {
  if (previous !== null && ms(input.at) < ms(previous.reportedAt)) return { state: previous };
  const live = isLive(previous, input.at, config) ? previous : null;
  // L'heure ANNONCÉE est arrondie comme le début servi : sinon elle rendrait l'instant exact (audit #18753).
  const announcedAt = floorTo(input.at, config.servedSinceStepMinutes);
  if (!input.active) return live ? { state: null, announcement: { kind: 'ended', at: announcedAt } } : { state: null };
  if (live) return { state: { since: live.since, reportedAt: input.at } };
  return { state: { since: input.at, reportedAt: input.at }, announcement: { kind: 'started', at: announcedAt } };
};

/**
 * Ce qu'un Sang lit : le début ARRONDI et l'heure où l'état cesse d'être servi, elle aussi arrondie
 * (au pas SUPÉRIEUR, pour ne jamais couper un appel avant son terme) — sans quoi `expiresAt − TTL`
 * rendrait l'instant exact du rapport, et l'arrondi du début ne cacherait rien. Jamais d'interlocuteur.
 */
export const servedPhoneCall = (userId: string, record: PhoneCallRecord | null, config: PhoneCallConfig = PHONE_CALL_CONFIG): PhoneCallState | null =>
  record === null
    ? null
    : {
      userId,
      since: floorTo(record.since, config.servedSinceStepMinutes),
      expiresAt: new Date(ms(ceilTo(record.reportedAt, config.servedSinceStepMinutes)) + config.reportTtlMinutes * MINUTE_MS).toISOString(),
    };
