import { enhancedLogger } from '../../../utils/logger-enhanced';
import { storageKeyUnder, type MediaObjectStore } from './MediaObjectStore';
import { processMediaObjectStores } from './mediaObjectStoreFactory';

const logger = enhancedLogger.child({ module: 'mirroredErasure' });

/**
 * Efface la copie du seau d'un fichier que l'appelant vient d'effacer du
 * disque (#11267, audit D2). Synchrone pour l'appelant — une vue unique
 * brûlée ne garde pas sa copie jusqu'au prochain balayage —, mais jamais
 * bloquant : un seau en panne n'empêche aucun effacement, et le balayage
 * horaire retire la copie restée. Sans seau configuré, rien.
 *
 * La décision « ce fichier peut-il partir ? » appartient à l'appelant, qui
 * l'a déjà prise pour le disque : la copie suit la même règle, au même site.
 */
export async function eraseMirroredCopy(
  fullPath: string,
  uploadRoot: string,
  mirror: Pick<MediaObjectStore, 'remove'> | null = processMediaObjectStores().mirror,
): Promise<void> {
  if (mirror === null) return;
  const key = storageKeyUnder(fullPath, uploadRoot);
  if (key === null) return;
  try {
    await mirror.remove(key);
  } catch (error: unknown) {
    logger.warn('media bucket copy not erased, left to the sweep', { key, error: error instanceof Error ? error.message : String(error) });
  }
}
