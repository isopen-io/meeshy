/**
 * LES FICHIERS DES PACKS DE STICKERS DE TIERS, SERVIS PAR LEUR CONTENU (#10188).
 *
 * Les packs officiels vivent dans l'image (`assets/packs/`, liste blanche
 * calculée au démarrage, `PackIndex`). Ceux des tiers vivent dans le volume des
 * téléversements, un dossier par proposition (`sticker-packs/<id>/<clé>.<ext>`),
 * parce que ce volume les POSSÈDE pack par pack : un refus remplacé, une purge
 * de compte (LP3) retirent les fichiers d'UNE proposition sans toucher ceux
 * d'une autre. Les dédupliquer sur le disque ferait supprimer, avec un pack,
 * les octets identiques d'un autre.
 *
 * L'adressage par contenu est donc LOGIQUE : la proposition grave l'empreinte
 * des octets gardés (`StickerPackItem.sha256`) et ce module résout une adresse
 * `<sha16>.<ext>` vers ces octets — d'un pack PUBLIÉ seulement (la porte est
 * publique, elle ne précède jamais la modération), de l'extension que le type
 * gardé produit, et dont le contenu relu porte TOUJOURS l'empreinte annoncée :
 * un fichier altéré sur le volume ne se sert jamais sous une adresse
 * immuable qui n'est plus la sienne.
 *
 * Une même image peut servir deux packs : elle se sert dès que l'UN est publié
 * (mêmes octets, même empreinte), comme les fichiers des lens (`LensPacks`).
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { stickerPackAssetContentType } from '@meeshy/shared/types/sticker-pack-asset';
import { prefixRange } from '../../utils/prefix-range';

export interface StickerPackFileReader {
  /** Les octets d'un fichier du volume, `null` s'il n'y est pas (ou s'il sortirait de sa racine). */
  read(relativePath: string): Promise<Buffer | null>;
}

export type StickerPackFile = { readonly bytes: Buffer; readonly contentType: string };

export type StickerPackAssetsDeps = {
  readonly prisma: Pick<PrismaClient, 'stickerPack' | 'stickerPackItem'>;
  readonly files: StickerPackFileReader;
};

export const sha256Hex = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

const isMissing = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'EISDIR' || code === 'ENOTDIR';
};

/** Le volume réel, confiné à sa racine : un chemin qui en sortirait rend `null`, jamais un fichier. */
export function diskStickerPackFileReader(basePath: string): StickerPackFileReader {
  const root = path.resolve(basePath);
  return {
    read: async (relativePath) => {
      const absolute = path.resolve(root, relativePath);
      if (!absolute.startsWith(`${root}${path.sep}`)) return null;
      try {
        return await fs.readFile(absolute);
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
  };
}

export const defaultStickerPackFileReader = (): StickerPackFileReader => diskStickerPackFileReader(process.env.UPLOAD_PATH || '/app/uploads');

type Candidate = { readonly packId: string; readonly filePath: string; readonly sha256: string | null; readonly mimeType: string };

export class StickerPackAssets {
  private readonly prisma: StickerPackAssetsDeps['prisma'];
  private readonly files: StickerPackFileReader;

  constructor(deps: StickerPackAssetsDeps) {
    this.prisma = deps.prisma;
    this.files = deps.files;
  }

  /**
   * Une adresse `<sha16>.png|webp|gif` appartient-elle à un pack PUBLIÉ ? Deux lectures de base, aucune lecture du
   * volume ni hachage : c'est la réponse d'une revalidation (304), dont le client détient déjà les octets de l'empreinte.
   */
  async isApproved(src: string): Promise<boolean> {
    return (await this.publishedCandidates(src)).length > 0;
  }

  /** Les octets d'une adresse `<sha16>.png|webp|gif`, d'un pack PUBLIÉ et intacts — `null` sinon. */
  async approvedFile(src: string): Promise<StickerPackFile | null> {
    const contentType = stickerPackAssetContentType(src);
    if (contentType === null) return null;
    for (const candidate of await this.publishedCandidates(src)) {
      const bytes = await this.files.read(candidate.filePath);
      if (bytes !== null && sha256Hex(bytes) === candidate.sha256) return { bytes, contentType };
    }
    return null;
  }

  private async publishedCandidates(src: string): Promise<readonly Candidate[]> {
    const contentType = stickerPackAssetContentType(src);
    if (contentType === null) return [];
    const rows: readonly Candidate[] = await this.prisma.stickerPackItem.findMany({
      where: { sha256: prefixRange(src.slice(0, 16)) },
      select: { packId: true, filePath: true, sha256: true, mimeType: true },
    });
    const candidates = rows.filter((row) => row.mimeType === contentType && row.sha256 !== null);
    if (candidates.length === 0) return [];
    const published = await this.prisma.stickerPack.findMany({
      where: { id: { in: [...new Set(candidates.map((row) => row.packId))] }, status: 'approved' },
      select: { id: true },
    });
    const publishedIds = new Set(published.map((pack) => pack.id));
    return candidates.filter((row) => publishedIds.has(row.packId));
  }
}

