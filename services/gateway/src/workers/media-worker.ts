/**
 * `meeshy-media-worker` (#11264) : la MÊME image que la passerelle, lancée par
 * `node dist/src/workers/media-worker.js`. Il consomme la file
 * `media-processing` (BullMQ, Redis existant), une tâche à la fois — le
 * serveur est partagé avec la production (#9232) — et rend vignettes,
 * variantes et rendus vidéo hors de la requête HTTP.
 *
 * Reprise : trois essais à délai exponentiel (`queue.ts`) ; après le dernier,
 * la ligne passe à `failed` et le média reste servi tel quel. Un arrêt
 * (SIGTERM) laisse finir la tâche en cours ; une tâche interrompue par un
 * crash est reprise par BullMQ (verrou expiré) et se rejoue sans dommage
 * (`processMediaJob` est idempotent).
 */
import { Worker } from 'bullmq';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MetadataManager } from '../services/attachments/MetadataManager';
import { runFfmpeg } from '../services/attachments/ffmpeg-run';
import { MEDIA_QUEUE_NAME, type MediaJob } from '../services/attachments/media-processing/jobs';
import { MEDIA_JOB_ATTEMPTS, mediaQueueConnection } from '../services/attachments/media-processing/queue';
import { processMediaJob } from '../services/attachments/media-processing/process-job';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'media-worker' });

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error('REDIS_URL requis pour le worker de médias');
  const uploadBasePath = process.env.UPLOAD_PATH || '/app/uploads';
  const prisma = new PrismaClient();
  const deps = { prisma: prisma as never, uploadBasePath, metadataManager: new MetadataManager(uploadBasePath), runFfmpeg };
  const worker = new Worker<MediaJob>(MEDIA_QUEUE_NAME, (job) => processMediaJob(deps, job.data), {
    connection: mediaQueueConnection(redisUrl),
    concurrency: Number(process.env.MEDIA_WORKER_CONCURRENCY || 1),
  });
  worker.on('failed', (job, error) => {
    logger.error('Tâche de média échouée', { jobId: job?.id, attemptsMade: job?.attemptsMade, error });
    if (job && job.attemptsMade >= MEDIA_JOB_ATTEMPTS) {
      const args = { where: { id: job.data.recordId }, data: { processingState: 'failed' } };
      const write = job.data.target === 'postMedia' ? prisma.postMedia.update(args) : prisma.messageAttachment.update(args);
      write.catch((err: unknown) => logger.error('processingState=failed non écrit', err as Error));
    }
  });
  const stop = async (): Promise<void> => {
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => { stop().catch(() => process.exit(1)); });
  process.on('SIGINT', () => { stop().catch(() => process.exit(1)); });
  logger.info('Worker de médias démarré', { queue: MEDIA_QUEUE_NAME });
}

main().catch((error: unknown) => {
  logger.error('Worker de médias arrêté', error as Error);
  process.exit(1);
});
