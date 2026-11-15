/**
 * L'ÉTAT DE BATTERIE d'un émetteur, au repos (#14147) — sur le modèle de `nowPlayingStore.ts`.
 *
 * - l'épisode (`BatteryEpisodeState`), l'ancre de la pente et l'étiquette de l'appareil, SCELLÉS
 *   par `secret-at-rest` et liés au compte : jamais un niveau en clair dans le cache ;
 * - la mémoire « a reçu le push critique », lecteur par lecteur, le temps de l'épisode ;
 * - le verrou du relevé à la demande, par paire, 5 min ;
 * - l'ENSEMBLE des émetteurs que le balayage d'extinction relit (un épisode en cours) — un SET
 *   Redis, jamais `KEYS`, qui bloque le serveur à l'échelle ;
 * - le verrou court qui sérialise les pas d'épisode d'un émetteur (relevé, signe de vie, balayage).
 *
 * Tout vit `BATTERY_CONFIG.stateTtlSeconds` (24 h) au plus : AUCUN historique.
 */
import { BATTERY_CONFIG, BATTERY_PHASES, type BatteryPhase } from '@meeshy/shared/types/battery';
import type { BatteryEpisodeState, BatteryReading } from '@meeshy/shared/utils/battery-episode';
import type { CacheStore } from '../CacheStore';
import { openSecret, sealSecret } from '../../utils/secret-at-rest';

/** Le cache partagé, plus un ENSEMBLE (SADD / SREM / SMEMBERS) pour les émetteurs surveillés. */
export type BatteryCache = Pick<CacheStore, 'get' | 'set' | 'del' | 'setnx'> & {
  readonly addMember: (key: string, member: string) => Promise<void>;
  readonly removeMember: (key: string, member: string) => Promise<void>;
  readonly members: (key: string) => Promise<readonly string[]>;
};

export type BatteryRecord = {
  readonly episode: BatteryEpisodeState;
  /** Le premier relevé en décharge de l'épisode : la pente de `estimatedMinutes` part de lui. */
  readonly anchor: BatteryReading | null;
  readonly deviceLabel: string | null;
  /** Les lecteurs à qui l'état a été servi : qui en sort reçoit son effacement, quelle que soit la cause. */
  readonly servedTo: readonly string[];
};

const id = (userId: string): string => userId.toLowerCase();
const stateKey = (userId: string): string => `battery:state:${id(userId)}`;
const contextOf = (userId: string): string => `Battery.state:${id(userId)}`;
const criticalKey = (userId: string): string => `battery:critical:${id(userId)}`;
const WATCH_SET = 'battery:watched';
const lockKey = (userId: string): string => `battery:lock:${id(userId)}`;
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
  return {
    episode,
    anchor: parseReading(value.anchor),
    deviceLabel: isText(value.deviceLabel) ? value.deviceLabel : null,
    servedTo: Array.isArray(value.servedTo) ? value.servedTo.filter(isText) : [],
  };
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
  if (watched) await cache.addMember(WATCH_SET, id(emitterId));
  else await cache.removeMember(WATCH_SET, id(emitterId));
}

export async function watchedBatteryEmitters(cache: BatteryCache): Promise<readonly string[]> {
  return cache.members(WATCH_SET);
}

/** Un pas d'épisode tient le verrou au plus ce délai : un processus mort ne le garde pas. */
export const BATTERY_LOCK_SECONDS = 10;
const LOCK_ATTEMPTS = 40;
const LOCK_PAUSE_MS = 25;

export class BatteryBusyError extends Error {
  constructor() {
    super('battery state busy');
  }
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sérialise les pas d'épisode d'UN émetteur à travers la flotte : lecture, calcul et écriture
 * se font sous un verrou `SET NX` court, si bien qu'un relevé, un signe de vie et un balayage
 * qui se croisent ne s'écrasent jamais. LÈVE {@link BatteryBusyError} quand il reste pris.
 */
export async function withBatteryLock<T>(cache: BatteryCache, emitterId: string, run: () => Promise<T>): Promise<T> {
  const key = lockKey(emitterId);
  const token = `${process.pid}:${Date.now()}:${Math.random()}`;
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    if (await cache.setnx(key, token, BATTERY_LOCK_SECONDS)) {
      try {
        return await run();
      } finally {
        if ((await cache.get(key)) === token) await cache.del(key);
      }
    }
    await pause(LOCK_PAUSE_MS);
  }
  throw new BatteryBusyError();
}
