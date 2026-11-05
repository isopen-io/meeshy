/**
 * LE NOM D'UN ÉDITEUR (#16274) — le SEUL site qui décide du `displayName` et
 * de sa clé de lecture (`nameKey`) avant toute écriture d'un `PartnerProfile`.
 * Tous les chemins qui écrivent un nom l'appellent : la proposition d'un pack
 * (`PackPublishers.adopt`), le profil partenaire (`LensPartners.saveOwnProfile`,
 * `PUT /lens/partners/me`) et le rattrapage (`PackPublishers.backfillNameKeys`).
 *
 * Un nom est refusé s'il est réservé (`isReservedPublisherIdentity` : mal formé,
 * ou qui se lit comme Meeshy) ou si un AUTRE éditeur porte déjà sa clé. Le
 * compte officiel porte « Meeshy », sans clé. Le nom neutre n'a pas de clé :
 * tous les éditeurs sans nom le partagent.
 *
 * Un ANCIEN profil, écrit avant les clés de nom et que le rattrapage n'a pas
 * encore touché, détient lui aussi son nom : sa clé se recalcule à la lecture
 * (balayage borné — ces profils sont peu nombreux, et le rattrapage les
 * épuise). Entre deux détenteurs d'un même nom, le plus ancien le garde.
 *
 * La vérification précède l'écriture ; deux écritures simultanées passent la
 * vérification toutes les deux. L'index unique partiel de `nameKey` (migration
 * du 2026-11-05) les départage par un P2002 que `isNameKeyViolation` lit comme
 * un nom pris ; sans l'index, `lostNameRace` départage après coup, le plus
 * ancien gardant le nom.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MEESHY_PUBLISHER_NAME, isReservedPublisherIdentity, publisherNameKey } from '@meeshy/shared/types/pack-publisher';
import { isUniqueViolation } from './PackCatalog';

export type PublisherNamesDb = Pick<PrismaClient, 'partnerProfile'>;

/** Le nom donné à un éditeur dont aucun nom acceptable n'a été déclaré. */
export const NEUTRAL_PUBLISHER_NAME = 'Éditeur';

export type PublisherNameClaim =
  | { readonly kind: 'ok'; readonly displayName: string; readonly nameKey: string | null }
  | { readonly kind: 'reserved' }
  | { readonly kind: 'name-taken' };

type AgedRow = { readonly id: string; readonly userId: string; readonly createdAt?: Date | null };

/**
 * `claimant` : le profil qui revendique, s'il existe déjà (un renommage, un
 * ancien profil qu'on nomme) — face à un ancien profil sans clé au même nom, le
 * plus ancien des deux garde le nom. Absent : une création, la plus récente.
 */
export type PublisherNameRequest = { readonly userId: string; readonly name: string; readonly official: boolean; readonly claimant?: AgedRow | null };

/** Au-delà, le balayage des anciens profils ne conclut pas : le nom est refusé (fail-closed) jusqu'au rattrapage. */
export const LEGACY_NAME_SCAN_LIMIT = 2_000;

const WITHOUT_NAME_KEY = [{ nameKey: null }, { nameKey: { isSet: false } }];

/** Ce qu'un compte peut écrire comme nom de boutique, et la clé qui l'accompagne. */
export async function claimPublisherName(prisma: PublisherNamesDb, request: PublisherNameRequest): Promise<PublisherNameClaim> {
  if (request.official) return { kind: 'ok', displayName: MEESHY_PUBLISHER_NAME, nameKey: null };
  if (request.name === NEUTRAL_PUBLISHER_NAME) return { kind: 'ok', displayName: NEUTRAL_PUBLISHER_NAME, nameKey: null };
  if (isReservedPublisherIdentity(request.name)) return { kind: 'reserved' };
  const nameKey = publisherNameKey(request.name);
  const holder = await prisma.partnerProfile.findFirst({ where: { nameKey, NOT: { userId: request.userId } }, select: { id: true } });
  if (holder !== null) return { kind: 'name-taken' };
  return (await legacyHolds(prisma, nameKey, request)) ? { kind: 'name-taken' } : { kind: 'ok', displayName: request.name, nameKey };
}

/** Vrai si un ancien profil sans clé, au même nom et plus ancien que le revendicateur, détient ce nom. */
async function legacyHolds(prisma: PublisherNamesDb, nameKey: string, request: PublisherNameRequest): Promise<boolean> {
  const legacy: readonly (AgedRow & { readonly displayName: string })[] = await prisma.partnerProfile.findMany({
    where: { OR: WITHOUT_NAME_KEY, NOT: { userId: request.userId } },
    select: { id: true, userId: true, displayName: true, createdAt: true },
    take: LEGACY_NAME_SCAN_LIMIT,
  });
  if (legacy.length >= LEGACY_NAME_SCAN_LIMIT) return true;
  const claimant = request.claimant ?? null;
  return legacy.some(
    (row) => row.displayName !== NEUTRAL_PUBLISHER_NAME && publisherNameKey(row.displayName) === nameKey && (claimant === null || byAge(row, claimant) < 0),
  );
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

/** Vrai si un AUTRE éditeur, plus ancien, porte aussi cette clé : `row` a perdu la course au nom. */
export async function lostNameRace(prisma: PublisherNamesDb, nameKey: string, row: AgedRow): Promise<boolean> {
  const holders: readonly AgedRow[] = await prisma.partnerProfile.findMany({ where: { nameKey }, select: { id: true, userId: true, createdAt: true } });
  return holders.some((holder) => holder.userId !== row.userId && byAge(holder, row) < 0);
}
