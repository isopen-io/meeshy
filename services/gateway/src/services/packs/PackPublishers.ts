/**
 * LES ÉDITEURS DE PACKS (#16274) — à qui appartient un pack, et qui peut publier.
 *
 * Un éditeur est un `PartnerProfile` (l'identité partenaire des lens, #11327,
 * généralisée à tous les domaines). Il appartient à UN compte Meeshy
 * (`userId`), et un compte en possède au plus un : un pack se rattache donc à
 * l'éditeur du compte qui l'a PROPOSÉ (`submitterId`), sans seconde référence
 * en base qui pourrait diverger de celle-là.
 *
 *  - **publier** (`authorizePublication`) exige un compte inscrit (garde des
 *    routes), ACTIF, et VÉRIFIÉ (adresse e-mail ou numéro), puis propriétaire de
 *    l'éditeur que la proposition nomme. Un compte sans éditeur en reçoit un à
 *    sa première proposition, nommé par l'auteur qu'elle déclare — jamais par
 *    son nom d'utilisateur. L'identité « Meeshy » (`isReservedPublisherIdentity`)
 *    est refusée à tout autre compte que l'officiel ;
 *  - **servir** (`servedFor`) rend, pour chaque proposant, `PackPublisherRef` :
 *    une adresse et un nom de boutique, jamais le compte propriétaire. Une
 *    proposition d'avant les éditeurs reçoit le sien À LA VOLÉE, sous le nom
 *    d'auteur qu'elle portait : la migration n'exige aucune passe préalable ;
 *  - **le compte officiel** est désigné par `MEESHY_OFFICIAL_ACCOUNT_ID`, jamais
 *    écrit en dur. Sans configuration, aucun compte n'est officiel et
 *    l'identité « Meeshy » reste réservée à tous (fail-closed) ;
 *  - **l'administration** (`adminList`) voit le compte propriétaire et son nom
 *    d'utilisateur ; elle seule.
 */
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  MEESHY_PUBLISHER,
  MEESHY_PUBLISHER_NAME,
  MEESHY_PUBLISHER_SLUG,
  PACK_PUBLISHER_LIMITS,
  isReservedPublisherIdentity,
  publisherSlugOf,
  type PackPublisherRef,
} from '@meeshy/shared/types/pack-publisher';
import { PARTNER_PROFILE_LIMITS } from '@meeshy/shared/types/lens-partner';
import { isUniqueViolation } from './PackCatalog';

export type PackPublishersDb = Pick<PrismaClient, 'partnerProfile' | 'user'>;

export type PublicationRefusal = 'account-unverified' | 'not-owner' | 'reserved';

export type PublicationAuthorization =
  | { readonly kind: 'allowed'; readonly publisher: PackPublisherRef }
  | { readonly kind: 'refused'; readonly reason: PublicationRefusal };

/** Ce qu'une proposition dit de son éditeur : l'auteur déclaré, et l'éditeur nommé (`null` : aucun, un ancien client). */
export type PublicationClaim = { readonly author: string; readonly claimed: string | null };

/** Un pack tel que la boutique le relit : son proposant et l'auteur qu'il déclarait. */
export type PublishedBy = { readonly submitterId: string; readonly author: string };

export type PublisherAdminView = {
  readonly id: string;
  readonly slug: string | null;
  readonly displayName: string;
  readonly verified: boolean;
  readonly verifiedAt: string | null;
  readonly official: boolean;
  readonly createdAt: string | null;
  /** Le compte propriétaire — servi à BIGBOSS/ADMIN seulement. */
  readonly owner: { readonly id: string; readonly username: string | null };
};

export type EnsureOfficialOutcome = 'linked' | 'unconfigured' | 'unknown-account' | 'conflict';

export type PackPublishersDeps = {
  readonly prisma: PackPublishersDb;
  /** Le compte officiel Meeshy (`officialPublisherAccountFrom(process.env)`) ; `null` : aucun. */
  readonly officialAccountId: string | null;
  readonly now?: () => Date;
  readonly suffix?: () => string;
};

const OBJECT_ID = /^[0-9a-f]{24}$/;

/** Le compte officiel, lu dans la configuration : un identifiant de compte exact, sinon aucun (fail-closed). */
export const officialPublisherAccountFrom = (env: Readonly<Record<string, string | undefined>>): string | null => {
  const raw = env.MEESHY_OFFICIAL_ACCOUNT_ID;
  return typeof raw === 'string' && OBJECT_ID.test(raw) ? raw : null;
};

/** Le nom donné à un éditeur dont la proposition ne déclarait aucun nom acceptable. */
export const NEUTRAL_PUBLISHER_NAME = 'Éditeur';

const NEUTRAL_SLUG = 'editeur';
const MAX_SLUG_ATTEMPTS = 5;
const INVISIBLE_OR_CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

const ROW_SELECT = { id: true, userId: true, slug: true, displayName: true, verifiedAt: true, createdAt: true } as const;

type PublisherRow = {
  readonly id: string;
  readonly userId: string;
  readonly slug: string | null;
  readonly displayName: string;
  readonly verifiedAt: Date | null;
  readonly createdAt?: Date | null;
};

type SluggedRow = PublisherRow & { readonly slug: string };

const ACCOUNT_SELECT = { isActive: true, deactivatedAt: true, deletedAt: true, emailVerifiedAt: true, phoneVerifiedAt: true } as const;

type AccountRow = {
  readonly isActive: boolean | null;
  readonly deactivatedAt: Date | null;
  readonly deletedAt: Date | null;
  readonly emailVerifiedAt: Date | null;
  readonly phoneVerifiedAt: Date | null;
};

const canPublish = (account: AccountRow | null): boolean =>
  account !== null &&
  account.isActive !== false &&
  account.deactivatedAt === null &&
  account.deletedAt === null &&
  (account.emailVerifiedAt !== null || account.phoneVerifiedAt !== null);

/** Le nom de boutique qu'un éditeur reçoit à sa création : l'auteur déclaré s'il est acceptable, sinon un nom neutre. */
const storeNameOf = (author: string): string => {
  const name = author.normalize('NFKC').trim();
  const acceptable = name.length > 0 && name.length <= PARTNER_PROFILE_LIMITS.maxDisplayNameLength && !INVISIBLE_OR_CONTROL.test(name) && !isReservedPublisherIdentity(name);
  return acceptable ? name : NEUTRAL_PUBLISHER_NAME;
};

/** La base de l'adresse d'un éditeur TIERS : jamais une adresse réservée, même tirée d'un ancien nom. */
const slugBaseOf = (name: string): string => (isReservedPublisherIdentity(name) ? NEUTRAL_SLUG : publisherSlugOf(name));

const hasSlug = (row: PublisherRow): row is SluggedRow => typeof row.slug === 'string' && row.slug.length > 0;

/** Un profil d'avant #16274 n'a pas de champ `slug` : ABSENT, que `{ slug: null }` seul ne trouve pas sur Mongo. */
const WITHOUT_SLUG = [{ slug: null }, { slug: { isSet: false } }];

export class PackPublishers {
  private readonly prisma: PackPublishersDb;
  private readonly official: string | null;
  private readonly now: () => Date;
  private readonly suffix: () => string;

  constructor(deps: PackPublishersDeps) {
    this.prisma = deps.prisma;
    this.official = deps.officialAccountId;
    this.now = deps.now ?? (() => new Date());
    this.suffix = deps.suffix ?? (() => randomBytes(4).toString('hex').slice(0, PACK_PUBLISHER_LIMITS.slugSuffixLength));
  }

  private isOfficial(userId: string): boolean {
    return this.official !== null && userId === this.official;
  }

  /** Ce que la boutique sert d'un éditeur — un ancien profil tiers au nom réservé est servi sous un nom neutre. */
  private refOf(row: SluggedRow): PackPublisherRef {
    if (this.isOfficial(row.userId)) return MEESHY_PUBLISHER;
    const name = isReservedPublisherIdentity(row.displayName) ? NEUTRAL_PUBLISHER_NAME : row.displayName;
    return { slug: row.slug, name, verified: row.verifiedAt !== null, official: false };
  }

  /** Publier : compte actif et vérifié, éditeur possédé, identité « Meeshy » au seul compte officiel. */
  async authorizePublication(userId: string, claim: PublicationClaim): Promise<PublicationAuthorization> {
    const account = await this.prisma.user.findUnique({ where: { id: userId }, select: ACCOUNT_SELECT });
    if (!canPublish(account)) return { kind: 'refused', reason: 'account-unverified' };
    const official = this.isOfficial(userId);
    if (!official && isReservedPublisherIdentity(claim.author)) return { kind: 'refused', reason: 'reserved' };
    const row = official ? await this.officialRow(userId) : await this.ensureFor(userId, claim.author);
    if (row === null) return { kind: 'refused', reason: 'reserved' };
    const publisher = this.refOf(row);
    if (claim.claimed !== null && claim.claimed !== publisher.slug) return { kind: 'refused', reason: 'not-owner' };
    return { kind: 'allowed', publisher };
  }

  /** L'éditeur servi pour chaque proposant ; celui d'une proposition d'avant les éditeurs est créé à la volée. */
  async servedFor(packs: readonly PublishedBy[]): Promise<ReadonlyMap<string, PackPublisherRef>> {
    const authorOf = new Map(packs.map((pack) => [pack.submitterId, pack.author]));
    const ids = [...authorOf.keys()];
    if (ids.length === 0) return new Map();
    const rows: readonly PublisherRow[] = await this.prisma.partnerProfile.findMany({ where: { userId: { in: ids } }, select: ROW_SELECT });
    const byOwner = new Map(rows.map((row) => [row.userId, row]));
    const resolved = await Promise.all(
      ids.map(async (id) => {
        if (this.isOfficial(id)) return [id, MEESHY_PUBLISHER] as const;
        const row = byOwner.get(id);
        const slugged = row !== undefined && hasSlug(row) ? row : await this.ensureFor(id, authorOf.get(id) ?? '');
        return [id, this.refOf(slugged)] as const;
      }),
    );
    return new Map(resolved);
  }

  /** Un éditeur par son adresse, pour la boutique : sans son propriétaire. */
  async bySlug(slug: string): Promise<PackPublisherRef | null> {
    if (slug === MEESHY_PUBLISHER_SLUG) return MEESHY_PUBLISHER;
    const row = await this.prisma.partnerProfile.findUnique({ where: { slug }, select: ROW_SELECT });
    return row === null || !hasSlug(row) ? null : this.refOf(row);
  }

  /** L'éditeur du compte connecté, s'il en a un. */
  async own(userId: string): Promise<PackPublisherRef | null> {
    if (this.isOfficial(userId)) return MEESHY_PUBLISHER;
    const row = await this.prisma.partnerProfile.findUnique({ where: { userId }, select: ROW_SELECT });
    if (row === null) return null;
    return this.refOf(hasSlug(row) ? row : await this.ensureFor(userId, row.displayName));
  }

  /** Tous les éditeurs avec leur compte propriétaire — pour BIGBOSS/ADMIN seulement. */
  async adminList(): Promise<readonly PublisherAdminView[]> {
    const rows: readonly PublisherRow[] = await this.prisma.partnerProfile.findMany({ orderBy: { createdAt: 'asc' }, select: ROW_SELECT });
    const owners = rows.length === 0 ? [] : await this.prisma.user.findMany({ where: { id: { in: rows.map((row) => row.userId) } }, select: { id: true, username: true } });
    const usernameOf = new Map(owners.map((owner) => [owner.id, owner.username]));
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug ?? null,
      displayName: row.displayName,
      verified: row.verifiedAt !== null,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      official: this.isOfficial(row.userId),
      createdAt: row.createdAt?.toISOString() ?? null,
      owner: { id: row.userId, username: usernameOf.get(row.userId) ?? null },
    }));
  }

  /** Lie l'éditeur « Meeshy » au compte officiel configuré — appelé au démarrage, idempotent. */
  async ensureOfficial(): Promise<EnsureOfficialOutcome> {
    if (this.official === null) return 'unconfigured';
    const account = await this.prisma.user.findUnique({ where: { id: this.official }, select: { isActive: true } });
    if (account === null) return 'unknown-account';
    const row = await this.officialRow(this.official);
    return row === null ? 'conflict' : 'linked';
  }

  /** L'éditeur « Meeshy » du compte officiel, créé ou réadressé ; `null` si l'adresse `meeshy` est tenue par un autre profil. */
  private async officialRow(userId: string): Promise<SluggedRow | null> {
    const now = this.now();
    const current = await this.prisma.partnerProfile.findUnique({ where: { userId }, select: ROW_SELECT });
    try {
      if (current === null) {
        await this.prisma.partnerProfile.create({ data: { userId, slug: MEESHY_PUBLISHER_SLUG, displayName: MEESHY_PUBLISHER_NAME, verifiedAt: now, createdAt: now, updatedAt: now } });
      } else if (current.slug !== MEESHY_PUBLISHER_SLUG || current.verifiedAt === null) {
        await this.prisma.partnerProfile.updateMany({ where: { userId }, data: { slug: MEESHY_PUBLISHER_SLUG, displayName: MEESHY_PUBLISHER_NAME, verifiedAt: current.verifiedAt ?? now, updatedAt: now } });
      }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const row = await this.prisma.partnerProfile.findUnique({ where: { userId }, select: ROW_SELECT });
    return row !== null && hasSlug(row) && row.slug === MEESHY_PUBLISHER_SLUG ? row : null;
  }

  /**
   * L'éditeur d'un compte TIERS, adressé : créé s'il n'existe pas (nommé par
   * `author`), réadressé s'il date d'avant les éditeurs. Deux créations
   * concurrentes se rejoignent sur la clé unique `userId` ; deux noms qui
   * donnent la même adresse se départagent par un suffixe.
   */
  private async ensureFor(userId: string, author: string): Promise<SluggedRow> {
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const current = await this.prisma.partnerProfile.findUnique({ where: { userId }, select: ROW_SELECT });
      if (current !== null && hasSlug(current)) return current;
      const name = current?.displayName ?? storeNameOf(author);
      const base = slugBaseOf(name);
      const slug = attempt === 0 ? base : `${base}-${this.suffix()}`;
      const now = this.now();
      try {
        if (current === null) {
          await this.prisma.partnerProfile.create({ data: { userId, slug, displayName: name, createdAt: now, updatedAt: now } });
        } else {
          await this.prisma.partnerProfile.updateMany({ where: { userId, OR: WITHOUT_SLUG }, data: { slug } });
        }
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    const settled = await this.prisma.partnerProfile.findUnique({ where: { userId }, select: ROW_SELECT });
    if (settled !== null && hasSlug(settled)) return settled;
    throw new Error('no publisher address could be allocated');
  }
}
