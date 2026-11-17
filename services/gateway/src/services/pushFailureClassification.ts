/**
 * Qui est en faute quand un push échoue : le JETON (mort, désinscrit) ou le FOURNISSEUR (réseau, clé,
 * panne, charge) ? Un seul classificateur, partagé par FCM, APNs et PushToTalk (#18910, serveur-transport-1
 * et -2) : une faute du fournisseur ne compte jamais contre le jeton — trois coupures d'APNs ne doivent pas
 * désactiver l'iPhone sain qui les a subies.
 */

export type ApnsFailure = { response?: { reason?: string }; status?: number | string };

// Raisons Apple qui disent que le jeton lui-même est mort : désactivé au premier échec.
export const APNS_PERMANENT_REASONS: ReadonlySet<string> = new Set([
  'BadDeviceToken', 'Unregistered', 'ExpiredToken', 'DeviceTokenNotForTopic',
]);

// Raisons Apple d'un hoquet du fournisseur : on RÉESSAIE (court) avant de rendre l'échec.
const APNS_RETRYABLE_REASONS: ReadonlySet<string> = new Set([
  'InternalServerError', 'ServiceUnavailable', 'TooManyRequests', 'Shutdown',
]);

// Raisons Apple qui condamnent NOTRE clé, NOTRE topic ou NOTRE certificat : rien à voir avec le jeton.
const APNS_PROVIDER_REASONS: ReadonlySet<string> = new Set([
  'InvalidProviderToken', 'ExpiredProviderToken', 'MissingProviderToken', 'TopicDisallowed',
  'BadCertificate', 'BadCertificateEnvironment', 'Forbidden', 'MissingTopic', 'BadTopic',
]);

// Raisons Apple qui condamnent la CHARGE que nous avons composée : rien à voir avec le jeton non plus.
const APNS_PAYLOAD_REASONS: ReadonlySet<string> = new Set([
  'PayloadTooLarge', 'PayloadEmpty', 'InvalidPushType', 'BadCollapseId', 'BadExpirationDate',
  'BadMessageId', 'BadPriority', 'BadPath', 'MethodNotAllowed',
]);

export const isRetryableApnsReason = (reason: string | undefined): boolean =>
  !!reason && APNS_RETRYABLE_REASONS.has(reason);

/**
 * Vrai seulement quand Apple a répondu par une raison qui peut viser le jeton (permanente, ou inconnue :
 * la règle des trois fautes la garde). Un échec SANS raison — délai d'écriture, session HTTP/2 fermée,
 * 408/500/504 — ou une raison côté clé ou côté charge n'accuse pas le jeton.
 */
export function apnsFailureIsTokenFault(failure: ApnsFailure | undefined): boolean {
  const reason = failure?.response?.reason;
  return !!reason && !APNS_PROVIDER_REASONS.has(reason) && !APNS_PAYLOAD_REASONS.has(reason);
}

export type PushFailureOutcome = { error: string; transient: boolean };

export function apnsFailureOutcome(failure: ApnsFailure | undefined): PushFailureOutcome {
  const reason = failure?.response?.reason;
  return {
    error: reason || 'APNS delivery failed',
    transient: isRetryableApnsReason(reason) || !apnsFailureIsTokenFault(failure),
  };
}

// FCM : le jeton est mort — le disjoncteur ne le compte pas comme une panne de Firebase.
const FCM_TOKEN_DEAD_CODES: ReadonlySet<string> = new Set([
  'messaging/registration-token-not-registered', 'messaging/invalid-registration-token',
]);

// FCM : hoquets de Firebase qu'on réessaie.
const FCM_RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'messaging/internal-error', 'messaging/server-unavailable', 'messaging/unavailable', 'messaging/quota-exceeded',
]);

// FCM : côté identifiants du projet ou côté réseau — jamais le jeton. `invalid-argument` n'y est PAS : il
// signale aussi un jeton mal formé.
const FCM_PROVIDER_CODES: ReadonlySet<string> = new Set([
  ...FCM_RETRYABLE_CODES, 'messaging/mismatched-credential', 'messaging/third-party-auth-error',
]);

export const isFcmTokenDeadCode = (code: string | undefined): boolean => !!code && FCM_TOKEN_DEAD_CODES.has(code);

export const isRetryableFcmCode = (code: string | undefined): boolean => !!code && FCM_RETRYABLE_CODES.has(code);

export const fcmFailureIsProviderFault = (code: string | undefined): boolean =>
  !!code && (FCM_PROVIDER_CODES.has(code) || code.startsWith('app/network-'));

/** Le repli d'un disjoncteur ouvert : une panne du fournisseur déclarée, jamais une valeur qui ressemble à un succès. */
export const circuitOpenError = (provider: string): Error =>
  Object.assign(new Error(`${provider} circuit breaker OPEN`), { code: 'messaging/server-unavailable' });
