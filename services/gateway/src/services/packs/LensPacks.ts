/**
 * LES PACKS DE LENS DES PARTENAIRES (#11271, MeeshyLens v1) — proposer,
 * modérer, publier, servir. Le circuit est celui des packs d'apparence des
 * vendeurs tiers (#10709), porté au domaine `lens` :
 *
 * - **proposer** — le document passe par `parseLens` (le contrat UNIQUE du
 *   format, #11270), puis par ce que la passerelle exige EN PLUS : un coût
 *   déclaré au moins égal au coût MESURÉ (`measureLensCost`), exactement les
 *   fichiers que les couches nomment, chacun ré-encodé (`normalizeAsset`, la
 *   porte des octets des stickers) et RENOMMÉ par l'empreinte de ses octets.
 *   Une LUT passe par sa propre porte, SANS PERTE (`normalizeLut`) : une table
 *   de couleurs redimensionnée ou compressée avec perte ne correspond plus à rien.
 *   Ce qui est gardé est la copie re-sérialisée de ce que le schéma a lu. La
 *   lens naît `pending` : rien n'est servi ni installable avant la modération ;
 * - **modérer** — sous `canModerateContent`, jamais sa propre proposition. La
 *   revue FIXE la fenêtre et les communautés (le document servi est réécrit,
 *   donc ré-adressé). Aucun prix : une lens est gratuite. Une lens publiée se
 *   RETIRE (`withdrawn`). Chaque geste s'écrit au journal (`AdminAuditLog`) AVANT
 *   d'agir : sans journal, rien ne bouge ; un refus remplacé par une nouvelle
 *   proposition y laisse sa trace ;
 * - **servir** — le magasin communautaire du moteur de packs (`lensStore`)
 *   n'offre une lens publiée que dans sa fenêtre et à ses communautés
 *   (`isPackShelved`, #11274) — détail et document compris, sauf pour son auteur
 *   et la modération ; `/pack-assets` sert son document et ses fichiers une fois
 *   publiée et sa fenêtre ouverte (`approvedFile`). Le document servi ne porte
 *   pas ses communautés : c'est la passerelle qui gouverne l'offre.
 *
 * Points « ATTEND » de #11251 laissés ABSENTS, jamais tranchés ici : ni
 * rémunération, ni crédit « Lens par X » en E2EE, ni géo-créneau — la revue
 * retire `window.geo` du document servi. L'identité partenaire et le comptage
 * d'usage sont S26.
 */
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UNKNOWN_PACK_AUDIENCE, isPackShelved, type PackAudience } from '@meeshy/shared/types/pack-availability';
import { parseLens, LENS_PATTERNS, type Lens } from '@meeshy/shared/types/lens-format';
import { LENS_PACK_LIMITS, isLensCostDeclaredHonestly, lensAssetRefs, measureLensCost, withLensAssets, type LensCost } from '@meeshy/shared/types/lens-pack';
import type { PackAssetRef, PackStatus, PackSummary } from '@meeshy/shared/types/content-pack';
import { STICKER_PACK_AUTHOR_MEESHY } from '@meeshy/shared/types/sticker-pack';
import { normalizeStickerImage, type StickerImageOutcome } from '../stickers/stickerImage';
import { normalizeLensLut } from './lensLutImage';
import { isUniqueViolation, type CommunityPackStore, type PackViewer } from './PackCatalog';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'LensPacks' });

export type LensPackDetail = PackSummary & {
  readonly cost: LensCost;
  readonly surfaces: readonly string[];
  readonly availability: { readonly startsAt: string; readonly endsAt: string };
  readonly document: PackAssetRef;
  readonly reviewNote?: string | null;
};

type LensPackRow = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly author: string;
  readonly submitterId: string;
  readonly status: string;
  readonly reviewNote: string | null;
  readonly installCount: number;
  readonly cost: string;
  readonly surfaces: readonly string[];
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly communities: readonly string[];
  readonly documentSha256: string;
  readonly documentSrc: string;
  readonly documentBytes: number;
};

/** Tout sauf le document (jusqu'à 64 Ko) : lister, détailler et installer n'en ont pas besoin. */
const ROW_SELECT = {
  id: true, slug: true, name: true, author: true, submitterId: true, status: true, reviewNote: true, installCount: true,
  cost: true, surfaces: true, startsAt: true, endsAt: true, communities: true, documentSha256: true, documentSrc: true, documentBytes: true,
} as const;

export type LensAssetRefusal = 'missing' | 'unused' | 'too-many' | 'too-large' | 'not-an-image';

export type SubmitLensOutcome =
  | { readonly kind: 'submitted'; readonly pack: LensPackDetail }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'forbidden'; readonly reasons: readonly string[] }
  | { readonly kind: 'update-required'; readonly schema: number }
  | { readonly kind: 'cost-understated'; readonly declared: LensCost; readonly measured: LensCost }
  | { readonly kind: 'asset-refused'; readonly src: string; readonly reason: LensAssetRefusal }
  | { readonly kind: 'slug-taken' }
  | { readonly kind: 'too-many-pending' }
  | { readonly kind: 'audit-unavailable' };

export type LensReview = {
  readonly decision: 'approve' | 'reject';
  readonly note: string | null;
  readonly window?: { readonly startsAt: string; readonly endsAt: string };
  readonly communities?: readonly string[];
};

export type ReviewLensOutcome =
  | { readonly kind: 'reviewed'; readonly pack: LensPackDetail }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'self-review' }
  | { readonly kind: 'invalid-window' }
  | { readonly kind: 'audit-unavailable' };

export type WithdrawLensOutcome =
  | { readonly kind: 'withdrawn'; readonly pack: LensPackDetail }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'audit-unavailable' };

export type LensFile = { readonly bytes: Buffer; readonly contentType: string };

export type LensPacksDeps = {
  readonly prisma: Pick<PrismaClient, 'lensPack' | 'lensPackAsset' | 'adminAuditLog'>;
  readonly now?: () => Date;
  readonly normalizeAsset?: (bytes: Buffer) => Promise<StickerImageOutcome>;
  readonly normalizeLut?: (bytes: Buffer) => Promise<StickerImageOutcome>;
  /** Où se signale un trou du journal de modération (#12329 R2). */
  readonly log?: LensPacksLog;
};

type LensPacksLog = { readonly error: (message: string, context?: Record<string, unknown>) => void };

type NotAppliedReason = 'concurrent-review' | 'write-failed';

type NotAppliedEntry = {
  readonly moderatorId: string;
  readonly submitterId: string;
  readonly action: 'LENS_PACK_APPROVE_NOT_APPLIED' | 'LENS_PACK_REJECT_NOT_APPLIED' | 'LENS_PACK_WITHDRAW_NOT_APPLIED';
  readonly slug: string;
};

type LensAuditEntry = {
  readonly adminId: string;
  readonly submitterId: string;
  readonly action:
    | 'LENS_PACK_APPROVE'
    | 'LENS_PACK_REJECT'
    | 'LENS_PACK_WITHDRAW'
    | 'LENS_PACK_REJECTION_REPLACED'
    | 'LENS_PACK_APPROVE_NOT_APPLIED'
    | 'LENS_PACK_REJECT_NOT_APPLIED'
    | 'LENS_PACK_WITHDRAW_NOT_APPLIED';
  readonly slug: string;
  readonly metadata: Readonly<Record<string, unknown>>;
};

const sha256Of = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
const isoOf = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
const EXTENSION = { 'image/png': 'png', 'image/webp': 'webp' } as const;
const isLensImageMime = (mime: string): mime is keyof typeof EXTENSION => mime in EXTENSION;
const DOCUMENT_CONTENT_TYPE = 'application/json; charset=utf-8';

export function lensPackDetail(row: LensPackRow, installed: boolean, viewer?: PackViewer): LensPackDetail {
  const ownView = viewer !== undefined && (viewer.userId === row.submitterId || viewer.canModerate);
  return {
    slug: row.slug,
    name: row.name,
    description: '',
    author: row.author || STICKER_PACK_AUTHOR_MEESHY,
    builtin: false,
    status: row.status as PackStatus,
    itemCount: 1,
    coverUrl: null,
    installed,
    installCount: row.installCount,
    domain: 'lens',
    origin: 'community',
    version: 1,
    downloadBytes: { story: row.documentBytes, square: null },
    removable: true,
    names: {},
    price: null,
    owned: true,
    preview: null,
    cost: row.cost as LensCost,
    surfaces: row.surfaces,
    availability: { startsAt: isoOf(row.startsAt), endsAt: isoOf(row.endsAt) },
    document: { src: row.documentSrc, bytes: row.documentBytes, sha256: row.documentSha256 },
    ...(ownView ? { reviewNote: row.reviewNote } : {}),
  };
}

const isOwnView = (row: Pick<LensPackRow, 'submitterId'>, viewer: PackViewer): boolean =>
  row.submitterId === viewer.userId || viewer.canModerate;

const isVisible = (row: Pick<LensPackRow, 'status' | 'submitterId'>, viewer: PackViewer): boolean =>
  row.status === 'approved' || isOwnView(row, viewer);

/** L'offre d'une lens publiée : sa fenêtre (fixée à la revue) et ses communautés (vide = tout le monde). */
const offerOf = (row: Pick<LensPackRow, 'startsAt' | 'endsAt' | 'communities'>) => ({
  availability: { startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() },
  ...(row.communities.length > 0 ? { targeting: { communities: row.communities } } : {}),
});

/**
 * Le document servi : la lens lue, ses fichiers renommés, sa fenêtre fixée, sans
 * géo-créneau (#11251, point 7 en attente) ni communautés — le ciblage reste à la
 * passerelle, et des identifiants de communautés privées n'ont rien à faire dans
 * un fichier que `/pack-assets` sert sans authentification.
 */
const servedDocument = (lens: Lens, window: { readonly startsAt: string; readonly endsAt: string }): string =>
  JSON.stringify({ ...lens, window: { startsAt: window.startsAt, endsAt: window.endsAt } });

export const documentColumns = (json: string) => {
  const sha256 = sha256Of(json);
  return { documentJson: json, documentSha256: sha256, documentSrc: `${sha256.slice(0, 16)}.json`, documentBytes: Buffer.byteLength(json, 'utf8') };
};

/**
 * Le document publié d'un compte purgé : `credits.author` réécrit, le reste
 * intact, ré-adressé par sa nouvelle empreinte (l'ancienne adresse ne sert plus
 * rien). Un document illisible garde ses octets — il n'a pas d'auteur à taire.
 */
export function anonymizedLensDocument(json: string, author: string): ReturnType<typeof documentColumns> {
  const parsed: unknown = (() => {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  })();
  const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!isObject(parsed) || !isObject(parsed.credits)) return documentColumns(json);
  return documentColumns(JSON.stringify({ ...parsed, credits: { ...parsed.credits, author } }));
}

const isWindowLawful = (window: { readonly startsAt: string; readonly endsAt: string }): boolean => {
  const starts = Date.parse(window.startsAt);
  const ends = Date.parse(window.endsAt);
  return Number.isFinite(starts) && Number.isFinite(ends) && starts < ends;
};

type DecodedAssets = { readonly ok: true; readonly bytes: ReadonlyMap<string, Buffer> } | { readonly ok: false; readonly src: string; readonly reason: LensAssetRefusal };

function decodeAssets(refs: readonly string[], provided: Readonly<Record<string, string>>): DecodedAssets {
  const keys = Object.keys(provided);
  if (keys.length > LENS_PACK_LIMITS.maxAssets) return { ok: false, src: keys[LENS_PACK_LIMITS.maxAssets] ?? '', reason: 'too-many' };
  const missing = refs.find((src) => provided[src] === undefined);
  if (missing !== undefined) return { ok: false, src: missing, reason: 'missing' };
  const unused = keys.find((src) => !refs.includes(src));
  if (unused !== undefined) return { ok: false, src: unused, reason: 'unused' };
  const decoded = refs.map((src) => [src, Buffer.from(provided[src] ?? '', 'base64')] as const);
  const heavy = decoded.find(([, bytes]) => bytes.length > LENS_PACK_LIMITS.maxAssetBytes);
  if (heavy !== undefined) return { ok: false, src: heavy[0], reason: 'too-large' };
  const total = decoded.reduce((sum, [, bytes]) => sum + bytes.length, 0);
  if (total > LENS_PACK_LIMITS.maxTotalAssetBytes) return { ok: false, src: refs[refs.length - 1] ?? '', reason: 'too-large' };
  return { ok: true, bytes: new Map(decoded) };
}

export class LensPacks {
  private readonly prisma: Pick<PrismaClient, 'lensPack' | 'lensPackAsset' | 'adminAuditLog'>;
  private readonly now: () => Date;
  private readonly normalizeAsset: (bytes: Buffer) => Promise<StickerImageOutcome>;
  private readonly normalizeLut: (bytes: Buffer) => Promise<StickerImageOutcome>;
  private readonly log: LensPacksLog;

  constructor(deps: LensPacksDeps) {
    this.log = deps.log ?? logger;
    this.prisma = deps.prisma;
    this.now = deps.now ?? (() => new Date());
    this.normalizeAsset = deps.normalizeAsset ?? normalizeStickerImage;
    this.normalizeLut = deps.normalizeLut ?? normalizeLensLut;
  }

  /**
   * Le geste journalisé n'a pas eu lieu (#12329 R2) : la ligne « non appliqué »
   * dit pourquoi. Si elle-même ne s'écrit pas, le journal porte un geste sans
   * son issue — ce trou se signale en erreur, nommé, au lieu de se taire.
   */
  private async recordNotApplied(entry: NotAppliedEntry & { readonly reason: NotAppliedReason }): Promise<void> {
    const journaled = await this.journal({ adminId: entry.moderatorId, submitterId: entry.submitterId, action: entry.action, slug: entry.slug, metadata: { reason: entry.reason } });
    if (!journaled) {
      this.log.error('lens moderation journal incomplete: a gesture is journaled without its outcome', { action: entry.action, slug: entry.slug, reason: entry.reason });
    }
  }

  /** L'écriture d'un geste déjà journalisé : si elle LÈVE, le journal le dit avant que l'erreur ne remonte. */
  private async applyJournaled(update: () => Promise<{ readonly count: number }>, notApplied: NotAppliedEntry): Promise<{ readonly count: number }> {
    try {
      return await update();
    } catch (error) {
      await this.recordNotApplied({ ...notApplied, reason: 'write-failed' });
      throw error;
    }
  }

  /** Une ligne de journal, ÉCRITE avant d'agir : si elle ne s'écrit pas, on n'agit pas. */
  private async journal(entry: LensAuditEntry): Promise<boolean> {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId: entry.adminId,
          userId: entry.submitterId,
          action: entry.action,
          entity: 'LensPack',
          entityId: entry.slug,
          metadata: JSON.stringify(entry.metadata),
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  async submit(userId: string, input: { readonly document: unknown; readonly assets: Readonly<Record<string, string>> }): Promise<SubmitLensOutcome> {
    if (Buffer.byteLength(JSON.stringify(input.document ?? null), 'utf8') > LENS_PACK_LIMITS.maxDocumentBytes) return { kind: 'invalid' };
    const parsed = parseLens(input.document);
    if (parsed.status === 'update-required') return { kind: 'update-required', schema: parsed.schema };
    if (parsed.status === 'forbidden') return { kind: 'forbidden', reasons: parsed.reasons };
    if (parsed.status === 'invalid') return { kind: 'invalid' };
    const { lens } = parsed;
    const measured = measureLensCost(lens);
    if (!isLensCostDeclaredHonestly(lens.cost, measured)) return { kind: 'cost-understated', declared: lens.cost, measured };

    const decoded = decodeAssets(lensAssetRefs(lens), input.assets);
    if ('reason' in decoded) return { kind: 'asset-refused', src: decoded.src, reason: decoded.reason };
    const luts = new Set(lens.layers.flatMap((layer) => (layer.kind === 'lut' ? [layer.asset] : [])));
    const normalized = await this.normalizeAll(decoded.bytes, luts);
    if ('reason' in normalized) return { kind: 'asset-refused', src: normalized.src, reason: normalized.reason };

    const existing = await this.prisma.lensPack.findUnique({
      where: { slug: lens.id },
      select: { id: true, submitterId: true, status: true, reviewNote: true, reviewerId: true, reviewedAt: true, documentSha256: true },
    });
    const replacing = existing !== null && existing.submitterId === userId && existing.status === 'rejected';
    if (existing !== null && !replacing) return { kind: 'slug-taken' };
    const pending = await this.prisma.lensPack.count({ where: { submitterId: userId, status: 'pending' } });
    if (pending >= LENS_PACK_LIMITS.maxPendingPerAuthor) return { kind: 'too-many-pending' };

    const renamed = new Map([...normalized.files].map(([src, file]) => [src, file.src]));
    const stored = withLensAssets(lens, renamed);
    const communities = lens.window.communities ?? [];
    const json = servedDocument(stored, lens.window);
    if (existing !== null) {
      const journaled = await this.journal({
        adminId: userId,
        submitterId: userId,
        action: 'LENS_PACK_REJECTION_REPLACED',
        slug: lens.id,
        metadata: {
          reviewNote: existing.reviewNote,
          reviewerId: existing.reviewerId,
          reviewedAt: existing.reviewedAt?.toISOString() ?? null,
          documentSha256: existing.documentSha256,
        },
      });
      if (!journaled) return { kind: 'audit-unavailable' };
    }
    try {
      if (existing !== null) await this.discard(existing.id);
      const row = await this.prisma.lensPack.create({
        data: {
          slug: lens.id,
          name: lens.name,
          author: lens.credits.author,
          submitterId: userId,
          status: 'pending',
          cost: measured,
          surfaces: [...lens.surfaces],
          startsAt: new Date(lens.window.startsAt),
          endsAt: new Date(lens.window.endsAt),
          communities: [...communities],
          ...documentColumns(json),
          assetSrcs: [...normalized.files.values()].map((file) => file.src),
          createdAt: this.now(),
        },
        select: ROW_SELECT,
      });
      await this.prisma.lensPackAsset.createMany({
        data: [...normalized.files.values()].map((file) => ({ packId: row.id, src: file.src, sha256: file.sha256, mimeType: file.mimeType, bytes: Uint8Array.from(file.bytes), sizeBytes: file.bytes.length })),
      });
      return { kind: 'submitted', pack: lensPackDetail(row, false, { userId, canModerate: false }) };
    } catch (error) {
      if (isUniqueViolation(error)) return { kind: 'slug-taken' };
      throw error;
    }
  }

  /** Les propositions de l'appelant, les plus récentes d'abord — avec le mot du modérateur. */
  async submissions(userId: string): Promise<readonly LensPackDetail[]> {
    const rows = await this.prisma.lensPack.findMany({ where: { submitterId: userId }, orderBy: { createdAt: 'desc' }, select: ROW_SELECT });
    return rows.map((row) => lensPackDetail(row, false, { userId, canModerate: false }));
  }

  /** La file de modération, la plus ancienne proposition d'abord. */
  async pending(moderatorId: string): Promise<readonly LensPackDetail[]> {
    const rows = await this.prisma.lensPack.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, select: ROW_SELECT });
    return rows.map((row) => lensPackDetail(row, false, { userId: moderatorId, canModerate: true }));
  }

  /**
   * Publie ou refuse une lens EN ATTENTE. La publication fixe la fenêtre et les
   * communautés (celles du document à défaut) et RÉÉCRIT le document servi ; le
   * passage est conditionnel (`status: 'pending'` + auteur relu) : deux
   * modérateurs ne se marchent pas dessus.
   */
  async review(moderatorId: string, slug: string, review: LensReview): Promise<ReviewLensOutcome> {
    const current = await this.prisma.lensPack.findUnique({ where: { slug }, select: { submitterId: true, status: true, documentJson: true, startsAt: true, endsAt: true, communities: true } });
    if (current === null || current.status !== 'pending') return { kind: 'not-found' };
    if (current.submitterId === moderatorId) return { kind: 'self-review' };
    const window = review.window ?? { startsAt: isoOf(current.startsAt), endsAt: isoOf(current.endsAt) };
    if (!isWindowLawful(window)) return { kind: 'invalid-window' };
    const approve = review.decision === 'approve';
    const communities = review.communities ?? current.communities;
    const parsed = parseLens(JSON.parse(current.documentJson));
    if (parsed.status !== 'ok') return { kind: 'not-found' };
    const fixed = approve
      ? {
          startsAt: new Date(window.startsAt),
          endsAt: new Date(window.endsAt),
          communities: [...communities],
          ...documentColumns(servedDocument(parsed.lens, window)),
        }
      : {};
    const note = review.note?.trim().slice(0, LENS_PACK_LIMITS.maxReviewNoteLength) || null;
    const journaled = await this.journal({
      adminId: moderatorId,
      submitterId: current.submitterId,
      action: approve ? 'LENS_PACK_APPROVE' : 'LENS_PACK_REJECT',
      slug,
      metadata: { note, ...(approve ? { window, communities } : {}) },
    });
    if (!journaled) return { kind: 'audit-unavailable' };
    const notApplied: NotAppliedEntry = { moderatorId, submitterId: current.submitterId, action: approve ? 'LENS_PACK_APPROVE_NOT_APPLIED' : 'LENS_PACK_REJECT_NOT_APPLIED', slug };
    const flipped = await this.applyJournaled(
      () =>
        this.prisma.lensPack.updateMany({
          where: { slug, status: 'pending', submitterId: current.submitterId },
          data: {
            status: approve ? 'approved' : 'rejected',
            reviewNote: note,
            reviewerId: moderatorId,
            reviewedAt: this.now(),
            ...fixed,
          },
        }),
      notApplied,
    );
    if (flipped.count === 0) {
      await this.recordNotApplied({ ...notApplied, reason: 'concurrent-review' });
      return { kind: 'not-found' };
    }
    const row = await this.prisma.lensPack.findUnique({ where: { slug }, select: ROW_SELECT });
    return row === null ? { kind: 'not-found' } : { kind: 'reviewed', pack: lensPackDetail(row, false, { userId: moderatorId, canModerate: true }) };
  }

  /**
   * Retire une lens PUBLIÉE (abus, signalement) : elle quitte le rayon, les
   * installés et le magasin des fichiers. Journalisé d'abord ; conditionnel sur
   * `approved`, deux modérateurs ne se marchent pas dessus.
   */
  async withdraw(moderatorId: string, slug: string, input: { readonly note: string | null }): Promise<WithdrawLensOutcome> {
    const current = await this.prisma.lensPack.findUnique({ where: { slug }, select: { submitterId: true, status: true } });
    if (current === null || current.status !== 'approved') return { kind: 'not-found' };
    const note = input.note?.trim().slice(0, LENS_PACK_LIMITS.maxReviewNoteLength) || null;
    const journaled = await this.journal({ adminId: moderatorId, submitterId: current.submitterId, action: 'LENS_PACK_WITHDRAW', slug, metadata: { note } });
    if (!journaled) return { kind: 'audit-unavailable' };
    const notApplied: NotAppliedEntry = { moderatorId, submitterId: current.submitterId, action: 'LENS_PACK_WITHDRAW_NOT_APPLIED', slug };
    const flipped = await this.applyJournaled(
      () =>
        this.prisma.lensPack.updateMany({
          where: { slug, status: 'approved' },
          data: { status: 'withdrawn', reviewNote: note, reviewerId: moderatorId, reviewedAt: this.now() },
        }),
      notApplied,
    );
    if (flipped.count === 0) {
      await this.recordNotApplied({ ...notApplied, reason: 'concurrent-review' });
      return { kind: 'not-found' };
    }
    const row = await this.prisma.lensPack.findUnique({ where: { slug }, select: ROW_SELECT });
    return row === null ? { kind: 'not-found' } : { kind: 'withdrawn', pack: lensPackDetail(row, false, { userId: moderatorId, canModerate: true }) };
  }

  /**
   * Le document d'une lens : publiée pour tous, en attente, refusée ou retirée pour
   * son auteur et les modérateurs. L'OFFRE (fenêtre, communautés) se juge avant,
   * par le détail du moteur de packs (route `/document`).
   */
  async document(slug: string, viewer: PackViewer): Promise<{ readonly documentJson: string; readonly sha256: string } | null> {
    const row = await this.prisma.lensPack.findUnique({ where: { slug }, select: { status: true, submitterId: true, documentJson: true, documentSha256: true } });
    if (row === null || !isVisible(row, viewer)) return null;
    return { documentJson: row.documentJson, sha256: row.documentSha256 };
  }

  /**
   * Un fichier d'une lens PUBLIÉE, par son adresse `<sha16>.<ext>` — la porte de
   * `/pack-assets` pour les lens. Une lens en attente ou refusée ne sert rien.
   */
  async approvedFile(src: string): Promise<LensFile | null> {
    if (src.endsWith('.json')) {
      const row = await this.prisma.lensPack.findFirst({ where: { documentSrc: src, ...this.servable() }, select: { documentJson: true, documentSha256: true } });
      if (row === null || sha256Of(row.documentJson) !== row.documentSha256) return null;
      return { bytes: Buffer.from(row.documentJson, 'utf8'), contentType: DOCUMENT_CONTENT_TYPE };
    }
    if (!LENS_PATTERNS.asset.test(src)) return null;
    // Une même image peut servir deux lens : elle se sert dès que l'UNE est publiée (mêmes octets, même empreinte).
    const copies = await this.prisma.lensPackAsset.findMany({ where: { src }, select: { packId: true, mimeType: true, bytes: true } });
    if (copies.length === 0) return null;
    const pack = await this.prisma.lensPack.findFirst({ where: { id: { in: copies.map((copy) => copy.packId) }, ...this.servable() }, select: { id: true } });
    const served = copies.find((copy) => copy.packId === pack?.id);
    return served === undefined ? null : { bytes: Buffer.from(served.bytes), contentType: served.mimeType };
  }

  /**
   * Ce que `/pack-assets` peut servir SANS authentification : une lens publiée dont
   * la fenêtre est OUVERTE — jamais une surprise avant son heure. Après la fin, ses
   * installés gardent leurs fichiers ; le ciblage, lui, se juge au détail, seule
   * porte qui donne l'adresse (`<sha16>`) d'un fichier.
   */
  private servable() {
    return { status: 'approved', startsAt: { lte: this.now() } };
  }

  private async normalizeAll(
    sources: ReadonlyMap<string, Buffer>,
    luts: ReadonlySet<string>,
  ): Promise<
    | { readonly ok: true; readonly files: ReadonlyMap<string, { readonly src: string; readonly sha256: string; readonly mimeType: string; readonly bytes: Buffer }> }
    | { readonly ok: false; readonly src: string; readonly reason: LensAssetRefusal }
  > {
    const files = new Map<string, { readonly src: string; readonly sha256: string; readonly mimeType: string; readonly bytes: Buffer }>();
    for (const [src, bytes] of sources) {
      const outcome = await (luts.has(src) ? this.normalizeLut(bytes) : this.normalizeAsset(bytes));
      if ('reason' in outcome) return { ok: false, src, reason: outcome.reason };
      const { mimeType } = outcome.image;
      if (!isLensImageMime(mimeType)) return { ok: false, src, reason: 'not-an-image' };
      const sha256 = sha256Of(outcome.image.bytes);
      files.set(src, { src: `${sha256.slice(0, 16)}.${EXTENSION[mimeType]}`, sha256, mimeType, bytes: outcome.image.bytes });
    }
    return { ok: true, files };
  }

  private async discard(id: string): Promise<void> {
    await this.prisma.lensPackAsset.deleteMany({ where: { packId: id } });
    await this.prisma.lensPack.delete({ where: { id } });
  }

  /**
   * Le magasin communautaire du domaine `lens` pour le moteur des packs :
   * une lens publiée est EN RAYON si elle est offerte maintenant à ce lecteur
   * (fenêtre, communautés) ou s'il l'a installée ; elle s'installe si elle est
   * offerte. Gratuite : toujours possédée.
   */
  store(options: { readonly audience: (userId: string) => Promise<PackAudience> }): CommunityPackStore<LensPackDetail> {
    const prisma = this.prisma;
    const now = this.now;
    const context = async (userId: string | undefined) => ({
      now: now(),
      audience: userId === undefined ? UNKNOWN_PACK_AUDIENCE : await options.audience(userId),
    });
    const approved = (where: Record<string, unknown> = {}) =>
      prisma.lensPack.findMany({ where: { status: 'approved', ...where }, orderBy: { installCount: 'desc' }, select: ROW_SELECT });
    return {
      catalogue: async (installedOf, _ownedKeys, userId) => {
        const [rows, offer] = await Promise.all([approved(), context(userId)]);
        return rows
          .filter((row) => isPackShelved(offerOf(row), offer, { ownedByRow: false, installed: installedOf(row.slug) }))
          .map((row) => lensPackDetail(row, installedOf(row.slug)));
      },
      installed: async (slugs) => {
        const rows = await approved({ slug: { in: [...slugs] } });
        const order = new Map(slugs.map((slug, index) => [slug, index]));
        return [...rows].sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0)).map((row) => lensPackDetail(row, true));
      },
      detail: async (slug, viewer, installedOf) => {
        const row = await prisma.lensPack.findUnique({ where: { slug }, select: ROW_SELECT });
        if (row === null || !isVisible(row, viewer)) return null;
        if (isOwnView(row, viewer)) return lensPackDetail(row, installedOf(slug), viewer);
        const shelved = isPackShelved(offerOf(row), await context(viewer.userId), { ownedByRow: false, installed: installedOf(slug) });
        return shelved ? lensPackDetail(row, installedOf(slug), viewer) : null;
      },
      installable: async (slug, userId) => {
        const row = await prisma.lensPack.findUnique({ where: { slug }, select: ROW_SELECT });
        // Une lens RETIRÉE reste désinstallable par qui l'a ; elle n'est plus offerte à personne.
        if (row === null || (row.status !== 'approved' && row.status !== 'withdrawn')) return null;
        if (row.status === 'withdrawn') {
          return { id: row.id, installCount: row.installCount, version: 1, offered: false, project: (installed, installCount) => lensPackDetail({ ...row, installCount }, installed) };
        }
        const offer = await context(userId);
        return {
          id: row.id,
          installCount: row.installCount,
          version: 1,
          offered: isPackShelved(offerOf(row), offer, { ownedByRow: false, installed: false }),
          project: (installed, installCount) => lensPackDetail({ ...row, installCount }, installed),
        };
      },
      addInstalls: async (id, delta) => {
        const row = await prisma.lensPack.update({ where: { id }, data: { installCount: { increment: delta } }, select: { installCount: true } });
        return row.installCount;
      },
    };
  }
}
