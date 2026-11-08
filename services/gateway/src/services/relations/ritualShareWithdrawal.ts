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
import type { RelationLevel } from '@meeshy/shared/types/relation';
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
 * `at` nul : la chute n'est le geste de personne (course du rituel), aucun côté n'est daté.
 */
export async function withdrawRitualSharesBetween(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly actorId: string; readonly otherId: string; readonly at: Date | null },
): Promise<void> {
  await Promise.all([
    withdrawOwnerShares(prisma, { ownerId: params.actorId, otherId: params.otherId, at: params.at }),
    withdrawOwnerShares(prisma, { ownerId: params.otherId, otherId: params.actorId, at: null }),
  ]);
}

const SHARES_OFF_DATA = Object.fromEntries(RELATION_RITUAL_SHARES.map((share) => [share, false])) as Record<RelationRitualShare, false>;

/**
 * Un compte part (désactivation, suppression) : tout partage du rituel qu'il avait consenti
 * ou qu'on lui avait consenti s'éteint (#14924), sans date — ce n'est le geste de personne.
 * Aucune ligne n'est créée ; une réactivation ne rallume rien.
 */
export async function withdrawRitualSharesOfUser(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly userId: string },
): Promise<void> {
  await prisma.relationFeatureSetting.updateMany({
    where: { OR: [{ ownerId: params.userId }, { otherId: params.userId }] },
    data: SHARES_OFF_DATA,
  });
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

/**
 * Le lien vient de tomber, par le geste de `actorId`, au niveau effectif `level` — baisse
 * (`POST /relations/:userId/level`) ou rupture d'une demande acceptée : site UNIQUE de ce qui
 * ne tient plus. Sous le Sang, les partages du rituel s'éteignent ; sous Proche, la catégorie
 * d'écoute aussi. Rejouable sans condition : un retrait échoué se solde au rejeu.
 */
export async function withdrawSharesAfterDrop(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly actorId: string; readonly otherId: string; readonly level: RelationLevel; readonly at: Date },
): Promise<void> {
  if (params.level === 'BLOOD') return;
  const pair = { actorId: params.actorId, otherId: params.otherId, at: params.at };
  await withdrawRitualSharesBetween(prisma, pair);
  if (params.level === 'CLOSE') return;
  await withdrawListeningCategoryBetween(prisma, pair);
}
