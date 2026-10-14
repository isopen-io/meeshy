/**
 * Le DÉCOR de profil (#10632, § 5.5 et § 10.2) — le contour d'avatar et la
 * bannière de design ÉQUIPÉS, visibles des autres. Deux fonctions, UN module :
 *
 *   - `servedProfileDecor` : ce qu'on SERT (`GET /me`, profil public) — tolérant,
 *     un choix qui n'existe plus au registre se sert `null`, jamais une erreur ;
 *   - `validateProfileDecorWrite` : ce qu'on ACCEPTE (`PUT /me/profile-decor`) —
 *     domaine, existence, POSSESSION, puis la loi des cadres pour le contour
 *     (`canUseFrame(…, { kind: 'avatar' })`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isPackOwned, type PackDomain } from '@meeshy/shared/types/content-pack';
import { frameUsageOf, type PackIndexEntry } from '@meeshy/shared/types/content-pack-index';
import { canUseFrame } from '@meeshy/shared/types/frame-usage';
import {
  EMPTY_PROFILE_DECOR,
  ProfileDecorRefSchema,
  formatProfileDecorRef,
  parseProfileDecorRef,
  type ProfileDecorRef,
  type ServedProfileDecor,
  type ServedProfileDecorItem,
} from '@meeshy/shared/types/profile-decor';
import type { PackIndex } from '../packs/PackIndex';

export type StoredProfileDecor = { readonly equippedAvatarRing?: string | null; readonly equippedBanner?: string | null };

const resolveEntry = (index: PackIndex, domain: PackDomain, ref: ProfileDecorRef): PackIndexEntry | undefined => {
  const entry = index.entries(domain).find((candidate) => candidate.slug === ref.pack && !candidate.hidden);
  return entry !== undefined && index.itemKeys(entry).includes(ref.item) ? entry : undefined;
};

const servedItem = (index: PackIndex, domain: PackDomain, stored: string | null | undefined): ServedProfileDecorItem | null => {
  const ref = parseProfileDecorRef(stored);
  const entry = ref === null ? undefined : resolveEntry(index, domain, ref);
  if (ref === null || entry === undefined) return null;
  return { pack: ref.pack, item: ref.item, origin: entry.origin, contract: entry.origin === 'builtin' ? null : entry.contract.src };
};

export const servedProfileDecor = (index: PackIndex, stored: StoredProfileDecor | null | undefined): ServedProfileDecor =>
  stored === null || stored === undefined
    ? EMPTY_PROFILE_DECOR
    : { avatarRing: servedItem(index, 'avatar-ring', stored.equippedAvatarRing), banner: servedItem(index, 'banner', stored.equippedBanner) };

export type ProfileDecorWriteOutcome =
  | { readonly kind: 'ok'; readonly data: StoredProfileDecor }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'not-owned' }
  | { readonly kind: 'usage-mismatch' };

type Side = { readonly field: 'equippedAvatarRing' | 'equippedBanner'; readonly key: 'avatarRing' | 'banner'; readonly domain: PackDomain };

const SIDES: readonly Side[] = [
  { field: 'equippedAvatarRing', key: 'avatarRing', domain: 'avatar-ring' },
  { field: 'equippedBanner', key: 'banner', domain: 'banner' },
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
  const owned = new Set<string>();
  const loadOwned = async () => {
    if (owned.size === 0) (await prisma.userPackOwnership.findMany({ where: { userId }, select: { packKey: true } })).forEach((row) => owned.add(row.packKey));
  };

  const data: { equippedAvatarRing?: string | null; equippedBanner?: string | null } = {};
  for (const side of SIDES) {
    const requested = input[side.key];
    if (requested === undefined) continue;
    if (requested === null) {
      data[side.field] = null;
      continue;
    }
    const parsed = ProfileDecorRefSchema.safeParse(requested);
    if (!parsed.success) return { kind: 'invalid' };
    const entry = resolveEntry(index, side.domain, parsed.data);
    if (entry === undefined) return { kind: 'not-owned' };
    if (entry.price !== undefined) await loadOwned();
    if (!isPackOwned({ domain: side.domain, slug: entry.slug, price: entry.price }, owned)) return { kind: 'not-owned' };
    if (side.domain === 'avatar-ring') {
      const usage = frameUsageOf(entry);
      if (usage === null || !canUseFrame(usage, { kind: 'avatar' })) return { kind: 'usage-mismatch' };
    }
    data[side.field] = formatProfileDecorRef(parsed.data);
  }
  return { kind: 'ok', data };
}
