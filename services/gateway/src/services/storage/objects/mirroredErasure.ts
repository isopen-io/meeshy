import { enhancedLogger } from '../../../utils/logger-enhanced';
import { storageKeyUnder, type MediaObjectStore } from './MediaObjectStore';
import { processMediaObjectStores } from './mediaObjectStoreFactory';

const logger = enhancedLogger.child({ module: 'mirroredErasure' });

/** Au-delà, l'effacement rend la main : la copie restée attend le balayage (contre-audit C2). */
const ERASE_TIMEOUT_MS = 3_000;

/**
 * Efface la copie du seau d'un fichier que l'appelant vient d'effacer du
 * disque (#11267, audit D2). Attendu par l'appelant — une vue unique brûlée
 * ne garde pas sa copie jusqu'au prochain balayage —, mais BORNÉ (contre-audit
 * C2) : au-delà de quelques secondes, la main est rendue et la requête au seau
 * continue détachée, son échec journalisé. Un seau en panne ou muet n'empêche
 * donc aucun effacement, et le balayage horaire retire la copie restée. Sans
 * seau configuré, rien.
 *
 * La décision « ce fichier peut-il partir ? » appartient à l'appelant, qui
 * l'a déjà prise pour le disque : la copie suit la même règle, au même site.
 */
export async function eraseMirroredCopy(
  fullPath: string,
  uploadRoot: string,
  mirror: Pick<MediaObjectStore, 'remove'> | null = processMediaObjectStores().mirror,
  options: { readonly timeoutMs?: number } = {},
): Promise<void> {
  if (mirror === null) return;
  const key = storageKeyUnder(fullPath, uploadRoot);
  if (key === null) return;
  const warn = (reason: string) => logger.warn('media bucket copy not erased, left to the sweep', { key, reason });
  const removal = mirror.remove(key).then(
    () => 'erased' as const,
    (error: unknown) => {
      warn(error instanceof Error ? error.message : String(error));
      return 'failed' as const;
    },
  );
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), options.timeoutMs ?? ERASE_TIMEOUT_MS);
    timer.unref();
  });
  const outcome = await Promise.race([removal, deadline]);
  clearTimeout(timer);
  if (outcome === 'timeout') warn('timeout');
}
