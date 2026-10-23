/**
 * La file de médias (#11264) : BullMQ sur le Redis existant, une seule file
 * (`media-processing`), une tâche par pièce, trois essais à reprise
 * exponentielle. Allumée par `MEDIA_QUEUE=bullmq` (staging) ; éteinte, aucune
 * tâche n'existe et tout le rendu reste dans la requête, comme avant.
 *
 * Audit S9, défauts 1 et 2 — la requête ne doit JAMAIS attendre Redis :
 * - la connexion PRODUCTRICE est distincte de celle du worker : sans file hors
 *   ligne, réessais bornés, délai de connexion court. Celle du worker garde
 *   `maxRetriesPerRequest: null`, qu'exige le blocage de BullMQ ;
 * - chaque appel est borné (`MEDIA_QUEUE_CALL_TIMEOUT_MS`) ; au-delà, il échoue
 *   et l'appelant rend sur place ;
 * - on ne diffère que si un worker est VIVANT : il pose un battement de cœur
 *   en Redis, à échéance courte ; sans battement, tout reste synchrone.
 */
import { Queue } from 'bullmq';
import { enhancedLogger } from '../../../utils/logger-enhanced.js';
import { MEDIA_QUEUE_NAME, mediaJobId, mediaJobPriority, type MediaJob } from './jobs';

const logger = enhancedLogger.child({ module: 'media-queue' });

export const MEDIA_JOB_ATTEMPTS = 3;
export const MEDIA_QUEUE_CALL_TIMEOUT_MS = 2000;
export const MEDIA_WORKER_HEARTBEAT_KEY = 'meeshy:media-worker:heartbeat';
export const MEDIA_WORKER_HEARTBEAT_TTL_MS = 30_000;
const WORKER_ALIVE_CACHE_MS = 5000;

export interface MediaJobQueue {
  /** Un worker vivant consomme-t-il la file ? Borné ; `false` sur toute panne. */
  workerAlive(): Promise<boolean>;
  /** Met la tâche en file ; LÈVE sur panne ou délai, jamais n'attend sans fin. */
  schedule(job: MediaJob): Promise<void>;
}

type HeartbeatClient = { get(key: string): Promise<string | null> };
type ExistingJob = { getState(): Promise<string>; remove(): Promise<void> };

export type QueueLike = {
  add(name: string, data: MediaJob, options: Record<string, unknown>): Promise<unknown>;
  readonly client: Promise<HeartbeatClient>;
  getJob?(id: string): Promise<ExistingJob | undefined>;
};

/** Une promesse bornée : rejette au délai, et son rejet tardif n'est jamais orphelin. */
export function bounded<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  work.catch(() => undefined);
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: pas de réponse en ${ms} ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export function bullmqMediaJobQueue(
  queue: QueueLike,
  options: { readonly timeoutMs?: number; readonly now?: () => number } = {}
): MediaJobQueue & { reschedule(job: MediaJob): Promise<void> } {
  const timeoutMs = options.timeoutMs ?? MEDIA_QUEUE_CALL_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  let cached: { readonly at: number; readonly alive: boolean } | null = null;

  const add = (job: MediaJob) =>
    bounded(queue.add('media', job, {
      jobId: mediaJobId(job),
      priority: mediaJobPriority(job.kinds),
      attempts: MEDIA_JOB_ATTEMPTS,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    }), timeoutMs, 'media-queue add');

  const probe = async (): Promise<boolean> => {
    try {
      const client = await bounded(queue.client, timeoutMs, 'media-queue client');
      const beat = await bounded(client.get(MEDIA_WORKER_HEARTBEAT_KEY), timeoutMs, 'media-queue heartbeat');
      return beat !== null && now() - Number(beat) < MEDIA_WORKER_HEARTBEAT_TTL_MS;
    } catch (error) {
      logger.warn('File de médias injoignable : rendu synchrone', { error });
      return false;
    }
  };

  return {
    workerAlive: async () => {
      if (cached && now() - cached.at < WORKER_ALIVE_CACHE_MS) return cached.alive;
      const alive = await probe();
      cached = { at: now(), alive };
      return alive;
    },
    schedule: async (job) => {
      await add(job);
    },
    /** Remet une pièce en file même si une tâche FINIE de même identifiant est retenue (balayage). */
    reschedule: async (job) => {
      const existing = queue.getJob ? await bounded(queue.getJob(mediaJobId(job)), timeoutMs, 'media-queue getJob') : undefined;
      if (existing) {
        const state = await bounded(existing.getState(), timeoutMs, 'media-queue state');
        if (state !== 'completed' && state !== 'failed') return;
        await bounded(existing.remove(), timeoutMs, 'media-queue remove');
      }
      await add(job);
    },
  };
}

type RedisUrlParts = {
  readonly host: string;
  readonly port: number;
  readonly username?: string;
  readonly password?: string;
  readonly db?: number;
  readonly tls?: Record<string, never>;
};

function redisUrlParts(url: string): RedisUrlParts {
  const parsed = new URL(url);
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined;
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(db !== undefined && Number.isInteger(db) ? { db } : {}),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

/** La connexion du WORKER et de l'écoute : bloquante, sans réessai borné (exigé par BullMQ). */
export function mediaQueueConnection(url: string): RedisUrlParts & { readonly maxRetriesPerRequest: null } {
  return { ...redisUrlParts(url), maxRetriesPerRequest: null };
}

/** La connexion du PRODUCTEUR (la requête HTTP) : elle échoue vite plutôt que d'attendre Redis. */
export function mediaQueueProducerConnection(url: string): RedisUrlParts & {
  readonly maxRetriesPerRequest: number;
  readonly enableOfflineQueue: false;
  readonly connectTimeout: number;
} {
  return { ...redisUrlParts(url), maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: MEDIA_QUEUE_CALL_TIMEOUT_MS };
}

export function mediaQueueEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MEDIA_QUEUE === 'bullmq' && typeof env.REDIS_URL === 'string' && env.REDIS_URL.length > 0;
}

let shared: MediaJobQueue | null | undefined;

/** La file du processus, ou `null` quand elle est éteinte (tout reste synchrone). */
export function mediaJobQueueFromEnv(env: NodeJS.ProcessEnv = process.env): MediaJobQueue | null {
  if (shared !== undefined) return shared;
  if (!mediaQueueEnabled(env)) {
    shared = null;
    return shared;
  }
  logger.info('File de médias BullMQ allumée', { queue: MEDIA_QUEUE_NAME });
  const queue = new Queue(MEDIA_QUEUE_NAME, { connection: mediaQueueProducerConnection(env.REDIS_URL as string) });
  queue.on('error', (error) => logger.warn('File de médias : erreur Redis', { error }));
  shared = bullmqMediaJobQueue(queue as unknown as QueueLike);
  return shared;
}
