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
 *    son nom d'utilisateur — sauf si un autre éditeur porte déjà ce nom
 *    (`publisherNameKey`). Un auteur qui se lit comme Meeshy
 *    (`impersonatesMeeshy`) est refusé à tout autre compte que l'officiel ;
 *  - **servir** (`servedFor`) est une LECTURE : jamais une écriture. Un
 *    proposant sans éditeur (proposition d'avant #16274, compte purgé) est servi
 *    sous `NEUTRAL_PUBLISHER`, et une base en défaut dégrade au même nom neutre
 *    plutôt que de casser le catalogue. Le rattrapage (`backfill`) crée les
 *    éditeurs manquants ;
 *  - **l'unicité** (un éditeur par compte, une adresse, un nom) ne suppose pas
 *    les index uniques que pose la migration du 2026-11-05 : la création est un
 *    `upsert` sur `userId`, les doublons d'un compte se résorbent au plus ancien,
 *    et une adresse se vérifie avant et après son écriture ;
 *  - **le compte officiel** est désigné par `MEESHY_OFFICIAL_ACCOUNT_ID`, jamais
 *    écrit en dur. Sans configuration, aucun compte n'est officiel et
 *    l'identité « Meeshy » reste réservée à tous (fail-closed). Sa liaison
 *    s'écrit au journal d'audit avant d'agir ;
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
  impersonatesMeeshy,
  isReservedPublisherIdentity,
  publisherSlugOf,
  type PackPublisherRef,
} from '@meeshy/shared/types/pack-publisher';
import { PARTNER_PROFILE_LIMITS } from '@meeshy/shared/types/lens-partner';
import { isUniqueViolation } from './PackCatalog';
import { NEUTRAL_PUBLISHER_NAME, byAge, claimPublisherName, isNameKeyViolation, lostNameRace } from './PublisherNames';

export { NEUTRAL_PUBLISHER_NAME } from './PublisherNames';

export type PackPublishersDb = Pick<PrismaClient, 'partnerProfile' | 'user' | 'adminAuditLog'>;

export type PublicationRefusal = 'account-unverified' | 'not-owner' | 'reserved' | 'name-taken';

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

export type EnsureOfficialOutcome = 'linked' | 'unconfigured' | 'unknown-account' | 'inactive-account' | 'audit-unavailable' | 'conflict';

/** Ce que le rattrapage a fait : éditeurs créés, adresses posées sur un ancien profil, éditeurs déjà complets, comptes sautés. */
export type BackfillSummary = { readonly created: number; readonly addressed: number; readonly kept: number; readonly skipped: number };

/** Ce que le rattrapage des clés de nom a fait : clés posées, profils ramenés au nom neutre (nom réservé ou déjà porté). */
export type NameKeyBackfillSummary = { readonly keyed: number; readonly neutralized: number };

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

const NEUTRAL_SLUG = 'editeur';

/**
 * L'éditeur servi pour un proposant qui n'en a pas (encore) : une adresse
 * qu'aucun éditeur réel ne porte (`editeur` nu n'est jamais alloué), un nom
 * neutre, non vérifié. Une lecture seule ne crée rien.
 */
export const NEUTRAL_PUBLISHER: PackPublisherRef = Object.freeze({ slug: NEUTRAL_SLUG, name: NEUTRAL_PUBLISHER_NAME, verified: false, official: false });

const MAX_SLUG_ATTEMPTS = 6;
const INVISIBLE_OR_CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const OFFICIAL_LINK_ACTION = 'PACK_PUBLISHER_OFFICIAL_LINK';

const ROW_SELECT = { id: true, userId: true, slug: true, displayName: true, nameKey: true, verifiedAt: true, createdAt: true } as const;

type PublisherRow = {
  readonly id: string;
  readonly userId: string;
  readonly slug: string | null;
  readonly displayName: string;
  readonly nameKey: string | null;
  readonly verifiedAt: Date | null;
  readonly createdAt?: Date | null;
};

const ACCOUNT_SELECT = { isActive: true, deactivatedAt: true, deletedAt: true, emailVerifiedAt: true, phoneVerifiedAt: true } as const;

type AccountRow = {
  readonly isActive: boolean | null;
  readonly deactivatedAt: Date | null;
  readonly deletedAt: Date | null;
  readonly emailVerifiedAt: Date | null;
  readonly phoneVerifiedAt: Date | null;
};

/** Actif, ni désactivé ni supprimé : seule une absence de date le prouve. */
const isLive = (account: AccountRow | null): account is AccountRow =>
  account !== null && account.isActive !== false && !(account.deactivatedAt instanceof Date) && !(account.deletedAt instanceof Date);

/** Vivant, et une adresse ou un numéro VÉRIFIÉ — seule une date prouve, tout le reste refuse. */
const canPublish = (account: AccountRow | null): boolean =>
  isLive(account) && (account.emailVerifiedAt instanceof Date || account.phoneVerifiedAt instanceof Date);

/** Le nom de boutique qu'un éditeur reçoit à sa création : l'auteur déclaré s'il est acceptable, sinon un nom neutre. */
const storeNameOf = (author: string): string => {
  const name = author.normalize('NFKC').trim();
  const acceptable = name.length > 0 && name.length <= PARTNER_PROFILE_LIMITS.maxDisplayNameLength && !INVISIBLE_OR_CONTROL.test(name) && !isReservedPublisherIdentity(name);
  return acceptable ? name : NEUTRAL_PUBLISHER_NAME;
};

/** Une adresse qu'un éditeur TIERS peut porter : ni l'adresse neutre, ni une adresse réservée. */
const isThirdPartySlug = (slug: string | null | undefined): slug is string =>
  typeof slug === 'string' && slug.length > 0 && slug !== NEUTRAL_SLUG && !isReservedPublisherIdentity(slug);

/** La base de l'adresse d'un éditeur TIERS : jamais une adresse réservée, même tirée d'un ancien nom. */
const slugBaseOf = (name: string): string => {
  const base = isReservedPublisherIdentity(name) ? NEUTRAL_SLUG : publisherSlugOf(name);
  return isReservedPublisherIdentity(base) ? NEUTRAL_SLUG : base;
};

/** Un nom écrit avant #16274, sans sa clé de lecture : il passe par `claimPublisherName` avant d'être servi. */
const lacksNameKey = (row: PublisherRow): boolean => row.displayName !== NEUTRAL_PUBLISHER_NAME && typeof row.nameKey !== 'string';

const WITHOUT_NAME_KEY = [{ nameKey: null }, { nameKey: { isSet: false } }];

class AuditUnavailableError extends Error {}

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

  isOfficial(userId: string): boolean {
    return this.official !== null && userId === this.official;
  }

  /**
   * Ce que la boutique sert d'un éditeur, ou `null` s'il n'est pas servable :
   * sans adresse, ou sous une adresse RÉSERVÉE portée par un compte qui n'est
   * pas l'officiel (un ancien compte officiel, une ligne d'avant la réserve).
   * Un ancien nom réservé est servi sous le nom neutre.
   */
  private servable(row: PublisherRow | null | undefined): PackPublisherRef | null {
    if (row === null || row === undefined) return null;
    if (this.isOfficial(row.userId)) return MEESHY_PUBLISHER;
    if (!isThirdPartySlug(row.slug)) return null;
    const name = isReservedPublisherIdentity(row.displayName) ? NEUTRAL_PUBLISHER_NAME : row.displayName;
    return { slug: row.slug, name, verified: row.verifiedAt !== null, official: false };
  }

  /** Publier : compte actif et vérifié, éditeur possédé, nom libre, identité « Meeshy » au seul compte officiel. */
  async authorizePublication(userId: string, claim: PublicationClaim): Promise<PublicationAuthorization> {
    const account = await this.prisma.user.findUnique({ where: { id: userId }, select: ACCOUNT_SELECT });
    if (!canPublish(account)) return { kind: 'refused', reason: 'account-unverified' };
    const official = this.isOfficial(userId);
    if (!official && impersonatesMeeshy(claim.author)) return { kind: 'refused', reason: 'reserved' };
    const adopted = official ? await this.officialRow(userId) : await this.adopt(userId, claim.author);
    if (adopted === 'name-taken') return { kind: 'refused', reason: 'name-taken' };
    if (adopted === null) return { kind: 'refused', reason: 'reserved' };
    if (claim.claimed === MEESHY_PUBLISHER_SLUG && !official) return { kind: 'refused', reason: 'not-owner' };
    if (claim.claimed !== null && claim.claimed !== adopted.slug) return { kind: 'refused', reason: 'not-owner' };
    return { kind: 'allowed', publisher: adopted };
  }

  /** L'éditeur servi pour chaque proposant — une LECTURE, jamais une écriture ; neutre pour qui n'en a pas, ou si la base est en défaut. */
  async servedFor(packs: readonly PublishedBy[]): Promise<ReadonlyMap<string, PackPublisherRef>> {
    const ids = [...new Set(packs.map((pack) => pack.submitterId))];
    if (ids.length === 0) return new Map();
    const rows = await this.rowsOf(ids);
    const byOwner = new Map<string, PublisherRow>();
    [...rows].sort(byAge).forEach((row) => {
      if (!byOwner.has(row.userId)) byOwner.set(row.userId, row);
    });
    return new Map(ids.map((id) => [id, this.isOfficial(id) ? MEESHY_PUBLISHER : (this.servable(byOwner.get(id)) ?? NEUTRAL_PUBLISHER)] as const));
  }

  /** Un éditeur par son adresse, pour la boutique : sans son propriétaire. L'adresse neutre ne désigne personne. */
  async bySlug(slug: string): Promise<PackPublisherRef | null> {
    if (slug === MEESHY_PUBLISHER_SLUG) return MEESHY_PUBLISHER;
    if (!isThirdPartySlug(slug)) return null;
    const rows: readonly PublisherRow[] = await this.prisma.partnerProfile.findMany({ where: { slug }, select: ROW_SELECT });
    return this.servable([...rows].sort(byAge)[0]);
  }

  /** L'éditeur du compte connecté, s'il en a un — une lecture. */
  async own(userId: string): Promise<PackPublisherRef | null> {
    if (this.isOfficial(userId)) return MEESHY_PUBLISHER;
    const rows = await this.rowsOf([userId]);
    if (rows.length === 0) return null;
    return this.servable([...rows].sort(byAge)[0]) ?? NEUTRAL_PUBLISHER;
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

  /**
   * Le RATTRAPAGE des propositions d'avant #16274 : l'éditeur de chaque
   * proposant VIVANT est créé (sous l'auteur déclaré, ou neutre si ce nom est
   * pris), ou reçoit son adresse s'il date d'avant les éditeurs. Un compte
   * supprimé, désactivé ou inconnu est sauté — jamais recréé. Rejouable.
   */
  async backfill(packs: readonly PublishedBy[]): Promise<BackfillSummary> {
    const authorOf = new Map<string, string>();
    packs.forEach((pack) => {
      if (!authorOf.has(pack.submitterId)) authorOf.set(pack.submitterId, pack.author);
    });
    const summary = { created: 0, addressed: 0, kept: 0, skipped: 0 };
    for (const [userId, author] of authorOf) {
      if (this.isOfficial(userId)) continue;
      const account = await this.prisma.user.findUnique({ where: { id: userId }, select: ACCOUNT_SELECT });
      if (!isLive(account)) {
        summary.skipped += 1;
        continue;
      }
      const before = await this.single(userId);
      if (this.servable(before) !== null) {
        summary.kept += 1;
        continue;
      }
      const adopted = await this.adopt(userId, author);
      if (adopted === 'name-taken') await this.adopt(userId, '');
      if (before === null) summary.created += 1;
      else summary.addressed += 1;
    }
    return summary;
  }

  /** Lie l'éditeur « Meeshy » au compte officiel configuré — appelé au démarrage, idempotent, journalisé. */
  async ensureOfficial(): Promise<EnsureOfficialOutcome> {
    if (this.official === null) return 'unconfigured';
    const account = await this.prisma.user.findUnique({ where: { id: this.official }, select: ACCOUNT_SELECT });
    if (account === null) return 'unknown-account';
    if (!isLive(account)) return 'inactive-account';
    try {
      return (await this.officialRow(this.official)) === null ? 'conflict' : 'linked';
    } catch (error) {
      if (error instanceof AuditUnavailableError) return 'audit-unavailable';
      throw error;
    }
  }

  /** Les profils de ces comptes ; une base en défaut rend une liste VIDE (la boutique dégrade au nom neutre). */
  private async rowsOf(userIds: readonly string[]): Promise<readonly PublisherRow[]> {
    try {
      return await this.prisma.partnerProfile.findMany({ where: { userId: { in: [...userIds] } }, select: ROW_SELECT });
    } catch {
      return [];
    }
  }

  /** L'éditeur d'un compte ; s'il en a plusieurs (base sans index, course), le plus ancien est gardé et les autres retirés. */
  private async single(userId: string): Promise<PublisherRow | null> {
    const rows: readonly PublisherRow[] = await this.prisma.partnerProfile.findMany({ where: { userId }, select: ROW_SELECT });
    const [kept, ...extras] = [...rows].sort(byAge);
    if (extras.length > 0) await this.prisma.partnerProfile.deleteMany({ where: { userId, id: { in: extras.map((row) => row.id) } } });
    return kept ?? null;
  }

  /** Une ligne d'audit, AVANT l'écriture qu'elle annonce : journal indisponible ⇒ rien ne change. */
  private async journal(userId: string, metadata: Readonly<Record<string, unknown>>): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: { adminId: userId, userId, action: OFFICIAL_LINK_ACTION, entity: 'PartnerProfile', entityId: userId, metadata: JSON.stringify(metadata) },
      });
    } catch {
      throw new AuditUnavailableError();
    }
  }

  /**
   * L'éditeur « Meeshy » du compte officiel, créé ou réadressé, après avoir
   * retiré l'adresse `meeshy` à tout autre détenteur. Chaque changement s'écrit
   * d'abord au journal ; déjà lié, rien ne s'écrit. `null` si la liaison n'a
   * pas tenu.
   */
  private async officialRow(userId: string): Promise<PackPublisherRef | null> {
    const holders: readonly PublisherRow[] = await this.prisma.partnerProfile.findMany({ where: { slug: MEESHY_PUBLISHER_SLUG, NOT: { userId } }, select: ROW_SELECT });
    const current = await this.single(userId);
    const linked = current !== null && current.slug === MEESHY_PUBLISHER_SLUG && current.displayName === MEESHY_PUBLISHER_NAME && current.verifiedAt !== null;
    if (holders.length === 0 && linked) return MEESHY_PUBLISHER;
    await this.journal(userId, {
      previousHolders: holders.map((holder) => holder.userId),
      previousSlug: current?.slug ?? null,
      previousDisplayName: current?.displayName ?? null,
    });
    for (const holder of holders) await this.allocateSlug(holder);
    const now = this.now();
    const data = { slug: MEESHY_PUBLISHER_SLUG, displayName: MEESHY_PUBLISHER_NAME, nameKey: null, verifiedAt: current?.verifiedAt ?? now, updatedAt: now };
    await this.prisma.partnerProfile.upsert({ where: { userId }, create: { userId, ...data, createdAt: now }, update: data });
    const settled = await this.single(userId);
    return settled !== null && settled.slug === MEESHY_PUBLISHER_SLUG ? MEESHY_PUBLISHER : null;
  }

  /**
   * L'éditeur d'un compte TIERS, servable : gardé s'il l'est déjà, créé s'il
   * n'existe pas (nommé par `author` si `claimPublisherName` l'accepte, neutre
   * s'il est réservé, refusé s'il est pris), complété sinon — un ancien profil
   * reçoit sa clé de nom, puis son adresse. La création est un `upsert` sur
   * `userId` : deux propositions simultanées ne créent pas deux éditeurs.
   */
  private async adopt(userId: string, author: string): Promise<PackPublisherRef | 'name-taken'> {
    const current = await this.single(userId);
    if (current !== null) {
      const named = lacksNameKey(current) ? await this.nameLegacy(current) : current;
      return this.servable(named) ?? this.allocateSlug(named);
    }
    const claim = await claimPublisherName(this.prisma, { userId, name: storeNameOf(author), official: false });
    if (claim.kind === 'name-taken') return 'name-taken';
    const { displayName, nameKey } = claim.kind === 'ok' ? claim : { displayName: NEUTRAL_PUBLISHER_NAME, nameKey: null };
    const now = this.now();
    try {
      await this.prisma.partnerProfile.upsert({ where: { userId }, create: { userId, displayName, nameKey, createdAt: now, updatedAt: now }, update: {} });
    } catch (error) {
      if (isNameKeyViolation(error)) return 'name-taken';
      if (!isUniqueViolation(error)) throw error;
    }
    const created = await this.single(userId);
    if (created === null) throw new Error('publisher vanished after creation');
    if (nameKey !== null && created.nameKey === nameKey && (await lostNameRace(this.prisma, nameKey, created))) {
      await this.prisma.partnerProfile.deleteMany({ where: { id: created.id, OR: [{ slug: null }, { slug: { isSet: false } }] } });
      return 'name-taken';
    }
    return this.servable(created) ?? this.allocateSlug(created);
  }

  /**
   * Un ancien profil (sans clé de nom) passe par `claimPublisherName` : nom
   * libre, il reçoit sa clé ; nom réservé ou déjà porté par un autre éditeur,
   * il est ramené au nom NEUTRE et perd la vérification qui portait sur ce nom.
   */
  private async nameLegacy(row: PublisherRow): Promise<PublisherRow> {
    const claim = await claimPublisherName(this.prisma, { userId: row.userId, name: row.displayName, official: this.isOfficial(row.userId) });
    const now = this.now();
    const neutral = { displayName: NEUTRAL_PUBLISHER_NAME, nameKey: null, verifiedAt: null, verifiedBy: null, updatedAt: now };
    try {
      await this.prisma.partnerProfile.updateMany({ where: { id: row.id }, data: claim.kind === 'ok' ? { nameKey: claim.nameKey, updatedAt: now } : neutral });
    } catch (error) {
      if (!isNameKeyViolation(error)) throw error;
      await this.prisma.partnerProfile.updateMany({ where: { id: row.id }, data: neutral });
    }
    const settled = await this.single(row.userId);
    if (settled === null) throw new Error('publisher vanished while naming it');
    if (typeof settled.nameKey === 'string' && (await lostNameRace(this.prisma, settled.nameKey, settled))) {
      await this.prisma.partnerProfile.updateMany({ where: { id: row.id }, data: neutral });
      return (await this.single(row.userId)) ?? settled;
    }
    return settled;
  }

  /**
   * Le RATTRAPAGE des clés de nom, à jouer AVANT la pose de l'index unique de
   * `nameKey` : chaque profil sans clé, du plus ancien au plus récent, passe
   * par `claimPublisherName`. Le plus ancien garde un nom en double ; les
   * suivants, comme un nom réservé, sont ramenés au nom neutre. Rejouable.
   */
  async backfillNameKeys(): Promise<NameKeyBackfillSummary> {
    const rows: readonly PublisherRow[] = await this.prisma.partnerProfile.findMany({ where: { OR: WITHOUT_NAME_KEY }, select: ROW_SELECT });
    const summary = { keyed: 0, neutralized: 0 };
    for (const row of [...rows].sort(byAge)) {
      if (this.isOfficial(row.userId) || !lacksNameKey(row)) continue;
      const named = await this.nameLegacy(row);
      if (named.displayName === NEUTRAL_PUBLISHER_NAME) summary.neutralized += 1;
      else summary.keyed += 1;
    }
    return summary;
  }

  /**
   * Pose une adresse libre sur ce profil, SANS supposer d'index unique :
   * l'adresse candidate est vérifiée libre avant l'écriture, puis relue après
   * — si un autre profil plus ancien l'a prise entre-temps, un suffixe est
   * tiré. Une adresse réservée remplacée emporte la vérification qu'elle
   * portait (celle d'`officialRow`) : fail-closed.
   */
  private async allocateSlug(row: PublisherRow): Promise<PackPublisherRef> {
    const base = slugBaseOf(row.displayName);
    const hadSlug = typeof row.slug === 'string' && row.slug.length > 0;
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const slug = attempt === 0 && base !== NEUTRAL_SLUG ? base : `${base}-${this.suffix()}`;
      const taken = await this.prisma.partnerProfile.findFirst({ where: { slug, NOT: { userId: row.userId } }, select: { id: true } });
      if (taken !== null) continue;
      const now = this.now();
      try {
        await this.prisma.partnerProfile.updateMany({ where: { id: row.id }, data: { slug, updatedAt: now, ...(hadSlug ? { verifiedAt: null, verifiedBy: null } : {}) } });
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }
      const holders: readonly PublisherRow[] = await this.prisma.partnerProfile.findMany({ where: { slug }, select: ROW_SELECT });
      if (holders.some((holder) => holder.userId !== row.userId && byAge(holder, row) < 0)) continue;
      const settled = this.servable(await this.single(row.userId));
      if (settled !== null) return settled;
    }
    throw new Error('no publisher address could be allocated');
  }
}

/** Les éditeurs de la passerelle : la base, et le compte officiel lu dans l'environnement. */
export const defaultPackPublishers = (prisma: PackPublishersDb): PackPublishers =>
  new PackPublishers({ prisma, officialAccountId: officialPublisherAccountFrom(process.env) });

/** Chaque pack projeté, avec l'éditeur de son proposant. */
export async function withPublishers<R extends PublishedBy, D>(
  publishers: PackPublishers,
  rows: readonly R[],
  project: (row: R) => D,
): Promise<readonly (D & { readonly publisher?: PackPublisherRef })[]> {
  const served = await publishers.servedFor(rows);
  return rows.map((row) => {
    const publisher = served.get(row.submitterId);
    return publisher === undefined ? project(row) : { ...project(row), publisher };
  });
}
