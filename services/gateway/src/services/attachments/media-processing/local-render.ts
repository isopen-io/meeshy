/**
 * Le rendu de FOND de la passerelle (#13984) : la file est allumée mais aucun
 * worker ne bat. Un grand média ne se rend plus dans la requête — le dernier
 * PATCH tus attendait la vignette, les variantes WebP/AVIF et le thumbhash
 * (environ 40 s pour une photo de 12 Mpx sur le staging) — : la ligne naît
 * `pending`, la réponse part, puis la passerelle rend, par la même fabrique
 * que le worker (`processMediaJob`, mode strict), et prévient comme lui
 * (`handleMediaReady` : `attachment:ready` à l'auteur, `message:attachment-updated`
 * aux lecteurs). Un rendu raté passe la pièce et ses copies à `failed`.
 *
 * Aucune donnée n'est gardée en mémoire : la pièce `pending` est en base, et si
 * la passerelle s'arrête avant d'avoir rendu, son balayage (`gateway-sweep.ts`,
 * pièces de plus de 15 min) ou celui du worker la reprend.
 */
import { enhancedLogger } from '../../../utils/logger-enhanced.js';
import type { MediaJob } from './jobs';

const logger = enhancedLogger.child({ module: 'media-local-render' });

/** Confie une pièce au rendu de fond ; rend la main tout de suite. */
export type LocalMediaRenderer = (job: MediaJob) => void;

export type LocalRenderPorts = {
  /** Rend la pièce (et ses copies) ; rend les ids écrits, ou `[]` si elle a disparu. */
  readonly render: (job: MediaJob) => Promise<readonly string[]>;
  /** La passe la pièce (et ses copies) à `failed` ; rend leurs ids. */
  readonly fail: (job: MediaJob) => Promise<readonly string[]>;
  readonly notify: (job: MediaJob, recordIds: readonly string[]) => Promise<void>;
};

/** Rend une pièce puis l'annonce ; un échec la passe `failed`. Ne lève jamais. */
export async function renderAndNotify(ports: LocalRenderPorts, job: MediaJob): Promise<void> {
  const recordIds = await ports.render(job).catch(async (error: unknown) => {
    logger.error('Pièce non rendue par la passerelle : failed', { recordId: job.recordId, error });
    return ports.fail(job).catch(() => [] as readonly string[]);
  });
  if (recordIds.length === 0) return;
  await ports.notify(job, recordIds).catch((error: unknown) =>
    logger.warn('Pièce rendue par la passerelle, annonce perdue', { recordId: job.recordId, error }));
}

export function localMediaRenderer(
  ports: LocalRenderPorts,
  defer: (run: () => void) => void = setImmediate,
): LocalMediaRenderer {
  return (job) => defer(() => {
    void renderAndNotify(ports, job).catch((error: unknown) =>
      logger.error('Rendu de fond : rejet inattendu', { recordId: job.recordId, error }));
  });
}
