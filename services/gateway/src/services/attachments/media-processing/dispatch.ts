/**
 * Le côté REQUÊTE de la file de médias (#11264) : décider ce qui sort de la
 * requête, puis le confier au worker — sans jamais laisser l'envoi attendre
 * Redis (audit S9, défauts 1 et 2).
 *
 * - `deferrableKinds` ne diffère que si la file est allumée ET qu'un worker
 *   bat : sinon, tout reste synchrone, exactement comme avant la file ;
 * - `scheduleDeferred` met en file sous délai. Si la file ne répond pas, la
 *   pièce RESTE `pending` et la requête rend la main : le balayage du worker
 *   (`sweep.ts`) la remet en file. Elle n'est JAMAIS rendue sur place à ce
 *   moment-là (contre-audit S9, N1) : une mise en file qui dépasse son délai
 *   peut quand même aboutir, et un rendu sur place doublerait alors celui du
 *   worker — deux ffmpeg sur le même fichier de sortie, l'échec de l'un
 *   effaçant la sortie de l'autre. Le balayage, lui, ne double pas une tâche
 *   vivante (identifiant idempotent).
 */
import { enhancedLogger } from '../../../utils/logger-enhanced.js';
import { deferredMediaKinds, mediaJobFor, type MediaJobKind, type MediaJobTarget } from './jobs';
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

/** `scheduled` : en file ; `left-to-sweep` : la file n'a pas répondu, le balayage reprendra ; `none` : rien à différer. */
export type DispatchOutcome = 'none' | 'scheduled' | 'left-to-sweep';

export async function scheduleDeferred(params: {
  readonly queue: MediaJobQueue | null;
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
    logger.warn('File de médias muette : la pièce reste en attente, le balayage la reprendra', { recordId: job.recordId, error });
    return 'left-to-sweep';
  }
}
