import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { accountReaderKeyOf } from '../posts/readerKey';

/**
 * L'EFFACEMENT de la télémétrie de lecture d'un compte supprimé (#10499,
 * revue de conformité O6 — RGPD art. 17).
 *
 * Toutes ces lignes ne parlent QUE de ce compte — ce qu'il a vu, lu,
 * ouvert, fait défiler ou capturé — et ne touchent aucun autre utilisateur :
 * elles s'effacent sans arbitrage. Les COMPTEURS des posts (`viewCount`,
 * `impressionCount`…) ne bougent pas : ils sont des agrégats sans identité.
 * Les événements v2 rangés SANS acteur (`actorKind = none`) ne portent pas de
 * `userId` : ils n'ont rien à effacer. Les impressions et sessions rangées
 * sous la forme RÉDUITE entre #10771 et #10785 portent l'EMPREINTE du compte
 * (`readerKey`) : elles s'effacent par elle, avec les lignes nominatives.
 *
 * Idempotent (`deleteMany` sur rien ne lève pas). Une panne PROPAGE, comme
 * pour chaque suppression voisine de la purge.
 */
export type ReadingTelemetryErasure = {
  readonly impressions: number;
  readonly engagements: number;
  readonly views: number;
  readonly contentEvents: number;
};

export type ReadingTelemetryErasureClient = Pick<
  PrismaClient,
  'postImpression' | 'postEngagement' | 'postView' | 'contentEvent'
>;

export async function eraseReadingTelemetryOf(
  prisma: ReadingTelemetryErasureClient,
  userId: string,
): Promise<ReadingTelemetryErasure> {
  const ofAccount = { OR: [{ userId }, { readerKey: accountReaderKeyOf(userId) }] };
  const [impressions, engagements, views, contentEvents] = await Promise.all([
    prisma.postImpression.deleteMany({ where: ofAccount }),
    prisma.postEngagement.deleteMany({ where: ofAccount }),
    prisma.postView.deleteMany({ where: { userId } }),
    prisma.contentEvent.deleteMany({ where: { userId } }),
  ]);
  return {
    impressions: impressions.count,
    engagements: engagements.count,
    views: views.count,
    contentEvents: contentEvents.count,
  };
}
