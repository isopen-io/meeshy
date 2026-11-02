import { isStagingEnvironment } from '../../email/staging-marker';
import type { LocalObjectStore } from './LocalObjectStore';
import type { MediaObjectStore } from './MediaObjectStore';
import { collectReferencedKeys, sweepBucket, type ObjectLister, type SweepReport } from './mediaBucketSweep';
import { FOLLOW_WINDOW_MS, objectIdAtOrAfter, runMediaMirror } from './mediaMirrorCli';
import type { MirrorRowSource } from './mediaMirror';
import { isPorteurApproval } from './mediaObjectStoreConfig';

export type MediaMirrorFollowMode =
  | { readonly kind: 'off'; readonly reason: 'not-enabled' | 'no-bucket' }
  | { readonly kind: 'dry-run' }
  | { readonly kind: 'apply' };

/** Armé en staging ; ailleurs, il compte sans écrire tant que le porteur n'a pas nommé sa décision (#9232). */
export function mediaMirrorFollowMode(env: Readonly<Record<string, string | undefined>>, bucketConfigured: boolean): MediaMirrorFollowMode {
  if (env.MEDIA_S3_MIRROR_FOLLOW !== 'on') return { kind: 'off', reason: 'not-enabled' };
  if (!bucketConfigured) return { kind: 'off', reason: 'no-bucket' };
  if (isStagingEnvironment(env.MEESHY_ENV) || isPorteurApproval(env.MEDIA_S3_MIRROR_PORTEUR_APPROVAL)) return { kind: 'apply' };
  return { kind: 'dry-run' };
}

export const SWEEP_EVERY_MS = 60 * 60 * 1000;
/** Une passe COMPLÈTE par jour : un fichier écrit plus de 24 h après sa ligne (piste TTS demandée plus tard) n'échappe pas au miroir. */
export const FULL_SCAN_EVERY_MS = 24 * 60 * 60 * 1000;
const BEFORE_EVERY_OBJECT_ID = '0'.repeat(24);
const SWEEP_GRACE_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 500;

/**
 * Un passage : la recopie depuis le curseur gardé, puis la fenêtre des
 * dernières 24 h (une ligne dont le fichier arrive après sa création), une
 * fois par jour la passe COMPLÈTE (un fichier arrivé plus tard encore), puis —
 * au plus une fois par `SWEEP_EVERY_MS` — le balayage des clés que plus rien ne
 * nomme. Rend la date du dernier balayage.
 */
export async function followMediaMirrorOnce(params: {
  readonly sources: readonly MirrorRowSource[];
  readonly local: LocalObjectStore;
  readonly mirror: MediaObjectStore & ObjectLister;
  readonly uploadRoot: string;
  readonly stateFile: string;
  readonly apply: boolean;
  readonly now: Date;
  readonly lastSweepAt: Date | null;
  readonly lastFullScanAt?: Date | null;
  readonly log: (line: string) => void;
  /** Le compte rendu du balayage, pour qui doit le signaler : un refus ne se rejoue pas en silence. */
  readonly onSweepReport?: (report: SweepReport) => void;
}): Promise<{ readonly lastSweepAt: Date | null; readonly lastFullScanAt: Date | null }> {
  const options = { apply: params.apply, batchSize: BATCH_SIZE, limit: null, reset: false };
  const run = (startAfter?: string) =>
    runMediaMirror({ sources: params.sources, local: params.local, mirror: params.mirror, uploadRoot: params.uploadRoot, stateFile: params.stateFile, options, log: params.log, ...(startAfter === undefined ? {} : { startAfter }) });
  await run();
  await run(objectIdAtOrAfter(new Date(params.now.getTime() - FOLLOW_WINDOW_MS)));

  const previousFullScan = params.lastFullScanAt ?? null;
  const fullScanDue = previousFullScan === null || params.now.getTime() - previousFullScan.getTime() >= FULL_SCAN_EVERY_MS;
  if (fullScanDue) await run(BEFORE_EVERY_OBJECT_ID);
  const lastFullScanAt = fullScanDue ? params.now : previousFullScan;

  const sweepDue = params.lastSweepAt === null || params.now.getTime() - params.lastSweepAt.getTime() >= SWEEP_EVERY_MS;
  if (!sweepDue) return { lastSweepAt: params.lastSweepAt, lastFullScanAt };
  const referenced = await collectReferencedKeys({ sources: params.sources, uploadRoot: params.uploadRoot, pageSize: BATCH_SIZE });
  const report = await sweepBucket({ lister: params.mirror, remover: params.mirror, referenced, now: params.now, graceMs: SWEEP_GRACE_MS, apply: params.apply, log: params.log });
  params.log(`balayage du seau : ${JSON.stringify(report)}`);
  params.onSweepReport?.(report);
  return { lastSweepAt: params.now, lastFullScanAt };
}
