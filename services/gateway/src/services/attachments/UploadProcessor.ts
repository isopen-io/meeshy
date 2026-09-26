/**
 * Processeur d'upload des attachments
 * Gère la validation, le stockage physique et le chiffrement
 */

import { apiPath } from '@meeshy/shared/api/prefix';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import os from 'os';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { PrismaClient } from '@meeshy/shared/prisma/client';

const logger = enhancedLogger.child({ module: 'UploadProcessor' });
import {
  getAttachmentType,
  getSizeLimit,
  type AttachmentMetadata,
} from '@meeshy/shared/types/attachment';
import type { EncryptionMode } from '@meeshy/shared/types/encryption';
import {
  AttachmentEncryptionService,
  getAttachmentEncryptionService,
} from '../AttachmentEncryptionService';
import { MetadataManager } from './MetadataManager';
import { planVideoTranscode, buildVideoTranscodeArgs } from './video-transcode-plan.js';
import { isExifStrippable, stripExifFromImageBuffer } from './ExifStrip.js';
import { verifyDeclaredMimeType } from './ContentSignature.js';
import { NORMALIZED_AUDIO, normalizedAudioPath } from './audio-normalization.js';
import { UnsupportedMediaTypeError, PayloadTooLargeError } from '../../errors/custom-errors.js';

export interface FileToUpload {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * Verdict de `validateFile` (#6604). `code` distingue un refus de TAILLE
 * (413) d'un refus de TYPE (415) — les deux sont des erreurs de DEMANDE,
 * jamais de serveur, et un appelant HTTP en a besoin pour choisir le bon
 * statut plutôt que de laisser une exception nue dégénérer en 500 générique.
 */
export type AttachmentValidationVerdict =
  | { valid: true; error?: undefined; code?: undefined }
  | { valid: false; error: string; code: 'FILE_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE' };

export interface UploadResult {
  id: string;
  messageId: string | null;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  codec?: string;
  channels?: number;
  metadata?: any;
  fps?: number;
  videoCodec?: string;
  pageCount?: number;
  lineCount?: number;
  uploadedBy: string;
  isAnonymous: boolean;
  createdAt: Date;
}

export interface EncryptedUploadResult extends UploadResult {
  encryptionMetadata: {
    encryptionKey: string;
    iv: string;
    authTag: string;
    hmac: string;
    originalSize: number;
    originalHash: string;
    mode: EncryptionMode;
    thumbnailIv?: string;
    thumbnailAuthTag?: string;
  };
}

/**
 * La provenance que le client DÉCLARE : ce fichier sort-il de la caméra ou du
 * micro de l'application ?
 *
 * Rien dans un fichier ne permet de la déduire — le serveur ne peut donc que
 * croire le client, et il ne le croit que sur un booléen VRAI. `providedMetadata`
 * arrive d'un corps multipart par un canal non typé, où la chaîne `'false'` est
 * véridique : une lecture laxiste (`!!m?.capturedInApp`) déclarerait capture ce
 * qui n'en est pas une, et se tromperait donc dans le sens qui fait apparaître
 * une confirmation là où elle n'a pas lieu d'être.
 *
 * L'omission vaut « pas une capture » : c'est le cas de tous les clients qui ne
 * connaissent pas encore ce champ, et de tout fichier choisi dans une galerie.
 * @see packages/shared/utils/forward-to-publication.ts
 */
const declaredCaptureInApp = (providedMetadata?: any): boolean =>
  providedMetadata?.capturedInApp === true;

/**
 * Traduit un verdict `{valid:false}` en exception TYPÉE (#6604) — jamais un
 * `Error` nu, pour que tout appelant qui laisse l'exception s'échapper (au
 * lieu de l'avaler comme `uploadMultiple`) obtienne le bon statut HTTP via
 * `typedErrorResponse` (`errors/custom-errors.ts`) plutôt qu'un 500 générique.
 *
 * Prend `code`/`error` à PART (pas le verdict entier) : `strictNullChecks`
 * étant désactivé pour ce paquet (`tsconfig.json`), le compilateur ne
 * rétrécit pas `AttachmentValidationVerdict` sur `if (!validation.valid)`
 * assez pour prouver `code`/`error` définis à l'appel — passer les deux
 * champs contourne la preuve plutôt que de la contester.
 */
function throwUploadValidationError(code: 'FILE_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE', error: string): never {
  throw code === 'FILE_TOO_LARGE'
    ? new PayloadTooLargeError(error)
    : new UnsupportedMediaTypeError(error);
}

/**
 * Processeur d'upload des attachments
 */
export class UploadProcessor {
  private prisma: PrismaClient;
  private uploadBasePath: string;
  private publicUrl: string;
  private encryptionService: AttachmentEncryptionService;
  private metadataManager: MetadataManager;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.encryptionService = getAttachmentEncryptionService(prisma);
    // UPLOAD_PATH doit être défini dans Docker, fallback sécurisé vers /app/uploads
    this.uploadBasePath = process.env.UPLOAD_PATH || '/app/uploads';
    this.metadataManager = new MetadataManager(this.uploadBasePath);
    this.publicUrl = this.determinePublicUrl();
  }

  /**
   * Détermine l'URL publique selon l'environnement
   */
  private determinePublicUrl(): string {
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'local';

    if (process.env.PUBLIC_URL) {
      return process.env.PUBLIC_URL;
    }

    if (isProduction) {
      const domain = process.env.DOMAIN || 'meeshy.me';
      const url = `https://gate.${domain}`;
      logger.warn('PUBLIC_URL non définie, utilisation du domaine par défaut', { url });
      return url;
    }

    if (isDevelopment) {
      if (process.env.BACKEND_URL) return process.env.BACKEND_URL;
      if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;

      const port = process.env.PORT || '3000';
      const url = `http://localhost:${port}`;
      logger.warn('BACKEND_URL non définie, utilisation de localhost', { url });
      return url;
    }

    const fallback = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    logger.error('Impossible de déterminer PUBLIC_URL', { fallback });
    return fallback;
  }

  /**
   * Valide un fichier selon son type, sa taille, et — pour les familles dont
   * une signature fiable existe (image, audio, SVG, PDF) — la correspondance
   * entre le `mimeType` déclaré et le contenu réel (#5615). Site UNIQUE de
   * cette vérification pour `uploadFile`/`uploadEncryptedFile`, donc pour
   * TOUT upload REST qui passe par `AttachmentService.uploadMultiple` —
   * inscrit ou anonyme. Avant #5615, `ContentSignature.ts` ne sniffait que
   * l'exemption anonyme (`classifyAnonymousAttachment`) ; un compte inscrit
   * pouvait déclarer n'importe quel mimeType sans qu'aucun octet ne soit
   * jamais regardé.
   */
  validateFile(file: FileToUpload): AttachmentValidationVerdict {
    const attachmentType = getAttachmentType(file.mimeType, file.filename);
    const sizeLimit = getSizeLimit(attachmentType);

    if (file.size > sizeLimit) {
      const limitGB = Math.floor(sizeLimit / (1024 * 1024 * 1024));
      return {
        valid: false,
        code: 'FILE_TOO_LARGE',
        error: `Fichier trop volumineux. Taille max: ${limitGB}GB`
      };
    }

    const signatureVerdict = verifyDeclaredMimeType(file.mimeType, file.buffer);
    if (signatureVerdict.verified === false) {
      // #6604 — un type déclaré qui ne correspond pas au contenu réel est un
      // refus de MÉDIA, pas une panne serveur : le `code` laisse l'appelant
      // choisir 415 plutôt que de laisser une exception nue dégénérer en 500
      // générique (§ `throw new Error` plus bas, avalé par `uploadMultiple`
      // mais nu pour tout appelant qui ne l'avale pas).
      return { valid: false, code: 'UNSUPPORTED_MEDIA_TYPE', error: signatureVerdict.reason };
    }

    return { valid: true };
  }

  /**
   * Génère un chemin de fichier structuré: YYYY/mm/userId/filename
   */
  generateFilePath(userId: string, originalFilename: string): string {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');

    const ext = path.extname(originalFilename);
    const nameWithoutExt = path.basename(originalFilename, ext);
    const cleanName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const uniqueName = `${cleanName}_${uuidv4()}${ext}`;

    return path.join(year, month, userId, uniqueName);
  }

  /**
   * Normalise un audio en AAC/M4A (+9 dB pour la transcription et la
   * diarization). Le conteneur de SORTIE est toujours M4A, quelle que soit la
   * source (#8039) : l'AAC ne tient ni dans un WebM, ni dans un Ogg, ni dans
   * un MP3 — ffmpeg refusait ces combinaisons, et le WebM/Opus de Chrome
   * partait tel quel vers iOS, qui ne le lit pas. `null` = échec : l'appelant
   * garde l'original, une normalisation ratée ne fait pas échouer l'upload.
   */
  private async normalizeAudio(buffer: Buffer, sourceFilename: string): Promise<Buffer | null> {
    const tempInputPath = path.join(os.tmpdir(), `audio_input_${uuidv4()}${path.extname(sourceFilename) || '.bin'}`);
    const tempOutputPath = path.join(os.tmpdir(), `audio_output_${uuidv4()}${NORMALIZED_AUDIO.extension}`);
    try {
      await fs.writeFile(tempInputPath, buffer);
      // Bitrate aligné sur la source iOS (64 kbps mono AAC) — ré-encoder à
      // 128 kbps doublait la taille sans bénéfice perceptif sur de la voix.
      await this.runFfmpeg([
        '-i', tempInputPath,
        '-af', 'volume=9dB',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-ac', '1',
        '-f', NORMALIZED_AUDIO.ffmpegFormat,
        '-y',
        tempOutputPath,
      ]);
      const normalized = await fs.readFile(tempOutputPath);
      logger.debug('Audio normalisé en M4A (+9dB)', { inputBytes: buffer.length, outputBytes: normalized.length });
      return normalized;
    } catch (error) {
      logger.error('Normalisation audio échouée, original conservé', error as Error);
      return null;
    } finally {
      await fs.unlink(tempInputPath).catch(() => {});
      await fs.unlink(tempOutputPath).catch(() => {});
    }
  }

  /** Run ffmpeg with the given argv; resolves on exit 0, rejects otherwise. */
  private runFfmpeg(args: string[], timeoutMs = 5 * 60_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args);
      let stderr = '';
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('ffmpeg transcode timeout'));
      }, timeoutMs);
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-400)}`));
      });
      proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
  }

  /**
   * D-video bandwidth — downscale/transcode an oversized clip to a lighter,
   * progressively streamable H.264 mp4. Returns the new stored file (relative
   * path + size + mime) on success, or `null` to keep the original.
   *
   * Defensive by construction: flag-gated (OFF by default), bounded by a max
   * inline size, transcodes to a temp output and only swaps when the result is
   * valid AND smaller — any failure/non-benefit leaves the upload untouched.
   */
  private async maybeTranscodeVideo(
    filePath: string,
    metadata: { width?: number; height?: number; bitrate?: number; videoCodec?: string },
    fileSize: number
  ): Promise<{ filePath: string; fileSize: number; mimeType: string } | null> {
    if (process.env.VIDEO_TRANSCODE !== 'true') return null;

    const plan = planVideoTranscode({
      width: metadata.width,
      height: metadata.height,
      bitrateBps: metadata.bitrate,
      videoCodec: metadata.videoCodec,
      sizeBytes: fileSize,
    });
    if (!plan) return null;

    const maxSync = Number(process.env.VIDEO_TRANSCODE_MAX_SYNC_BYTES || 200 * 1024 * 1024);
    if (fileSize > maxSync) return null; // too large to transcode inline; leave as-is

    const inputAbs = path.join(this.uploadBasePath, filePath);
    const outputRel = filePath.replace(/\.[^.]+$/, '') + '_t.mp4';
    const outputAbs = path.join(this.uploadBasePath, outputRel);

    try {
      await this.runFfmpeg(buildVideoTranscodeArgs(inputAbs, outputAbs, plan));
      const stat = await fs.stat(outputAbs);
      if (stat.size === 0 || stat.size >= fileSize) {
        // No benefit — discard the transcode, keep the original.
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

  /**
   * Sauvegarde physiquement un fichier avec permissions sécurisées.
   * Un audio est normalisé en M4A : le fichier écrit peut alors changer
   * d'extension et de type — ce que rend `relativePath`/`mimeType`, et ce que
   * l'appelant persiste.
   */
  async saveFile(
    buffer: Buffer,
    relativePath: string,
    mimeType?: string
  ): Promise<{ size: number; relativePath: string; mimeType?: string }> {
    let finalBuffer = buffer;
    let finalPath = relativePath;
    let finalMimeType = mimeType;
    if (mimeType && mimeType.startsWith('audio/')) {
      const normalized = await this.normalizeAudio(buffer, relativePath);
      if (normalized) {
        finalBuffer = normalized;
        finalPath = normalizedAudioPath(relativePath);
        finalMimeType = NORMALIZED_AUDIO.mimeType;
      }
    } else if (mimeType && isExifStrippable(mimeType)) {
      // #3627 — EXIF/GPS retiré AVANT persistance : c'est ce fichier que
      // `GET /attachments/:id` sert tel quel. `mimeType` absent (chemin
      // chiffré) saute cette branche sans y penser — le serveur ne peut pas
      // lire un buffer E2EE en clair de toute façon.
      try {
        finalBuffer = await stripExifFromImageBuffer(buffer, mimeType);
      } catch (error) {
        logger.warn('EXIF strip failed, storing original bytes', error as Error);
      }
    }

    const fullPath = path.join(this.uploadBasePath, finalPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, finalBuffer);

    try {
      await fs.chmod(fullPath, 0o644);
    } catch (error) {
      logger.error('Impossible de modifier les permissions du fichier', error as Error);
    }

    return { size: finalBuffer.length, relativePath: finalPath, mimeType: finalMimeType };
  }

  /**
   * Génère une URL publique pour un fichier
   */
  getAttachmentUrl(filePath: string): string {
    return `${this.publicUrl}${apiPath(`/attachments/file/${encodeURIComponent(filePath)}`)}`;
  }

  /**
   * CE QUI SE PERSISTE — la CLÉ DE STOCKAGE, jamais une adresse (#4324, #7022).
   *
   * Elle valait `apiPath('/attachments/file/<clé percent-encodée>')` : une
   * ROUTE, et donc une décision de déploiement (le préfixe, la version) gravée
   * dans la donnée. 539 `MessageAttachment` et 35 `PostMedia` la portent en
   * production, la dernière écrite le 2026-09-16 — ce producteur était VIVANT,
   * et normaliser la base avant de le tarir aurait payé une migration pour un
   * sursis : chaque téléversement suivant regravait la route.
   *
   * La clé est la forme que `tus-handler` écrit déjà (`const fileUrl = relPath`)
   * et que les quatre surfaces vivantes savent lire — `resolveAttachmentSrc`
   * (web-v2) en fait son cas NOMINAL, `MeeshyConfig.resolveMediaURL` (iOS) a sa
   * branche explicite, et la passerelle recompose partout où ça compte
   * (`publicMediaUrlFromEnv` pour le fil push, `relativePathFromUrl` pour les
   * octets). Rendre la clé ne leur AJOUTE aucune forme à supporter : elle en
   * RETIRE une.
   *
   * La fonction est l'identité sur `filePath`, et c'est le fait à retenir : la
   * colonne d'adresse (`fileUrl`) et la colonne de disque (`filePath`) portent
   * désormais la MÊME valeur. Ce site reste nommé parce qu'il porte la
   * DÉCISION — ce que la base reçoit se change ici, pas aux cinq appels.
   */
  getAttachmentPath(filePath: string): string {
    return filePath;
  }

  /**
   * Construit l'URL complète à partir d'un chemin relatif
   */
  buildFullUrl(relativePath: string): string {
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
      return relativePath;
    }
    return `${this.publicUrl}${relativePath}`;
  }

  /**
   * Upload un fichier standard (non chiffré)
   */
  async uploadFile(
    file: FileToUpload,
    userId: string,
    isAnonymous: boolean = false,
    messageId?: string,
    providedMetadata?: any
  ): Promise<UploadResult> {
    logger.debug('uploadFile called', {
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
    });

    const validation = this.validateFile(file);
    if (!validation.valid) {
      logger.error('Validation échouée', { error: validation.error, code: validation.code });
      throwUploadValidationError(validation.code, validation.error);
    }

    const saved = await this.saveFile(file.buffer, this.generateFilePath(userId, file.filename), file.mimeType);
    const filePath = saved.relativePath;
    const savedMimeType = saved.mimeType ?? file.mimeType;

    const attachmentType = getAttachmentType(file.mimeType, file.filename);
    let metadata = await this.metadataManager.extractMetadata(
      filePath,
      attachmentType,
      savedMimeType,
      providedMetadata,
      saved.size  // Passer la taille du fichier RÉELLEMENT écrit (EXIF/audio peuvent la changer)
    );

    // The stored representation may diverge from the upload after transcoding
    // (e.g. video → capped-resolution H.264 mp4). Everything persisted below
    // (URL, size, mime, dimensions) reads these, not the raw upload.
    let storedFilePath = filePath;
    let storedFileSize = saved.size;
    let storedMimeType = savedMimeType;

    let thumbnailPath: string | null = null;
    let imageVariants: Array<{ width: number; height: number; url: string; size: number; format: 'webp' }> | undefined;
    if (attachmentType === 'image') {
      thumbnailPath = await this.metadataManager.generateThumbnail(filePath);
      // D4: responsive WebP variants for srcset — plaintext images only.
      const variants = await this.metadataManager.generateImageVariants(filePath);
      if (variants.length > 0) {
        imageVariants = variants.map((v) => ({
          width: v.width,
          height: v.height,
          url: this.getAttachmentPath(v.path),
          size: v.size,
          format: 'webp' as const,
        }));
      }
    } else if (attachmentType === 'video') {
      thumbnailPath = await this.metadataManager.generateVideoThumbnail(filePath);
      // D-video: downscale/transcode oversized clips to a lighter, progressively
      // streamable H.264 mp4 (flag-gated, OFF by default; original kept on any
      // failure or non-benefit). Re-probe so persisted dimensions/size match.
      const transcoded = await this.maybeTranscodeVideo(filePath, metadata, file.size);
      if (transcoded) {
        storedFilePath = transcoded.filePath;
        storedFileSize = transcoded.fileSize;
        storedMimeType = transcoded.mimeType;
        try {
          metadata = await this.metadataManager.extractMetadata(
            storedFilePath, attachmentType, storedMimeType, undefined, storedFileSize
          );
        } catch {
          // Keep prior metadata (dimensions ~unchanged after a downscale-fit);
          // never fail the upload over a re-probe.
        }
      }
    }
    metadata.thumbnailGenerated = !!thumbnailPath;

    // ThumbHash: backend fallback — skip if client already computed it.
    // Defense-in-depth length cap (cf. tus-handler.ts) — protège contre un
    // payload malformé / malveillant qui ferait gonfler la doc DB.
    const MAX_THUMBHASH_LENGTH = 100;
    const rawClientThumbHash = providedMetadata?.thumbHash ?? null;
    let thumbHash: string | null =
      (rawClientThumbHash && rawClientThumbHash.length <= MAX_THUMBHASH_LENGTH)
        ? rawClientThumbHash
        : null;
    if (!thumbHash) {
      const { ThumbHashGenerator } = await import('./ThumbHashGenerator.js');
      thumbHash = await ThumbHashGenerator.generate(path.join(this.uploadBasePath, storedFilePath), storedMimeType);
    }

    const fileUrl = this.getAttachmentPath(storedFilePath);
    const thumbnailUrl = thumbnailPath ? this.getAttachmentPath(thumbnailPath) : undefined;
    const finalMessageId = messageId || null;

    const metadataJson = metadata.audioEffectsTimeline
      ? { audioEffectsTimeline: metadata.audioEffectsTimeline } as any
      : undefined;

    const attachment = await this.prisma.messageAttachment.create({
      data: {
        messageId: finalMessageId,
        fileName: path.basename(storedFilePath),
        originalName: file.filename,
        mimeType: storedMimeType,
        fileSize: storedFileSize,
        filePath: storedFilePath,
        fileUrl: fileUrl,
        thumbnailPath: thumbnailPath || undefined,
        thumbnailUrl: thumbnailUrl,
        thumbHash: thumbHash || undefined,
        imageVariants: imageVariants as any,
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        bitrate: metadata.bitrate,
        sampleRate: metadata.sampleRate,
        codec: metadata.codec,
        channels: metadata.channels,
        fps: metadata.fps,
        videoCodec: metadata.videoCodec,
        pageCount: metadata.pageCount,
        lineCount: metadata.lineCount,
        metadata: metadataJson,
        uploadedBy: userId,
        isAnonymous: isAnonymous,
        capturedInApp: declaredCaptureInApp(providedMetadata),
      },
    });

    return {
      id: attachment.id,
      messageId: attachment.messageId,
      fileName: attachment.fileName,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      fileUrl: attachment.fileUrl,
      thumbnailUrl: attachment.thumbnailUrl || undefined,
      width: attachment.width || undefined,
      height: attachment.height || undefined,
      duration: attachment.duration || undefined,
      bitrate: attachment.bitrate || undefined,
      sampleRate: attachment.sampleRate || undefined,
      codec: attachment.codec || undefined,
      channels: attachment.channels || undefined,
      metadata: attachment.metadata || undefined,
      fps: attachment.fps || undefined,
      videoCodec: attachment.videoCodec || undefined,
      pageCount: attachment.pageCount || undefined,
      lineCount: attachment.lineCount || undefined,
      uploadedBy: attachment.uploadedBy,
      isAnonymous: attachment.isAnonymous,
      createdAt: attachment.createdAt,
    };
  }

  /**
   * Upload un fichier chiffré (E2EE)
   */
  async uploadEncryptedFile(
    file: FileToUpload,
    userId: string,
    encryptionMode: EncryptionMode,
    isAnonymous: boolean = false,
    messageId?: string,
    providedMetadata?: any
  ): Promise<EncryptedUploadResult> {
    logger.debug('uploadEncryptedFile called', {
      filename: file.filename,
      encryptionMode,
    });

    const validation = this.validateFile(file);
    if (!validation.valid) {
      throwUploadValidationError(validation.code, validation.error);
    }

    const attachmentType = getAttachmentType(file.mimeType, file.filename);

    // Amplifier l'audio AVANT chiffrement pour améliorer la transcription/diarization
    let fileBuffer = file.buffer;
    let storedMimeType = file.mimeType;
    if (attachmentType === 'audio') {
      const normalized = await this.normalizeAudio(file.buffer, file.filename);
      if (normalized) {
        fileBuffer = normalized;
        storedMimeType = NORMALIZED_AUDIO.mimeType;
      }
    }

    let thumbnailBuffer: Buffer | undefined;
    if (attachmentType === 'image') {
      thumbnailBuffer = await this.metadataManager.generateThumbnailFromBuffer(fileBuffer);
    } else if (attachmentType === 'video') {
      thumbnailBuffer = await this.metadataManager.generateVideoThumbnailFromBuffer(fileBuffer, file.mimeType);
    }

    const encryptionResult = await this.encryptionService.encryptAttachment({
      fileBuffer: fileBuffer,
      filename: file.filename,
      mimeType: storedMimeType,
      mode: encryptionMode,
      thumbnailBuffer,
    });

    const filePath = this.generateFilePath(userId, `${file.filename}.enc`);
    await this.saveFile(encryptionResult.encryptedBuffer, filePath);

    let thumbnailPath: string | undefined;
    if (encryptionResult.encryptedThumbnail) {
      const thumbPath = filePath.replace('.enc', '_thumb.enc');
      await this.saveFile(encryptionResult.encryptedThumbnail.buffer, thumbPath);
      thumbnailPath = thumbPath;
    }

    let serverCopyPath: string | undefined;
    if (encryptionResult.serverCopy && attachmentType === 'audio') {
      serverCopyPath = this.generateFilePath(userId, `${file.filename}.server.enc`);
      await this.saveFile(encryptionResult.serverCopy.encryptedBuffer, serverCopyPath);
    }

    const metadata: AttachmentMetadata = {};

    if (attachmentType === 'image') {
      const imageMeta = await this.metadataManager.extractImageMetadataFromBuffer(fileBuffer);
      metadata.width = imageMeta.width;
      metadata.height = imageMeta.height;
    }

    if (attachmentType === 'audio' && providedMetadata) {
      metadata.duration = Math.round(providedMetadata.duration || 0);
      metadata.bitrate = providedMetadata.bitrate || 0;
      metadata.sampleRate = providedMetadata.sampleRate || 0;
      metadata.codec = providedMetadata.codec || 'unknown';
      metadata.channels = providedMetadata.channels || 1;
      if (providedMetadata.audioEffectsTimeline) {
        metadata.audioEffectsTimeline = providedMetadata.audioEffectsTimeline;
      }
    }

    const fileUrl = this.getAttachmentPath(filePath);
    const thumbnailUrl = thumbnailPath ? this.getAttachmentPath(thumbnailPath) : undefined;

    const metadataJson = metadata.audioEffectsTimeline
      ? { audioEffectsTimeline: metadata.audioEffectsTimeline } as any
      : undefined;

    const attachment = await this.prisma.messageAttachment.create({
      data: {
        messageId: messageId || null,
        fileName: path.basename(filePath),
        originalName: file.filename,
        mimeType: storedMimeType,
        fileSize: encryptionResult.metadata.encryptedSize,
        filePath: filePath,
        fileUrl: fileUrl,
        thumbnailPath: thumbnailPath,
        thumbnailUrl: thumbnailUrl,
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        bitrate: metadata.bitrate,
        sampleRate: metadata.sampleRate,
        codec: metadata.codec,
        channels: metadata.channels,
        metadata: metadataJson,
        uploadedBy: userId,
        isAnonymous: isAnonymous,
        capturedInApp: declaredCaptureInApp(providedMetadata),
        isEncrypted: true,
        encryptionMode: encryptionMode,
        encryptionIv: encryptionResult.metadata.iv,
        encryptionAuthTag: encryptionResult.metadata.authTag,
        encryptionHmac: encryptionResult.metadata.hmac,
        originalFileHash: encryptionResult.metadata.originalHash,
        encryptedFileHash: encryptionResult.metadata.encryptedHash,
        originalFileSize: encryptionResult.metadata.originalSize,
        serverKeyId: encryptionResult.serverCopy?.keyId,
        thumbnailEncryptionIv: encryptionResult.encryptedThumbnail?.iv,
        thumbnailEncryptionAuthTag: encryptionResult.encryptedThumbnail?.authTag,
      },
    });

    return {
      id: attachment.id,
      messageId: attachment.messageId,
      fileName: attachment.fileName,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      fileUrl: attachment.fileUrl,
      thumbnailUrl: attachment.thumbnailUrl || undefined,
      width: attachment.width || undefined,
      height: attachment.height || undefined,
      duration: attachment.duration || undefined,
      bitrate: attachment.bitrate || undefined,
      sampleRate: attachment.sampleRate || undefined,
      codec: attachment.codec || undefined,
      channels: attachment.channels || undefined,
      metadata: attachment.metadata || undefined,
      uploadedBy: attachment.uploadedBy,
      isAnonymous: attachment.isAnonymous,
      createdAt: attachment.createdAt,
      encryptionMetadata: {
        encryptionKey: encryptionResult.metadata.encryptionKey,
        iv: encryptionResult.metadata.iv,
        authTag: encryptionResult.metadata.authTag,
        hmac: encryptionResult.metadata.hmac,
        originalSize: encryptionResult.metadata.originalSize,
        originalHash: encryptionResult.metadata.originalHash,
        mode: encryptionResult.metadata.mode,
        thumbnailIv: encryptionResult.encryptedThumbnail?.iv,
        thumbnailAuthTag: encryptionResult.encryptedThumbnail?.authTag,
      },
    };
  }

  /**
   * Upload multiple fichiers
   */
  async uploadMultiple(
    files: FileToUpload[],
    userId: string,
    isAnonymous: boolean = false,
    messageId?: string,
    metadataMap?: Map<number, any>
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const fileMetadata = metadataMap?.get(i);
        const result = await this.uploadFile(file, userId, isAnonymous, messageId, fileMetadata);
        results.push(result);
        logger.info('Fichier uploadé', { filename: file.filename, sizeMB: (file.size / (1024 * 1024)).toFixed(1) });
      } catch (error) {
        logger.error('Erreur upload fichier', error as Error);
      }
    }

    logger.info('Résultat upload', { uploaded: results.length, total: files.length });
    return results;
  }

  /**
   * Crée un attachment depuis du texte
   */
  async createTextAttachment(
    content: string,
    userId: string,
    isAnonymous: boolean = false,
    messageId?: string
  ): Promise<UploadResult> {
    const filename = `text_${Date.now()}.txt`;
    const buffer = Buffer.from(content, 'utf-8');

    return this.uploadFile(
      {
        buffer,
        filename,
        mimeType: 'text/plain',
        size: buffer.length,
      },
      userId,
      isAnonymous,
      messageId
    );
  }
}
