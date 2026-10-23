/**
 * Le côté REQUÊTE de la file de médias (#11264) : décider ce qui sort de la
 * requête, puis le confier au worker — sans jamais laisser l'envoi attendre
 * Redis ni laisser une pièce `pending` sans personne pour la rendre (audit S9,
 * défauts 1 et 2).
 *
 * - `deferrableKinds` ne diffère que si la file est allumée ET qu'un worker
 *   bat : sinon, tout reste synchrone, exactement comme avant la file ;
 * - `scheduleOrRender` met en file sous délai ; si la file ne répond pas, il
 *   rend SUR PLACE par la même fabrique que le worker, puis, si le rendu lui-
 *   même échoue, passe la pièce à `failed` — jamais `pending` sans tâche.
 */
import { enhancedLogger } from '../../../utils/logger-enhanced.js';
import { deferredMediaKinds, mediaJobFor, type MediaJobKind, type MediaJobTarget } from './jobs';
import { markMediaJobFailed, processMediaJob, type ProcessJobDeps } from './process-job';
import type { MediaJobQueue } from './queue';

const logger = enhancedLogger.child({ module: 'media-dispatch' });

export async function deferrableKinds(
  queue: MediaJobQueue | null,
  input: { readonly attachmentType: string; readonly fileSize: number; readonly compatRenditionEnabled: boolean }
): Promise<readonly MediaJobKind[]> {
  const kinds = deferredMediaKinds({ ...input, queueEnabled: queue !== null });
  if (queue === null || kinds.length === 0) return [];
  return (await queue.workerAlive()) ? kinds : [];
}

export type DispatchOutcome = 'none' | 'scheduled' | 'rendered' | 'failed';

export async function scheduleOrRender(params: {
  readonly queue: MediaJobQueue | null;
  readonly deps: ProcessJobDeps;
  readonly target: MediaJobTarget;
  readonly recordId: string;
  readonly kinds: readonly MediaJobKind[];
}): Promise<DispatchOutcome> {
  const job = mediaJobFor(params.target, params.recordId, params.kinds);
  if (job === null || params.queue === null) return 'none';
  try {
    await params.queue.schedule(job);
    return 'scheduled';
  } catch (error) {
    logger.warn('File de médias muette : rendu dans la requête', { recordId: job.recordId, error });
  }
  try {
    const outcome = await processMediaJob(params.deps, job);
    return outcome.status === 'done' ? 'rendered' : 'none';
  } catch (error) {
    logger.error('Rendu sur place échoué : pièce servie telle quelle', { recordId: job.recordId, error });
    await markMediaJobFailed(params.deps, job).catch((err: unknown) => logger.error('processingState=failed non écrit', { err }));
    return 'failed';
  }
}
