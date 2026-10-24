/**
 * Le câblage du balayage côté passerelle (#11264, R1) : démarré quand la file
 * est allumée (`MEDIA_QUEUE=bullmq`, pour survivre à un worker perdu) ou mise
 * à l'arrêt (`MEDIA_QUEUE=drain`, retour arrière). Sans l'une ni l'autre, il
 * n'y a jamais eu de pièce `pending` à reprendre, et rien ne tourne.
 */
import { randomUUID } from 'crypto';
import { MetadataManager } from '../MetadataManager';
import { runFfmpeg } from '../ffmpeg-run';
import { guardedInterval } from '../../../utils/guarded-timer';
import { enhancedLogger } from '../../../utils/logger-enhanced.js';
import { listenerLease } from './listener-lease';
import { markMediaJobFailed, processMediaJob, type ProcessJobDeps } from './process-job';
import { mediaJobQueueFromEnv } from './queue';
import { handleMediaReady } from './ready-notifier';
import { mediaReadyPorts, type MediaReadyListenerDeps } from './ready-listener';
import { GATEWAY_SWEEP_INTERVAL_MS, GATEWAY_SWEEP_LEASE_KEY, sweepPendingInGateway } from './gateway-sweep';

const logger = enhancedLogger.child({ module: 'media-gateway-sweep' });

export function gatewaySweepEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MEDIA_QUEUE === 'bullmq' || env.MEDIA_QUEUE === 'drain';
}

export function startGatewayPendingSweep(deps: MediaReadyListenerDeps): { close(): void } {
  const uploadBasePath = process.env.UPLOAD_PATH || '/app/uploads';
  const renderDeps: ProcessJobDeps = { prisma: deps.prisma as never, uploadBasePath, metadataManager: new MetadataManager(uploadBasePath), runFfmpeg };
  const readyPorts = mediaReadyPorts(deps);
  const lease = listenerLease(async () => deps.leaseStore, randomUUID(), Date.now, GATEWAY_SWEEP_LEASE_KEY);

  const run = async (): Promise<void> => {
    const handled = await sweepPendingInGateway({
      queue: mediaJobQueueFromEnv(),
      lease,
      listPending: async (target, createdBefore, limit) => {
        const args = { where: { processingState: 'pending', createdAt: { lt: createdBefore } }, select: { id: true, filePath: true, mimeType: true, fileSize: true }, take: limit } as const;
        return target === 'postMedia' ? deps.prisma.postMedia.findMany(args) : deps.prisma.messageAttachment.findMany(args);
      },
      render: async (job) => {
        const outcome = await processMediaJob(renderDeps, job);
        return outcome.status === 'done' ? outcome.recordIds : [];
      },
      fail: (job) => markMediaJobFailed(renderDeps, job),
      notify: (job, recordIds) => handleMediaReady(readyPorts, { target: job.target, recordIds }),
    }, { now: new Date(), compatRenditionEnabled: process.env.VIDEO_COMPAT_RENDITION === 'true' });
    if (handled > 0) logger.info('Pièces en attente rendues par la passerelle', { handled });
  };

  const timer = guardedInterval({ name: 'media-gateway-pending-sweep', everyMs: GATEWAY_SWEEP_INTERVAL_MS, logger, run });
  return { close: () => clearInterval(timer) };
}
