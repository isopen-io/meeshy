/**
 * LE RETRAIT DES PARTAGES DU RITUEL DU SANG (#14401, #14910) — site unique.
 *
 * Un partage consenti au rituel (titre écouté, position, historique, proximité)
 * se retire de deux façons : par son propriétaire, un à un
 * (`PUT /relations/:userId/settings`), ou d'office quand le lien tombe sous le
 * Sang (`POST /relations/:userId/level`) — le consentement a été donné à un Sang,
 * pas au cercle d'en dessous. Chaque partage ENCORE allumé passe à `false` ; un
 * partage déjà éteint garde sa date (audit #14535 constat 3). Aucune ligne n'est
 * créée, et les blocages de réception (Bring, talkie) ne sont pas des partages.
 *
 * La date de retrait (`*WithdrawnAt`) trace le GESTE du propriétaire. Chez l'AUTRE
 * — celui qui subit la baisse —, le partage s'éteint SANS date : son export la lui
 * servirait, et dater la baisse qu'on lui a tue (RG-07, audit #14910).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { compareRelationLevel, type RelationLevel } from '@meeshy/shared/types/relation';
import { niveauEffectif, type RelationLevelDb } from '../friendship';
import {
  RELATION_RITUAL_SHARES,
  RELATION_RITUAL_SHARE_WITHDRAWN_AT,
  type RelationRitualShare,
} from '@meeshy/shared/types/relation-person-settings';

export type RitualSharesRow = Readonly<Record<RelationRitualShare, boolean>>;

const SHARES_SELECT = Object.fromEntries(RELATION_RITUAL_SHARES.map((share) => [share, true])) as Record<RelationRitualShare, true>;

/** `at` nul : le partage s'éteint sans date de retrait (ce n'est pas le geste du propriétaire). */
export const ritualShareWithdrawalOf = (
  current: Partial<RitualSharesRow> | null,
  shares: readonly RelationRitualShare[],
  at: Date | null,
): Record<string, boolean | Date> =>
  Object.fromEntries(
    shares
      .filter((share) => current?.[share] === true)
      .flatMap((share): Array<[string, boolean | Date]> =>
        at === null ? [[share, false]] : [[share, false], [RELATION_RITUAL_SHARE_WITHDRAWN_AT[share], at]]),
  );

async function withdrawOwnerShares(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly ownerId: string; readonly otherId: string; readonly at: Date | null },
): Promise<void> {
  const current = (await prisma.relationFeatureSetting.findUnique({
    where: { ownerId_otherId: { ownerId: params.ownerId, otherId: params.otherId } },
    select: SHARES_SELECT,
  })) as Partial<RitualSharesRow> | null;
  const data = ritualShareWithdrawalOf(current, RELATION_RITUAL_SHARES, params.at);
  if (Object.keys(data).length === 0) return;
  await prisma.relationFeatureSetting.updateMany({ where: { ownerId: params.ownerId, otherId: params.otherId }, data });
}

/**
 * Le lien est tombé sous le Sang par le geste de `actorId` : les partages du rituel
 * s'éteignent dans les DEUX sens — datés chez l'acteur, sans date chez l'autre.
 */
export async function withdrawRitualSharesBetween(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly actorId: string; readonly otherId: string; readonly at: Date },
): Promise<void> {
  await Promise.all([
    withdrawOwnerShares(prisma, { ownerId: params.actorId, otherId: params.otherId, at: params.at }),
    withdrawOwnerShares(prisma, { ownerId: params.otherId, otherId: params.actorId, at: null }),
  ]);
}

/**
 * Le lien est tombé sous Proche (#13934, #16686) : l'accord de la CATÉGORIE d'écoute
 * s'éteint dans les deux sens — il a été donné à un Proche, pas au cercle d'en dessous,
 * et une remontée ultérieure ne le rallume pas sans un nouvel accord. Daté chez
 * l'acteur, sans date chez l'autre (RG-07) ; aucune ligne créée.
 */
export async function withdrawListeningCategoryBetween(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly actorId: string; readonly otherId: string; readonly at: Date },
): Promise<void> {
  await Promise.all([
    prisma.relationFeatureSetting.updateMany({
      where: { ownerId: params.actorId, otherId: params.otherId, listeningCategoryShared: true },
      data: { listeningCategoryShared: false, listeningCategoryWithdrawnAt: params.at },
    }),
    prisma.relationFeatureSetting.updateMany({
      where: { ownerId: params.otherId, otherId: params.actorId, listeningCategoryShared: true },
      data: { listeningCategoryShared: false },
    }),
  ]);
}

export type SharesBeyondLinkDb = RelationLevelDb & Pick<PrismaClient, 'relationFeatureSetting'>;

const SHARE_ROW_SELECT = {
  ownerId: true,
  otherId: true,
  listeningCategoryShared: true,
  ...Object.fromEntries(RELATION_RITUAL_SHARES.map((share) => [share, true])),
} as const;

type ShareRow = { readonly ownerId: string; readonly otherId: string; readonly listeningCategoryShared: boolean | null } & Partial<RitualSharesRow>;

const revocationOf = (row: ShareRow, level: RelationLevel, now: Date): Record<string, boolean | Date> => ({
  ...(level === 'BLOOD' ? {} : ritualShareWithdrawalOf(row, RELATION_RITUAL_SHARES, now)),
  ...(compareRelationLevel(level, 'CLOSE') < 0 && row.listeningCategoryShared === true
    ? { listeningCategoryShared: false, listeningCategoryWithdrawnAt: now }
    : {}),
});

/**
 * Les partages de `userId`, dans les DEUX sens, que le LIEN réel n'ouvre pas (#16814) :
 * ceux du rituel hors Sang, la catégorie d'écoute sous Proche. Ils s'éteignent datés chez
 * chaque émetteur — c'est la fin d'un accord donné hors rituel entre collègues de l'équipe,
 * que seul l'appelant (`revokeTeamSharesOf`) sait reconnaître. Aucune ligne n'est créée.
 */
export async function withdrawSharesTheLinkDoesNotOpen(
  prisma: SharesBeyondLinkDb,
  params: { readonly userId: string; readonly at: Date },
): Promise<void> {
  const rows = (await prisma.relationFeatureSetting.findMany({
    where: { OR: [{ ownerId: params.userId }, { otherId: params.userId }] },
    select: SHARE_ROW_SELECT,
  })) as unknown as readonly ShareRow[];
  await Promise.all(
    rows.map(async (row) => {
      const data = revocationOf(row, await niveauEffectif(prisma, row.ownerId, row.otherId), params.at);
      if (Object.keys(data).length === 0) return;
      await prisma.relationFeatureSetting.updateMany({ where: { ownerId: row.ownerId, otherId: row.otherId }, data });
    }),
  );
}
