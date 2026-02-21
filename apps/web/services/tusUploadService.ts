import { Upload } from 'tus-js-client';
import {
  MAX_CONCURRENT_UPLOADS,
  TUS_CHUNK_SIZE,
  SMALL_FILE_THRESHOLD,
  MAX_FILES_PER_MESSAGE,
  getSizeLimit,
  getAttachmentType,
  formatFileSize,
} from '@meeshy/shared/types/attachment';
import { createAuthHeaders } from '@/utils/token-utils';
import { buildApiUrl } from '@/lib/config';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

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
  resolve: (value: UploadedAttachmentResponse) => void;
  reject: (error: Error) => void;
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

  async uploadFiles(
    files: File[],
    metadataArray?: Record<string, string>[]
  ): Promise<UploadedAttachmentResponse[]> {
    if (files.length > MAX_FILES_PER_MESSAGE) {
      throw new Error(`Maximum ${MAX_FILES_PER_MESSAGE} files allowed per message`);
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
        this.queue.push({ file, fileId, metadata, resolve, reject });
      });
    });

    this.emitProgress();
    this.processQueue();

    return Promise.all(promises);
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

    if (file.size <= SMALL_FILE_THRESHOLD) {
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

    const upload = new Upload(file, {
      endpoint: buildApiUrl('/uploads'),
      chunkSize: TUS_CHUNK_SIZE,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      metadata: tusMetadata,
      headers: authHeaders,
      onError: (error) => {
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
    const authHeaders = createAuthHeaders(this.token) as Record<string, string>;

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

      const result = await new Promise<UploadedAttachmentResponse>((res, rej) => {
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const parsed = JSON.parse(xhr.responseText);
            const attachments = parsed.data?.attachments || parsed.attachments || [];
            if (attachments.length > 0) {
              res(attachments[0]);
            } else {
              rej(new Error('No attachment returned'));
            }
          } else {
            rej(new Error(`Upload failed with status ${xhr.status}`));
          }
        });
        xhr.addEventListener('error', () => rej(new Error('Network error')));
        xhr.addEventListener('timeout', () => rej(new Error('Upload timeout')));
        xhr.timeout = 600000;
        xhr.open('POST', buildApiUrl('/attachments/upload'));
        Object.entries(authHeaders).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value as string);
        });
        xhr.send(formData);
      });

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
