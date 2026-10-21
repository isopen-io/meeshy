/**
 * Le DÉCOR de profil (#10632, § 5.5 et § 10.2) — le contour d'avatar, la
 * bannière de design (le FOND) et le cadre de bannière (posé SUR la photo,
 * #10932) ÉQUIPÉS, visibles des autres. Deux fonctions, UN module :
 *
 *   - `servedProfileDecor` : ce qu'on SERT (`GET /me`, profil public) — tolérant,
 *     un choix qui n'existe plus au registre se sert `null`, jamais une erreur ;
 *   - `validateProfileDecorWrite` : ce qu'on ACCEPTE (`PUT /me/profile-decor`) —
 *     domaine, POSSESSION du pack, existence de l'élément (après la possession :
 *     aucun oracle sur le contenu d'un pack non possédé), puis la loi des cadres pour le contour
 *     (`canUseFrame(…, { kind: 'avatar' })`) et le cadre de bannière (`{ kind: 'banner' }`).
 *     Fail-closed : un côté refusé n'écrit RIEN, pas même les autres côtés de la requête.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isFreePack, isPackOwned, type PackDomain } from '@meeshy/shared/types/content-pack';
import { frameUsageOf, type PackIndexEntry } from '@meeshy/shared/types/content-pack-index';
import { ownedPackKeys } from '@meeshy/shared/types/pack-ownership';
import { canUseFrame, type FrameUseContext } from '@meeshy/shared/types/frame-usage';
import {
  EMPTY_PROFILE_DECOR,
  PROFILE_DECOR_SIDE_DOMAIN,
  ProfileDecorRefSchema,
  formatProfileDecorRef,
  parseProfileDecorRef,
  type ProfileDecorRef,
  type ProfileDecorSide,
  type ServedProfileDecor,
  type ServedProfileDecorItem,
} from '@meeshy/shared/types/profile-decor';
import type { PackIndex } from '../packs/PackIndex';

/** La forme SERVIE d'un élément de décor, déclarée UNE fois pour `/me`, `PUT /me/profile-decor` et le profil public. */
export const servedProfileDecorItemJsonSchema = {
  type: 'object',
  nullable: true,
  properties: { pack: { type: 'string' }, item: { type: 'string' }, origin: { type: 'string' }, contract: { type: 'string', nullable: true } },
} as const;

/** Le décor SERVI, ses trois côtés — UNE déclaration pour `/me`, `PUT /me/profile-decor` et le profil public. */
export const servedProfileDecorJsonSchema = {
  type: 'object',
  properties: { avatarRing: servedProfileDecorItemJsonSchema, banner: servedProfileDecorItemJsonSchema, bannerFrame: servedProfileDecorItemJsonSchema },
} as const;

/** Les colonnes du décor, à `select`er ensemble partout où le décor est composé. */
export const PROFILE_DECOR_COLUMNS = { equippedAvatarRing: true, equippedBanner: true, equippedBannerFrame: true } as const;

/** La seule colonne du décor qu'un RÉSUMÉ de personne lit (#10945) — à étaler dans le `select` qu'il fait déjà. */
export const AVATAR_RING_COLUMN = { equippedAvatarRing: true } as const;

export type StoredProfileDecor = {
  readonly equippedAvatarRing?: string | null;
  readonly equippedBanner?: string | null;
  readonly equippedBannerFrame?: string | null;
};

/** Un pack MASQUÉ se sert en lecture (ce qui est équipé, payé compris, reste porté) ; il ne s'équipe plus. */
const resolvePack = (index: PackIndex, domain: PackDomain, ref: ProfileDecorRef, use: 'served' | 'equipped'): PackIndexEntry | undefined =>
  index.entries(domain).find((candidate) => candidate.slug === ref.pack && (use === 'served' || !candidate.hidden));

const resolveEntry = (index: PackIndex, domain: PackDomain, ref: ProfileDecorRef, use: 'served' | 'equipped'): PackIndexEntry | undefined => {
  const entry = resolvePack(index, domain, ref, use);
  return entry !== undefined && index.itemKeys(entry).includes(ref.item) ? entry : undefined;
};

const servedItem = (index: PackIndex, domain: PackDomain, stored: string | null | undefined): ServedProfileDecorItem | null => {
  const ref = parseProfileDecorRef(stored);
  const entry = ref === null ? undefined : resolveEntry(index, domain, ref, 'served');
  if (ref === null || entry === undefined) return null;
  return { pack: ref.pack, item: ref.item, origin: entry.origin, contract: entry.origin === 'builtin' ? null : entry.contract.src };
};

export const servedProfileDecor = (index: PackIndex, stored: StoredProfileDecor | null | undefined): ServedProfileDecor =>
  stored === null || stored === undefined
    ? EMPTY_PROFILE_DECOR
    : {
        avatarRing: servedItem(index, 'avatar-ring', stored.equippedAvatarRing),
        banner: servedItem(index, 'banner', stored.equippedBanner),
        bannerFrame: servedItem(index, 'banner-frame', stored.equippedBannerFrame),
      };

/**
 * Le contour qui voyage AVEC un participant (#10713) — listes, fiche, bulles.
 * `undefined` (clé absente) pour un participant sans compte, sans contour, ou
 * dont le contour a quitté le registre : la charge reste additive, et un ancien
 * client n'y voit rien de neuf.
 */
export const participantProfileDecor = (
  index: PackIndex,
  user: { readonly equippedAvatarRing?: string | null } | null | undefined,
): { readonly avatarRing: ServedProfileDecorItem } | undefined => {
  const avatarRing = servedItem(index, 'avatar-ring', user?.equippedAvatarRing);
  return avatarRing === null ? undefined : { avatarRing };
};

export type ProfileDecorWriteOutcome =
  | { readonly kind: 'ok'; readonly data: StoredProfileDecor }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'not-owned' }
  | { readonly kind: 'item-not-found' }
  | { readonly kind: 'usage-mismatch' };

type Side = {
  readonly field: keyof StoredProfileDecor;
  readonly key: ProfileDecorSide;
  readonly domain: PackDomain;
  /** Le contexte de la loi des cadres : `null` pour un côté qui n'est pas un cadre (le fond de bannière). */
  readonly frameContext: FrameUseContext | null;
};

const SIDES: readonly Side[] = [
  { field: 'equippedAvatarRing', key: 'avatarRing', domain: PROFILE_DECOR_SIDE_DOMAIN.avatarRing, frameContext: { kind: 'avatar' } },
  { field: 'equippedBanner', key: 'banner', domain: PROFILE_DECOR_SIDE_DOMAIN.banner, frameContext: null },
  { field: 'equippedBannerFrame', key: 'bannerFrame', domain: PROFILE_DECOR_SIDE_DOMAIN.bannerFrame, frameContext: { kind: 'banner' } },
];

export type ProfileDecorWriteParams = {
  readonly prisma: PrismaClient;
  readonly index: PackIndex;
  readonly userId: string;
  readonly input: unknown;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value);

export async function validateProfileDecorWrite({ prisma, index, userId, input }: ProfileDecorWriteParams): Promise<ProfileDecorWriteOutcome> {
  if (!isRecord(input)) return { kind: 'invalid' };
  let ownedRead: Promise<ReadonlySet<string>> | undefined;
  const ownedKeys = (): Promise<ReadonlySet<string>> =>
    (ownedRead ??= prisma.userPackOwnership.findMany({ where: { userId }, select: { packKey: true } }).then(ownedPackKeys));

  const data: { -readonly [F in keyof StoredProfileDecor]: StoredProfileDecor[F] } = {};
  for (const side of SIDES) {
    const requested = input[side.key];
    if (requested === undefined) continue;
    if (requested === null) {
      data[side.field] = null;
      continue;
    }
    const parsed = ProfileDecorRefSchema.safeParse(requested);
    if (!parsed.success) return { kind: 'invalid' };
    const entry = resolvePack(index, side.domain, parsed.data, 'equipped');
    if (entry === undefined) return { kind: 'not-owned' };
    const owned = isFreePack(entry) ? new Set<string>() : await ownedKeys();
    if (!isPackOwned({ domain: side.domain, slug: entry.slug, price: entry.price, reward: entry.reward }, owned)) return { kind: 'not-owned' };
    if (!index.itemKeys(entry).includes(parsed.data.item)) return { kind: 'item-not-found' };
    if (side.frameContext !== null) {
      const usage = frameUsageOf(entry);
      if (usage === null || !canUseFrame(usage, side.frameContext)) return { kind: 'usage-mismatch' };
    }
    data[side.field] = formatProfileDecorRef(parsed.data);
  }
  return { kind: 'ok', data };
}
