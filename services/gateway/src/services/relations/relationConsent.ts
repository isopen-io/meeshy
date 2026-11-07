/**
 * LE SITE UNIQUE du consentement de cercle (#14401, audit #14535 constat 2).
 *
 * Dit si `ownerId` partage `feature` à `otherId` — la catégorie de son écoute dès Proche
 * (#16686), le reste depuis le rituel du Sang —, en lisant
 * `RelationFeatureSetting` À CHAQUE appel : jamais un cache, ni en mémoire ni dans
 * Redis. Tout relais (écoute #13934, position #13937) le consulte avant chaque
 * émission, si bien qu'un retrait (`PUT /relations/:userId/settings`) coupe
 * l'émission suivante. Une valeur illisible vaut `refused`.
 *
 * La garde `relationConsent.test.ts` interdit toute autre lecture des colonnes de
 * consentement dans la passerelle.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

export const RITUAL_CONSENT_FEATURES = ['listening.title', 'location.live', 'location.history', 'location.proximity'] as const;
export type RitualConsentFeature = (typeof RITUAL_CONSENT_FEATURES)[number];

/**
 * Tous les partages consentis par l'ÉMETTEUR, personne par personne : la catégorie
 * d'écoute (accordée dès Proche, #13934) et ceux du rituel.
 */
export const SHARE_CONSENT_FEATURES = ['listening.category', ...RITUAL_CONSENT_FEATURES] as const;
export type ShareConsentFeature = (typeof SHARE_CONSENT_FEATURES)[number];

const COLUMN = {
  'listening.category': 'listeningCategoryShared',
  'listening.title': 'listeningTitleShared',
  'location.live': 'locationShared',
  'location.history': 'locationHistoryShared',
  'location.proximity': 'proximityShared',
} as const satisfies Record<ShareConsentFeature, string>;

export type RelationConsent = 'granted' | 'refused';

export async function relationConsentOf(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly ownerId: string; readonly otherId: string; readonly feature: ShareConsentFeature },
): Promise<RelationConsent> {
  const column = COLUMN[params.feature];
  const row = await prisma.relationFeatureSetting.findUnique({
    where: { ownerId_otherId: { ownerId: params.ownerId, otherId: params.otherId } },
    select: { [column]: true } as Record<typeof column, true>,
  });
  return (row as Record<string, unknown> | null)?.[column] === true ? 'granted' : 'refused';
}

/**
 * Les personnes parmi `otherIds` à qui `ownerId` partage `feature`, en UNE lecture :
 * un éventail (écoute, position) ne relit pas la table lecteur par lecteur. Absent
 * de l'ensemble = `refused`, comme une valeur illisible.
 */
export async function relationConsentGrantedAmong(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly ownerId: string; readonly otherIds: readonly string[]; readonly feature: ShareConsentFeature },
): Promise<ReadonlySet<string>> {
  if (params.otherIds.length === 0) return new Set();
  const column = COLUMN[params.feature];
  const rows = (await prisma.relationFeatureSetting.findMany({
    where: { ownerId: params.ownerId, otherId: { in: [...params.otherIds] } },
    select: { otherId: true, [column]: true } as Record<'otherId' | typeof column, true>,
  })) as ReadonlyArray<Record<string, unknown>>;
  return new Set(rows.filter((row) => row[column] === true).map((row) => String(row.otherId)));
}

/** Les propriétaires parmi `ownerIds` qui partagent `feature` à `otherId` — le sens du lecteur (rattrapage). */
export async function relationConsentGrantedBy(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly ownerIds: readonly string[]; readonly otherId: string; readonly feature: ShareConsentFeature },
): Promise<ReadonlySet<string>> {
  if (params.ownerIds.length === 0) return new Set();
  const column = COLUMN[params.feature];
  const rows = (await prisma.relationFeatureSetting.findMany({
    where: { ownerId: { in: [...params.ownerIds] }, otherId: params.otherId },
    select: { ownerId: true, [column]: true } as Record<'ownerId' | typeof column, true>,
  })) as ReadonlyArray<Record<string, unknown>>;
  return new Set(rows.filter((row) => row[column] === true).map((row) => String(row.ownerId)));
}
