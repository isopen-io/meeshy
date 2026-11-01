import { getCacheStore } from '../CacheStore';
import { uploadLimitPolicyFromEnv } from '../attachments/upload-admission';
import { createUploadQuota, type ReservingUploadQuota } from '../attachments/upload-quota';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'publicationCopyQuota' });

export type PublicationCopyQuota = Pick<ReservingUploadQuota, 'reserve' | 'release' | 'record'>;

let shared: PublicationCopyQuota | undefined;

/**
 * Le quota journalier d'envoi (#11266), celui que les portes tus et multipart
 * débitent : même politique, même Redis (`getCacheStore`, que `fastify.redis`
 * décore), donc le MÊME compteur `uploads:bytes:{userId}:{jour}`. Une copie de
 * média écrit des octets comme un téléversement et se paie comme lui (#14305).
 */
export function publicationCopyQuota(): PublicationCopyQuota {
  shared ??= createUploadQuota({ redis: getCacheStore().getNativeClient(), quotas: uploadLimitPolicyFromEnv().quotas });
  return shared;
}

/**
 * Copie sous réservation : les octets attendus sont RÉSERVÉS avant la première
 * écriture — deux requêtes concurrentes ne lisent jamais le même compteur —,
 * rendus si la copie échoue, et l'écart avec ce qui a été réellement écrit est
 * réglé après — sur le JOUR de la réservation, même si la copie franchit
 * minuit UTC. `null` : le quota refuse, rien n'est copié.
 */
export async function reservedCopy<C extends { readonly bytes: number }>(params: {
  readonly quota: PublicationCopyQuota;
  readonly userId: string;
  readonly expectedBytes: number;
  readonly copy: () => Promise<C>;
}): Promise<C | null> {
  const { quota, userId, expectedBytes } = params;
  const now = Date.now();
  const verdict = await quota.reserve({ userId, role: 'registered', bytes: expectedBytes, now });
  if ('quotaBytes' in verdict) {
    log.warn('copie de médias sœurs refusée par le quota journalier d’envoi', {
      userId, expectedBytes, usedBytes: verdict.usedBytes, quotaBytes: verdict.quotaBytes,
    });
    return null;
  }
  const copies = await params.copy().catch(async (error: unknown) => {
    await quota.release({ userId, bytes: expectedBytes, now });
    throw error;
  });
  const gap = copies.bytes - expectedBytes;
  if (gap > 0) await quota.record({ userId, bytes: gap, now });
  if (gap < 0) await quota.release({ userId, bytes: -gap, now });
  return copies;
}
