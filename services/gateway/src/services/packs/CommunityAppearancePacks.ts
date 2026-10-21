/**
 * Les packs d'APPARENCE des vendeurs tiers (#10709, spec § 12) : fonds de
 * conversation, contours d'avatar et bannières de profil proposés par la
 * communauté, par le circuit des propositions des stickers (#9141) étendu à
 * trois domaines. Origine `community` du moteur des packs.
 *
 * - **proposer** — un manifeste de DONNÉES, validé par le même Zod que les packs
 *   officiels (`validateCommunityAppearanceManifest`) ; ce qui est conservé est la
 *   copie RE-SÉRIALISÉE de ce que le schéma a lu, adressée par son empreinte.
 *   Le pack naît `pending` : rien n'est servi, ni installable, avant la modération ;
 * - **modérer** — `approved` publie, `rejected` renvoie à l'auteur avec un mot.
 *   Le PRIX est fixé par le modérateur à la publication, jamais proposé par le
 *   vendeur (aucun reversement n'existe encore : spec § 12) ; la possession et
 *   l'achat suivent la loi des packs officiels (`PackCatalog`).
 */
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  COMMUNITY_APPEARANCE_LIMITS,
  validateCommunityAppearanceManifest,
  type CommunityAppearanceDomain,
  type CommunityAppearanceProblem,
} from '@meeshy/shared/types/community-appearance-pack';
import { APPEARANCE_CONTRACT_SCHEMA } from '@meeshy/shared/types/appearance-design';
import { PACK_LIMITS, PACK_PRICE_MAX, isPackOwned, isReservedPackSlug, type PackRegistries, type PackStatus } from '@meeshy/shared/types/content-pack';
import { isUniqueViolation, type CommunityPackStore, type PackViewer } from './PackCatalog';
import type { PackIndex } from './PackIndex';
import type { AppearancePackDetail } from './appearancePackSpec';

export type CommunityAppearanceRow = {
  readonly id: string;
  readonly domain: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly submitterId: string;
  readonly status: string;
  readonly reviewNote: string | null;
  readonly price: number | null;
  readonly installCount: number;
  readonly contractSha256: string;
  readonly contractSrc: string;
  readonly contractBytes: number;
  readonly itemKeys: readonly string[];
};

/**
 * Les colonnes d'une PROJECTION — tout sauf `contractJson` (jusqu'à 256 Ko) : lister,
 * détailler, installer et acheter n'en ont jamais besoin. Seuls le magasin
 * (`approvedContract`) et la lecture de modération (`contract`) le chargent.
 */
const ROW_SELECT = {
  id: true, domain: true, slug: true, name: true, description: true, author: true, submitterId: true, status: true,
  reviewNote: true, price: true, installCount: true, contractSha256: true, contractSrc: true, contractBytes: true, itemKeys: true,
} as const;

export type CommunityAppearanceDetail = AppearancePackDetail & { readonly reviewNote?: string | null };

/** La projection d'un pack communautaire. Le mot du modérateur n'est servi qu'à son auteur et aux modérateurs. */
export function communityAppearanceDetail(row: CommunityAppearanceRow, installed: boolean, ownedKeys: ReadonlySet<string> | undefined, viewer?: PackViewer): CommunityAppearanceDetail {
  const domain = row.domain as CommunityAppearanceDomain;
  const price = row.price ?? null;
  const ownView = viewer !== undefined && (viewer.userId === row.submitterId || viewer.canModerate);
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    author: row.author,
    builtin: false,
    status: row.status as PackStatus,
    itemCount: row.itemKeys.length,
    coverUrl: null,
    installed,
    installCount: row.installCount,
    domain,
    origin: 'community',
    version: 1,
    downloadBytes: { story: row.contractBytes, square: null },
    removable: true,
    names: {},
    price,
    owned: isPackOwned({ domain, slug: row.slug, price }, ownedKeys ?? new Set()),
    preview: null,
    ...(domain === 'avatar-ring' ? { usage: { kind: 'free', surfaces: ['avatar'] } as const } : {}),
    contractSchema: APPEARANCE_CONTRACT_SCHEMA,
    contract: { src: row.contractSrc, bytes: row.contractBytes, sha256: row.contractSha256 },
    strings: {},
    ...(ownView ? { reviewNote: row.reviewNote } : {}),
  };
}

export const isCommunityAppearanceVisible = (row: Pick<CommunityAppearanceRow, 'status' | 'submitterId'>, viewer: PackViewer): boolean =>
  row.status === 'approved' || row.submitterId === viewer.userId || viewer.canModerate;

/** Le magasin communautaire d'un domaine d'apparence : ses packs publiés, du plus installé au moins installé. */
export function prismaCommunityAppearanceStore(prisma: PrismaClient, domain: CommunityAppearanceDomain): CommunityPackStore<AppearancePackDetail> {
  return {
    priced: true,
    async catalogue(installedOf, ownedKeys) {
      const rows = await prisma.communityAppearancePack.findMany({ where: { domain, status: 'approved' }, orderBy: { installCount: 'desc' }, select: ROW_SELECT });
      return rows.map((row) => communityAppearanceDetail(row, installedOf(row.slug), ownedKeys));
    },
    async installed(slugs, ownedKeys) {
      const rows = await prisma.communityAppearancePack.findMany({ where: { domain, slug: { in: [...slugs] }, status: 'approved' }, select: ROW_SELECT });
      const order = new Map(slugs.map((slug, index) => [slug, index]));
      return [...rows].sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0)).map((row) => communityAppearanceDetail(row, true, ownedKeys));
    },
    async detail(slug, viewer, installedOf, ownedKeys) {
      const row = await prisma.communityAppearancePack.findUnique({ where: { domain_slug: { domain, slug } }, select: ROW_SELECT });
      if (row === null || !isCommunityAppearanceVisible(row, viewer)) return null;
      return communityAppearanceDetail(row, installedOf(slug), ownedKeys, viewer);
    },
    async installable(slug) {
      const row = await prisma.communityAppearancePack.findUnique({ where: { domain_slug: { domain, slug } }, select: ROW_SELECT });
      if (row === null || row.status !== 'approved') return null;
      return {
        id: row.id,
        installCount: row.installCount,
        ...(row.price === null ? {} : { price: row.price }),
        version: 1,
        project: (installed, installCount, owned = true) => communityAppearanceDetail({ ...row, installCount }, installed, owned ? new Set([`${domain}.${slug}`]) : new Set()),
      };
    },
    async addInstalls(id, delta) {
      const row = await prisma.communityAppearancePack.update({ where: { id }, data: { installCount: { increment: delta } }, select: { installCount: true } });
      return row.installCount;
    },
  };
}

export type SubmitCommunityAppearanceOutcome =
  | { readonly kind: 'submitted'; readonly pack: CommunityAppearanceDetail }
  | { readonly kind: 'invalid'; readonly problems: readonly CommunityAppearanceProblem[] }
  | { readonly kind: 'slug-taken' }
  | { readonly kind: 'too-many-pending' };

export type CommunityReview = { readonly decision: 'approve' | 'reject'; readonly note: string | null; readonly price: number | null };

/**
 * `self-review` : un modérateur ne tranche pas sa PROPRE proposition — il fixerait
 * lui-même le prix d'un pack dont il est l'auteur (et, demain, le reversement : #10724).
 */
export type ReviewCommunityAppearanceOutcome =
  | { readonly kind: 'reviewed'; readonly pack: CommunityAppearanceDetail }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'self-review' };

/** Le contrat d'un pack, pour qui peut le voir : les OCTETS mêmes que le magasin servira après publication (relus par le schéma à la proposition). */
export type CommunityAppearanceContract = { readonly contractSchema: number; readonly contractJson: string; readonly sha256: string };

export type CommunityAppearancePacksDeps = {
  readonly prisma: PrismaClient;
  readonly index: PackIndex;
  readonly now?: () => Date;
};

export class CommunityAppearancePacks {
  private readonly prisma: PrismaClient;
  private readonly index: PackIndex;
  private readonly now: () => Date;

  constructor(deps: CommunityAppearancePacksDeps) {
    this.prisma = deps.prisma;
    this.index = deps.index;
    this.now = deps.now ?? (() => new Date());
  }

  async submit(userId: string, domain: CommunityAppearanceDomain, input: unknown): Promise<SubmitCommunityAppearanceOutcome> {
    const validation = validateCommunityAppearanceManifest(domain, input);
    if ('problems' in validation) return { kind: 'invalid', problems: validation.problems };
    const { manifest } = validation;
    const registries: PackRegistries = { [domain]: this.index.entries(domain).map((entry) => ({ slug: entry.slug, installedByDefault: entry.installedByDefault })) };
    if (isReservedPackSlug(domain, manifest.slug, registries)) return { kind: 'slug-taken' };

    const existing = await this.prisma.communityAppearancePack.findUnique({ where: { domain_slug: { domain, slug: manifest.slug } }, select: { id: true, submitterId: true, status: true } });
    const replacing = existing !== null && existing.submitterId === userId && existing.status === 'rejected';
    if (existing !== null && !replacing) return { kind: 'slug-taken' };
    const pending = await this.prisma.communityAppearancePack.count({ where: { submitterId: userId, status: 'pending' } });
    if (pending >= COMMUNITY_APPEARANCE_LIMITS.maxPendingPerAuthor) return { kind: 'too-many-pending' };

    const sha256 = createHash('sha256').update(manifest.contractJson, 'utf8').digest('hex');
    try {
      if (existing !== null) await this.prisma.communityAppearancePack.delete({ where: { id: existing.id } });
      const row = await this.prisma.communityAppearancePack.create({
        data: {
          domain,
          slug: manifest.slug,
          name: manifest.name,
          description: manifest.description,
          author: manifest.author,
          submitterId: userId,
          status: 'pending',
          contractJson: manifest.contractJson,
          contractSha256: sha256,
          contractSrc: `${sha256.slice(0, 16)}.json`,
          contractBytes: new TextEncoder().encode(manifest.contractJson).length,
          itemKeys: [...manifest.itemKeys],
          createdAt: this.now(),
        },
        select: ROW_SELECT,
      });
      return { kind: 'submitted', pack: communityAppearanceDetail(row, false, undefined, { userId, canModerate: false }) };
    } catch (error) {
      if (isUniqueViolation(error)) return { kind: 'slug-taken' };
      throw error;
    }
  }

  /** Les propositions d'un auteur dans ce domaine, les plus récentes d'abord — avec le mot du modérateur. */
  async submissions(userId: string, domain: CommunityAppearanceDomain): Promise<readonly CommunityAppearanceDetail[]> {
    const rows = await this.prisma.communityAppearancePack.findMany({ where: { domain, submitterId: userId }, orderBy: { createdAt: 'desc' }, select: ROW_SELECT });
    return rows.map((row) => communityAppearanceDetail(row, false, undefined, { userId, canModerate: false }));
  }

  /** La file de modération du domaine, la plus ancienne proposition d'abord. */
  async pending(moderatorId: string, domain: CommunityAppearanceDomain): Promise<readonly CommunityAppearanceDetail[]> {
    const rows = await this.prisma.communityAppearancePack.findMany({ where: { domain, status: 'pending' }, orderBy: { createdAt: 'asc' }, select: ROW_SELECT });
    return rows.map((row) => communityAppearanceDetail(row, false, undefined, { userId: moderatorId, canModerate: true }));
  }

  /**
   * Publie ou refuse un pack EN ATTENTE. Le passage est conditionnel : deux modérateurs
   * ne se marchent pas dessus, et l'auteur (immuable) relu fait partie de la condition.
   */
  async review(moderatorId: string, domain: CommunityAppearanceDomain, slug: string, review: CommunityReview): Promise<ReviewCommunityAppearanceOutcome> {
    const current = await this.prisma.communityAppearancePack.findUnique({ where: { domain_slug: { domain, slug } }, select: { submitterId: true, status: true } });
    if (current === null || current.status !== 'pending') return { kind: 'not-found' };
    if (current.submitterId === moderatorId) return { kind: 'self-review' };
    const approve = review.decision === 'approve';
    const price = approve && review.price !== null && Number.isInteger(review.price) && review.price >= 1 && review.price <= PACK_PRICE_MAX ? review.price : null;
    const flipped = await this.prisma.communityAppearancePack.updateMany({
      where: { domain, slug, status: 'pending', submitterId: current.submitterId },
      data: {
        status: approve ? 'approved' : 'rejected',
        reviewNote: review.note?.trim().slice(0, PACK_LIMITS.maxReviewNoteLength) || null,
        reviewerId: moderatorId,
        reviewedAt: this.now(),
        price,
      },
    });
    if (flipped.count === 0) return { kind: 'not-found' };
    const row = await this.prisma.communityAppearancePack.findUnique({ where: { domain_slug: { domain, slug } }, select: ROW_SELECT });
    return row === null ? { kind: 'not-found' } : { kind: 'reviewed', pack: communityAppearanceDetail(row, false, undefined, { userId: moderatorId, canModerate: true }) };
  }

  /**
   * Le contrat d'un pack communautaire pour un lecteur qui peut le VOIR : publié pour
   * tous, en attente ou refusé pour son auteur et les modérateurs — sans quoi la
   * modération publierait à l'aveugle, le magasin ne servant que les packs publiés.
   */
  async contract(domain: CommunityAppearanceDomain, slug: string, viewer: PackViewer): Promise<CommunityAppearanceContract | null> {
    const row = await this.prisma.communityAppearancePack.findUnique({ where: { domain_slug: { domain, slug } }, select: { status: true, submitterId: true, contractJson: true, contractSha256: true } });
    if (row === null || !isCommunityAppearanceVisible(row, viewer)) return null;
    return { contractSchema: APPEARANCE_CONTRACT_SCHEMA, contractJson: row.contractJson, sha256: row.contractSha256 };
  }

  /** Le contrat d'un pack PUBLIÉ, par son adresse `<sha16>.json` — la porte du magasin des packs pour les contrats tiers. */
  async approvedContract(src: string): Promise<string | null> {
    const row = await this.prisma.communityAppearancePack.findFirst({ where: { contractSrc: src, status: 'approved' }, select: { contractJson: true, contractSha256: true } });
    if (row === null) return null;
    return createHash('sha256').update(row.contractJson, 'utf8').digest('hex') === row.contractSha256 ? row.contractJson : null;
  }
}
