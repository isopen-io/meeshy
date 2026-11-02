/**
 * LE SITE UNIQUE du consentement de cercle (#14401, audit #14535 constat 2).
 *
 * Dit si `ownerId` partage `feature` à `otherId` depuis le rituel du Sang, en lisant
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

const COLUMN = {
  'listening.title': 'listeningTitleShared',
  'location.live': 'locationShared',
  'location.history': 'locationHistoryShared',
  'location.proximity': 'proximityShared',
} as const satisfies Record<RitualConsentFeature, string>;

export type RelationConsent = 'granted' | 'refused';

export async function relationConsentOf(
  prisma: Pick<PrismaClient, 'relationFeatureSetting'>,
  params: { readonly ownerId: string; readonly otherId: string; readonly feature: RitualConsentFeature },
): Promise<RelationConsent> {
  const column = COLUMN[params.feature];
  const row = await prisma.relationFeatureSetting.findUnique({
    where: { ownerId_otherId: { ownerId: params.ownerId, otherId: params.otherId } },
    select: { [column]: true } as Record<typeof column, true>,
  });
  return (row as Record<string, unknown> | null)?.[column] === true ? 'granted' : 'refused';
}
