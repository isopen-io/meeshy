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
  'InternalServerError', 'ServiceUnavailable', 'TooManyRequests', 'Shutdown', 'IdleTimeout',
]);

// Raisons Apple qui condamnent NOTRE clé, NOTRE topic ou NOTRE certificat : rien à voir avec le jeton.
const APNS_PROVIDER_REASONS: ReadonlySet<string> = new Set([
  'InvalidProviderToken', 'ExpiredProviderToken', 'MissingProviderToken', 'TopicDisallowed',
  'BadCertificate', 'BadCertificateEnvironment', 'Forbidden', 'MissingTopic', 'BadTopic',
  'TooManyProviderTokenUpdates', 'UnrelatedKeyIdInToken', 'BadEnvironmentKeyIdInToken', 'IdleTimeout',
]);

// Raisons Apple qui condamnent la CHARGE que nous avons composée : rien à voir avec le jeton non plus.
const APNS_PAYLOAD_REASONS: ReadonlySet<string> = new Set([
  'PayloadTooLarge', 'PayloadEmpty', 'InvalidPushType', 'BadCollapseId', 'BadExpirationDate',
  'BadMessageId', 'BadPriority', 'BadPath', 'MethodNotAllowed', 'DuplicateHeaders', 'MissingDeviceToken',
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

/**
 * Ce qu'un échec FCM dit du jeton et de Firebase. Les codes sont ceux de `MessagingErrorCode` de firebase-admin 14.5
 * (`lib/messaging/error.js`), le seul vocabulaire que le SDK émet, plus les `app/*` du module d'application.
 *
 * - `token-dead` : Firebase dit le jeton mort, il est désactivé au premier échec.
 * - `token-fault` : il vise peut-être le jeton (mal formé, mauvais paquet) ; la règle des trois fautes le garde.
 * - `token-fault-if-provider-healthy` : identifiants refusés pour CE jeton (autre projet Firebase, clé APNs
 *   ou Web Push d'un tiers). Faute du jeton seulement quand Firebase livre sur la même plateforme ; sinon c'est
 *   notre projet qui est en cause, et personne n'est puni.
 * - `not-token-fault` : la charge que nous composons, une cadence dépassée, une erreur sans détail : ni faute au
 *   jeton, ni panne de Firebase.
 * - `provider-outage` : Firebase ou notre compte de service ne répond plus ; seul ce verdict nourrit le disjoncteur.
 *
 * Un code propre à un jeton ne nourrit JAMAIS le disjoncteur global : cinq jetons d'un autre projet notifiés à la
 * suite couperaient Firebase à tous les comptes pendant soixante secondes, sonnerie d'appel Android comprise.
 */
export type FcmFailureVerdict =
  | 'token-dead'
  | 'token-fault'
  | 'token-fault-if-provider-healthy'
  | 'not-token-fault'
  | 'provider-outage';

const FCM_VERDICTS: ReadonlyMap<string, FcmFailureVerdict> = new Map<string, FcmFailureVerdict>([
  ['messaging/registration-token-not-registered', 'token-dead'],
  ['messaging/invalid-registration-token', 'token-dead'],
  ['messaging/installation-id-not-registered', 'token-dead'],
  ['messaging/invalid-argument', 'token-fault'],
  ['messaging/invalid-recipient', 'token-fault'],
  ['messaging/invalid-package-name', 'token-fault'],
  ['messaging/mismatched-credential', 'token-fault-if-provider-healthy'],
  ['messaging/third-party-auth-error', 'token-fault-if-provider-healthy'],
  ['messaging/invalid-payload', 'not-token-fault'],
  ['messaging/invalid-data-payload-key', 'not-token-fault'],
  ['messaging/payload-size-limit-exceeded', 'not-token-fault'],
  ['messaging/invalid-options', 'not-token-fault'],
  ['messaging/device-message-rate-exceeded', 'not-token-fault'],
  ['messaging/message-rate-exceeded', 'not-token-fault'],
  ['messaging/topics-message-rate-exceeded', 'not-token-fault'],
  ['messaging/topics-subscription-rate-exceeded', 'not-token-fault'],
  ['messaging/too-many-topics', 'not-token-fault'],
  ['messaging/unknown-error', 'not-token-fault'],
  ['messaging/internal-error', 'provider-outage'],
  ['messaging/server-unavailable', 'provider-outage'],
  ['messaging/authentication-error', 'provider-outage'],
]);

// FCM : ce que Google dit de réessayer (500, 503, 429) — avant de rendre le verdict.
const FCM_RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'messaging/internal-error', 'messaging/server-unavailable', 'messaging/message-rate-exceeded',
]);

export const isRetryableFcmCode = (code: string | undefined): boolean => !!code && FCM_RETRYABLE_CODES.has(code);

/** Sans code (délai, disjoncteur ouvert) ou `app/*` (réseau, identifiants du projet) : une panne. Code inconnu : trois fautes. */
export function fcmFailureVerdict(code: string | undefined): FcmFailureVerdict {
  if (!code || code.startsWith('app/')) return 'provider-outage';
  return FCM_VERDICTS.get(code) ?? 'token-fault';
}

/** L'issue d'un refus FCM rendu en valeur : `providerHealthy` dit si Firebase a livré récemment sur la même plateforme. */
export function fcmRejectionOutcome(
  rejection: { readonly code: string; readonly message: string },
  context: { readonly providerHealthy: boolean },
): PushFailureOutcome {
  const verdict = fcmFailureVerdict(rejection.code);
  if (verdict === 'token-dead') return { error: 'TOKEN_INVALID', transient: false };
  const transient = verdict === 'not-token-fault'
    || verdict === 'provider-outage'
    || (verdict === 'token-fault-if-provider-healthy' && !context.providerHealthy);
  return { error: rejection.message, transient };
}

/** Ce que Firebase a rendu : `rejection` quand il a refusé le jeton ou le message (une réponse, pas une panne). */
export type FcmSendOutcome = { readonly rejection: { readonly code: string; readonly message: string } | null };

/** Le repli d'un disjoncteur ouvert : une panne du fournisseur déclarée, jamais une valeur qui ressemble à un succès. */
export const circuitOpenError = (provider: string): Error => new Error(`${provider} circuit breaker OPEN`);
