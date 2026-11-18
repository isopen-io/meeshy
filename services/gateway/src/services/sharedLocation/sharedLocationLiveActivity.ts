/**
 * LA FIN D'UN PARTAGE, PORTÉE À L'APPAREIL SUSPENDU (#19463).
 *
 * L'Activité en direct iOS, l'écran verrouillé et la notification en cours Android vivent app
 * suspendue : `location:share-ended` ne les atteint pas. Le relais signale chaque fin servie
 * (`SharedLocationRelayDeps.ended`, appelé là où la socket l'annonce et nulle part ailleurs) ;
 * ce module la pousse :
 *
 * - une poussée SILENCIEUSE au seul lecteur (type, émetteur, heure — rien de la position) ;
 * - `event: end` à chaque jeton d'Activité en direct que le lecteur a enregistré pour CE sujet,
 *   jeton aussitôt effacé.
 *
 * Les jetons vivent dans le cache STRICT du partage, une clé par lecteur, SCELLÉE et liée au
 * compte (aucun jeton en clair), échue avec la dernière échéance qu'elle porte, bornée à
 * `LIVE_ACTIVITY_TOKENS_PER_ACCOUNT_MAX`. On n'enregistre qu'un jeton de lecteur SERVI par le
 * partage courant du sujet : ce que le lecteur sait déjà, rien de plus. Une poussée ratée ne
 * lève jamais : la fin est déjà actée, et la socket comme le rattrapage restent la vérité.
 */
import {
  LIVE_ACTIVITY_TOKENS_PER_ACCOUNT_MAX,
  LOCATION_SHARE_ENDED_PUSH_TYPE,
  type LiveActivityTokenRegistered,
  type LiveActivityTokenRegistration,
  type LocationShareEndedPushData,
  type SharedLocationLiveActivityEndState,
} from '@meeshy/shared/types/shared-location-live-activity';
import { hasValidSecretsKey, isSealedSecret, openSecret, sealSecret } from '../../utils/secret-at-rest';
import type { SharedLocationKv } from './sharedLocationKv';
import { servedSharedLocationDeadline, type SharedLocationEndSignal, type SharedLocationRelayDeps } from './sharedLocationRelay';

export type LiveActivityApnsEnvironment = 'development' | 'production';

export type SharedLocationLiveActivityToken = {
  readonly subjectUserId: string;
  readonly token: string;
  readonly apnsEnvironment: LiveActivityApnsEnvironment;
  readonly expiresAt: string;
};

export type SharedLocationEndPush = {
  readonly silent: (readerId: string, data: LocationShareEndedPushData) => Promise<void>;
  readonly liveActivityEnd: (
    target: { readonly token: string; readonly apnsEnvironment: LiveActivityApnsEnvironment },
    state: SharedLocationLiveActivityEndState,
  ) => Promise<void>;
};

export type SharedLocationEndPushDeps = {
  readonly cache: SharedLocationKv;
  readonly push: SharedLocationEndPush;
  readonly now: () => number;
  readonly report?: (error: unknown) => void;
};

const keyOf = (readerId: string): string => `shared-location-la:{${readerId.toLowerCase()}}`;
const contextOf = (readerId: string): string => `SharedLocation.liveActivity:${readerId.toLowerCase()}`;

const isEnvironment = (value: unknown): value is LiveActivityApnsEnvironment => value === 'development' || value === 'production';

function parseToken(value: unknown): SharedLocationLiveActivityToken | null {
  if (typeof value !== 'object' || value === null) return null;
  const { subjectUserId, token, apnsEnvironment, expiresAt } = value as Record<string, unknown>;
  if (typeof subjectUserId !== 'string' || typeof token !== 'string' || !isEnvironment(apnsEnvironment)) return null;
  if (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt))) return null;
  return { subjectUserId, token, apnsEnvironment, expiresAt };
}

function openTokens(readerId: string, stored: string | null): readonly SharedLocationLiveActivityToken[] {
  if (stored === null || (hasValidSecretsKey() && !isSealedSecret(stored))) return [];
  try {
    const parsed: unknown = JSON.parse(openSecret(stored, contextOf(readerId)));
    const list = Array.isArray((parsed as { tokens?: unknown } | null)?.tokens) ? (parsed as { tokens: unknown[] }).tokens : [];
    return list.flatMap((entry) => parseToken(entry) ?? []);
  } catch {
    return [];
  }
}

const alive = (tokens: readonly SharedLocationLiveActivityToken[], now: number): readonly SharedLocationLiveActivityToken[] =>
  tokens.filter((token) => Date.parse(token.expiresAt) > now);

async function write(cache: SharedLocationKv, readerId: string, tokens: readonly SharedLocationLiveActivityToken[], now: number): Promise<void> {
  if (tokens.length === 0) {
    await cache.del(keyOf(readerId));
    return;
  }
  const last = Math.max(...tokens.map((token) => Date.parse(token.expiresAt)));
  await cache.set(keyOf(readerId), sealSecret(JSON.stringify({ tokens }), contextOf(readerId)), Math.max(1, Math.ceil((last - now) / 1000)));
}

/** Les jetons vivants du lecteur. */
export async function readSharedLocationLiveActivityTokens(cache: SharedLocationKv, readerId: string, now: number): Promise<readonly SharedLocationLiveActivityToken[]> {
  return alive(openTokens(readerId, await cache.get(keyOf(readerId))), now);
}

/**
 * Range le jeton d'un lecteur SERVI par le partage courant du sujet, jusqu'à son échéance ;
 * rend `null` (rien rangé) à qui ne l'est pas. Le même jeton réenregistré remplace l'ancien.
 */
export async function registerSharedLocationLiveActivityToken(
  deps: SharedLocationRelayDeps,
  input: { readonly readerId: string; readonly registration: LiveActivityTokenRegistration },
): Promise<LiveActivityTokenRegistered | null> {
  const { readerId, registration } = input;
  const subjectUserId = registration.subjectUserId.toLowerCase();
  if (subjectUserId === readerId.toLowerCase()) return null;
  const expiresAt = await servedSharedLocationDeadline(deps, subjectUserId, readerId);
  if (expiresAt === null) return null;
  const now = deps.now();
  const token = registration.token.toLowerCase();
  const kept = (await readSharedLocationLiveActivityTokens(deps.cache, readerId, now)).filter((entry) => entry.token !== token);
  const next = [...kept, { subjectUserId, token, apnsEnvironment: registration.apnsEnvironment ?? 'production', expiresAt }];
  await write(deps.cache, readerId, next.slice(-LIVE_ACTIVITY_TOKENS_PER_ACCOUNT_MAX), now);
  return { expiresAt };
}

/** La purge du compte lecteur : ses jetons partent avec lui. */
export async function purgeSharedLocationLiveActivityTokens(cache: SharedLocationKv, accountId: string): Promise<void> {
  await cache.del(keyOf(accountId));
}

const quietly = async (deps: SharedLocationEndPushDeps, send: () => Promise<void>): Promise<void> => {
  try {
    await send();
  } catch (error) {
    deps.report?.(error);
  }
};

/** Pousse UNE fin servie : la silencieuse au lecteur, puis `end` à ses jetons pour ce sujet, effacés d'abord. */
export async function pushSharedLocationEnd(deps: SharedLocationEndPushDeps, end: SharedLocationEndSignal): Promise<void> {
  const data: LocationShareEndedPushData = { type: LOCATION_SHARE_ENDED_PUSH_TYPE, userId: end.emitterId, endedAt: end.endedAt };
  await quietly(deps, () => deps.push.silent(end.readerId, data));

  let ending: readonly SharedLocationLiveActivityToken[] = [];
  await quietly(deps, async () => {
    const now = deps.now();
    const tokens = await readSharedLocationLiveActivityTokens(deps.cache, end.readerId, now);
    const subject = end.emitterId.toLowerCase();
    ending = tokens.filter((token) => token.subjectUserId === subject);
    if (ending.length > 0) await write(deps.cache, end.readerId, tokens.filter((token) => token.subjectUserId !== subject), now);
  });
  const state: SharedLocationLiveActivityEndState = { endedAt: end.endedAt };
  await Promise.all(ending.map((token) => quietly(deps, () => deps.push.liveActivityEnd({ token: token.token, apnsEnvironment: token.apnsEnvironment }, state))));
}

/** Le signal `ended` du relais : synchrone pour lui, la poussée part sans être attendue. */
export function sharedLocationEndPusherOf(deps: SharedLocationEndPushDeps): (end: SharedLocationEndSignal) => void {
  return (end) => {
    pushSharedLocationEnd(deps, end).catch((error: unknown) => deps.report?.(error));
  };
}
