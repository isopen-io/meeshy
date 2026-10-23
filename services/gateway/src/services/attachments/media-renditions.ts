import { promises as fs } from 'fs';
import path from 'path';
import type { Prisma } from '@meeshy/shared/prisma/client';
import type { AttachmentMetadata, ImageVariant } from '@meeshy/shared/types/attachment';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { ThumbHashGenerator } from './ThumbHashGenerator.js';
import { planVideoTranscode, buildVideoTranscodeArgs } from './video-transcode-plan.js';
import type { MediaRendition } from '@meeshy/shared/types/attachment';
import { produceCompatibilityRendition, type VideoRendition } from './video-compat-rendition.js';
import { convertStoredHeif } from './heif-conversion.js';
import { timeMediaStage } from '../metrics/mediaStageMetrics';

const logger = enhancedLogger.child({ module: 'media-renditions' });

/**
 * LA FABRIQUE UNIQUE DES RENDUS D'UN MÉDIA TÉLÉVERSÉ (#11260).
 *
 * Deux portes d'entrée écrivent un média sur disque : le multipart
 * (`UploadProcessor.uploadFile`) et le résumable TUS (`onUploadFinish`). La
 * seconde ne produisait que la vignette et le thumbhash ; ni les variantes
 * WebP responsives (D4), ni le plan de transcodage vidéo (D-video) n'y
 * étaient appelés — un même fichier donnait donc deux médias différents selon
 * son poids (TUS ne sert que les gros fichiers, ceux qui en ont le plus
 * besoin). Ce module est le SEUL endroit où ces rendus se décident ; les deux
 * portes l'appellent avec la même entrée et obtiennent la même sortie.
 *
 * Ce que la fabrique ne fait pas : lire la requête, choisir la table
 * (`PostMedia` / `MessageAttachment`) ou écrire en base. Elle rend des
 * VALEURS ; l'appelant persiste.
 *
 * ─── LE CHEMIN CHIFFRÉ N'EST PAS DU E2EE ────────────────────────────────────
 * `UploadProcessor.uploadEncryptedFile` reçoit le CLAIR et chiffre côté
 * serveur : le serveur voit le fichier. Ce n'est PAS du chiffrement de bout en
 * bout au sens de #9224 (où le serveur ne voit jamais le clair). Il n'en
 * respecte pas moins une règle de rendu : AUCUN rendu en clair ne survit. Ni
 * variante WebP, ni thumbhash serveur (un flou d'image lisible dans une
 * colonne en clair), ni transcodage sur disque. Seule la vignette est
 * fabriquée — en TAMPON, `produceEncryptedThumbnail` — puis chiffrée avec le
 * fichier.
 */

/** Plafond d'un thumbhash client : un thumbhash base64 fait ~28-33 caractères. */
export const MAX_THUMBHASH_LENGTH = 100;

/** Ce que la fabrique demande au gestionnaire de métadonnées, et rien de plus. */
export interface RenditionMetadataPort {
  generateThumbnail(imagePath: string): Promise<string | null>;
  generateImageVariants(
    imagePath: string
  ): Promise<ReadonlyArray<{ path: string; width: number; height: number; size: number }>>;
  generateAvifVariants(
    imagePath: string
  ): Promise<ReadonlyArray<{ path: string; width: number; height: number; size: number }>>;
  generateVideoThumbnail(videoPath: string): Promise<string | null>;
  extractMetadata(
    filePath: string,
    attachmentType: string,
    mimeType: string,
    providedMetadata?: unknown,
    fileSize?: number
  ): Promise<AttachmentMetadata>;
}

export interface RenditionDeps {
  readonly uploadBasePath: string;
  readonly metadataManager: RenditionMetadataPort;
  readonly runFfmpeg: (args: string[]) => Promise<void>;
}

export interface RenditionSource {
  /** Clé de stockage du fichier écrit, relative à `uploadBasePath`. */
  readonly relPath: string;
  readonly mimeType: string;
  readonly attachmentType: string;
  readonly fileSize: number;
  /** Métadonnées déjà extraites du fichier écrit. */
  readonly metadata: AttachmentMetadata;
  readonly clientThumbHash?: string | null;
}

export interface MediaRenditions {
  /** Le fichier à servir : l'original, ou le rendu transcodé qui l'a remplacé. */
  readonly storedPath: string;
  readonly storedSize: number;
  readonly storedMimeType: string;
  readonly metadata: AttachmentMetadata;
  readonly thumbnailPath: string | null;
  /** Absent (et non vide) quand aucune variante n'existe : le champ est optionnel en base. */
  readonly imageVariants?: readonly ImageVariant[];
  /** #11262 — les variantes AVIF, à CÔTÉ des WebP : absent quand aucune n'existe. */
  readonly avifVariants?: readonly ImageVariant[];
  /** #11261, #11263 — autres encodages du même média (H.264 d'un HEVC, original HEIC/AVIF) ; absent quand il n'y en a pas. */
  readonly renditions?: readonly MediaRendition[];
  readonly thumbHash: string | null;
}

export async function produceMediaRenditions(
  deps: RenditionDeps,
  received: RenditionSource
): Promise<MediaRenditions> {
  const converted = received.attachmentType === 'image'
    ? await convertStoredHeif(deps.uploadBasePath, received.relPath, received.mimeType)
    : null;
  const source: RenditionSource = converted === null
    ? received
    : {
      ...received,
      relPath: converted.relPath,
      mimeType: converted.mimeType,
      fileSize: converted.fileSize,
      metadata: await attempt(
        'converted image metadata',
        () => deps.metadataManager.extractMetadata(converted.relPath, received.attachmentType, converted.mimeType, undefined, converted.fileSize),
        received.metadata,
      ),
    };
  const { attachmentType } = source;
  const visual = await visualRenditions(deps.metadataManager, source);

  const transcoded = attachmentType === 'video' ? await transcodeVideoRendition(deps, source) : null;
  const compat = attachmentType === 'video' && transcoded === null
    ? await attempt('compat rendition', () => produceCompatibilityRendition(deps, source), null)
    : null;
  const storedPath = transcoded?.filePath ?? source.relPath;
  const storedSize = transcoded?.fileSize ?? source.fileSize;
  const storedMimeType = transcoded?.mimeType ?? source.mimeType;
  const probed = transcoded ? await reprobe(deps.metadataManager, source, transcoded) : source.metadata;
  const renditions = [...(converted ? [converted.original] : []), ...(compat ? [compat] : [])];

  const thumbHash = await resolveThumbHash({
    clientThumbHash: source.clientThumbHash,
    absolutePath: path.join(deps.uploadBasePath, storedPath),
    mimeType: storedMimeType,
    attachmentType,
  });

  return {
    storedPath,
    storedSize,
    storedMimeType,
    metadata: { ...probed, thumbnailGenerated: visual.thumbnailPath !== null },
    thumbnailPath: visual.thumbnailPath,
    ...(visual.imageVariants ? { imageVariants: visual.imageVariants } : {}),
    ...(visual.avifVariants ? { avifVariants: visual.avifVariants } : {}),
    ...(renditions.length > 0 ? { renditions } : {}),
    thumbHash,
  };
}

async function visualRenditions(
  metadataManager: RenditionMetadataPort,
  source: RenditionSource
): Promise<{ thumbnailPath: string | null; imageVariants?: readonly ImageVariant[]; avifVariants?: readonly ImageVariant[] }> {
  if (source.attachmentType === 'image') {
    const thumbnailPath = await attempt('thumbnail', () => metadataManager.generateThumbnail(source.relPath), null);
    const variants = await attempt('image variants', () => metadataManager.generateImageVariants(source.relPath), []);
    const avif = await attempt('avif variants', () => metadataManager.generateAvifVariants(source.relPath), []);
    return {
      thumbnailPath,
      ...(variants.length > 0 ? { imageVariants: variants.map((v) => toImageVariant(v, 'webp')) } : {}),
      ...(avif.length > 0 ? { avifVariants: avif.map((v) => toImageVariant(v, 'avif')) } : {}),
    };
  }
  if (source.attachmentType === 'video') {
    const thumbnailPath = await attempt('video thumbnail', () => metadataManager.generateVideoThumbnail(source.relPath), null);
    return { thumbnailPath };
  }
  return { thumbnailPath: null };
}

/** Un rendu manqué ne fait jamais échouer l'upload : le média reste servi tel quel. */
async function attempt<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    logger.warn(`Rendu non généré (${label}), média conservé tel quel`, { error });
    return fallback;
  }
}

/** Les variantes se désignent par leur CLÉ DE STOCKAGE, jamais une adresse (#4324). */
function toImageVariant(variant: { path: string; width: number; height: number; size: number }, format: ImageVariant['format']): ImageVariant {
  return { width: variant.width, height: variant.height, url: variant.path, size: variant.size, format };
}

/**
 * La forme que la colonne `imageVariants` (`Json?`) reçoit. Un littéral
 * d'objet, et non l'interface partagée : Prisma n'accepte en JSON que des
 * objets à signature d'index.
 */
export function imageVariantsJson(variants: readonly ImageVariant[]): Prisma.InputJsonArray {
  return variants.map(({ width, height, url, size, format }) => ({ width, height, url, size, format }));
}

/** La forme que la colonne `renditions` (`Json?`) reçoit (#11261, #11263). */
export function renditionsJson(renditions: readonly MediaRendition[]): Prisma.InputJsonArray {
  return renditions.map(({ codec, mimeType, url, width, height, size }) => ({ codec, ...(mimeType ? { mimeType } : {}), url, width, height, size }));
}

export interface TranscodedVideo {
  readonly filePath: string;
  readonly fileSize: number;
  readonly mimeType: string;
}

/**
 * D-video bandwidth — descend un clip trop lourd vers un mp4 H.264 plus léger
 * et lisible en progressif. Rend le nouveau fichier (clé, taille, type) ou
 * `null` pour garder l'original.
 *
 * Défensif par construction : drapeau (`VIDEO_TRANSCODE`, ÉTEINT par défaut),
 * borné par une taille synchrone maximale, sortie temporaire, échange
 * seulement si le résultat est valide ET plus petit. Tout échec laisse
 * l'upload intact.
 */
export async function transcodeVideoRendition(
  deps: Pick<RenditionDeps, 'uploadBasePath' | 'runFfmpeg'>,
  source: Pick<RenditionSource, 'relPath' | 'metadata' | 'fileSize'>
): Promise<TranscodedVideo | null> {
  if (process.env.VIDEO_TRANSCODE !== 'true') return null;

  const plan = planVideoTranscode({
    width: source.metadata.width,
    height: source.metadata.height,
    bitrateBps: source.metadata.bitrate,
    videoCodec: source.metadata.videoCodec,
    sizeBytes: source.fileSize,
  });
  if (!plan) return null;

  const maxSync = Number(process.env.VIDEO_TRANSCODE_MAX_SYNC_BYTES || 200 * 1024 * 1024);
  if (source.fileSize > maxSync) return null;

  const inputAbs = path.join(deps.uploadBasePath, source.relPath);
  const outputRel = source.relPath.replace(/\.[^.]+$/, '') + '_t.mp4';
  const outputAbs = path.join(deps.uploadBasePath, outputRel);

  try {
    await timeMediaStage('transcode', 'video', () => deps.runFfmpeg(buildVideoTranscodeArgs(inputAbs, outputAbs, plan)));
    const stat = await fs.stat(outputAbs);
    if (stat.size === 0 || stat.size >= source.fileSize) {
      await fs.unlink(outputAbs).catch(() => {});
      return null;
    }
    await fs.unlink(inputAbs).catch(() => {});
    return { filePath: outputRel, fileSize: stat.size, mimeType: 'video/mp4' };
  } catch (error) {
    logger.error('Video transcode failed, keeping original', error as Error);
    await fs.unlink(outputAbs).catch(() => {});
    return null;
  }
}

/** Le fichier rendu a d'autres dimensions et un autre débit : on le re-sonde, sans jamais échouer l'upload. */
async function reprobe(
  metadataManager: RenditionMetadataPort,
  source: RenditionSource,
  transcoded: TranscodedVideo
): Promise<AttachmentMetadata> {
  try {
    return await metadataManager.extractMetadata(
      transcoded.filePath, source.attachmentType, transcoded.mimeType, undefined, transcoded.fileSize
    );
  } catch {
    return source.metadata;
  }
}

/**
 * Le thumbhash du client prime quand il tient dans le plafond ; sinon le
 * serveur le calcule (image, vidéo). Le plafond protège le document en base
 * contre un blob malformé ou malveillant.
 */
async function resolveThumbHash(params: {
  readonly clientThumbHash?: string | null;
  readonly absolutePath: string;
  readonly mimeType: string;
  readonly attachmentType: string;
}): Promise<string | null> {
  const { clientThumbHash } = params;
  if (clientThumbHash && clientThumbHash.length <= MAX_THUMBHASH_LENGTH) return clientThumbHash;
  if (clientThumbHash) {
    logger.warn(`Rejecting oversized client thumbHash (${clientThumbHash.length} chars)`);
  }
  if (params.attachmentType !== 'image' && params.attachmentType !== 'video') return null;
  try {
    return await ThumbHashGenerator.generate(params.absolutePath, params.mimeType);
  } catch (error) {
    logger.warn('ThumbHash generation failed', { error });
    return null;
  }
}

export interface EncryptedThumbnailPort {
  generateThumbnailFromBuffer(buffer: Buffer): Promise<Buffer | undefined>;
  generateVideoThumbnailFromBuffer(buffer: Buffer, mimeType: string): Promise<Buffer | undefined>;
}

/**
 * La SEULE chose que le chemin chiffré fabrique à partir du clair : une
 * vignette en tampon, que l'appelant chiffre avec le fichier. Voir l'en-tête
 * du module : ce chemin reçoit le clair, ce n'est pas du E2EE (#9224).
 */
export async function produceEncryptedThumbnail(params: {
  readonly metadataManager: EncryptedThumbnailPort;
  readonly attachmentType: string;
  readonly buffer: Buffer;
  readonly mimeType: string;
}): Promise<Buffer | undefined> {
  if (params.attachmentType === 'image') {
    return params.metadataManager.generateThumbnailFromBuffer(params.buffer);
  }
  if (params.attachmentType === 'video') {
    return params.metadataManager.generateVideoThumbnailFromBuffer(params.buffer, params.mimeType);
  }
  return undefined;
}
