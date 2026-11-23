import { PHONE_REACHABILITY_CONFIG } from '@meeshy/shared/types/phone-reachability-constants';
import type { PhoneReachabilityState } from '@meeshy/shared/types/phone-reachability';

/**
 * **UN TÉLÉPHONE INJOIGNABLE QUI DURE** (#20241, iso `PhoneUnreachableLasting.swift`) — la passerelle me sert que le
 * téléphone d'un proche ne répond plus depuis `unreachableSince` (son dernier signe de vie, après ses sondes). Passé
 * {@link PHONE_UNREACHABLE_MINIMUM_SILENCE_MS}, ce qui exige son téléphone ne peut plus aboutir : le talkie devient un
 * message vocal, « Demander un relevé » disparaît. Sans état servi, ou au-delà de la durée de vie du contrat, rien ne
 * change : ce client ne devine rien.
 */

/** Cinq minutes de silence au moins depuis le dernier signe de vie : écarte une horloge ou un épisode tout juste ouvert. */
export const PHONE_UNREACHABLE_MINIMUM_SILENCE_MS = 5 * 60_000;

const TTL_MS = PHONE_REACHABILITY_CONFIG.stateTtlSeconds * 1_000;

const elapsedOf = (state: PhoneReachabilityState | null, now: number): number | null => {
  const since = state === null ? Number.NaN : Date.parse(state.unreachableSince);
  return Number.isFinite(since) ? now - since : null;
};

export function isPhoneUnreachableLasting(state: PhoneReachabilityState | null, now: number): boolean {
  const elapsed = elapsedOf(state, now);
  return elapsed !== null && elapsed >= PHONE_UNREACHABLE_MINIMUM_SILENCE_MS && elapsed <= TTL_MS;
}

/** Dans combien de temps la réponse de {@link isPhoneUnreachableLasting} change ; `null` : plus jamais pour cet état. */
export function phoneUnreachableLastingWakeInMs(state: PhoneReachabilityState | null, now: number): number | null {
  const elapsed = elapsedOf(state, now);
  if (elapsed === null || elapsed > TTL_MS) return null;
  return elapsed < PHONE_UNREACHABLE_MINIMUM_SILENCE_MS ? PHONE_UNREACHABLE_MINIMUM_SILENCE_MS - elapsed : TTL_MS - elapsed + 1;
}

