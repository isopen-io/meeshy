/**
 * `meeshy-media-worker` (#11264) : la MÊME image que la passerelle, lancée par
 * `node dist/src/workers/media-worker.js`. Il consomme la file
 * `media-processing` (BullMQ, Redis existant), une tâche à la fois par défaut —
 * le serveur est partagé avec la production (#9232) — et rend vignettes,
 * variantes et rendus vidéo hors de la requête HTTP.
 *
 * - Battement de cœur : une clé Redis à échéance courte (la passerelle ne
 *   diffère que si elle bat) et un fichier local (la sonde de santé du conteneur).
 * - Reprise : trois essais à délai exponentiel (`queue.ts`), les rendus déjà
 *   faits sautés (`progress`) ; au DERNIER essai raté, la pièce et ses copies
 *   passent à `failed` AVANT que l'échec ne soit publié, pour que la passerelle
 *   le lise en relisant la ligne.
 * - Balayage : les pièces `pending` sans tâche sont remises en file (`sweep.ts`).
 * - Arrêt (SIGTERM) : la tâche en cours finit (`stop_grace_period` du compose).
 */
import { promises as fs } from 'fs';
import { Queue, Worker, type Job } from 'bullmq';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MetadataManager } from '../services/attachments/MetadataManager';
import { runFfmpeg } from '../services/attachments/ffmpeg-run';
import { MEDIA_QUEUE_NAME, readMediaJob, type MediaJobKind } from '../services/attachments/media-processing/jobs';
import {
  MEDIA_JOB_ATTEMPTS,
  MEDIA_WORKER_HEARTBEAT_KEY,
  MEDIA_WORKER_HEARTBEAT_TTL_MS,
  bullmqMediaJobQueue,
  mediaQueueConnection,
  type QueueLike,
} from '../services/attachments/media-processing/queue';
import { markMediaJobFailed, processMediaJob, type MediaJobOutcome, type ProcessJobDeps } from '../services/attachments/media-processing/process-job';
import { PENDING_SWEEP_INTERVAL_MS, sweepPendingMedia } from '../services/attachments/media-processing/sweep';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { guardedInterval } from '../utils/guarded-timer';

const logger = enhancedLogger.child({ module: 'media-worker' });

export const MEDIA_WORKER_ALIVE_FILE = '/tmp/media-worker.alive';
const HEARTBEAT_EVERY_MS = 10_000;

export function workerConcurrency(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 8 ? parsed : 1;
}

function doneKinds(progress: unknown): readonly MediaJobKind[] {
  const done = progress && typeof progress === 'object' ? (progress as { done?: unknown }).done : undefined;
  return Array.isArray(done) ? done.filter((k): k is MediaJobKind => k === 'thumb' || k === 'transcode') : [];
}

export async function runMediaJob(deps: ProcessJobDeps, job: Pick<Job, 'data' | 'progress' | 'attemptsMade' | 'updateProgress'> & { opts: { attempts?: number } }): Promise<MediaJobOutcome> {
  const data = readMediaJob(job.data);
  if (data === null) return { status: 'gone' };
  try {
    return await processMediaJob(deps, data, {
      done: doneKinds(job.progress),
      onRendered: async ({ recordIds, done }) => {
        await job.updateProgress({ target: data.target, recordIds, done });
      },
    });
  } catch (error) {
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? MEDIA_JOB_ATTEMPTS)) {
      // La pièce ET ses copies passent `failed`, et la passerelle les prévient
      // toutes (`progress`) : l'événement `failed` de la file ne porte que l'id.
      const recordIds = await markMediaJobFailed(deps, data).catch((err: unknown) => {
        logger.error('processingState=failed non écrit', { err });
        return [] as readonly string[];
      });
      if (recordIds.length > 0) {
        await job.updateProgress({ target: data.target, recordIds, failed: true })
          .catch((err: unknown) => logger.warn('Échec non annoncé aux copies', { err }));
      }
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error('REDIS_URL requis pour le worker de médias');
  const uploadBasePath = process.env.UPLOAD_PATH || '/app/uploads';
  const prisma = new PrismaClient();
  const deps: ProcessJobDeps = { prisma: prisma as never, uploadBasePath, metadataManager: new MetadataManager(uploadBasePath), runFfmpeg };
  const worker = new Worker(MEDIA_QUEUE_NAME, (job) => runMediaJob(deps, job), {
    connection: mediaQueueConnection(redisUrl),
    concurrency: workerConcurrency(process.env.MEDIA_WORKER_CONCURRENCY),
  });
  worker.on('failed', (job, error) => logger.error('Tâche de média échouée', { jobId: job?.id, attemptsMade: job?.attemptsMade, error }));
  worker.on('error', (error) => logger.error('Worker de médias : erreur Redis', { error }));

  const beat = async (): Promise<void> => {
    const client = await worker.client;
    await client.set(MEDIA_WORKER_HEARTBEAT_KEY, String(Date.now()), { PX: MEDIA_WORKER_HEARTBEAT_TTL_MS });
    await fs.writeFile(MEDIA_WORKER_ALIVE_FILE, String(Date.now()));
  };
  const heartbeat = guardedInterval({ name: 'media-worker-heartbeat', everyMs: HEARTBEAT_EVERY_MS, logger, run: beat });
  beat().catch((error: unknown) => logger.warn('Battement de cœur non posé', { error }));

  const sweepQueue = new Queue(MEDIA_QUEUE_NAME, { connection: mediaQueueConnection(redisUrl) });
  const rescheduler = bullmqMediaJobQueue(sweepQueue as unknown as QueueLike);
  const sweep = async (): Promise<void> => {
    const count = await sweepPendingMedia({
      listPending: async (target, createdBefore, limit) => {
        const args = { where: { processingState: 'pending', createdAt: { lt: createdBefore } }, select: { id: true, filePath: true, mimeType: true, fileSize: true }, take: limit } as const;
        return target === 'postMedia' ? prisma.postMedia.findMany(args) : prisma.messageAttachment.findMany(args);
      },
      reschedule: (job) => rescheduler.reschedule(job),
    }, { now: new Date(), compatRenditionEnabled: process.env.VIDEO_COMPAT_RENDITION === 'true' });
    if (count > 0) logger.info('Pièces en attente remises en file', { count });
  };
  const sweeper = guardedInterval({ name: 'media-worker-pending-sweep', everyMs: PENDING_SWEEP_INTERVAL_MS, logger, run: sweep });

  const stop = async (): Promise<void> => {
    clearInterval(heartbeat);
    clearInterval(sweeper);
    await worker.close();
    await sweepQueue.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => { stop().catch(() => process.exit(1)); });
  process.on('SIGINT', () => { stop().catch(() => process.exit(1)); });
  logger.info('Worker de médias démarré', { queue: MEDIA_QUEUE_NAME });
}

if (require.main === module) {
  main().catch((error: unknown) => {
    logger.error('Worker de médias arrêté', error as Error);
    process.exit(1);
  });
}
