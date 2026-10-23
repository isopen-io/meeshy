/**
 * Le miroir continu des médias vers le seau S3 (#11267).
 *
 * Il tourne DANS la passerelle parce qu'elle est le seul service à monter le
 * volume des dépôts : un conteneur voisin qui le monterait ouvrirait la
 * surface que `media-uploads-never-public` ferme (#11256). Armé par
 * `MEDIA_S3_MIRROR_FOLLOW=on` ; appliqué en staging ou sur feu vert nommé du
 * porteur, à blanc ailleurs.
 */
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { guardedInterval, type TimerErrorLogger } from '../utils/guarded-timer.js';
import { processMediaObjectStores } from '../services/storage/objects/mediaObjectStoreFactory';
import { followMediaMirrorOnce, mediaMirrorFollowMode, type MediaMirrorFollowMode } from '../services/storage/objects/mediaMirrorFollow';
import { MIRROR_LOCK_TTL_MS, mediaMirrorSources, mirrorLockFile } from '../services/storage/objects/mediaMirrorCli';
import { withMirrorLock } from '../services/storage/objects/mediaMirrorLock';
import { processMediaBucketMetrics, recordSweepReport } from '../services/metrics/mediaBucketMetrics';

type Env = Readonly<Record<string, string | undefined>>;
type JobLogger = TimerErrorLogger & {
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
};

const DEFAULT_APPLY_INTERVAL_MS = 60_000;
const DRY_RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function followIntervalMs(mode: MediaMirrorFollowMode, env: Env): number {
  if (mode.kind !== 'apply') return DRY_RUN_INTERVAL_MS;
  const configured = Number(env.MEDIA_MIRROR_INTERVAL_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_APPLY_INTERVAL_MS;
}

export class MediaMirrorFollowJob {
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly deps: {
      readonly mode: () => MediaMirrorFollowMode;
      readonly pass: (apply: boolean) => Promise<void>;
      readonly logger: JobLogger;
      readonly env: Env;
    },
  ) {}

  start(): void {
    const mode = this.deps.mode();
    if (mode.kind === 'off') {
      this.deps.logger.info('Media mirror follower off', { reason: mode.reason });
      return;
    }
    const apply = mode.kind === 'apply';
    this.deps.logger.info(apply ? 'Media mirror follower started (applied)' : 'Media mirror follower started (dry run — counts only)');
    const tick = async () => {
      if (this.running) return;
      this.running = true;
      try {
        await this.deps.pass(apply);
      } finally {
        this.running = false;
      }
    };
    void tick().catch((error: unknown) => this.deps.logger.error('Media mirror pass failed', error));
    this.interval = guardedInterval({ name: 'media-mirror-follow', everyMs: followIntervalMs(mode, this.deps.env), logger: this.deps.logger, run: tick });
    this.interval.unref();
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }
}

/** Repousse l'échéance du verrou tant que le passage tourne : une passe complète peut dépasser l'échéance. */
async function withHeartbeat<T>(renew: () => Promise<void>, run: () => Promise<T>): Promise<T> {
  const heartbeat = setInterval(() => void renew().catch(() => undefined), MIRROR_LOCK_TTL_MS / 3);
  heartbeat.unref();
  try {
    return await run();
  } finally {
    clearInterval(heartbeat);
  }
}

/** Le job du processus : le stockage, la base et l'horloge réels. */
export function processMediaMirrorFollowJob(prisma: PrismaClient, logger: JobLogger): MediaMirrorFollowJob {
  let lastSweepAt: Date | null = null;
  let lastFullScanAt: Date | null = null;
  return new MediaMirrorFollowJob({
    env: process.env,
    logger,
    mode: () => mediaMirrorFollowMode(process.env, processMediaObjectStores().mirror !== null),
    pass: async (apply) => {
      const stores = processMediaObjectStores();
      if (stores.mirror === null) return;
      const uploadRoot = process.env.UPLOAD_PATH || 'uploads/attachments';
      const mirror = stores.mirror;
      const locked = await withMirrorLock({ file: mirrorLockFile(uploadRoot), owner: `gateway:${os.hostname()}:${process.pid}`, ttlMs: MIRROR_LOCK_TTL_MS }, (renew) => withHeartbeat(renew, () => followMediaMirrorOnce({
        sources: mediaMirrorSources(prisma),
        local: stores.local,
        mirror,
        uploadRoot,
        stateFile: path.join(path.resolve(uploadRoot), '.media-mirror', 'state.json'),
        apply,
        now: new Date(),
        lastSweepAt,
        lastFullScanAt,
        log: (line) => logger.info(line),
        onSweepReport: (report) => {
          recordSweepReport(processMediaBucketMetrics, report, new Date());
          if (report.kind === 'refused') {
            logger.warn('Media bucket sweep refused — nothing erased; see mediaMirrorCli --sweep, then --sweep --apply --allow-mass-removal=<N>', { reason: report.reason });
          }
        },
      })));
      if (locked.kind === 'busy') {
        logger.info('Media mirror pass skipped: another pass holds the volume lock', { holder: locked.holder });
        return;
      }
      lastSweepAt = locked.value.lastSweepAt;
      lastFullScanAt = locked.value.lastFullScanAt;
    },
  });
}
