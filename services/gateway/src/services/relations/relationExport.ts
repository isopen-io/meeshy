/**
 * La section `relations` de `GET /me/export` (#14400, écart E2 de #13942 —
 * RGPD art. 15 et 20) : ce que la passerelle garde de MES cercles.
 *
 *  - `links` : chaque lien où je figure (`UserRelation`), avec ce que J'accorde,
 *    son origine, sa date de naissance et MES passages (`transitions` dont je
 *    suis l'acteur) ;
 *  - `interactionDays` : par paire et par jour (`PairInteractionDay`), ce que
 *    J'AI fait envers l'autre, nature par nature ;
 *  - `consents` : les partages que J'AI consentis au rituel du Sang
 *    (`RelationFeatureSetting`, `ownerId` = moi), et la date à laquelle j'ai
 *    retiré chacun (#14401), avec le fantôme ciblé et le rayon de proximité
 *    que j'ai réglés pour l'autre ;
 *  - la position du Sang (`bloodLocationExport.ts`, #13937) : mon fantôme
 *    global, mes points et le journal des consultations qui me concernent.
 *
 * Jamais ce qui décrit l'AUTRE (art. 15(4)) : ni ce qu'il m'accorde, ni ses
 * passages (ses baisses comprises), ni le niveau effectif qui en dérive, ni le
 * cool-down qu'un refus m'a valu (RG-07), ni ses compteurs envers moi, ni les
 * consentements qu'il m'a donnés. La ligne est lue en entier pour savoir de
 * quel côté je suis ; seule ma moitié en sort.
 *
 * Chaque liste est bornée par la page de la requête. Le module vit sous
 * `services/relations/` : c'est le seul endroit, avec `friendship.ts`, qui lit
 * `userRelation` (`relation-access-single-site-guard.test.ts`).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ExportPage } from '../../routes/me/export-sections';
import { exportBloodLocation } from '../bloodLocation/bloodLocationExport';

export const INTERACTION_KINDS = ['Message', 'Reaction', 'PostView', 'Comment', 'Share', 'StoryReply', 'Mention', 'Call', 'Audio'] as const;

type InteractionKind = (typeof INTERACTION_KINDS)[number];

type Side = 'Low' | 'High';

type PairRow = { readonly userLowId: string; readonly userHighId: string };

type LinkRow = PairRow & {
  readonly grantedByLow: string;
  readonly grantedByHigh: string;
  readonly origin: string;
  readonly createdAt: Date;
  readonly transitions: ReadonlyArray<{ readonly actorId: string; readonly from: string; readonly to: string; readonly at: Date }> | null;
};

type InteractionDayRow = PairRow & { readonly day: Date } & { readonly [K in `by${Side}${InteractionKind}`]: number };

type ConsentRow = {
  readonly otherId: string;
  readonly listeningCategoryShared?: boolean | null;
  readonly listeningTitleShared: boolean;
  readonly locationShared: boolean;
  readonly locationHistoryShared: boolean;
  readonly proximityShared: boolean;
  readonly consentedAt: Date;
  readonly listeningCategoryWithdrawnAt?: Date | null;
  readonly listeningTitleWithdrawnAt?: Date | null;
  readonly locationWithdrawnAt?: Date | null;
  readonly locationHistoryWithdrawnAt?: Date | null;
  readonly proximityWithdrawnAt?: Date | null;
  readonly ghostAt?: Date | null;
  readonly proximityRadiusMeters?: number | null;
};

type FindMany<Row> = { readonly findMany: (args: never) => Promise<readonly Row[]> };

type RelationsExportPrisma = {
  readonly userRelation: FindMany<LinkRow>;
  readonly pairInteractionDay: FindMany<InteractionDayRow>;
  readonly relationFeatureSetting: FindMany<ConsentRow>;
};

const sideOf = (row: PairRow, userId: string): Side => (row.userLowId === userId ? 'Low' : 'High');

const otherOf = (row: PairRow, userId: string): string => (row.userLowId === userId ? row.userHighId : row.userLowId);

const linkOf = (row: LinkRow, userId: string) => ({
  userId: otherOf(row, userId),
  grantedByMe: sideOf(row, userId) === 'Low' ? row.grantedByLow : row.grantedByHigh,
  origin: row.origin,
  createdAt: row.createdAt.toISOString(),
  myTransitions: (row.transitions ?? [])
    .filter((transition) => transition.actorId === userId)
    .map(({ from, to, at }) => ({ from, to, at: at.toISOString() })),
});

const interactionDayOf = (row: InteractionDayRow, userId: string) => {
  const side = sideOf(row, userId);
  const counts = Object.fromEntries(
    INTERACTION_KINDS.map((kind) => [`${kind.charAt(0).toLowerCase()}${kind.slice(1)}`, row[`by${side}${kind}`]]),
  );
  return { userId: otherOf(row, userId), day: row.day.toISOString(), ...counts };
};

const consentOf = (row: ConsentRow) => ({
  userId: row.otherId,
  listeningCategoryShared: row.listeningCategoryShared === true,
  listeningTitleShared: row.listeningTitleShared,
  locationShared: row.locationShared,
  locationHistoryShared: row.locationHistoryShared,
  proximityShared: row.proximityShared,
  consentedAt: row.consentedAt.toISOString(),
  ghostAt: row.ghostAt?.toISOString() ?? null,
  proximityRadiusMeters: row.proximityRadiusMeters ?? null,
  withdrawnAt: {
    listeningCategoryShared: row.listeningCategoryWithdrawnAt?.toISOString() ?? null,
    listeningTitleShared: row.listeningTitleWithdrawnAt?.toISOString() ?? null,
    locationShared: row.locationWithdrawnAt?.toISOString() ?? null,
    locationHistoryShared: row.locationHistoryWithdrawnAt?.toISOString() ?? null,
    proximityShared: row.proximityWithdrawnAt?.toISOString() ?? null,
  },
});

const interactionSelect = Object.fromEntries(
  (['Low', 'High'] as const).flatMap((side) => INTERACTION_KINDS.map((kind) => [`by${side}${kind}`, true])),
);

export async function exportRelations(prisma: RelationsExportPrisma | PrismaClient, userId: string, page: ExportPage) {
  const db = prisma as unknown as RelationsExportPrisma;
  const take = page.limit + 1;
  const skip = page.offset;
  const ofMyPairs = { OR: [{ userLowId: userId }, { userHighId: userId }] };

  const [links, interactionDays, consents, bloodLocation] = await Promise.all([
    db.userRelation.findMany({
      where: ofMyPairs,
      select: { userLowId: true, userHighId: true, grantedByLow: true, grantedByHigh: true, origin: true, createdAt: true, transitions: true },
      orderBy: { createdAt: 'asc' },
      take,
      skip,
    } as never),
    db.pairInteractionDay.findMany({
      where: ofMyPairs,
      select: { userLowId: true, userHighId: true, day: true, ...interactionSelect },
      orderBy: { day: 'desc' },
      take,
      skip,
    } as never),
    db.relationFeatureSetting.findMany({
      where: { ownerId: userId },
      select: { otherId: true, listeningCategoryShared: true, listeningTitleShared: true, locationShared: true, locationHistoryShared: true, proximityShared: true, consentedAt: true,
        listeningCategoryWithdrawnAt: true, listeningTitleWithdrawnAt: true, locationWithdrawnAt: true, locationHistoryWithdrawnAt: true, proximityWithdrawnAt: true,
        ghostAt: true, proximityRadiusMeters: true },
      orderBy: { consentedAt: 'asc' },
      take,
      skip,
    } as never),
    exportBloodLocation(prisma as unknown as PrismaClient, userId, page),
  ]);

  const clip = <Row>(rows: readonly Row[]) => rows.slice(0, page.limit);
  return {
    links: clip(links).map((row) => linkOf(row, userId)),
    interactionDays: clip(interactionDays).map((row) => interactionDayOf(row, userId)),
    consents: clip(consents).map(consentOf),
    bloodLocationGhostAt: bloodLocation.bloodLocationGhostAt,
    bloodLocationPoints: bloodLocation.bloodLocationPoints,
    bloodLocationConsultations: bloodLocation.bloodLocationConsultations,
    hasMore: {
      links: links.length > page.limit,
      interactionDays: interactionDays.length > page.limit,
      consents: consents.length > page.limit,
      ...bloodLocation.hasMore,
    },
  };
}
