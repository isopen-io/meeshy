import type { ParsedSocialEventsContext } from '../../routes/social/eventsV2Schemas';
import type { SocialEvent } from '../../routes/social/eventsSchemas';
import { rawReadingRetentionMs } from '../../config/raw-reading-retention';
import {
  compact,
  ejsonDate,
  ejsonObjectId,
  eventKeyOf,
  insertDocuments,
  type RawCommandPrisma,
} from './contentEvents';
import { storedListingOf, type AnalyticsStanding } from './eventPrivacy';

/**
 * La LIGNE `PostImpression` d'une impression de compte (#10501) — la seule
 * fabrique de cette ligne, pour les deux chemins d'écriture (`createMany`
 * pour un ancien client, `insert` brut quand l'impression porte un
 * `eventId`).
 *
 * Ce que la ligne range dépend de la situation de consentement
 * (`eventPrivacy.ts`) : la position, la source de classement et la
 * visibilité sont de la MESURE (rangées sauf refus) ; l'identifiant de page
 * de fil et la session d'application RELIENT des événements entre eux et ne
 * sont rangés que si l'analyse est consentie.
 *
 * La ligne porte le COMPTE quel que soit le statut (#10785, décision du
 * porteur) : « qui a vu » est une fonctionnalité de la plateforme, sa base est
 * l'exécution du service, pas le consentement d'analyse. Les lignes réduites
 * écrites entre #10773 et #10785 (`readerKey`, sans `userId`) ne sont plus
 * produites ; elles restent lues jusqu'à leur expiration (8 jours).
 */

export type ImpressionEvent = Extract<SocialEvent, { type: 'impression' }>;

export type ImpressionRow = {
  readonly postId: string;
  readonly userId: string;
  readonly source: string;
  readonly surface?: string;
  readonly createdAt?: Date;
  readonly expiresAt: Date;
  readonly eventKey?: string;
  readonly position?: number;
  readonly rankingSource?: string;
  readonly feedRequestId?: string;
  readonly viewable?: boolean;
  readonly visibleFraction?: number;
  readonly visibleMs?: number;
  readonly appSessionId?: string;
  readonly platform?: string;
};

export function impressionRowOf(params: {
  readonly event: ImpressionEvent;
  readonly userId: string;
  readonly standing: AnalyticsStanding;
  readonly context: ParsedSocialEventsContext;
  readonly derivedAt?: Date;
  readonly receivedAt: Date;
}): ImpressionRow {
  const { event, standing } = params;
  const listing = storedListingOf(event.listing, standing);
  const measured = standing !== 'denied';
  const visibility = measured ? event.visibility : undefined;
  return compact({
    postId: event.postId,
    userId: params.userId,
    source: event.source,
    surface: event.surface,
    createdAt: params.derivedAt,
    expiresAt: new Date((params.derivedAt ?? params.receivedAt).getTime() + rawReadingRetentionMs()),
    eventKey: event.eventId ? eventKeyOf(event.eventId) : undefined,
    position: listing?.position,
    rankingSource: listing?.rankingSource,
    feedRequestId: listing?.feedRequestId,
    viewable: visibility?.viewable,
    visibleFraction: visibility?.maxVisibleFraction,
    visibleMs: visibility?.visibleMs,
    appSessionId: standing === 'granted' ? params.context.appSessionId : undefined,
    platform: measured ? params.context.platform : undefined,
  }) as ImpressionRow;
}

const toExtendedJson = (row: ImpressionRow): Record<string, unknown> => ({
  ...row,
  postId: ejsonObjectId(row.postId),
  userId: ejsonObjectId(row.userId),
  createdAt: ejsonDate(row.createdAt ?? new Date()),
  expiresAt: ejsonDate(row.expiresAt),
});

/**
 * Écrit les lignes PORTANT une clé en UNE commande non ordonnée ; rend
 * l'index des lignes réellement écrites. Une ligne refusée en doublon est un
 * rejeu : elle ne crédite aucun compteur.
 */
export async function insertKeyedImpressions(
  prisma: RawCommandPrisma,
  rows: readonly ImpressionRow[],
): Promise<{ readonly inserted: ReadonlySet<number>; readonly duplicates: ReadonlySet<number> }> {
  return insertDocuments(prisma, 'PostImpression', rows.map(toExtendedJson));
}

/**
 * Retire les lignes à clé qu'un comptage en échec vient d'écrire (#10553) :
 * sans cela le renvoi du client serait un doublon, et l'impression perdue.
 */
export async function removeKeyedImpressions(prisma: RawCommandPrisma, rows: readonly ImpressionRow[]): Promise<void> {
  const keys = rows.flatMap((row) => (row.eventKey ? [row.eventKey] : []));
  if (keys.length === 0) return;
  await prisma.$runCommandRaw({
    delete: 'PostImpression',
    deletes: [{ q: { eventKey: { $in: keys } }, limit: 0 }],
  }).catch(() => undefined);
}
