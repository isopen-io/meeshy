/**
 * Les PROPOSITIONS de packs par des tiers, et leur modération (#9141),
 * extraites telles quelles de `StickerPacks.ts` par LP0 (#10148). Seul un
 * domaine qui déclare une `SubmissionSpec` les reçoit — en v1, les stickers ;
 * les cadres n'ont ni `/submissions`, ni `/pending`, ni `/:slug/review`.
 *
 * - **proposer** — un manifeste (`validateManifest`, la même fonction que
 *   l'éditeur web) et un fichier par élément. Chaque fichier passe par
 *   `normalizeAsset`, seule porte d'entrée des octets (type lu dans les
 *   octets, ré-encodage) ; le GENRE déclaré est confronté à l'animation
 *   RÉELLE. L'empreinte des octets GARDÉS (`sha256`) est gravée avec eux :
 *   c'est l'adresse du fichier dans le magasin `/pack-assets` (#10188). Le
 *   pack naît `pending` ;
 * - **modérer** — `approved` le publie, `rejected` le renvoie à son auteur
 *   avec un mot, et l'auteur peut reproposer sous le même slug.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import {
  STICKER_PACK_LIMITS,
  validateStickerPackManifest,
  type StickerKind,
  type StickerPackDetail,
  type StickerPackItemManifest,
  type StickerPackProblem,
} from '@meeshy/shared/types/sticker-pack';
import type { StickerMimeType } from '@meeshy/shared/types/sticker-definition';
import type { NormalizedStickerImage, StickerImageOutcome } from '../stickers/stickerImage';
import type { StickerFileStore } from '../stickers/StickerLibrary';
import { isUniqueViolation } from './PackCatalog';
import { STICKER_PACK_INCLUDE, stickerPackDetail, type StickerPackRow } from './stickerPackSpec';

export type StickerAssetRefusal = 'missing' | 'not-an-image' | 'too-large' | 'kind-mismatch';

export type SubmitStickerPackOutcome =
  | { readonly kind: 'submitted'; readonly pack: StickerPackDetail }
  | { readonly kind: 'invalid'; readonly problems: readonly StickerPackProblem[] }
  | { readonly kind: 'asset-refused'; readonly key: string; readonly reason: StickerAssetRefusal }
  | { readonly kind: 'slug-taken' }
  | { readonly kind: 'too-many-pending' };

export type ReviewDecision = 'approve' | 'reject';

/** Ce qu'un domaine fournit pour recevoir des propositions : son validateur, sa porte des octets, son stockage. */
export type SubmissionSpec = {
  readonly validateManifest: typeof validateStickerPackManifest;
  readonly normalizeAsset: (bytes: Buffer) => Promise<StickerImageOutcome>;
  readonly files: StickerFileStore;
};

export type PackSubmissionsDeps = {
  readonly prisma: PrismaClient;
  readonly spec: SubmissionSpec;
  readonly now?: () => Date;
  readonly newFileId?: () => string;
};

const EXTENSION: Readonly<Record<StickerMimeType, string>> = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

/** Un « fixe » ne bouge pas, un « cinématique » bouge ; un Instant peut l'un ou l'autre. */
const kindMatches = (kind: StickerKind, animated: boolean): boolean =>
  kind === 'static' ? !animated : kind === 'cinematic' ? animated : true;

export class PackSubmissions {
  private readonly prisma: PrismaClient;
  private readonly spec: SubmissionSpec;
  private readonly now: () => Date;
  private readonly newFileId: () => string;

  constructor(deps: PackSubmissionsDeps) {
    this.prisma = deps.prisma;
    this.spec = deps.spec;
    this.now = deps.now ?? (() => new Date());
    this.newFileId = deps.newFileId ?? randomUUID;
  }

  async submit(userId: string, input: unknown, assets: ReadonlyMap<string, Buffer>): Promise<SubmitStickerPackOutcome> {
    const validation = this.spec.validateManifest(input);
    if ('problems' in validation) return { kind: 'invalid', problems: validation.problems };
    const { manifest } = validation;

    const existing = await this.prisma.stickerPack.findUnique({ where: { slug: manifest.slug }, include: STICKER_PACK_INCLUDE });
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
      await Promise.all(stored.map(({ filePath, image }) => this.spec.files.write(filePath, image.bytes)));
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
              sha256: createHash('sha256').update(image.bytes).digest('hex'),
              width: image.width,
              height: image.height,
              sizeBytes: image.bytes.length,
              zones: item.kind === 'instant' ? ((item.zones ?? []) as unknown as Prisma.InputJsonValue) : undefined,
              position,
            })),
          },
        },
        include: STICKER_PACK_INCLUDE,
      });
      return { kind: 'submitted', pack: stickerPackDetail(row, false, { userId, canModerate: false }) };
    } catch (error) {
      await Promise.all(stored.map(({ filePath }) => this.spec.files.remove(filePath).catch(() => undefined)));
      if (isUniqueViolation(error)) return { kind: 'slug-taken' };
      throw error;
    }
  }

  /** Les propositions d'un auteur, les plus récentes d'abord — avec le mot du modérateur. */
  async submissions(userId: string): Promise<readonly StickerPackDetail[]> {
    const rows = await this.prisma.stickerPack.findMany({ where: { submitterId: userId }, include: STICKER_PACK_INCLUDE, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => stickerPackDetail(row, false, { userId, canModerate: false }));
  }

  /** La file de modération, la plus ancienne proposition d'abord. */
  async pending(moderatorId: string): Promise<readonly StickerPackDetail[]> {
    const rows = await this.prisma.stickerPack.findMany({ where: { status: 'pending' }, include: STICKER_PACK_INCLUDE, orderBy: { createdAt: 'asc' } });
    return rows.map((row) => stickerPackDetail(row, false, { userId: moderatorId, canModerate: true }));
  }

  /** Publie ou refuse un pack EN ATTENTE — `null` s'il n'y en a pas sous ce slug. */
  async review(moderatorId: string, slug: string, decision: ReviewDecision, note: string | null): Promise<StickerPackDetail | null> {
    const row = await this.prisma.stickerPack.findUnique({ where: { slug }, include: STICKER_PACK_INCLUDE });
    if (row === null || row.status !== 'pending') return null;
    const updated = await this.prisma.stickerPack.update({
      where: { id: row.id },
      data: {
        status: decision === 'approve' ? 'approved' : 'rejected',
        reviewNote: note?.trim().slice(0, STICKER_PACK_LIMITS.maxReviewNoteLength) || null,
        reviewerId: moderatorId,
        reviewedAt: this.now(),
      },
      include: STICKER_PACK_INCLUDE,
    });
    return stickerPackDetail(updated, false, { userId: moderatorId, canModerate: true });
  }

  private async normalizeAll(
    items: readonly StickerPackItemManifest[],
    assets: ReadonlyMap<string, Buffer>,
  ): Promise<{ ok: true; byKey: ReadonlyMap<string, NormalizedStickerImage> } | { ok: false; key: string; reason: StickerAssetRefusal }> {
    const byKey = new Map<string, NormalizedStickerImage>();
    for (const item of items) {
      const bytes = assets.get(item.asset);
      if (bytes === undefined) return { ok: false, key: item.key, reason: 'missing' };
      const outcome = await this.spec.normalizeAsset(bytes);
      if ('reason' in outcome) return { ok: false, key: item.key, reason: outcome.reason };
      if (!kindMatches(item.kind, outcome.image.animated)) return { ok: false, key: item.key, reason: 'kind-mismatch' };
      byKey.set(item.key, outcome.image);
    }
    return { ok: true, byKey };
  }

  private async discard(row: StickerPackRow): Promise<void> {
    await this.prisma.stickerPack.delete({ where: { id: row.id } });
    await Promise.all(row.items.map((item) => this.spec.files.remove(item.filePath).catch(() => undefined)));
  }
}
