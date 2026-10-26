/**
 * #13100 — le BALAYAGE du scellement au repos, toutes les dix minutes :
 *
 * 1. les pièces des conversations `server` / `hybrid` des dernières 48 h
 *    restées en clair (scellement échoué à l'envoi, rendu différé dont
 *    l'événement de fin s'est perdu, verrou occupé) sont scellées ;
 * 2. les clairs remplacés depuis sept jours sont effacés dès qu'aucune ligne
 *    ne les désigne plus, et toute ligne retardataire est repointée sur le
 *    scellé (`finishPendingErasures`) ;
 * 3. les pistes TTS temporaires (`translated/.track-*`, du clair) laissées
 *    par un processus tué sont effacées après une heure.
 *
 * Sans accès aux fichiers scellés configuré, rien ne tourne.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { guardedInterval } from '../utils/guarded-timer.js';
import { processAtRestFileAccess } from '../services/attachments/atRest/atRestFiles';
import { backfillAtRestAttachments } from '../services/attachments/atRest/atRestBackfill';
import { finishPendingErasures } from '../services/attachments/atRest/sealAttachmentFiles';
import { gatewaySealDeps } from '../services/messaging/sealMessageAttachments';

const logger = enhancedLogger.child({ module: 'AtRestFileSweep' });

export const AT_REST_SWEEP_EVERY_MS = 10 * 60 * 1000;
const RECENT_PIECES_MS = 48 * 60 * 60 * 1000;
const PENDING_ERASURE_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_TRACK_MS = 60 * 60 * 1000;

export async function sweepStaleTrackTemporaries(uploadRoot: string, now: number): Promise<number> {
  const directory = path.join(uploadRoot, 'translated');
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const stale = await Promise.all(
    names.filter((name) => name.startsWith('.track-')).map(async (name) => {
      const absolute = path.join(directory, name);
      const stats = await fs.stat(absolute).catch(() => null);
      return stats && now - stats.mtimeMs > STALE_TRACK_MS ? absolute : null;
    })
  );
  const doomed = stale.filter((absolute): absolute is string => absolute !== null);
  await Promise.all(doomed.map((absolute) => fs.unlink(absolute).catch(() => undefined)));
  return doomed.length;
}

export async function runAtRestFileSweep(prisma: PrismaClient, now: Date = new Date()): Promise<void> {
  const access = processAtRestFileAccess();
  if (!access) return;
  const deps = { ...gatewaySealDeps(prisma, access), prisma };
  const report = await backfillAtRestAttachments(deps, { dryRun: false, log: () => undefined, since: new Date(now.getTime() - RECENT_PIECES_MS) });
  const replacing = await access.store.replacingSince(new Date(now.getTime() - PENDING_ERASURE_MS));
  const finished = await Promise.all(replacing.map((attachmentId) => finishPendingErasures(deps, attachmentId).catch(() => ({ erased: 0, repointed: 0 }))));
  const tracks = await sweepStaleTrackTemporaries(deps.uploadRoot, now.getTime());
  const erased = finished.reduce((sum, outcome) => sum + outcome.erased, 0);
  const repointed = finished.reduce((sum, outcome) => sum + outcome.repointed, 0);
  if (report.sealed + report.failed + erased + repointed + tracks > 0) {
    logger.info('balayage du scellement au repos', { sealed: report.sealed, failed: report.failed, erased, repointed, staleTracks: tracks });
  }
}

export function startAtRestFileSweep(prisma: PrismaClient): { stop(): void } {
  const timer = guardedInterval({ name: 'at-rest-file-sweep', everyMs: AT_REST_SWEEP_EVERY_MS, logger, run: () => runAtRestFileSweep(prisma) });
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}
