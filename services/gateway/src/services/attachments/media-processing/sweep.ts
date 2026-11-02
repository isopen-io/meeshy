/**
 * Le balayage des pièces `pending` sans tâche (#11264, audit S9 défaut 1).
 *
 * Une pièce peut rester `pending` sans que rien ne la rende : processus tué
 * entre la création de la ligne et la mise en file, tâche perdue au-delà des
 * reprises de BullMQ, copie dont la pièce source a disparu pendant le rendu.
 * Le worker remet en file, à intervalle, les pièces `pending` plus vieilles
 * que `PENDING_SWEEP_AGE_MS` ; une tâche encore vivante n'est pas doublée
 * (identifiant de tâche idempotent), une tâche finie retenue est remplacée.
 */
import { getAttachmentType } from '@meeshy/shared/types/attachment';
import { deferredMediaKinds, mediaJobFor, type MediaJob, type MediaJobTarget } from './jobs';

export const PENDING_SWEEP_AGE_MS = 10 * 60 * 1000;
export const PENDING_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
export const PENDING_SWEEP_BATCH = 100;

export type PendingRow = {
  readonly id: string;
  readonly filePath: string | null;
  readonly mimeType: string;
  readonly fileSize: number | null;
};

export type SweepPorts = {
  listPending(target: MediaJobTarget, createdBefore: Date, limit: number): Promise<readonly PendingRow[]>;
  reschedule(job: MediaJob): Promise<void>;
};

/** Les tâches des pièces `pending` créées avant `before`, une par jeu d'octets. */
export async function pendingMediaJobs(
  listPending: SweepPorts['listPending'],
  options: { readonly before: Date; readonly limit: number; readonly compatRenditionEnabled: boolean }
): Promise<readonly MediaJob[]> {
  const targets: readonly MediaJobTarget[] = ['messageAttachment', 'postMedia'];
  return (await Promise.all(targets.map(async (target) => {
    const rows = await listPending(target, options.before, options.limit);
    const seen = new Set<string>();
    return rows.flatMap((row) => {
      if (row.filePath === null) return [];
      const sharedKey = target === 'messageAttachment' ? row.filePath : row.id;
      if (seen.has(sharedKey)) return [];
      seen.add(sharedKey);
      const kinds = deferredMediaKinds({
        attachmentType: getAttachmentType(row.mimeType, row.filePath),
        fileSize: row.fileSize ?? 0,
        queueEnabled: true,
        compatRenditionEnabled: options.compatRenditionEnabled,
      });
      const job = mediaJobFor(target, row.id, kinds.length > 0 ? kinds : ['thumb']);
      return job ? [job] : [];
    });
  }))).flat();
}

export async function sweepPendingMedia(
  ports: SweepPorts,
  options: { readonly now: Date; readonly compatRenditionEnabled: boolean }
): Promise<number> {
  const jobs = await pendingMediaJobs(ports.listPending, {
    before: new Date(options.now.getTime() - PENDING_SWEEP_AGE_MS),
    limit: PENDING_SWEEP_BATCH,
    compatRenditionEnabled: options.compatRenditionEnabled,
  });
  const results = await Promise.allSettled(jobs.map((job) => ports.reschedule(job)));
  return results.filter((r) => r.status === 'fulfilled').length;
}
