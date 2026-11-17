import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { notificationLogger } from '../../utils/logger-enhanced';
import { retractedNotificationOf, type RetractedNotification } from './retractedNotifications';

/**
 * Le lot d'un retrait par chemin JSON. `singleBatch` en fait une lecture close
 * plutôt qu'un curseur laissé ouvert côté serveur. Une demande d'amitié produit
 * UNE notification ; un BLOCAGE retire tout ce qu'une personne a produit chez
 * une autre, des années de messages compris : le retrait se répète donc, lot
 * après lot, jusqu'à un lot incomplet.
 */
const RETRACTION_BATCH_SIZE = 1000;

/**
 * Borne du nombre de lots : chaque lot supprime ce qu'il a lu, donc le suivant
 * lit les lignes d'après. La borne ne sert qu'à ce qu'une suppression qui
 * n'aboutirait pas (lignes relues à l'identique) ne tourne jamais sans fin.
 */
const RETRACTION_MAX_BATCHES = 50;

type RetractionParams = {
  readonly prisma: PrismaClient;
  readonly userId: string;
  readonly match: Readonly<Record<string, unknown>>;
  readonly projection: Readonly<Record<string, 1>>;
  readonly announce: ((retracted: readonly RetractedNotification[]) => Promise<void>) | undefined;
  readonly failure: { readonly message: string; readonly context: Readonly<Record<string, unknown>> };
};

type RawRetractionBatch = {
  cursor?: {
    firstBatch?: ReadonlyArray<{
      _id: string | { $oid: string };
      type?: unknown;
      context?: unknown;
      delivery?: unknown;
    }>;
  };
};

/**
 * Le geste commun des retraits qui visent une notification par un chemin que
 * Prisma ne filtre pas sur MongoDB (`context.friendRequestId`, `actor.id`) :
 * lire les ids par `$runCommandRaw`, supprimer les ids RELUS — l'ensemble
 * supprimé et l'ensemble annoncé sont identiques par construction — puis
 * annoncer APRÈS l'écriture durable, que les compteurs voient la base d'après.
 *
 * `announce` absent = retrait SILENCIEUX : la ligne part, rien n'est émis. C'est
 * le cas du blocage côté bloqué, à qui une disparition en direct apprendrait
 * qu'il a été bloqué.
 *
 * `userId` est la garde anti-IDOR : il scope toujours la lecture. Ne lève
 * jamais — un retrait ne fait pas échouer le geste qui l'a demandé.
 */
export async function retractNotificationRows(params: RetractionParams): Promise<number> {
  if (!/^[0-9a-f]{24}$/i.test(params.userId)) return 0;
  return retractBatches(params, 0);
}

/** Un lot, puis le suivant tant que le lot était plein. Une panne arrête la série sans lever. */
async function retractBatches(params: RetractionParams, batchIndex: number): Promise<number> {
  try {
    const retracted = await retractOneBatch(params);
    const more = retracted === RETRACTION_BATCH_SIZE && batchIndex + 1 < RETRACTION_MAX_BATCHES;
    return more ? retracted + (await retractBatches(params, batchIndex + 1)) : retracted;
  } catch (error) {
    notificationLogger.error(params.failure.message, { error, userId: params.userId, ...params.failure.context });
    return 0;
  }
}

async function retractOneBatch(params: RetractionParams): Promise<number> {
  const { prisma, userId, match, projection, announce } = params;
  const raw = await (prisma as unknown as {
    $runCommandRaw: (cmd: Record<string, unknown>) => Promise<RawRetractionBatch>;
  }).$runCommandRaw({
    find: 'Notification',
    filter: { userId: { $oid: userId }, ...match },
    projection,
    singleBatch: true,
    batchSize: RETRACTION_BATCH_SIZE,
  });

  const rows = (raw?.cursor?.firstBatch ?? []).map((row) => ({
    id: typeof row._id === 'string' ? row._id : row._id.$oid,
    type: row.type,
    context: row.context,
    delivery: row.delivery,
  }));
  if (rows.length === 0) return 0;

  await prisma.notification.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
  await announce?.(rows.map((row) => retractedNotificationOf({ ...row, userId })));
  return rows.length;
}
