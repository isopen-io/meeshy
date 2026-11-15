/**
 * L'ÉTAT DE BATTERIE d'un émetteur, au repos (#14147) — sur le modèle de `nowPlayingStore.ts`.
 *
 * - l'épisode (`BatteryEpisodeState`), l'ancre de la pente et l'étiquette de l'appareil, SCELLÉS
 *   par `secret-at-rest` et liés au compte : jamais un niveau en clair dans le cache ;
 * - la mémoire « a reçu le push critique », lecteur par lecteur, le temps de l'épisode ;
 * - le verrou du relevé à la demande, par paire, 5 min ;
 * - le marqueur que le balayage d'extinction relit (un épisode en cours).
 *
 * Tout vit `BATTERY_CONFIG.stateTtlSeconds` (24 h) au plus : AUCUN historique.
 */
import { BATTERY_CONFIG, BATTERY_PHASES, type BatteryPhase } from '@meeshy/shared/types/battery';
import type { BatteryEpisodeState, BatteryReading } from '@meeshy/shared/utils/battery-episode';
import type { CacheStore } from '../CacheStore';
import { openSecret, sealSecret } from '../../utils/secret-at-rest';

export type BatteryCache = Pick<CacheStore, 'get' | 'set' | 'del' | 'setnx' | 'keys'>;

export type BatteryRecord = {
  readonly episode: BatteryEpisodeState;
  /** Le premier relevé en décharge de l'épisode : la pente de `estimatedMinutes` part de lui. */
  readonly anchor: BatteryReading | null;
  readonly deviceLabel: string | null;
};

const id = (userId: string): string => userId.toLowerCase();
const stateKey = (userId: string): string => `battery:state:${id(userId)}`;
const contextOf = (userId: string): string => `Battery.state:${id(userId)}`;
const criticalKey = (userId: string): string => `battery:critical:${id(userId)}`;
const WATCH_PREFIX = 'battery:watch:';
const pullKey = (emitterId: string, readerId: string): string => `battery:pull:${id(emitterId)}:${id(readerId)}`;

const TTL = BATTERY_CONFIG.stateTtlSeconds;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isPhase = (value: unknown): value is BatteryPhase => typeof value === 'string' && (BATTERY_PHASES as readonly string[]).includes(value);

function parseReading(value: unknown): BatteryReading | null {
  if (!isRecord(value)) return null;
  const { level, charging, lowPower, measuredAt } = value;
  if (typeof level !== 'number' || typeof charging !== 'boolean' || typeof lowPower !== 'boolean' || !isText(measuredAt)) return null;
  return { level, charging, lowPower, measuredAt };
}

function parseEpisode(value: unknown): BatteryEpisodeState | null {
  if (!isRecord(value) || !isPhase(value.phase) || !Array.isArray(value.announcedThresholds)) return null;
  const thresholds = value.announcedThresholds.filter((t): t is number => typeof t === 'number');
  return {
    phase: value.phase,
    announcedThresholds: thresholds,
    criticalFloor: typeof value.criticalFloor === 'number' ? value.criticalFloor : null,
    closedAt: isText(value.closedAt) ? value.closedAt : null,
    lastReading: parseReading(value.lastReading),
    lastSeenAt: isText(value.lastSeenAt) ? value.lastSeenAt : null,
  };
}

function parseRecord(raw: string): BatteryRecord | null {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value)) return null;
  const episode = parseEpisode(value.episode);
  if (!episode) return null;
  return { episode, anchor: parseReading(value.anchor), deviceLabel: isText(value.deviceLabel) ? value.deviceLabel : null };
}

/** Sans clé de scellement dans un environnement servi, LÈVE : rien n'est rangé en clair. */
export async function storeBatteryRecord(cache: BatteryCache, userId: string, record: BatteryRecord): Promise<void> {
  await cache.set(stateKey(userId), sealSecret(JSON.stringify(record), contextOf(userId)), TTL);
}

/** L'épisode courant, ou `null` (absent, expiré, illisible, scellé pour un autre compte). */
export async function readBatteryRecord(cache: BatteryCache, userId: string): Promise<BatteryRecord | null> {
  const stored = await cache.get(stateKey(userId));
  if (stored === null) return null;
  try {
    return parseRecord(openSecret(stored, contextOf(userId)));
  } catch {
    return null;
  }
}

export async function clearBatteryRecord(cache: BatteryCache, userId: string): Promise<void> {
  await cache.del(stateKey(userId));
}

export async function readCriticalReaders(cache: BatteryCache, emitterId: string): Promise<ReadonlySet<string>> {
  const raw = await cache.get(criticalKey(emitterId));
  if (raw === null) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    return new Set(Array.isArray(value) ? value.filter(isText) : []);
  } catch {
    return new Set();
  }
}

export async function rememberCriticalReaders(cache: BatteryCache, emitterId: string, readerIds: readonly string[]): Promise<void> {
  if (readerIds.length === 0) return;
  const known = await readCriticalReaders(cache, emitterId);
  await cache.set(criticalKey(emitterId), JSON.stringify([...new Set([...known, ...readerIds])]), TTL);
}

export async function forgetCriticalReaders(cache: BatteryCache, emitterId: string): Promise<void> {
  await cache.del(criticalKey(emitterId));
}

/** Un relevé à la demande par paire et par fenêtre : `true` si celui-ci est le premier. */
export function claimBatteryPull(cache: BatteryCache, pair: { readonly emitterId: string; readonly readerId: string }): Promise<boolean> {
  return cache.setnx(pullKey(pair.emitterId, pair.readerId), '1', BATTERY_CONFIG.pullCooldownMinutes * 60);
}

/** Un épisode en cours se surveille : le balayage d'extinction ne relit que ces émetteurs. */
export async function watchBatteryEmitter(cache: BatteryCache, emitterId: string, watched: boolean): Promise<void> {
  if (watched) await cache.set(`${WATCH_PREFIX}${id(emitterId)}`, '1', TTL);
  else await cache.del(`${WATCH_PREFIX}${id(emitterId)}`);
}

export async function watchedBatteryEmitters(cache: BatteryCache): Promise<readonly string[]> {
  const keys = await cache.keys(`${WATCH_PREFIX}*`);
  return keys.map((key) => key.slice(WATCH_PREFIX.length));
}
