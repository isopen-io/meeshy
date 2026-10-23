/**
 * Le balayage côté PASSERELLE des pièces `pending` (#11264, troisième passe
 * d'audit S9, R1 — le retour arrière).
 *
 * Le balayage du worker (`sweep.ts`) ne vit que dans le worker. Si la file est
 * éteinte (retour arrière : `MEDIA_QUEUE=drain`) ou qu'aucun worker ne bat,
 * les pièces déjà `pending` ne seraient plus jamais rendues. La passerelle les
 * reprend alors elle-même, en SYNCHRONE, par la même fabrique que le worker
 * (`processMediaJob`, mode strict), et :
 * - jamais quand un worker bat (il a son propre balayage : pas de double rendu) ;
 * - sous bail : une seule instance de la passerelle balaie (`listenerLease`) ;
 * - borné : quelques pièces par passage, l'une après l'autre ;
 * - seulement les pièces plus vieilles que `GATEWAY_SWEEP_AGE_MS` (au-delà de
 *   ce que le balayage du worker aurait déjà repris) ;
 * - un rendu raté passe la pièce et ses copies à `failed`, jamais `pending`.
 */
import { enhancedLogger } from '../../../utils/logger-enhanced.js';
import type { MediaJob } from './jobs';
import type { MediaJobQueue } from './queue';
import { pendingMediaJobs, type SweepPorts } from './sweep';

const logger = enhancedLogger.child({ module: 'media-gateway-sweep' });

export const GATEWAY_SWEEP_AGE_MS = 15 * 60 * 1000;
export const GATEWAY_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
export const GATEWAY_SWEEP_BATCH = 5;
export const GATEWAY_SWEEP_LEASE_KEY = 'meeshy:media-gateway-sweep:lease';

export type GatewaySweepPorts = {
  readonly queue: MediaJobQueue | null;
  readonly lease: { holds(): Promise<boolean> };
  readonly listPending: SweepPorts['listPending'];
  /** Rend la pièce (et ses copies) ; rend les ids écrits, ou `[]` si elle a disparu. */
  readonly render: (job: MediaJob) => Promise<readonly string[]>;
  /** La passe la pièce (et ses copies) à `failed` ; rend leurs ids. */
  readonly fail: (job: MediaJob) => Promise<readonly string[]>;
  readonly notify: (job: MediaJob, recordIds: readonly string[]) => Promise<void>;
};

export async function sweepPendingInGateway(
  ports: GatewaySweepPorts,
  options: { readonly now: Date; readonly compatRenditionEnabled: boolean }
): Promise<number> {
  if (ports.queue !== null && (await ports.queue.workerAlive())) return 0;
  if (!(await ports.lease.holds())) return 0;

  const jobs = await pendingMediaJobs(ports.listPending, {
    before: new Date(options.now.getTime() - GATEWAY_SWEEP_AGE_MS),
    limit: GATEWAY_SWEEP_BATCH,
    compatRenditionEnabled: options.compatRenditionEnabled,
  });

  let handled = 0;
  for (const job of jobs.slice(0, GATEWAY_SWEEP_BATCH)) {
    const recordIds = await ports.render(job).catch(async (error: unknown) => {
      logger.error('Pièce en attente non rendue par la passerelle : failed', { recordId: job.recordId, error });
      return ports.fail(job).catch(() => [] as readonly string[]);
    });
    if (recordIds.length > 0) await ports.notify(job, recordIds).catch(() => undefined);
    handled += 1;
  }
  return handled;
}
