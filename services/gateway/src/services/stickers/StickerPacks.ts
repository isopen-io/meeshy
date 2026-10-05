/**
 * LES PACKS DE STICKERS (#9141) — proposés par des tiers, modérés, installés
 * par chacun.
 *
 * - **proposer** — un manifeste (`validateStickerPackManifest`, la même
 *   fonction que l'éditeur web) et un fichier par sticker. Chaque fichier passe
 *   par `normalizeStickerImage`, seule porte d'entrée des octets d'un sticker
 *   (type lu dans les octets, ré-encodage, 512 px) ; le GENRE déclaré est
 *   confronté à l'animation RÉELLE : un « cinématique » fixe ou un « fixe »
 *   animé est refusé. Le pack naît `pending` ;
 * - **modérer** — `approved` le publie dans le catalogue, `rejected` le
 *   renvoie à son auteur avec un mot, et l'auteur peut reproposer sous le même
 *   slug ;
 * - **installer / retirer** — le CHOIX de l'utilisateur, une ligne
 *   `UserStickerPack` ; sans choix, le défaut du pack (`isStickerPackInstalled`) :
 *   les packs intégrés Mee, Meo et Mee & Meo sont installés, les autres non.
 *
 * Un pack non publié n'existe que pour son auteur et les modérateurs : pour
 * tout autre, il rend le même « absent » qu'un slug inconnu.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import {
  BUILTIN_STICKER_PACKS,
  STICKER_KINDS,
  STICKER_PACK_AUTHOR_MEESHY,
  STICKER_PACK_LIMITS,
  isBuiltinStickerPackSlug,
  isStickerPackInstalled,
  validateStickerPackManifest,
  type StickerKind,
  type StickerPackDetail,
  type StickerPackItem,
  type StickerPackItemManifest,
  type StickerPackProblem,
  type StickerPackStatus,
  type StickerPackSummary,
  type StickerTextZone,
} from '@meeshy/shared/types/sticker-pack';
import type { StickerMimeType } from '@meeshy/shared/types/sticker-definition';
import { normalizeStickerImage, type NormalizedStickerImage, type StickerImageOutcome } from './stickerImage';
import type { StickerFileStore } from './StickerLibrary';

type ItemRow = {
  readonly key: string;
  readonly title: string;
  readonly emoji: string;
  readonly kind: string;
  readonly mimeType: string;
  readonly filePath: string;
  readonly width: number;
  readonly height: number;
  readonly zones: Prisma.JsonValue | null;
  readonly position: number;
};

type PackRow = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly submitterId: string;
  readonly status: string;
  readonly reviewNote: string | null;
  readonly installCount: number;
  readonly items: readonly ItemRow[];
};

export type StickerPackViewer = { readonly userId: string; readonly canModerate: boolean };

export type StickerAssetRefusal = 'missing' | 'not-an-image' | 'too-large' | 'kind-mismatch';

export type SubmitStickerPackOutcome =
  | { readonly kind: 'submitted'; readonly pack: StickerPackDetail }
  | { readonly kind: 'invalid'; readonly problems: readonly StickerPackProblem[] }
  | { readonly kind: 'asset-refused'; readonly key: string; readonly reason: StickerAssetRefusal }
  | { readonly kind: 'slug-taken' }
  | { readonly kind: 'too-many-pending' };

export type ReviewDecision = 'approve' | 'reject';

export type StickerPacksDeps = {
  readonly prisma: PrismaClient;
  readonly files: StickerFileStore;
  readonly normalize?: (bytes: Buffer) => Promise<StickerImageOutcome>;
  readonly now?: () => Date;
  readonly newFileId?: () => string;
};

const EXTENSION: Readonly<Record<StickerMimeType, string>> = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const KINDS: ReadonlySet<string> = new Set(STICKER_KINDS);
const UNIQUE_VIOLATION = 'P2002';
const PACK_INCLUDE = { items: { orderBy: { position: 'asc' } } } as const;

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === UNIQUE_VIOLATION;

const asKind = (value: string): StickerKind => (KINDS.has(value) ? (value as StickerKind) : 'static');

const asZones = (value: Prisma.JsonValue | null): readonly StickerTextZone[] =>
  Array.isArray(value) ? (value as unknown as readonly StickerTextZone[]) : [];

const kindsOf = (items: readonly { readonly kind: string }[]): readonly StickerKind[] =>
  STICKER_KINDS.filter((kind) => items.some((item) => item.kind === kind));

/** Un « fixe » ne bouge pas, un « cinématique » bouge ; un Instant peut l'un ou l'autre. */
const kindMatches = (kind: StickerKind, animated: boolean): boolean =>
  kind === 'static' ? !animated : kind === 'cinematic' ? animated : true;

function toItem(row: ItemRow): StickerPackItem {
  return {
    key: row.key,
    title: row.title,
    emoji: row.emoji,
    kind: asKind(row.kind),
    mimeType: row.mimeType,
    fileUrl: row.filePath,
    width: row.width,
    height: row.height,
    zones: asZones(row.zones),
  };
}

function toDetail(row: PackRow, installed: boolean, viewer?: StickerPackViewer): StickerPackDetail {
  const ownView = viewer !== undefined && (viewer.userId === row.submitterId || viewer.canModerate);
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    author: row.author,
    builtin: false,
    status: row.status as StickerPackStatus,
    itemCount: row.items.length,
    kinds: kindsOf(row.items),
    coverUrl: row.items[0]?.filePath ?? null,
    installed,
    installCount: row.installCount,
    items: row.items.map(toItem),
    ...(ownView ? { reviewNote: row.reviewNote } : {}),
  };
}

const toSummary = ({ items: _items, reviewNote: _note, ...summary }: StickerPackDetail): StickerPackSummary => summary;

function builtinDetail(slug: string, installed: boolean): StickerPackDetail | null {
  const pack = BUILTIN_STICKER_PACKS.find((candidate) => candidate.slug === slug);
  if (pack === undefined) return null;
  return {
    slug: pack.slug,
    name: pack.name,
    description: pack.description,
    author: STICKER_PACK_AUTHOR_MEESHY,
    builtin: true,
    status: 'approved',
    itemCount: 0,
    kinds: pack.kinds,
    coverUrl: null,
    installed,
    installCount: 0,
    items: [],
  };
}

export class StickerPacks {
  private readonly prisma: PrismaClient;
  private readonly files: StickerFileStore;
  private readonly normalize: (bytes: Buffer) => Promise<StickerImageOutcome>;
  private readonly now: () => Date;
  private readonly newFileId: () => string;

  constructor(deps: StickerPacksDeps) {
    this.prisma = deps.prisma;
    this.files = deps.files;
    this.normalize = deps.normalize ?? normalizeStickerImage;
    this.now = deps.now ?? (() => new Date());
    this.newFileId = deps.newFileId ?? randomUUID;
  }

  /** La boutique : les packs intégrés, puis les packs publiés, du plus installé au moins installé. */
  async catalogue(userId: string): Promise<readonly StickerPackSummary[]> {
    const [choices, rows] = await Promise.all([
      this.choices(userId),
      this.prisma.stickerPack.findMany({ where: { status: 'approved' }, include: PACK_INCLUDE, orderBy: { installCount: 'desc' } }),
    ]);
    const installed = (slug: string) => isStickerPackInstalled(slug, choices.get(slug));
    return [
      ...BUILTIN_STICKER_PACKS.flatMap((pack) => {
        const detail = builtinDetail(pack.slug, installed(pack.slug));
        return detail === null ? [] : [toSummary(detail)];
      }),
      ...rows.map((row) => toSummary(toDetail(row, installed(row.slug)))),
    ];
  }

  /** Les packs installés, avec leurs stickers : ce que la feuille de stickers montre, un onglet par pack. */
  async installed(userId: string): Promise<readonly StickerPackDetail[]> {
    const choices = await this.choices(userId);
    const builtins = BUILTIN_STICKER_PACKS.filter((pack) => isStickerPackInstalled(pack.slug, choices.get(pack.slug))).flatMap((pack) => {
      const detail = builtinDetail(pack.slug, true);
      return detail === null ? [] : [detail];
    });
    const chosen = [...choices.entries()].filter(([slug, choice]) => choice.installed && !isBuiltinStickerPackSlug(slug)).map(([slug]) => slug);
    if (chosen.length === 0) return builtins;
    const rows = await this.prisma.stickerPack.findMany({ where: { slug: { in: chosen }, status: 'approved' }, include: PACK_INCLUDE });
    const order = new Map(chosen.map((slug, index) => [slug, index]));
    const packs = [...rows].sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0)).map((row) => toDetail(row, true));
    return [...builtins, ...packs];
  }

  /** Un pack et ses stickers — publié pour tous ; en attente ou refusé pour son auteur et les modérateurs seulement. */
  async detail(slug: string, viewer: StickerPackViewer): Promise<StickerPackDetail | null> {
    const choice = (await this.choices(viewer.userId)).get(slug);
    if (isBuiltinStickerPackSlug(slug)) return builtinDetail(slug, isStickerPackInstalled(slug, choice));
    const row = await this.prisma.stickerPack.findUnique({ where: { slug }, include: PACK_INCLUDE });
    if (row === null || !this.visible(row, viewer)) return null;
    return toDetail(row, isStickerPackInstalled(slug, choice), viewer);
  }

  /** Installe ou retire — `null` pour un pack que l'utilisateur ne peut pas installer (inconnu, non publié). */
  async setInstalled(userId: string, slug: string, installed: boolean): Promise<StickerPackSummary | null> {
    const builtin = isBuiltinStickerPackSlug(slug);
    const row = builtin ? null : await this.prisma.stickerPack.findUnique({ where: { slug }, include: PACK_INCLUDE });
    if (!builtin && (row === null || row.status !== 'approved')) return null;

    const before = isStickerPackInstalled(slug, (await this.choices(userId)).get(slug));
    const at = this.now();
    await this.prisma.userStickerPack.upsert({
      where: { userId_packSlug: { userId, packSlug: slug } },
      create: { userId, packSlug: slug, installedAt: installed ? at : null, updatedAt: at },
      update: { installedAt: installed ? at : null, updatedAt: at },
    });
    if (row === null) {
      const detail = builtinDetail(slug, installed);
      return detail === null ? null : toSummary(detail);
    }
    const delta = before === installed ? 0 : installed ? 1 : -1;
    const installCount = delta === 0 ? row.installCount : (await this.prisma.stickerPack.update({ where: { id: row.id }, data: { installCount: { increment: delta } } })).installCount;
    return toSummary(toDetail({ ...row, installCount }, installed));
  }

  async submit(userId: string, input: unknown, assets: ReadonlyMap<string, Buffer>): Promise<SubmitStickerPackOutcome> {
    const validation = validateStickerPackManifest(input);
    if ('problems' in validation) return { kind: 'invalid', problems: validation.problems };
    const { manifest } = validation;

    const existing = await this.prisma.stickerPack.findUnique({ where: { slug: manifest.slug }, include: PACK_INCLUDE });
    const replacing = existing !== null && existing.submitterId === userId && existing.status === 'rejected';
    if (existing !== null && !replacing) return { kind: 'slug-taken' };
    const pending = await this.prisma.stickerPack.count({ where: { submitterId: userId, status: 'pending' } });
    if (pending >= STICKER_PACK_LIMITS.maxPendingPerAuthor) return { kind: 'too-many-pending' };

    const images = await this.normalizeAll(manifest.items, assets);
    if ('reason' in images) return { kind: 'asset-refused', key: images.key, reason: images.reason };

    const folder = `sticker-packs/${this.newFileId()}`;
    const stored = manifest.items.map((item, position) => {
      const image = images.byKey.get(item.key) as NormalizedStickerImage;
      return { item, image, position, filePath: `${folder}/${item.key}.${EXTENSION[image.mimeType]}` };
    });
    try {
      await Promise.all(stored.map(({ filePath, image }) => this.files.write(filePath, image.bytes)));
      if (existing !== null) await this.discard(existing);
      const row = await this.prisma.stickerPack.create({
        data: {
          slug: manifest.slug,
          name: manifest.name,
          description: manifest.description,
          author: manifest.author,
          submitterId: userId,
          status: 'pending',
          createdAt: this.now(),
          items: {
            create: stored.map(({ item, image, position, filePath }) => ({
              key: item.key,
              title: item.title,
              emoji: item.emoji,
              kind: item.kind,
              mimeType: image.mimeType,
              filePath,
              width: image.width,
              height: image.height,
              sizeBytes: image.bytes.length,
              zones: item.kind === 'instant' ? ((item.zones ?? []) as unknown as Prisma.InputJsonValue) : undefined,
              position,
            })),
          },
        },
        include: PACK_INCLUDE,
      });
      return { kind: 'submitted', pack: toDetail(row, false, { userId, canModerate: false }) };
    } catch (error) {
      await Promise.all(stored.map(({ filePath }) => this.files.remove(filePath).catch(() => undefined)));
      if (isUniqueViolation(error)) return { kind: 'slug-taken' };
      throw error;
    }
  }

  /** Les propositions d'un auteur, les plus récentes d'abord — avec le mot du modérateur. */
  async submissions(userId: string): Promise<readonly StickerPackDetail[]> {
    const rows = await this.prisma.stickerPack.findMany({ where: { submitterId: userId }, include: PACK_INCLUDE, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => toDetail(row, false, { userId, canModerate: false }));
  }

  /** La file de modération, la plus ancienne proposition d'abord. */
  async pending(moderatorId: string): Promise<readonly StickerPackDetail[]> {
    const rows = await this.prisma.stickerPack.findMany({ where: { status: 'pending' }, include: PACK_INCLUDE, orderBy: { createdAt: 'asc' } });
    return rows.map((row) => toDetail(row, false, { userId: moderatorId, canModerate: true }));
  }

  /** Publie ou refuse un pack EN ATTENTE — `null` s'il n'y en a pas sous ce slug. */
  async review(moderatorId: string, slug: string, decision: ReviewDecision, note: string | null): Promise<StickerPackDetail | null> {
    const row = await this.prisma.stickerPack.findUnique({ where: { slug }, include: PACK_INCLUDE });
    if (row === null || row.status !== 'pending') return null;
    const updated = await this.prisma.stickerPack.update({
      where: { id: row.id },
      data: {
        status: decision === 'approve' ? 'approved' : 'rejected',
        reviewNote: note?.trim().slice(0, STICKER_PACK_LIMITS.maxReviewNoteLength) || null,
        reviewerId: moderatorId,
        reviewedAt: this.now(),
      },
      include: PACK_INCLUDE,
    });
    return toDetail(updated, false, { userId: moderatorId, canModerate: true });
  }

  private visible(row: PackRow, viewer: StickerPackViewer): boolean {
    return row.status === 'approved' || row.submitterId === viewer.userId || viewer.canModerate;
  }

  private async choices(userId: string): Promise<ReadonlyMap<string, { readonly installed: boolean }>> {
    const rows = await this.prisma.userStickerPack.findMany({ where: { userId }, orderBy: { updatedAt: 'asc' } });
    return new Map(rows.map((row) => [row.packSlug, { installed: row.installedAt !== null }]));
  }

  private async normalizeAll(
    items: readonly StickerPackItemManifest[],
    assets: ReadonlyMap<string, Buffer>,
  ): Promise<{ ok: true; byKey: ReadonlyMap<string, NormalizedStickerImage> } | { ok: false; key: string; reason: StickerAssetRefusal }> {
    const byKey = new Map<string, NormalizedStickerImage>();
    for (const item of items) {
      const bytes = assets.get(item.asset);
      if (bytes === undefined) return { ok: false, key: item.key, reason: 'missing' };
      const outcome = await this.normalize(bytes);
      if ('reason' in outcome) return { ok: false, key: item.key, reason: outcome.reason };
      if (!kindMatches(item.kind, outcome.image.animated)) return { ok: false, key: item.key, reason: 'kind-mismatch' };
      byKey.set(item.key, outcome.image);
    }
    return { ok: true, byKey };
  }

  private async discard(row: PackRow): Promise<void> {
    await this.prisma.stickerPack.delete({ where: { id: row.id } });
    await Promise.all(row.items.map((item) => this.files.remove(item.filePath).catch(() => undefined)));
  }
}
