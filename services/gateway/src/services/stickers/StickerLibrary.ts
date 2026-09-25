/**
 * « Mes stickers » — la bibliothèque SERVEUR des stickers d'un utilisateur (#7938).
 *
 * Avant ce lot, un sticker créé depuis une image n'existait que sur l'appareil
 * qui l'avait créé (iOS : `StickerLibraryStore`, un index JSON local) et le web
 * n'en créait aucun. La bibliothèque vit désormais ici, une ligne `UserSticker`
 * par sticker, un fichier par ligne sous `stickers/<userId>/` :
 *
 * - **créer** — depuis un fichier, un collage, un détourage ou un sticker
 *   reçu. Les octets passent par `normalizeStickerImage`, seule porte d'entrée ;
 *   re-créer la MÊME image (même empreinte SHA-256 des octets source) remonte
 *   le sticker existant en tête au lieu d'en ajouter un double ;
 * - **lister** — du plus récemment utilisé au plus ancien ;
 * - **utiliser** — remonter un sticker en tête quand il part dans un message ;
 * - **retirer** — la ligne ET le fichier.
 *
 * Tout est borné au PROPRIÉTAIRE : un identifiant d'autrui rend le même « absent »
 * qu'un identifiant inexistant — on ne confirme pas l'existence d'un sticker
 * qu'on n'a pas le droit de nommer.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  STICKER_LIMITS,
  type StickerDefinition,
  type StickerMimeType,
  type StickerOrigin,
} from '@meeshy/shared/types/sticker-definition';
import { normalizeStickerImage, type StickerImageOutcome, type StickerImageRefusal } from './stickerImage';

export interface StickerFileStore {
  write(relativePath: string, bytes: Buffer): Promise<void>;
  remove(relativePath: string): Promise<void>;
}

type StickerRow = {
  readonly id: string;
  readonly name: string | null;
  readonly origin: string;
  readonly mimeType: string;
  readonly filePath: string;
  readonly width: number;
  readonly height: number;
  readonly sizeBytes: number;
  readonly animated: boolean;
  readonly createdAt: Date;
  readonly lastUsedAt: Date;
};

export type CreateStickerInput = {
  readonly bytes: Buffer;
  readonly origin: StickerOrigin;
  readonly name?: string | null;
};

export type CreateStickerOutcome =
  | { readonly kind: 'created'; readonly sticker: StickerDefinition }
  | { readonly kind: 'existing'; readonly sticker: StickerDefinition }
  | { readonly kind: 'refused'; readonly reason: StickerImageRefusal }
  | { readonly kind: 'library-full' };

export type StickerLibraryDeps = {
  readonly prisma: PrismaClient;
  readonly files: StickerFileStore;
  readonly normalize?: (bytes: Buffer) => Promise<StickerImageOutcome>;
  readonly now?: () => Date;
  readonly newFileId?: () => string;
};

const EXTENSION: Readonly<Record<StickerMimeType, string>> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === UNIQUE_VIOLATION;
}

function cleanName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed.slice(0, STICKER_LIMITS.maxNameLength);
}

export function toStickerDefinition(row: StickerRow): StickerDefinition {
  return {
    id: row.id,
    name: row.name,
    origin: row.origin as StickerOrigin,
    mimeType: row.mimeType as StickerMimeType,
    fileUrl: row.filePath,
    width: row.width,
    height: row.height,
    sizeBytes: row.sizeBytes,
    animated: row.animated,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
  };
}

export class StickerLibrary {
  private readonly prisma: PrismaClient;
  private readonly files: StickerFileStore;
  private readonly normalize: (bytes: Buffer) => Promise<StickerImageOutcome>;
  private readonly now: () => Date;
  private readonly newFileId: () => string;

  constructor(deps: StickerLibraryDeps) {
    this.prisma = deps.prisma;
    this.files = deps.files;
    this.normalize = deps.normalize ?? normalizeStickerImage;
    this.now = deps.now ?? (() => new Date());
    this.newFileId = deps.newFileId ?? randomUUID;
  }

  async list(userId: string): Promise<readonly StickerDefinition[]> {
    const rows = await this.prisma.userSticker.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
      take: STICKER_LIMITS.maxCount,
    });
    return rows.map(toStickerDefinition);
  }

  async create(userId: string, input: CreateStickerInput): Promise<CreateStickerOutcome> {
    const contentHash = createHash('sha256').update(input.bytes).digest('hex');
    const known = await this.touchByHash(userId, contentHash);
    if (known) return { kind: 'existing', sticker: known };

    const count = await this.prisma.userSticker.count({ where: { userId } });
    if (count >= STICKER_LIMITS.maxCount) return { kind: 'library-full' };

    const outcome = await this.normalize(input.bytes);
    if ('reason' in outcome) return { kind: 'refused', reason: outcome.reason };

    const { image } = outcome as Extract<StickerImageOutcome, { ok: true }>;
    const filePath = `stickers/${userId}/${this.newFileId()}.${EXTENSION[image.mimeType]}`;
    await this.files.write(filePath, image.bytes);

    const at = this.now();
    try {
      const row = await this.prisma.userSticker.create({
        data: {
          userId,
          name: cleanName(input.name),
          origin: input.origin,
          mimeType: image.mimeType,
          filePath,
          width: image.width,
          height: image.height,
          sizeBytes: image.bytes.length,
          animated: image.animated,
          contentHash,
          createdAt: at,
          lastUsedAt: at,
        },
      });
      return { kind: 'created', sticker: toStickerDefinition(row) };
    } catch (error) {
      await this.files.remove(filePath).catch(() => undefined);
      if (!isUniqueViolation(error)) throw error;
      const raced = await this.touchByHash(userId, contentHash);
      if (!raced) throw error;
      return { kind: 'existing', sticker: raced };
    }
  }

  async markUsed(userId: string, stickerId: string): Promise<StickerDefinition | null> {
    const owned = await this.prisma.userSticker.findFirst({ where: { id: stickerId, userId }, select: { id: true } });
    if (!owned) return null;
    const row = await this.prisma.userSticker.update({ where: { id: owned.id }, data: { lastUsedAt: this.now() } });
    return toStickerDefinition(row);
  }

  async remove(userId: string, stickerId: string): Promise<boolean> {
    const owned = await this.prisma.userSticker.findFirst({
      where: { id: stickerId, userId },
      select: { id: true, filePath: true },
    });
    if (!owned) return false;
    await this.prisma.userSticker.delete({ where: { id: owned.id } });
    await this.files.remove(owned.filePath).catch(() => undefined);
    return true;
  }

  private async touchByHash(userId: string, contentHash: string): Promise<StickerDefinition | null> {
    const existing = await this.prisma.userSticker.findFirst({ where: { userId, contentHash }, select: { id: true } });
    if (!existing) return null;
    const row = await this.prisma.userSticker.update({ where: { id: existing.id }, data: { lastUsedAt: this.now() } });
    return toStickerDefinition(row);
  }
}
