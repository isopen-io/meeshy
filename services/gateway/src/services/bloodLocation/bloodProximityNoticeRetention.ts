/**
 * CE QU'UNE ALERTE « UN SANG S'APPROCHE » LAISSE EN BASE (#20542, audit de #20540, constat C3).
 *
 * La ligne `Notification` de type `blood_proximity` dit « Lina, à 500 m, le 24/11 à 21 h 12 » :
 * une position datée de l'AUTRE Sang, gardée chez le destinataire. `expiresAt` ne faisait que la
 * MASQUER à la lecture (`visibleNotificationsWhere`) ; aucune purge ni index TTL ne l'effaçait, et
 * un effacement de l'historique en laissait une copie chez chaque destinataire. Trois gestes
 * l'effacent désormais, tous ici :
 *
 * - l'ÉCHÉANCE : passé `expiresAt` (2 h, la cadence de l'alerte), la ligne part — balayée par les
 *   tâches de fond (`purgeExpiredBloodProximityNotices`) ;
 * - l'EFFACEMENT de l'historique (`DELETE /me/location/history`) : partent les lignes qui NOMMENT
 *   la personne, chez tous les destinataires, et celles qu'elle a reçues — chaque alerte dit où se
 *   trouvaient les DEUX, à 500 m l'un de l'autre ;
 * - le RETRAIT de la proximité (réglage par personne, ou baisse sous le Sang) : partent les lignes
 *   que le destinataire tenait de cet émetteur.
 *
 * Les retraits sont SILENCIEUX — rien n'est émis : une ligne disparue n'apprend rien à l'autre, et
 * une annonce lui dirait qu'on vient d'effacer ou de retirer. Un échec ne fait pas échouer le geste
 * qui l'a demandé : la ligne expirée part de toute façon au balayage suivant.
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { BLOOD_PROXIMITY_NOTIFICATION_TYPE } from '@meeshy/shared/types/blood-location';

export type BloodProximityNoticeStore = Pick<PrismaClient, '$runCommandRaw'>;
export type BloodProximityExpiryStore = Pick<PrismaClient, 'notification'>;

/** Un sens de la proximité : `readerId` ne doit plus rien garder de ce que `emitterId` lui a montré. */
export type BloodProximityPair = { readonly emitterId: string; readonly readerId: string };

const OBJECT_ID = /^[0-9a-f]{24}$/i;

async function deleteNotices(prisma: BloodProximityNoticeStore, branches: readonly Prisma.InputJsonObject[]): Promise<void> {
  if (branches.length === 0) return;
  await prisma.$runCommandRaw({
    delete: 'Notification',
    deletes: [{ q: { type: BLOOD_PROXIMITY_NOTIFICATION_TYPE, $or: [...branches] }, limit: 0 }],
  });
}

/** L'effacement de l'historique de `userId` : ses alertes chez tous les autres, et celles qu'il a reçues. */
export async function eraseBloodProximityNoticesOf(prisma: BloodProximityNoticeStore, userId: string): Promise<void> {
  if (!OBJECT_ID.test(userId)) return;
  await deleteNotices(prisma, [{ 'actor.id': userId }, { userId: { $oid: userId } }]);
}

/** Le retrait de la proximité, sens par sens : chez le lecteur, les alertes qui nomment l'émetteur. */
export async function retractBloodProximityNotices(prisma: BloodProximityNoticeStore, pairs: readonly BloodProximityPair[]): Promise<void> {
  const valid = pairs.filter((pair) => OBJECT_ID.test(pair.emitterId) && OBJECT_ID.test(pair.readerId));
  await deleteNotices(prisma, valid.map((pair) => ({ userId: { $oid: pair.readerId }, 'actor.id': pair.emitterId })));
}

/** Les alertes échues : leur ligne part, et rend combien. */
export async function purgeExpiredBloodProximityNotices(prisma: BloodProximityExpiryStore, now: Date): Promise<number> {
  const { count } = await prisma.notification.deleteMany({
    where: { type: BLOOD_PROXIMITY_NOTIFICATION_TYPE, expiresAt: { lt: now } },
  });
  return count;
}
