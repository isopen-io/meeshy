/**
 * L'ÉTAT « EN APPEL » d'un émetteur, au repos (#18753) : le début et le dernier rapport, SCELLÉS par
 * `secret-at-rest` et liés au compte, avec les lecteurs à qui l'état a été servi. Vit la durée de
 * vie d'un rapport (`PHONE_CALL_CONFIG.reportTtlMinutes`), repoussée à chaque rappel : AUCUN
 * historique, et un téléphone qui ne dit jamais la fin ne laisse rien au-delà.
 */
import { PHONE_CALL_CONFIG } from '@meeshy/shared/types/phone-call';
import type { PhoneCallRecord } from '@meeshy/shared/utils/phone-call';
import { openSecret, sealSecret } from '../../utils/secret-at-rest';
import { withCacheLock, type ReachabilityCache } from '../phoneReachability/phoneReachabilityStore';

export type PhoneCallCache = ReachabilityCache;

export type StoredPhoneCall = PhoneCallRecord & {
  /** Les lecteurs à qui l'état a été servi : qui en sort reçoit son effacement. */
  readonly servedTo: readonly string[];
};

const id = (userId: string): string => userId.toLowerCase();
const stateKey = (userId: string): string => `pcall:state:${id(userId)}`;
const contextOf = (userId: string): string => `PhoneCall.state:${id(userId)}`;
const lockKey = (userId: string): string => `pcall:lock:${id(userId)}`;
/** La durée de vie d'un rapport, plus un pas d'arrondi : l'expiration SERVIE est arrondie au pas supérieur. */
const TTL = (PHONE_CALL_CONFIG.reportTtlMinutes + PHONE_CALL_CONFIG.servedSinceStepMinutes) * 60;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

function parse(raw: string): StoredPhoneCall | null {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value)) return null;
  const since = text(value.since);
  const reportedAt = text(value.reportedAt);
  if (since === null || reportedAt === null) return null;
  return { since, reportedAt, servedTo: Array.isArray(value.servedTo) ? value.servedTo.filter((v): v is string => text(v) !== null) : [] };
}

/** Sans clé de scellement dans un environnement servi, LÈVE : rien n'est rangé en clair. */
export async function storePhoneCall(cache: PhoneCallCache, userId: string, record: StoredPhoneCall): Promise<void> {
  await cache.set(stateKey(userId), sealSecret(JSON.stringify(record), contextOf(userId)), TTL);
}

/** L'état courant, ou `null` (absent, expiré, illisible, scellé pour un autre compte). */
export async function readPhoneCall(cache: PhoneCallCache, userId: string): Promise<StoredPhoneCall | null> {
  const stored = await cache.get(stateKey(userId));
  if (stored === null) return null;
  try {
    return parse(openSecret(stored, contextOf(userId)));
  } catch {
    return null;
  }
}

export async function clearPhoneCall(cache: PhoneCallCache, userId: string): Promise<void> {
  await cache.del(stateKey(userId));
}

export function withPhoneCallLock<T>(cache: PhoneCallCache, userId: string, run: () => Promise<T>): Promise<T> {
  return withCacheLock(cache, lockKey(userId), run);
}
