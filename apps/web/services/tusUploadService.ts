import { Upload } from 'tus-js-client';
import {
  MAX_CONCURRENT_UPLOADS,
  TUS_CHUNK_SIZE,
  SMALL_FILE_THRESHOLD,
  MAX_ATTACHMENTS_PER_MESSAGE,
  getSizeLimit,
  getAttachmentType,
  formatFileSize,
} from '@meeshy/shared/types/attachment';
import { createAuthHeaders } from '@/utils/token-utils';
import { buildApiUrl } from '@/lib/config';
import { API_ENDPOINTS } from '@meeshy/shared/api/endpoints';
import { apiService } from '@/services/api.service';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

/**
 * Extrait le statut HTTP d'une erreur tus-js-client sans dépendre de la classe
 * `DetailedError` (duck-typing sur `originalResponse.getStatus()`, la forme
 * documentée par la bibliothèque — cf. `lib/index.d.ts`). `unknown` en entrée :
 * `onError` peut aussi recevoir une simple `Error` sans réponse HTTP.
 */
function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('originalResponse' in error)) {
    return undefined;
  }
  const originalResponse = (error as { originalResponse: unknown }).originalResponse;
  if (
    typeof originalResponse !== 'object' ||
    originalResponse === null ||
    typeof (originalResponse as { getStatus?: unknown }).getStatus !== 'function'
  ) {
    return undefined;
  }
  return (originalResponse as { getStatus: () => number }).getStatus();
}

export type FileUploadStatus = 'queued' | 'uploading' | 'complete' | 'error' | 'paused';

export type FileUploadProgress = {
  readonly fileId: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly status: FileUploadStatus;
  readonly percentage: number;
  readonly bytesUploaded: number;
  readonly error?: string;
  readonly attachment?: UploadedAttachmentResponse;
};

export type QueueProgress = {
  readonly files: readonly FileUploadProgress[];
  readonly totalFiles: number;
  readonly completedFiles: number;
  readonly totalBytes: number;
  readonly uploadedBytes: number;
  readonly globalPercentage: number;
};

type QueueItem = {
  file: File;
  fileId: string;
  metadata?: Record<string, string>;
  /**
   * Force le chemin résumable même sous `SMALL_FILE_THRESHOLD` — le transport
   * post (`attachmentTransport.ts`) l'utilise : le handler TUS est le SEUL
   * créateur de `PostMedia` côté upload, et `POST /attachments/upload`
   * (chemin direct) ne connaît aucun `uploadcontext`.
   */
  forceResumable?: boolean;
  resolve: (value: UploadedAttachmentResponse) => void;
  reject: (error: Error) => void;
};

export type TusUploadOptions = {
  /** cf. `QueueItem.forceResumable` — s'applique à TOUS les fichiers de cet appel. */
  readonly forceResumable?: boolean;
  /** Plafond du nombre de fichiers pour CET appel — défaut `MAX_ATTACHMENTS_PER_MESSAGE`. */
  readonly maxFiles?: number;
};

export class TusUploadService {
  private queue: QueueItem[] = [];
  private activeUploads = new Map<string, Upload>();
  private progress = new Map<string, FileUploadProgress>();
  private onProgressCallback?: (progress: QueueProgress) => void;

  constructor(private token?: string) {}

  setToken(token: string) {
    this.token = token;
  }

  onProgress(callback: (progress: QueueProgress) => void) {
    this.onProgressCallback = callback;
  }

  /**
   * TOUT-OU-RIEN : un fichier en échec rejette l'appel entier. C'est le
   * contrat historique, et celui dont dépend le chemin MESSAGE.
   */
  async uploadFiles(
    files: File[],
    metadataArray?: Record<string, string>[],
    options?: TusUploadOptions
  ): Promise<UploadedAttachmentResponse[]> {
    return Promise.all(this.enqueue(files, metadataArray, options));
  }

  /**
   * PAR FICHIER : rend le sort de chacun, jamais un rejet global.
   *
   * ─── POURQUOI CETTE SECONDE PORTE ─────────────────────────────────────
   * `Promise.all` fait perdre à l'utilisateur les fichiers qui ont RÉUSSI
   * dès qu'un voisin échoue : le hook tombe dans son `catch` global et purge
   * toute la sélection, pendant que les lignes `PostMedia` des réussis
   * existent déjà côté serveur — et plus aucun id ne subsiste pour les
   * relâcher. Le transport MESSAGE n'a jamais eu ce défaut : la route
   * `/attachments/upload` rend un tableau plus court sous `success: true`, et
   * l’appariement du hook (`pairUploads`) ne purge que les fichiers réellement perdus.
   * Cette variante rend au transport POST la même tolérance.
   *
   * Les refus PRÉ-VOL (plafond de nombre, taille) restent des rejets GLOBAUX :
   * rien n'est parti, donc il n'y a rien à réconcilier.
   */
  async uploadFilesSettled(
    files: File[],
    metadataArray?: Record<string, string>[],
    options?: TusUploadOptions
  ): Promise<PromiseSettledResult<UploadedAttachmentResponse>[]> {
    return Promise.allSettled(this.enqueue(files, metadataArray, options));
  }

  /**
   * Valide, met en file, démarre — et rend UNE promesse par fichier. Le sort
   * de ces promesses (toutes ensemble, ou chacune pour soi) appartient à
   * l'appelant : c'est la SEULE différence entre les deux portes ci-dessus.
   *
   * Les refus de validation LÈVENT ici, avant qu'aucune promesse n'existe —
   * ils remontent donc en rejet de l'appel, quelle que soit la porte.
   */
  private enqueue(
    files: File[],
    metadataArray?: Record<string, string>[],
    options?: TusUploadOptions
  ): Promise<UploadedAttachmentResponse>[] {
    const maxFiles = options?.maxFiles ?? MAX_ATTACHMENTS_PER_MESSAGE;
    if (files.length > maxFiles) {
      throw new Error(`Maximum ${maxFiles} files allowed per message`);
    }

    for (const file of files) {
      const type = getAttachmentType(file.type);
      const limit = getSizeLimit(type);
      if (file.size > limit) {
        throw new Error(
          `${file.name} is too large (${formatFileSize(file.size)}). Max: ${formatFileSize(limit)}`
        );
      }
    }

    const promises = files.map((file, index) => {
      const fileId = `${Date.now()}-${index}-${file.name}`;
      const metadata = metadataArray?.[index];

      this.progress.set(fileId, {
        fileId,
        fileName: file.name,
        fileSize: file.size,
        status: 'queued',
        percentage: 0,
        bytesUploaded: 0,
      });

      return new Promise<UploadedAttachmentResponse>((resolve, reject) => {
        this.queue.push({ file, fileId, metadata, forceResumable: options?.forceResumable, resolve, reject });
      });
    });

    this.emitProgress();
    this.processQueue();

    return promises;
  }

  pauseAll() {
    for (const [fileId, upload] of this.activeUploads) {
      upload.abort(true);
      const current = this.progress.get(fileId);
      if (current) {
        this.progress.set(fileId, { ...current, status: 'paused' });
      }
    }
    this.emitProgress();
  }

  resumeAll() {
    for (const [fileId, upload] of this.activeUploads) {
      const current = this.progress.get(fileId);
      if (current?.status === 'paused') {
        this.progress.set(fileId, { ...current, status: 'uploading' });
        upload.start();
      }
    }
    this.emitProgress();
  }

  abort(fileId: string) {
    const upload = this.activeUploads.get(fileId);
    if (upload) {
      upload.abort(true);
      this.activeUploads.delete(fileId);
    }
    this.queue = this.queue.filter((item) => item.fileId !== fileId);
    const current = this.progress.get(fileId);
    if (current) {
      this.progress.set(fileId, { ...current, status: 'error', error: 'Cancelled' });
    }
    this.emitProgress();
    this.processQueue();
  }

  private processQueue() {
    while (this.activeUploads.size < MAX_CONCURRENT_UPLOADS && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.startUpload(item);
    }
  }

  private startUpload(item: QueueItem) {
    const { file } = item;

    if (!item.forceResumable && file.size <= SMALL_FILE_THRESHOLD) {
      this.startDirectUpload(item);
      return;
    }

    this.startTusUpload(item);
  }

  private startTusUpload(item: QueueItem) {
    const { file, fileId, metadata, resolve, reject } = item;
    const authHeaders = createAuthHeaders(this.token) as Record<string, string>;

    const tusMetadata: Record<string, string> = {
      filename: file.name,
      filetype: file.type || 'application/octet-stream',
      ...(metadata || {}),
    };

    if (authHeaders['X-Session-Token']) {
      tusMetadata.isAnonymous = 'true';
      tusMetadata.userId = authHeaders['X-Session-Token'];
    }

    // Plafonne la reprise sur refus d'authentification à UNE tentative pour
    // cette instance d'upload (fermeture, pas un champ de QueueItem : chaque
    // gros fichier a sa propre instance tus, jamais partagée entre elles).
    let hasAttemptedAuthRetry = false;

    const upload = new Upload(file, {
      endpoint: buildApiUrl(API_ENDPOINTS.uploads.root),
      chunkSize: TUS_CHUNK_SIZE,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      metadata: tusMetadata,
      headers: authHeaders,
      onError: (error) => {
        const status = getHttpStatus(error);

        if (status === 401 && !hasAttemptedAuthRetry) {
          hasAttemptedAuthRetry = true;
          apiService.refreshAuthToken().then((refreshed) => {
            if (!refreshed) {
              this.activeUploads.delete(fileId);
              this.progress.set(fileId, {
                ...this.progress.get(fileId)!,
                status: 'error',
                error: 'Session expirée, veuillez vous reconnecter',
              });
              this.emitProgress();
              reject(new Error('Session expirée, veuillez vous reconnecter'));
              this.processQueue();
              return;
            }

            // Un jeton neuf ne sert à rien s'il n'est pas envoyé : les en-têtes
            // sont reconstruits (jamais réutilisés) sur la MÊME instance `upload`.
            // Sa propriété `url` (fixée par le POST de création, si atteint) est
            // préservée : dans le cas nominal, `start()` reprend via une requête
            // HEAD à l'offset déjà accepté par le serveur, au lieu de retéléverser
            // le fichier entier. Réserve : si ce HEAD échoue lui-même avec un statut
            // 4xx (jeton encore refusé, upload introuvable côté serveur...),
            // tus-js-client n'appelle PAS notre `onError` — elle remet `url` à
            // `null` en silence et relance une création neuve (POST), donc un
            // redémarrage depuis zéro sans aucun signal ici (`_resumeUpload` dans
            // node_modules/tus-js-client/lib/upload.js). `onError` n'est réinvoqué
            // que si cette création neuve échoue à son tour. `hasAttemptedAuthRetry`
            // borne bien la boucle à une seule tentative, mais ne garantit pas que
            // la reprise se fasse toujours depuis l'offset déjà accepté.
            upload.options.headers = createAuthHeaders(undefined) as Record<string, string>;
            upload.start();
          });
          return;
        }

        this.activeUploads.delete(fileId);
        this.progress.set(fileId, {
          ...this.progress.get(fileId)!,
          status: 'error',
          error: error.message || 'Upload failed',
        });
        this.emitProgress();
        reject(new Error(error.message || 'Upload failed'));
        this.processQueue();
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
        this.progress.set(fileId, {
          ...this.progress.get(fileId)!,
          status: 'uploading',
          percentage,
          bytesUploaded,
        });
        this.emitProgress();
      },
      onSuccess: () => {
        this.activeUploads.delete(fileId);

        let attachment: UploadedAttachmentResponse | undefined;

        try {
          const responseBody = (upload as any).lastResponse?.getBody?.();
          if (responseBody) {
            const parsed = JSON.parse(responseBody);
            attachment = parsed.data?.attachment;
          }
        } catch {
          // Response parsing failed
        }

        this.progress.set(fileId, {
          ...this.progress.get(fileId)!,
          status: 'complete',
          percentage: 100,
          bytesUploaded: file.size,
          attachment,
        });
        this.emitProgress();

        if (attachment) {
          resolve(attachment);
        } else {
          reject(new Error('Upload completed but no attachment data received'));
        }

        this.processQueue();
      },
    });

    this.activeUploads.set(fileId, upload);
    this.progress.set(fileId, {
      ...this.progress.get(fileId)!,
      status: 'uploading',
    });
    this.emitProgress();

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    });
  }

  private async startDirectUpload(item: QueueItem) {
    const { file, fileId, metadata, resolve, reject } = item;

    this.progress.set(fileId, {
      ...this.progress.get(fileId)!,
      status: 'uploading',
    });
    this.emitProgress();

    try {
      const formData = new FormData();
      formData.append('files', file);
      if (metadata) {
        formData.append('metadata_0', JSON.stringify(metadata));
      }

      const result = await this.sendDirectUploadRequest(item, formData, false);

      this.progress.set(fileId, {
        ...this.progress.get(fileId)!,
        status: 'complete',
        percentage: 100,
        bytesUploaded: file.size,
        attachment: result,
      });
      this.emitProgress();
      resolve(result);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      this.progress.set(fileId, {
        ...this.progress.get(fileId)!,
        status: 'error',
        error: errorMessage,
      });
      this.emitProgress();
      reject(error instanceof Error ? error : new Error(errorMessage));
    } finally {
      this.activeUploads.delete(fileId);
      this.processQueue();
    }
  }

  /**
   * Envoie la requête XHR d'upload direct (fichiers ≤ SMALL_FILE_THRESHOLD,
   * chemin le plus fréquenté : `POST /attachments/upload`). Sur un refus
   * d'authentification (401), retente EXACTEMENT une fois après un
   * rafraîchissement réussi du jeton — même idiome que
   * `AttachmentService.sendUploadRequest` (`attachmentService.ts`), le
   * service le plus proche : XHR non repris, donc pas de fermeture mutable
   * façon `hasAttemptedAuthRetry` de `startTusUpload` ci-dessus, mais un
   * paramètre `isRetry` porté par l'appel récursif. Un jeton neuf ne sert à
   * rien s'il n'est pas envoyé : les en-têtes sont reconstruits (jamais
   * réutilisés) avant la nouvelle tentative, via `createAuthHeaders(undefined)`
   * qui relit le jeton COURANT au lieu du `this.token` potentiellement périmé.
   */
  private sendDirectUploadRequest(
    item: QueueItem,
    formData: FormData,
    isRetry: boolean
  ): Promise<UploadedAttachmentResponse> {
    const { fileId } = item;
    const authHeaders = createAuthHeaders(isRetry ? undefined : this.token) as Record<string, string>;

    return new Promise<UploadedAttachmentResponse>((res, rej) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentage = Math.round((event.loaded / event.total) * 100);
          this.progress.set(fileId, {
            ...this.progress.get(fileId)!,
            status: 'uploading',
            percentage,
            bytesUploaded: event.loaded,
          });
          this.emitProgress();
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const parsed = JSON.parse(xhr.responseText);
          const attachments = parsed.data?.attachments || parsed.attachments || [];
          if (attachments.length > 0) {
            res(attachments[0]);
          } else {
            rej(new Error('No attachment returned'));
          }
          return;
        }

        if (xhr.status === 401 && !isRetry) {
          apiService.refreshAuthToken().then((refreshed) => {
            if (!refreshed) {
              rej(new Error('Session expirée, veuillez vous reconnecter'));
              return;
            }
            res(this.sendDirectUploadRequest(item, formData, true));
          });
          return;
        }

        rej(new Error(`Upload failed with status ${xhr.status}`));
      });
      xhr.addEventListener('error', () => rej(new Error('Network error')));
      xhr.addEventListener('timeout', () => rej(new Error('Upload timeout')));
      xhr.timeout = 600000;
      xhr.open('POST', buildApiUrl(API_ENDPOINTS.attachments.upload));
      Object.entries(authHeaders).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value as string);
      });
      xhr.send(formData);
    });
  }

  private emitProgress() {
    if (!this.onProgressCallback) return;

    const files = Array.from(this.progress.values());
    const totalBytes = files.reduce((sum, f) => sum + f.fileSize, 0);
    const uploadedBytes = files.reduce((sum, f) => sum + f.bytesUploaded, 0);
    const completedFiles = files.filter((f) => f.status === 'complete').length;

    this.onProgressCallback({
      files,
      totalFiles: files.length,
      completedFiles,
      totalBytes,
      uploadedBytes,
      globalPercentage: totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0,
    });
  }

  getProgress(): QueueProgress {
    const files = Array.from(this.progress.values());
    const totalBytes = files.reduce((sum, f) => sum + f.fileSize, 0);
    const uploadedBytes = files.reduce((sum, f) => sum + f.bytesUploaded, 0);
    const completedFiles = files.filter((f) => f.status === 'complete').length;

    return {
      files,
      totalFiles: files.length,
      completedFiles,
      totalBytes,
      uploadedBytes,
      globalPercentage: totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0,
    };
  }
}
