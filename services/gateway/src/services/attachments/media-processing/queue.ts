/**
 * La file de médias (#11264) : BullMQ sur le Redis existant, une seule file
 * (`media-processing`), des priorités par genre de tâche, trois essais à
 * reprise exponentielle. Allumée par `MEDIA_QUEUE=bullmq` (staging) ; éteinte,
 * aucune tâche n'existe et tout le rendu reste dans la requête, comme avant.
 */
import { Queue } from 'bullmq';
import { enhancedLogger } from '../../../utils/logger-enhanced.js';
import { MEDIA_JOB_PRIORITY, MEDIA_QUEUE_NAME, mediaJobId, type MediaJob } from './jobs';

const logger = enhancedLogger.child({ module: 'media-queue' });

export interface MediaJobQueue {
  schedule(job: MediaJob): Promise<void>;
}

type QueueLike = { add(name: string, data: MediaJob, options: Record<string, unknown>): Promise<unknown> };

export const MEDIA_JOB_ATTEMPTS = 3;

export function bullmqMediaJobQueue(queue: QueueLike): MediaJobQueue {
  return {
    schedule: async (job) => {
      await queue.add(job.kind, job, {
        jobId: mediaJobId(job),
        priority: MEDIA_JOB_PRIORITY[job.kind],
        attempts: MEDIA_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    },
  };
}

export type MediaQueueConnection = {
  readonly host: string;
  readonly port: number;
  readonly username?: string;
  readonly password?: string;
  readonly db?: number;
  readonly tls?: Record<string, never>;
  readonly maxRetriesPerRequest: null;
};

/** La connexion Redis de BullMQ, lue dans l'URL du Redis existant ; sans réessai bloquant (exigé par BullMQ). */
export function mediaQueueConnection(url: string): MediaQueueConnection {
  const parsed = new URL(url);
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined;
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(db !== undefined && Number.isInteger(db) ? { db } : {}),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
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
  shared = bullmqMediaJobQueue(new Queue(MEDIA_QUEUE_NAME, { connection: mediaQueueConnection(env.REDIS_URL as string) }));
  return shared;
}
