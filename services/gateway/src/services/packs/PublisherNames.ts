/**
 * LE NOM D'UN ÉDITEUR (#16274) — le SEUL site qui décide du `displayName` et
 * de sa clé de lecture (`nameKey`) avant toute écriture d'un `PartnerProfile`.
 * Tous les chemins qui écrivent un nom l'appellent : la proposition d'un pack
 * (`PackPublishers.adopt`), le profil partenaire (`LensPartners.saveOwnProfile`,
 * `PUT /lens/partners/me`) et le rattrapage (`PackPublishers.backfillNameKeys`).
 *
 * Un NOUVEAU nom est refusé s'il est réservé (`isReservedPublisherIdentity` :
 * mal formé, ou qui se lit comme Meeshy) ou si un AUTRE éditeur porte déjà sa
 * clé. Un ANCIEN nom n'est refusé que s'il se lit comme Meeshy. Le
 * compte officiel porte « Meeshy », sans clé. Le nom neutre n'a pas de clé :
 * tous les éditeurs sans nom le partagent.
 *
 * Un ANCIEN profil, écrit avant les clés de nom et que le rattrapage n'a pas
 * encore touché, détient lui aussi son nom : sa clé se recalcule à la lecture
 * (balayage borné, neutres et officiel exclus — ces profils sont peu nombreux,
 * et le rattrapage les épuise). En DIRECT (création, renommage), tout ancien
 * profil au même nom le détient, quel que soit son âge, et un balayage
 * inconcluant veut dire « réessayer plus tard ». Au RATTRAPAGE seul, où les
 * deux portaient déjà le nom, la clé va au profil VÉRIFIÉ, puis au plus ancien
 * (`byPrecedence`) ; l'autre garde son nom sans clé, « à arbitrer ».
 *
 * La vérification précède l'écriture ; deux écritures simultanées passent la
 * vérification toutes les deux. L'index unique partiel de `nameKey` (migration
 * du 2026-11-05) les départage par un P2002 que `isNameKeyViolation` lit comme
 * un nom pris ; sans l'index, `lostNameRace` départage après coup par la même
 * préséance — mais seul l'index ferme toute course : il se pose avant la fusion.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MEESHY_PUBLISHER_NAME, impersonatesMeeshy, isReservedPublisherIdentity, publisherNameKey } from '@meeshy/shared/types/pack-publisher';
import { isUniqueViolation } from './PackCatalog';

export type PublisherNamesDb = Pick<PrismaClient, 'partnerProfile'>;

/** Le nom donné à un éditeur dont aucun nom acceptable n'a été déclaré. */
export const NEUTRAL_PUBLISHER_NAME = 'Éditeur';

export type PublisherNameClaim =
  | { readonly kind: 'ok'; readonly displayName: string; readonly nameKey: string | null }
  | { readonly kind: 'reserved' }
  | { readonly kind: 'name-taken' }
  /** Le balayage des anciens profils n'a pas conclu : ni accordé ni refusé. */
  | { readonly kind: 'inconclusive' };

type AgedRow = { readonly id: string; readonly userId: string; readonly createdAt?: Date | null; readonly verifiedAt?: Date | null };

/**
 * `legacyClaimant` : AU RATTRAPAGE SEULEMENT, l'ancien profil qu'on nomme —
 * face à un autre ancien profil au même nom, celui qui le PRÉCÈDE
 * (`byPrecedence` : vérifié, puis plus ancien) garde la clé.
 * Absent (création, renommage en direct) : tout ancien profil au même nom le
 * détient, quel que soit son âge.
 */
export type PublisherNameRequest = { readonly userId: string; readonly name: string; readonly official: boolean; readonly legacyClaimant?: AgedRow };

/** Au-delà, le balayage des anciens profils ne conclut pas : « réessayer plus tard » (fail-closed) jusqu'au rattrapage. */
export const LEGACY_NAME_SCAN_LIMIT = 2_000;

const WITHOUT_NAME_KEY = [{ nameKey: null }, { nameKey: { isSet: false } }];

/** Ce qu'un compte peut écrire comme nom de boutique, et la clé qui l'accompagne. */
export async function claimPublisherName(prisma: PublisherNamesDb, request: PublisherNameRequest): Promise<PublisherNameClaim> {
  if (request.official) return { kind: 'ok', displayName: MEESHY_PUBLISHER_NAME, nameKey: null };
  if (request.name === NEUTRAL_PUBLISHER_NAME) return { kind: 'ok', displayName: NEUTRAL_PUBLISHER_NAME, nameKey: null };
  const reserved = request.legacyClaimant === undefined ? isReservedPublisherIdentity(request.name) : impersonatesMeeshy(request.name);
  if (reserved) return { kind: 'reserved' };
  const nameKey = publisherNameKey(request.name);
  const holder = await prisma.partnerProfile.findFirst({ where: { nameKey, NOT: { userId: request.userId } }, select: { id: true } });
  if (holder !== null) return { kind: 'name-taken' };
  const legacy = await legacyHolder(prisma, nameKey, request);
  if (legacy === 'inconclusive') return { kind: 'inconclusive' };
  return legacy === 'held' ? { kind: 'name-taken' } : { kind: 'ok', displayName: request.name, nameKey };
}

/**
 * Un ancien profil sans clé détient-il ce nom ? Les profils neutres et celui
 * de « Meeshy » sont exclus DÈS LA REQUÊTE : ils ne détiennent aucun nom, et
 * ne doivent pas remplir le balayage. Au-delà de la borne : `inconclusive`.
 */
async function legacyHolder(prisma: PublisherNamesDb, nameKey: string, request: PublisherNameRequest): Promise<'held' | 'free' | 'inconclusive'> {
  const legacy: readonly (AgedRow & { readonly displayName: string })[] = await prisma.partnerProfile.findMany({
    where: { OR: WITHOUT_NAME_KEY, NOT: { userId: request.userId }, displayName: { notIn: [NEUTRAL_PUBLISHER_NAME, MEESHY_PUBLISHER_NAME] } },
    select: { id: true, userId: true, displayName: true, createdAt: true, verifiedAt: true },
    take: LEGACY_NAME_SCAN_LIMIT,
  });
  if (legacy.length >= LEGACY_NAME_SCAN_LIMIT) return 'inconclusive';
  const claimant = request.legacyClaimant;
  const holds = legacy.some((row) => publisherNameKey(row.displayName) === nameKey && (claimant === undefined || byPrecedence(row, claimant) < 0));
  return holds ? 'held' : 'free';
}

/** Une écriture refusée par l'index unique de `nameKey` : le nom vient d'être pris. */
export function isNameKeyViolation(error: unknown): boolean {
  if (!isUniqueViolation(error)) return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? (error as Error).message ?? '');
  return text.includes('nameKey');
}

/** Le plus ancien d'abord : par date de création, puis par identifiant (un ObjectId croît avec le temps). */
export const byAge = (a: AgedRow, b: AgedRow): number => {
  const at = a.createdAt?.getTime() ?? 0;
  const bt = b.createdAt?.getTime() ?? 0;
  return at === bt ? a.id.localeCompare(b.id) : at - bt;
};

/** La PRÉSÉANCE entre deux détenteurs d'un même nom : le profil vérifié d'abord, puis le plus ancien. */
export const byPrecedence = (a: AgedRow, b: AgedRow): number => {
  const av = a.verifiedAt instanceof Date;
  const bv = b.verifiedAt instanceof Date;
  return av === bv ? byAge(a, b) : av ? -1 : 1;
};

/** Vrai si un AUTRE éditeur, qui le précède (`byPrecedence`), porte aussi cette clé : `row` a perdu la course au nom. */
export async function lostNameRace(prisma: PublisherNamesDb, nameKey: string, row: AgedRow): Promise<boolean> {
  const holders: readonly AgedRow[] = await prisma.partnerProfile.findMany({ where: { nameKey }, select: { id: true, userId: true, createdAt: true, verifiedAt: true } });
  return holders.some((holder) => holder.userId !== row.userId && byPrecedence(holder, row) < 0);
}
