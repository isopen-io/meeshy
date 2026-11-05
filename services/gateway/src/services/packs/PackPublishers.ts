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
 *    son nom d'utilisateur. L'auteur déclaré, texte libre, est soumis à la
 *    réserve (`isReservedPublisherIdentity`) et à l'unicité des noms
 *    (`publisherNameKey`) pour tout autre compte que l'officiel. Tout se
 *    VÉRIFIE d'abord sans écrire (`vetPublication`) ; l'éditeur ne se crée
 *    qu'au moment où le pack s'écrit (`commit`), une fois tous les contrôles
 *    de la proposition passés ;
 *  - **un profil existant n'est JAMAIS renommé ni dévérifié** par la
 *    publication ou le rattrapage : un ancien nom en double ou qui se lit comme
 *    Meeshy est marqué « à arbitrer » (`nameDisputedAt`), un admin tranche ;
 *  - **servir** (`servedFor`) est une LECTURE : jamais une écriture. L'auteur
 *    servi aux anciens clients est le nom de l'éditeur (`servedAuthor`). Un
 *    proposant sans éditeur (proposition d'avant #16274, compte purgé) est servi
 *    sous `NEUTRAL_PUBLISHER`, et une base en défaut dégrade au même nom neutre
 *    plutôt que de casser le catalogue. Le rattrapage (`backfill`) crée les
 *    éditeurs manquants ;
 *  - **l'unicité** (un éditeur par compte, une adresse, un nom) ne suppose pas
 *    les index uniques que pose la migration du 2026-11-05 pour rester CORRECT
 *    (doublons d'un compte résorbés, adresse et nom relus après écriture), mais
 *    seul l'index FERME les courses — un `upsert` sans index n'est pas atomique
 *    dans MongoDB ; l'index se pose donc sur le staging avant la fusion ;
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
  publisherNameKey,
  publisherSlugOf,
  type PackPublisherRef,
} from '@meeshy/shared/types/pack-publisher';
import { PARTNER_PROFILE_LIMITS } from '@meeshy/shared/types/lens-partner';
import { isUniqueViolation } from './PackCatalog';
import { NEUTRAL_PUBLISHER_NAME, byAge, byPrecedence, claimPublisherName, isNameKeyViolation, lostNameRace } from './PublisherNames';

export { NEUTRAL_PUBLISHER_NAME } from './PublisherNames';

export type PackPublishersDb = Pick<PrismaClient, 'partnerProfile' | 'user' | 'adminAuditLog'>;

export type PublicationRefusal = 'account-unverified' | 'not-owner' | 'reserved' | 'name-taken' | 'retry-later';

export type PublicationAuthorization =
  | { readonly kind: 'allowed'; readonly publisher: PackPublisherRef }
  | { readonly kind: 'refused'; readonly reason: PublicationRefusal };

/**
 * Une proposition VÉRIFIÉE sans rien écrire : `commit` crée ou complète
 * l'éditeur, à appeler juste avant d'écrire le pack, une fois tous les autres
 * contrôles passés — un refus d'adresse ou d'image ne réserve aucun nom.
 */
export type PublicationVetting =
  | { readonly kind: 'vetted'; readonly commit: () => Promise<PublicationAuthorization> }
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

/** Ce que le rattrapage fait (ou ferait, en `dryRun`) d'un proposant. */
export type BackfillEntry = { readonly userId: string; readonly outcome: 'created' | 'addressed' | 'kept' | 'skipped' | 'deferred'; readonly name: string | null };

/** Ce que le rattrapage a fait : éditeurs créés, adresses posées sur un ancien profil, éditeurs déjà complets, comptes sautés, reportés. */
export type BackfillSummary = {
  readonly created: number;
  readonly addressed: number;
  readonly kept: number;
  readonly skipped: number;
  readonly deferred: number;
  readonly entries: readonly BackfillEntry[];
};

/** Ce que le rattrapage des clés fait (ou ferait) d'un ancien profil : clé posée, ou nom gardé SANS clé, à arbitrer. */
export type NameKeyEntry = {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly verified: boolean;
  readonly outcome: 'keyed' | 'disputed';
  /** Pour un profil à arbitrer : `reserved` (se lit comme Meeshy) ou `name-taken` (un homonyme le précède). */
  readonly reason?: 'reserved' | 'name-taken';
  /** Le profil qui garde la clé de ce nom, pour un homonyme à arbitrer. */
  readonly heldBy?: string;
};

/** Ce que le rattrapage des clés de nom a fait : clés posées, profils à arbitrer — aucun nom réécrit, aucune vérification retirée. */
export type NameKeyBackfillSummary = { readonly keyed: number; readonly disputed: number; readonly entries: readonly NameKeyEntry[] };

export type BackfillOptions = { readonly dryRun?: boolean };

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

const ROW_SELECT = { id: true, userId: true, slug: true, displayName: true, nameKey: true, nameDisputedAt: true, verifiedAt: true, createdAt: true } as const;

type PublisherRow = {
  readonly id: string;
  readonly userId: string;
  readonly slug: string | null;
  readonly displayName: string;
  readonly nameKey: string | null;
  readonly nameDisputedAt?: Date | null;
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

/** Un nom écrit avant #16274, sans sa clé de lecture et pas encore à arbitrer : il passe par `claimPublisherName`. */
const lacksNameKey = (row: PublisherRow): boolean =>
  row.displayName !== NEUTRAL_PUBLISHER_NAME && typeof row.nameKey !== 'string' && !(row.nameDisputedAt instanceof Date);

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
   * Un ancien nom qui se lit comme Meeshy est SERVI sous le nom neutre, sans
   * jamais être réécrit ; tout autre ancien nom est un droit acquis.
   */
  private servable(row: PublisherRow | null | undefined): PackPublisherRef | null {
    if (row === null || row === undefined) return null;
    if (this.isOfficial(row.userId)) return MEESHY_PUBLISHER;
    if (!isThirdPartySlug(row.slug)) return null;
    const name = impersonatesMeeshy(row.displayName) ? NEUTRAL_PUBLISHER_NAME : row.displayName;
    return { slug: row.slug, name, verified: row.verifiedAt !== null, official: false };
  }

  /** Publier : vérifier sans écrire, puis créer l'éditeur — pour qui n'a aucun autre contrôle entre les deux. */
  async authorizePublication(userId: string, claim: PublicationClaim): Promise<PublicationAuthorization> {
    const vetting = await this.vetPublication(userId, claim);
    return vetting.kind === 'refused' ? vetting : vetting.commit();
  }

  /**
   * Vérifie une proposition SANS RIEN ÉCRIRE : compte actif et vérifié, auteur
   * hors réserve et hors du nom d'un autre éditeur, éditeur nommé possédé.
   * Identité « Meeshy » au seul compte officiel.
   */
  async vetPublication(userId: string, claim: PublicationClaim): Promise<PublicationVetting> {
    const account = await this.prisma.user.findUnique({ where: { id: userId }, select: ACCOUNT_SELECT });
    if (!canPublish(account)) return { kind: 'refused', reason: 'account-unverified' };
    if (this.isOfficial(userId)) return { kind: 'vetted', commit: () => this.commitOfficial(userId, claim) };
    if (isReservedPublisherIdentity(claim.author)) return { kind: 'refused', reason: 'reserved' };
    if (claim.claimed === MEESHY_PUBLISHER_SLUG) return { kind: 'refused', reason: 'not-owner' };
    const current = await this.firstRow(userId);
    if (current !== null && claim.claimed !== null && typeof current.slug === 'string' && current.slug !== claim.claimed) return { kind: 'refused', reason: 'not-owner' };
    const conflict = await this.authorConflict(userId, claim.author, current);
    if (conflict !== null) return { kind: 'refused', reason: conflict };
    return { kind: 'vetted', commit: () => this.commitThirdParty(userId, claim) };
  }

  /** L'auteur déclaré nomme-t-il un AUTRE éditeur ? `null` : non. Un doute du balayage : réessayer plus tard. */
  private async authorConflict(userId: string, author: string, current: PublisherRow | null): Promise<'name-taken' | 'retry-later' | null> {
    const name = storeNameOf(author);
    if (name === NEUTRAL_PUBLISHER_NAME) return null;
    if (current !== null && current.nameKey === publisherNameKey(name)) return null;
    const claim = await claimPublisherName(this.prisma, { userId, name, official: false });
    if (claim.kind === 'name-taken') return 'name-taken';
    return claim.kind === 'inconclusive' ? 'retry-later' : null;
  }

  private async commitOfficial(userId: string, claim: PublicationClaim): Promise<PublicationAuthorization> {
    const adopted = await this.officialRow(userId);
    if (adopted === null) return { kind: 'refused', reason: 'reserved' };
    if (claim.claimed !== null && claim.claimed !== adopted.slug) return { kind: 'refused', reason: 'not-owner' };
    return { kind: 'allowed', publisher: adopted };
  }

  private async commitThirdParty(userId: string, claim: PublicationClaim): Promise<PublicationAuthorization> {
    const adopted = await this.adopt(userId, claim.author);
    if (adopted === 'name-taken' || adopted === 'retry-later') return { kind: 'refused', reason: adopted };
    if (claim.claimed !== null && claim.claimed !== adopted.slug) return { kind: 'refused', reason: 'not-owner' };
    return { kind: 'allowed', publisher: adopted };
  }

  /** L'éditeur servi pour chaque proposant — une LECTURE, jamais une écriture ; neutre pour qui n'en a pas, ou si la base est en défaut. */
  async servedFor(packs: readonly PublishedBy[]): Promise<ReadonlyMap<string, PackPublisherRef>> {
    const ids = [...new Set(packs.map((pack) => pack.submitterId))];
    if (ids.length === 0) return new Map();
    const rows = await this.rowsOf(ids);
    const byOwner = new Map<string, PublisherRow>();
    [...rows].sort(byPrecedence).forEach((row) => {
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
    return this.servable([...rows].sort(byPrecedence)[0]) ?? NEUTRAL_PUBLISHER;
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
   * réservé ou pris), ou reçoit son adresse s'il date d'avant les éditeurs. Un
   * compte supprimé, désactivé ou inconnu est sauté — jamais recréé. Un doute
   * du balayage des noms reporte le proposant. Rejouable ; `dryRun` liste ce
   * qu'il ferait sans rien écrire.
   */
  async backfill(packs: readonly PublishedBy[], options: BackfillOptions = {}): Promise<BackfillSummary> {
    const authorOf = new Map<string, string>();
    packs.forEach((pack) => {
      if (!authorOf.has(pack.submitterId)) authorOf.set(pack.submitterId, pack.author);
    });
    const entries: BackfillEntry[] = [];
    for (const [userId, author] of authorOf) {
      if (this.isOfficial(userId)) continue;
      entries.push(await this.backfillOne(userId, author, options.dryRun === true));
    }
    const count = (outcome: BackfillEntry['outcome']) => entries.filter((entry) => entry.outcome === outcome).length;
    return { created: count('created'), addressed: count('addressed'), kept: count('kept'), skipped: count('skipped'), deferred: count('deferred'), entries };
  }

  private async backfillOne(userId: string, author: string, dryRun: boolean): Promise<BackfillEntry> {
    const account = await this.prisma.user.findUnique({ where: { id: userId }, select: ACCOUNT_SELECT });
    if (!isLive(account)) return { userId, outcome: 'skipped', name: null };
    const before = dryRun ? await this.firstRow(userId) : await this.single(userId);
    if (this.servable(before) !== null) return { userId, outcome: 'kept', name: before?.displayName ?? null };
    const outcome = before === null ? 'created' : 'addressed';
    if (dryRun) {
      if (before !== null) return { userId, outcome, name: before.displayName };
      const claim = await claimPublisherName(this.prisma, { userId, name: storeNameOf(author), official: false });
      if (claim.kind === 'inconclusive') return { userId, outcome: 'deferred', name: null };
      return { userId, outcome, name: claim.kind === 'ok' ? claim.displayName : NEUTRAL_PUBLISHER_NAME };
    }
    const first = await this.adopt(userId, author);
    const adopted = first === 'name-taken' ? await this.adopt(userId, '') : first;
    if (adopted === 'retry-later' || adopted === 'name-taken') return { userId, outcome: 'deferred', name: null };
    return { userId, outcome, name: adopted.name };
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

  /** L'éditeur d'un compte, en LECTURE seule : le premier par préséance (vérifié, puis plus ancien). */
  private async firstRow(userId: string): Promise<PublisherRow | null> {
    const rows: readonly PublisherRow[] = await this.prisma.partnerProfile.findMany({ where: { userId }, select: ROW_SELECT });
    return [...rows].sort(byPrecedence)[0] ?? null;
  }

  /** L'éditeur d'un compte ; s'il en a plusieurs (base sans index, course), le premier par préséance est gardé et les autres retirés. */
  private async single(userId: string): Promise<PublisherRow | null> {
    const rows: readonly PublisherRow[] = await this.prisma.partnerProfile.findMany({ where: { userId }, select: ROW_SELECT });
    const [kept, ...extras] = [...rows].sort(byPrecedence);
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
    for (const holder of holders) await this.allocateSlug(holder, { demoted: true });
    const now = this.now();
    const data = { slug: MEESHY_PUBLISHER_SLUG, displayName: MEESHY_PUBLISHER_NAME, nameKey: null, verifiedAt: current?.verifiedAt ?? now, updatedAt: now };
    await this.prisma.partnerProfile.upsert({ where: { userId }, create: { userId, ...data, createdAt: now }, update: data });
    const settled = await this.single(userId);
    return settled !== null && settled.slug === MEESHY_PUBLISHER_SLUG ? MEESHY_PUBLISHER : null;
  }

  /**
   * L'éditeur d'un compte TIERS, servable : gardé s'il l'est déjà, créé s'il
   * n'existe pas (nommé par `author` si `claimPublisherName` l'accepte, neutre
   * s'il est réservé, refusé s'il est pris, reporté sur un doute), complété
   * sinon — un ancien profil reçoit sa clé de nom (ou est marqué à arbitrer),
   * puis son adresse. Un profil existant n'est jamais renommé ni dévérifié.
   */
  private async adopt(userId: string, author: string): Promise<PackPublisherRef | 'name-taken' | 'retry-later'> {
    const current = await this.single(userId);
    if (current !== null) {
      const named = lacksNameKey(current) ? await this.nameLegacy(current) : current;
      return this.servable(named) ?? this.allocateSlug(named, { demoted: false });
    }
    const claim = await claimPublisherName(this.prisma, { userId, name: storeNameOf(author), official: false });
    if (claim.kind === 'name-taken') return 'name-taken';
    if (claim.kind === 'inconclusive') return 'retry-later';
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
    return this.servable(created) ?? this.allocateSlug(created, { demoted: false });
  }

  /**
   * Un ancien profil (sans clé de nom) passe par `claimPublisherName` : nom
   * libre, il reçoit sa clé ; nom qui se lit comme Meeshy, ou qu'un homonyme
   * PRÉCÈDE (vérifié, puis plus ancien), il GARDE son nom et sa vérification,
   * sans clé, marqué à arbitrer. Un balayage inconcluant ne touche à rien.
   */
  private async nameLegacy(row: PublisherRow): Promise<PublisherRow> {
    if (this.isOfficial(row.userId)) return row;
    const claim = await claimPublisherName(this.prisma, { userId: row.userId, name: row.displayName, official: false, legacyClaimant: row });
    if (claim.kind === 'inconclusive') return row;
    if (claim.kind !== 'ok' || claim.nameKey === null) return this.markDisputed(row);
    return this.keyLegacy(row, claim.nameKey);
  }

  /** Pose la clé d'un ancien profil ; un index qui refuse, ou un homonyme qui le précède, le marque à arbitrer. */
  private async keyLegacy(row: PublisherRow, nameKey: string): Promise<PublisherRow> {
    try {
      await this.prisma.partnerProfile.updateMany({ where: { id: row.id, OR: WITHOUT_NAME_KEY }, data: { nameKey, updatedAt: this.now() } });
    } catch (error) {
      if (!isNameKeyViolation(error)) throw error;
      return this.markDisputed(row);
    }
    const settled = await this.single(row.userId);
    if (settled === null) throw new Error('publisher vanished while naming it');
    if (settled.nameKey === nameKey && (await lostNameRace(this.prisma, nameKey, settled))) return this.markDisputed(settled);
    return settled;
  }

  /** « À arbitrer » : le profil garde son nom et sa vérification, sans clé ; seul un admin le renommera. */
  private async markDisputed(row: PublisherRow): Promise<PublisherRow> {
    const now = this.now();
    await this.prisma.partnerProfile.updateMany({ where: { id: row.id }, data: { nameKey: null, nameDisputedAt: now, updatedAt: now } });
    return (await this.single(row.userId)) ?? row;
  }

  /**
   * Le RATTRAPAGE des clés de nom, à jouer AVANT la pose de l'index unique de
   * `nameKey`. Le plan se calcule EN MÉMOIRE sur tous les profils (aucune borne
   * de balayage) : par nom, la clé va au détenteur qui en a déjà une, sinon au
   * profil vérifié, puis au plus ancien ; les autres, et tout nom qui se lit
   * comme Meeshy, gardent leur nom sans clé, à arbitrer. Aucun nom réécrit,
   * aucune vérification retirée. Rejouable ; `dryRun` rend le plan sans écrire.
   */
  async backfillNameKeys(options: BackfillOptions = {}): Promise<NameKeyBackfillSummary> {
    const keyed: readonly PublisherRow[] = await this.prisma.partnerProfile.findMany({ where: { nameKey: { not: null } }, select: ROW_SELECT });
    const unkeyed: readonly PublisherRow[] = await this.prisma.partnerProfile.findMany({ where: { OR: WITHOUT_NAME_KEY }, select: ROW_SELECT });
    const holders = new Map(keyed.filter((row) => typeof row.nameKey === 'string').map((row) => [row.nameKey as string, row] as const));
    const planned: NameKeyEntry[] = [];
    for (const row of [...unkeyed].sort(byPrecedence)) {
      if (this.isOfficial(row.userId) || !lacksNameKey(row)) continue;
      const base = { id: row.id, userId: row.userId, displayName: row.displayName, verified: row.verifiedAt !== null };
      if (impersonatesMeeshy(row.displayName)) {
        planned.push({ ...base, outcome: 'disputed', reason: 'reserved' });
        continue;
      }
      const nameKey = publisherNameKey(row.displayName);
      const holder = holders.get(nameKey);
      if (holder !== undefined && holder.userId !== row.userId) {
        planned.push({ ...base, outcome: 'disputed', reason: 'name-taken', heldBy: holder.id });
        continue;
      }
      holders.set(nameKey, row);
      planned.push({ ...base, outcome: 'keyed' });
    }
    const entries = options.dryRun === true ? planned : await this.applyNameKeys(planned, unkeyed);
    return { keyed: entries.filter((entry) => entry.outcome === 'keyed').length, disputed: entries.filter((entry) => entry.outcome === 'disputed').length, entries };
  }

  private async applyNameKeys(planned: readonly NameKeyEntry[], rows: readonly PublisherRow[]): Promise<readonly NameKeyEntry[]> {
    const byId = new Map(rows.map((row) => [row.id, row] as const));
    const applied: NameKeyEntry[] = [];
    for (const entry of planned) {
      const row = byId.get(entry.id) as PublisherRow;
      if (entry.outcome === 'disputed') {
        await this.markDisputed(row);
        applied.push(entry);
        continue;
      }
      const settled = await this.keyLegacy(row, publisherNameKey(row.displayName));
      applied.push(typeof settled.nameKey === 'string' ? entry : { ...entry, outcome: 'disputed', reason: 'name-taken' });
    }
    return applied;
  }

  /**
   * Pose une adresse libre sur ce profil, SANS supposer d'index unique :
   * l'adresse candidate est vérifiée libre avant l'écriture, puis relue après
   * — si un autre profil plus ancien l'a prise entre-temps, un suffixe est
   * tiré. `demoted` : l'ancien détenteur de l'adresse `meeshy` qu'`officialRow`
   * réadresse perd la vérification qu'elle portait (journalisé) ; aucun autre
   * chemin ne retire une vérification.
   */
  private async allocateSlug(row: PublisherRow, { demoted }: { readonly demoted: boolean }): Promise<PackPublisherRef> {
    const base = slugBaseOf(row.displayName);
    const hadSlug = demoted && typeof row.slug === 'string' && row.slug.length > 0;
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

/**
 * L'auteur SERVI aux anciens clients, qui n'affichent que lui : le nom de
 * l'éditeur dès qu'un éditeur réel porte le pack, jamais le texte libre. Sans
 * éditeur réel (proposition d'avant les éditeurs), le texte libre, sauf s'il
 * est réservé.
 */
export const servedAuthor = (author: string, publisher: PackPublisherRef | undefined): string => {
  if (publisher === undefined) return author;
  if (publisher.slug !== NEUTRAL_SLUG) return publisher.name;
  return isReservedPublisherIdentity(author) ? NEUTRAL_PUBLISHER_NAME : author;
};

/** Chaque pack projeté, avec l'éditeur de son proposant — et l'auteur servi qui en découle. */
export async function withPublishers<R extends PublishedBy, D>(
  publishers: PackPublishers,
  rows: readonly R[],
  project: (row: R) => D,
): Promise<readonly (D & { readonly publisher?: PackPublisherRef })[]> {
  const served = await publishers.servedFor(rows);
  return rows.map((row) => {
    const publisher = served.get(row.submitterId);
    const projected = project(row);
    if (publisher === undefined) return projected;
    const author = typeof (projected as { author?: unknown }).author === 'string' ? { author: servedAuthor((projected as { author: string }).author, publisher) } : {};
    return { ...projected, ...author, publisher };
  });
}
