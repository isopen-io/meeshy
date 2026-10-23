/**
 * Le miroir continu des médias vers le seau S3 (#11267).
 *
 * Il tourne DANS la passerelle parce qu'elle est le seul service à monter le
 * volume des dépôts : un conteneur voisin qui le monterait ouvrirait la
 * surface que `media-uploads-never-public` ferme (#11256). Armé par
 * `MEDIA_S3_MIRROR_FOLLOW=on` ; appliqué en staging ou sur feu vert nommé du
 * porteur, à blanc ailleurs.
 */
import path from 'node:path';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { guardedInterval, type TimerErrorLogger } from '../utils/guarded-timer.js';
import { processMediaObjectStores } from '../services/storage/objects/mediaObjectStoreFactory';
import { followMediaMirrorOnce, mediaMirrorFollowMode, type MediaMirrorFollowMode } from '../services/storage/objects/mediaMirrorFollow';
import { mediaMirrorSources } from '../services/storage/objects/mediaMirrorCli';

type Env = Readonly<Record<string, string | undefined>>;
type JobLogger = TimerErrorLogger & { info: (message: string, context?: Record<string, unknown>) => void };

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

/** Le job du processus : le stockage, la base et l'horloge réels. */
export function processMediaMirrorFollowJob(prisma: PrismaClient, logger: JobLogger): MediaMirrorFollowJob {
  let lastSweepAt: Date | null = null;
  return new MediaMirrorFollowJob({
    env: process.env,
    logger,
    mode: () => mediaMirrorFollowMode(process.env, processMediaObjectStores().mirror !== null),
    pass: async (apply) => {
      const stores = processMediaObjectStores();
      if (stores.mirror === null) return;
      const uploadRoot = process.env.UPLOAD_PATH || 'uploads/attachments';
      const next = await followMediaMirrorOnce({
        sources: mediaMirrorSources(prisma),
        local: stores.local,
        mirror: stores.mirror,
        uploadRoot,
        stateFile: path.join(path.resolve(uploadRoot), '.media-mirror', 'state.json'),
        apply,
        now: new Date(),
        lastSweepAt,
        log: (line) => logger.info(line),
      });
      lastSweepAt = next.lastSweepAt;
    },
  });
}
