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
 *    (`RelationFeatureSetting`, `ownerId` = moi).
 *
 * Jamais ce qui décrit l'AUTRE (art. 15(4)) : ni ce qu'il m'accorde, ni ses
 * passages (ses baisses comprises), ni le niveau effectif qui en dérive, ni le
 * cool-down qu'un refus m'a valu (RG-07), ni ses compteurs envers moi, ni les
 * consentements qu'il m'a donnés. La ligne est lue en entier pour savoir de
 * quel côté je suis ; seule ma moitié en sort.
 *
 * Chaque liste est bornée par la page de la requête.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ExportPage } from './export-sections';

const INTERACTION_KINDS = ['Message', 'Reaction', 'PostView', 'Comment', 'Share', 'StoryReply', 'Mention', 'Call', 'Audio'] as const;

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
  readonly listeningTitleShared: boolean;
  readonly locationShared: boolean;
  readonly locationHistoryShared: boolean;
  readonly proximityShared: boolean;
  readonly consentedAt: Date;
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
  listeningTitleShared: row.listeningTitleShared,
  locationShared: row.locationShared,
  locationHistoryShared: row.locationHistoryShared,
  proximityShared: row.proximityShared,
  consentedAt: row.consentedAt.toISOString(),
});

const interactionSelect = Object.fromEntries(
  (['Low', 'High'] as const).flatMap((side) => INTERACTION_KINDS.map((kind) => [`by${side}${kind}`, true])),
);

export async function exportRelations(prisma: RelationsExportPrisma | PrismaClient, userId: string, page: ExportPage) {
  const db = prisma as unknown as RelationsExportPrisma;
  const take = page.limit + 1;
  const skip = page.offset;
  const ofMyPairs = { OR: [{ userLowId: userId }, { userHighId: userId }] };

  const [links, interactionDays, consents] = await Promise.all([
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
      select: { otherId: true, listeningTitleShared: true, locationShared: true, locationHistoryShared: true, proximityShared: true, consentedAt: true },
      orderBy: { consentedAt: 'asc' },
      take,
      skip,
    } as never),
  ]);

  const clip = <Row>(rows: readonly Row[]) => rows.slice(0, page.limit);
  return {
    links: clip(links).map((row) => linkOf(row, userId)),
    interactionDays: clip(interactionDays).map((row) => interactionDayOf(row, userId)),
    consents: clip(consents).map(consentOf),
    hasMore: {
      links: links.length > page.limit,
      interactionDays: interactionDays.length > page.limit,
      consents: consents.length > page.limit,
    },
  };
}

const interactionCountsSchema = Object.fromEntries(
  INTERACTION_KINDS.map((kind) => [`${kind.charAt(0).toLowerCase()}${kind.slice(1)}`, { type: 'integer' }]),
);

/** Des `properties` NOMMÉES : chaque colonne que `exportRelations` sert, et elle seule. */
export const relationsExportSchema = {
  type: 'object',
  nullable: true,
  properties: {
    links: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          grantedByMe: { type: 'string' },
          origin: { type: 'string' },
          createdAt: { type: 'string' },
          myTransitions: {
            type: 'array',
            items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, at: { type: 'string' } } },
          },
        },
      },
    },
    interactionDays: {
      type: 'array',
      items: { type: 'object', properties: { userId: { type: 'string' }, day: { type: 'string' }, ...interactionCountsSchema } },
    },
    consents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          listeningTitleShared: { type: 'boolean' },
          locationShared: { type: 'boolean' },
          locationHistoryShared: { type: 'boolean' },
          proximityShared: { type: 'boolean' },
          consentedAt: { type: 'string' },
        },
      },
    },
    hasMore: {
      type: 'object',
      properties: { links: { type: 'boolean' }, interactionDays: { type: 'boolean' }, consents: { type: 'boolean' } },
    },
  },
} as const;
