# Resumable Upload (30 files, 4GB) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable uploading up to 30 files simultaneously (up to 4 GB each) with resumable chunked uploads via tus protocol across web, iOS, and gateway.

**Architecture:** tus protocol (`@tus/server` + `@tus/file-store` on gateway, `tus-js-client` on web, `TUSKit` on iOS). Files upload in 10 MB chunks with auto-resume. Upload queue manages 3 parallel uploads max. Existing REST upload preserved for small files (<50 MB).

**Tech Stack:** `@tus/server`, `@tus/file-store`, `tus-js-client`, `TUSKit` (Swift), Fastify 5, Next.js 15, SwiftUI

---

## Task 1: Update shared upload constants

**Files:**
- Modify: `packages/shared/types/attachment.ts:342-349` (UPLOAD_LIMITS)

**Step 1: Update UPLOAD_LIMITS to 4 GB and add new constants**

```typescript
// In packages/shared/types/attachment.ts, replace UPLOAD_LIMITS block:

export const UPLOAD_LIMITS = {
  IMAGE: 4294967296, // 4GB
  DOCUMENT: 4294967296, // 4GB
  AUDIO: 4294967296, // 4GB
  VIDEO: 4294967296, // 4GB
  TEXT: 2147483648, // 2GB
  CODE: 2147483648, // 2GB
} as const;

export const MAX_FILES_PER_MESSAGE = 30;

export const MAX_CONCURRENT_UPLOADS = 3;

export const TUS_CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

export const SMALL_FILE_THRESHOLD = 50 * 1024 * 1024; // 50 MB - below this, use direct REST upload
```

**Step 2: Build shared package**

Run: `cd packages/shared && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/shared/types/attachment.ts
git commit -m "feat(shared): update upload limits to 4GB, add tus constants"
```

---

## Task 2: Install tus dependencies (gateway + web)

**Files:**
- Modify: `services/gateway/package.json`
- Modify: `apps/web/package.json`

**Step 1: Install gateway tus packages**

Run: `cd /Users/smpceo/Documents/v2_meeshy && pnpm add @tus/server @tus/file-store --filter @meeshy/gateway`
Expected: Packages installed successfully

**Step 2: Install web tus client**

Run: `cd /Users/smpceo/Documents/v2_meeshy && pnpm add tus-js-client --filter @meeshy/web`
Expected: Package installed successfully

**Step 3: Commit**

```bash
git add services/gateway/package.json apps/web/package.json pnpm-lock.yaml
git commit -m "chore: install @tus/server, @tus/file-store, tus-js-client"
```

---

## Task 3: Create tus server integration in gateway

**Files:**
- Create: `services/gateway/src/routes/uploads/tus-handler.ts`
- Modify: `services/gateway/src/server.ts:430-435` (add content type parser)
- Modify: `services/gateway/src/server.ts:960-966` (register tus routes)

**Step 1: Create the tus handler module**

Create `services/gateway/src/routes/uploads/tus-handler.ts`:

```typescript
import { Server } from '@tus/server';
import { FileStore } from '@tus/file-store';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  getAttachmentType,
  getSizeLimit,
  UPLOAD_LIMITS,
} from '@meeshy/shared/types/attachment';
import { MetadataManager } from '../../services/attachments/MetadataManager';

const UPLOAD_PATH = process.env.UPLOAD_PATH || '/app/uploads';
const TUS_TEMP_PATH = path.join(UPLOAD_PATH, '.tus-resumable');

function getMaxFileSize(): number {
  return Math.max(...Object.values(UPLOAD_LIMITS));
}

function buildPublicUrl(): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    const domain = process.env.DOMAIN || 'meeshy.me';
    return `https://gate.${domain}`;
  }
  return process.env.BACKEND_URL || `http://localhost:${process.env.PORT || '3000'}`;
}

export function createTusServer(prisma: PrismaClient): Server {
  const metadataManager = new MetadataManager(UPLOAD_PATH);
  const publicUrl = buildPublicUrl();

  const tusServer = new Server({
    path: '/uploads',
    datastore: new FileStore({ directory: TUS_TEMP_PATH }),
    maxSize: getMaxFileSize(),
    async onUploadCreate(req, upload) {
      const authHeader = req.headers.get
        ? req.headers.get('authorization')
        : (req.headers as any)?.authorization;
      const sessionToken = req.headers.get
        ? req.headers.get('x-session-token')
        : (req.headers as any)?.['x-session-token'];

      if (!authHeader && !sessionToken) {
        throw { status_code: 401, body: 'Authentication required\n' };
      }

      const mimeType = upload.metadata?.filetype || 'application/octet-stream';
      const attachmentType = getAttachmentType(mimeType, upload.metadata?.filename);
      const sizeLimit = getSizeLimit(attachmentType);

      if (upload.size && upload.size > sizeLimit) {
        throw {
          status_code: 413,
          body: `File too large. Max size for ${attachmentType}: ${(sizeLimit / (1024 * 1024 * 1024)).toFixed(1)} GB\n`,
        };
      }

      return {
        metadata: {
          ...upload.metadata,
          uploadedAt: new Date().toISOString(),
        },
      };
    },
    async onUploadFinish(req, upload) {
      const filename = upload.metadata?.filename || 'unknown';
      const mimeType = upload.metadata?.filetype || 'application/octet-stream';
      const userId = upload.metadata?.userId || 'anonymous';
      const isAnonymous = upload.metadata?.isAnonymous === 'true';

      const now = new Date();
      const year = now.getFullYear().toString();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const destDir = path.join(UPLOAD_PATH, year, month, userId);
      await fs.mkdir(destDir, { recursive: true });

      const ext = path.extname(filename);
      const baseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      const storedName = `${baseName}_${uuidv4()}${ext}`;
      const destPath = path.join(destDir, storedName);

      const sourcePath = upload.storage?.path;
      if (!sourcePath) {
        throw { status_code: 500, body: 'Upload storage path not found\n' };
      }
      await fs.rename(sourcePath, destPath);

      const fileSize = upload.size || 0;
      const relPath = path.join(year, month, userId, storedName);
      const fileUrl = `${publicUrl}/api/v1/attachments/file/${relPath}`;

      let metadata: any = {};
      try {
        metadata = await metadataManager.extractMetadata(destPath, mimeType);
      } catch (err) {
        console.error('[TUS] Metadata extraction failed:', err);
      }

      let thumbnailUrl: string | undefined;
      if (metadata.thumbnailPath) {
        const thumbRelPath = path.relative(UPLOAD_PATH, metadata.thumbnailPath);
        thumbnailUrl = `${publicUrl}/api/v1/attachments/file/${thumbRelPath}`;
      }

      const attachment = await prisma.messageAttachment.create({
        data: {
          fileName: storedName,
          originalName: filename,
          mimeType,
          fileSize,
          filePath: destPath,
          fileUrl,
          thumbnailPath: metadata.thumbnailPath || null,
          thumbnailUrl: thumbnailUrl || null,
          width: metadata.width || null,
          height: metadata.height || null,
          duration: metadata.duration || null,
          bitrate: metadata.bitrate || null,
          sampleRate: metadata.sampleRate || null,
          codec: metadata.codec || null,
          channels: metadata.channels || null,
          fps: metadata.fps || null,
          videoCodec: metadata.videoCodec || null,
          pageCount: metadata.pageCount || null,
          lineCount: metadata.lineCount || null,
          uploadedBy: userId,
          isAnonymous,
        },
      });

      return {
        status_code: 200,
        body: JSON.stringify({
          success: true,
          data: {
            attachment: {
              id: attachment.id,
              fileName: storedName,
              originalName: filename,
              mimeType,
              fileSize,
              fileUrl,
              thumbnailUrl,
              width: metadata.width,
              height: metadata.height,
              duration: metadata.duration,
              bitrate: metadata.bitrate,
              sampleRate: metadata.sampleRate,
              codec: metadata.codec,
              channels: metadata.channels,
            },
          },
        }),
      };
    },
  });

  return tusServer;
}

export async function registerTusRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = (fastify as any).prisma;
  if (!prisma) {
    throw new Error('[TUS] Prisma client not available');
  }

  await fs.mkdir(TUS_TEMP_PATH, { recursive: true });

  const tusServer = createTusServer(prisma);

  fastify.addContentTypeParser(
    'application/offset+octet-stream',
    (_request: any, _payload: any, done: (err: null) => void) => done(null)
  );

  fastify.all('/uploads', (req, reply) => {
    tusServer.handle(req.raw, reply.raw);
  });

  fastify.all('/uploads/*', (req, reply) => {
    tusServer.handle(req.raw, reply.raw);
  });

  console.log('[TUS] Resumable upload routes registered at /uploads/*');
}
```

**Step 2: Register tus routes in server.ts**

In `services/gateway/src/server.ts`, add import at top (after other route imports ~line 74):

```typescript
import { registerTusRoutes } from './routes/uploads/tus-handler';
```

In `setupRoutes()` method, after the attachment routes registration (~line 966), add:

```typescript
    // Register tus resumable upload routes (no prefix - mounted at /uploads)
    await this.server.register(registerTusRoutes);
    logger.info('✓ TUS resumable upload routes registered');
```

**Step 3: Update error handler for 4GB limit message**

In `services/gateway/src/server.ts:659-669`, update the FST_REQ_FILE_TOO_LARGE error message from "2 GB" to "4 GB":

```typescript
      if (err && err.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send({
          error: 'File Too Large',
          message: `File size exceeds the allowed limit of 4 GB. Please reduce the file size.`,
          details: {
            maxFileSize: '4 GB',
            limit: 'File size exceeded'
          },
          statusCode: 413,
          timestamp: new Date().toISOString()
        });
```

**Step 4: Update multipart limits to 4GB**

In `services/gateway/src/server.ts:430-435`, update multipart fileSize from 2GB to 4GB:

```typescript
    await this.server.register(multipart, {
      limits: {
        fileSize: 4294967296, // 4GB max file size
        files: 100,
      },
    });
```

**Step 5: Verify gateway compiles**

Run: `cd /Users/smpceo/Documents/v2_meeshy/services/gateway && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add services/gateway/src/routes/uploads/tus-handler.ts services/gateway/src/server.ts
git commit -m "feat(gateway): add tus resumable upload server with 4GB support"
```

---

## Task 4: Create tus upload service for web

**Files:**
- Create: `apps/web/services/tusUploadService.ts`

**Step 1: Create TusUploadService**

Create `apps/web/services/tusUploadService.ts`:

```typescript
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
    const { file, fileId, metadata, resolve, reject } = item;

    const authHeaders = createAuthHeaders(this.token);

    if (file.size <= SMALL_FILE_THRESHOLD) {
      this.startDirectUpload(item);
      return;
    }

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

        const responseUrl = upload.url;
        let attachment: UploadedAttachmentResponse | undefined;

        try {
          const responseBody = (upload as any).lastResponse?.getBody?.();
          if (responseBody) {
            const parsed = JSON.parse(responseBody);
            attachment = parsed.data?.attachment;
          }
        } catch {
          // Response parsing failed, attachment will be fetched separately
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
    const authHeaders = createAuthHeaders(this.token);

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
    } catch (error: any) {
      this.progress.set(fileId, {
        ...this.progress.get(fileId)!,
        status: 'error',
        error: error.message,
      });
      this.emitProgress();
      reject(error);
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
```

**Step 2: Verify web compiles**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/web && npx tsc --noEmit`
Expected: No errors (warnings OK)

**Step 3: Commit**

```bash
git add apps/web/services/tusUploadService.ts
git commit -m "feat(web): add TusUploadService with queue, resume, and progress tracking"
```

---

## Task 5: Create iOS TUS upload manager

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Networking/TusUploadManager.swift`

**Step 1: Create TusUploadManager**

Note: Since TUSKit adds a heavy SPM dependency, we implement a lightweight tus client directly using URLSession. The tus protocol is simple HTTP (POST to create, PATCH to upload chunks, HEAD to check offset).

Create `packages/MeeshySDK/Sources/MeeshySDK/Networking/TusUploadManager.swift`:

```swift
import Foundation
import Combine

public enum UploadFileStatus: String, Sendable {
    case queued, uploading, complete, error, paused
}

public struct FileUploadProgress: Sendable {
    public let fileId: String
    public let fileName: String
    public let fileSize: Int64
    public let status: UploadFileStatus
    public let percentage: Double
    public let bytesUploaded: Int64
    public let error: String?
    public let attachmentId: String?
}

public struct UploadQueueProgress: Sendable {
    public let files: [FileUploadProgress]
    public let totalFiles: Int
    public let completedFiles: Int
    public let totalBytes: Int64
    public let uploadedBytes: Int64
    public let globalPercentage: Double
}

public struct TusUploadResult: Decodable, Sendable {
    public let id: String
    public let fileName: String
    public let originalName: String?
    public let mimeType: String
    public let fileSize: Int
    public let fileUrl: String
    public let thumbnailUrl: String?
    public let width: Int?
    public let height: Int?
    public let duration: Int?
}

public actor TusUploadManager {
    private let baseURL: URL
    private let chunkSize: Int = 10 * 1024 * 1024 // 10 MB
    private let maxConcurrent: Int = 3
    private var activeCount = 0
    private var queue: [(URL, String, String, CheckedContinuation<TusUploadResult, Error>)] = []
    private var progressMap: [String: FileUploadProgress] = [:]
    private let progressSubject = PassthroughSubject<UploadQueueProgress, Never>()

    public nonisolated var progressPublisher: AnyPublisher<UploadQueueProgress, Never> {
        progressSubject.eraseToAnyPublisher()
    }

    public init(baseURL: URL) {
        self.baseURL = baseURL
    }

    public func uploadFile(fileURL: URL, mimeType: String, token: String) async throws -> TusUploadResult {
        let fileId = UUID().uuidString
        let fileName = fileURL.lastPathComponent
        let attrs = try FileManager.default.attributesOfItem(atPath: fileURL.path)
        let fileSize = (attrs[.size] as? Int64) ?? 0

        progressMap[fileId] = FileUploadProgress(
            fileId: fileId, fileName: fileName, fileSize: fileSize,
            status: .queued, percentage: 0, bytesUploaded: 0, error: nil, attachmentId: nil
        )
        emitProgress()

        return try await withCheckedThrowingContinuation { continuation in
            queue.append((fileURL, mimeType, token, continuation))
            processQueue()
        }
    }

    public func uploadFiles(fileURLs: [(url: URL, mimeType: String)], token: String) async throws -> [TusUploadResult] {
        try await withThrowingTaskGroup(of: TusUploadResult.self) { group in
            for item in fileURLs {
                group.addTask {
                    try await self.uploadFile(fileURL: item.url, mimeType: item.mimeType, token: token)
                }
            }
            var results: [TusUploadResult] = []
            for try await result in group {
                results.append(result)
            }
            return results
        }
    }

    private func processQueue() {
        while activeCount < maxConcurrent, !queue.isEmpty {
            let (fileURL, mimeType, token, continuation) = queue.removeFirst()
            activeCount += 1
            Task {
                do {
                    let result = try await performTusUpload(fileURL: fileURL, mimeType: mimeType, token: token)
                    activeCount -= 1
                    continuation.resume(returning: result)
                    processQueue()
                } catch {
                    activeCount -= 1
                    continuation.resume(throwing: error)
                    processQueue()
                }
            }
        }
    }

    private func performTusUpload(fileURL: URL, mimeType: String, token: String) async throws -> TusUploadResult {
        let fileName = fileURL.lastPathComponent
        let attrs = try FileManager.default.attributesOfItem(atPath: fileURL.path)
        let fileSize = (attrs[.size] as? Int64) ?? 0
        let fileId = progressMap.first(where: { $0.value.fileName == fileName })?.key ?? UUID().uuidString

        // Step 1: Create upload (POST)
        let uploadURL = baseURL.appendingPathComponent("uploads")
        var createReq = URLRequest(url: uploadURL)
        createReq.httpMethod = "POST"
        createReq.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        createReq.setValue("1.0.0", forHTTPHeaderField: "Tus-Resumable")
        createReq.setValue("\(fileSize)", forHTTPHeaderField: "Upload-Length")

        let encodedFilename = Data(fileName.utf8).base64EncodedString()
        let encodedFiletype = Data(mimeType.utf8).base64EncodedString()
        createReq.setValue("filename \(encodedFilename),filetype \(encodedFiletype)", forHTTPHeaderField: "Upload-Metadata")

        let (_, createResponse) = try await URLSession.shared.data(for: createReq)
        guard let httpResponse = createResponse as? HTTPURLResponse,
              httpResponse.statusCode == 201,
              let location = httpResponse.value(forHTTPHeaderField: "Location") else {
            throw URLError(.badServerResponse)
        }

        guard let patchURL = URL(string: location, relativeTo: baseURL) else {
            throw URLError(.badURL)
        }

        // Step 2: Upload chunks (PATCH)
        let fileHandle = try FileHandle(forReadingFrom: fileURL)
        defer { try? fileHandle.close() }

        var offset: Int64 = 0
        while offset < fileSize {
            let remaining = fileSize - offset
            let readSize = min(Int64(chunkSize), remaining)

            fileHandle.seek(toFileOffset: UInt64(offset))
            guard let chunk = fileHandle.readData(ofLength: Int(readSize)) as Data?,
                  !chunk.isEmpty else { break }

            var patchReq = URLRequest(url: patchURL)
            patchReq.httpMethod = "PATCH"
            patchReq.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            patchReq.setValue("1.0.0", forHTTPHeaderField: "Tus-Resumable")
            patchReq.setValue("application/offset+octet-stream", forHTTPHeaderField: "Content-Type")
            patchReq.setValue("\(offset)", forHTTPHeaderField: "Upload-Offset")
            patchReq.httpBody = chunk

            let (responseData, patchResponse) = try await URLSession.shared.data(for: patchReq)
            guard let patchHttp = patchResponse as? HTTPURLResponse,
                  patchHttp.statusCode == 204 || patchHttp.statusCode == 200 else {
                throw URLError(.badServerResponse)
            }

            offset += Int64(chunk.count)

            progressMap[fileId] = FileUploadProgress(
                fileId: fileId, fileName: fileName, fileSize: fileSize,
                status: .uploading, percentage: Double(offset) / Double(fileSize) * 100,
                bytesUploaded: offset, error: nil, attachmentId: nil
            )
            emitProgress()

            // If this is the last chunk (offset == fileSize), parse onUploadFinish response
            if offset >= fileSize, let responseBody = String(data: responseData, encoding: .utf8),
               !responseBody.isEmpty {
                let decoder = JSONDecoder()
                struct TusResponse: Decodable {
                    let success: Bool
                    let data: TusResponseData?
                }
                struct TusResponseData: Decodable {
                    let attachment: TusUploadResult
                }
                if let parsed = try? decoder.decode(TusResponse.self, from: responseData),
                   let attachment = parsed.data?.attachment {
                    progressMap[fileId] = FileUploadProgress(
                        fileId: fileId, fileName: fileName, fileSize: fileSize,
                        status: .complete, percentage: 100, bytesUploaded: fileSize,
                        error: nil, attachmentId: attachment.id
                    )
                    emitProgress()
                    return attachment
                }
            }
        }

        throw URLError(.cannotParseResponse)
    }

    private func emitProgress() {
        let files = Array(progressMap.values)
        let totalBytes = files.reduce(Int64(0)) { $0 + $1.fileSize }
        let uploadedBytes = files.reduce(Int64(0)) { $0 + $1.bytesUploaded }
        let completedFiles = files.filter { $0.status == .complete }.count

        let progress = UploadQueueProgress(
            files: files, totalFiles: files.count, completedFiles: completedFiles,
            totalBytes: totalBytes, uploadedBytes: uploadedBytes,
            globalPercentage: totalBytes > 0 ? Double(uploadedBytes) / Double(totalBytes) * 100 : 0
        )
        progressSubject.send(progress)
    }
}
```

**Step 2: Verify iOS build**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Networking/TusUploadManager.swift
git commit -m "feat(ios): add TusUploadManager with chunked resumable upload"
```

---

## Task 6: Add tus cleanup cron job in gateway

**Files:**
- Create: `services/gateway/src/services/TusCleanupService.ts`
- Modify: `services/gateway/src/server.ts` (register cleanup in `initializeServices`)

**Step 1: Create TusCleanupService**

Create `services/gateway/src/services/TusCleanupService.ts`:

```typescript
import { promises as fs } from 'fs';
import path from 'path';

const TUS_TEMP_PATH = path.join(process.env.UPLOAD_PATH || '/app/uploads', '.tus-resumable');
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export class TusCleanupService {
  private interval: ReturnType<typeof setInterval> | null = null;

  start(intervalMs: number = 60 * 60 * 1000) {
    this.interval = setInterval(() => this.cleanup(), intervalMs);
    console.log('[TusCleanup] Started cleanup cron (every 1h, max age 24h)');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async cleanup(): Promise<number> {
    let removed = 0;
    try {
      const entries = await fs.readdir(TUS_TEMP_PATH);
      const now = Date.now();

      for (const entry of entries) {
        const fullPath = path.join(TUS_TEMP_PATH, entry);
        try {
          const stats = await fs.stat(fullPath);
          if (now - stats.mtimeMs > MAX_AGE_MS) {
            await fs.rm(fullPath, { recursive: true, force: true });
            removed++;
          }
        } catch {
          // File may have been deleted between readdir and stat
        }
      }

      if (removed > 0) {
        console.log(`[TusCleanup] Removed ${removed} stale uploads`);
      }
    } catch (err) {
      // Directory may not exist yet
    }
    return removed;
  }
}
```

**Step 2: Register cleanup in server.ts**

In `services/gateway/src/server.ts`, add import:

```typescript
import { TusCleanupService } from './services/TusCleanupService';
```

Add property to the class:

```typescript
  private tusCleanup: TusCleanupService;
```

In constructor, initialize:

```typescript
    this.tusCleanup = new TusCleanupService();
```

In `initializeServices()` method, after other service inits, add:

```typescript
    this.tusCleanup.start();
    logger.info('✓ TUS cleanup service started');
```

**Step 3: Commit**

```bash
git add services/gateway/src/services/TusCleanupService.ts services/gateway/src/server.ts
git commit -m "feat(gateway): add tus cleanup cron for stale incomplete uploads"
```

---

## Task 7: Update web AttachmentService to validate 30-file limit

**Files:**
- Modify: `apps/web/services/attachmentService.ts:294-308`

**Step 1: Add 30-file validation in validateFiles()**

In `apps/web/services/attachmentService.ts`, update `validateFiles`:

```typescript
  static validateFiles(files: File[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (files.length > MAX_FILES_PER_MESSAGE) {
      errors.push(`Maximum ${MAX_FILES_PER_MESSAGE} files allowed. You selected ${files.length}.`);
    }

    files.forEach((file) => {
      const validation = this.validateFile(file);
      if (!validation.valid) {
        errors.push(`${file.name}: ${validation.error}`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }
```

Also add the import at the top of the file:

```typescript
import {
  Attachment,
  UploadedAttachmentResponse,
  UploadMultipleResponse,
  formatFileSize,
  getSizeLimit,
  getAttachmentType,
  isAcceptedMimeType,
  MAX_FILES_PER_MESSAGE,
  type AttachmentType
} from '@meeshy/shared/types/attachment';
```

**Step 2: Commit**

```bash
git add apps/web/services/attachmentService.ts
git commit -m "feat(web): enforce 30-file limit in attachment validation"
```

---

## Task 8: Update gateway error handler for 30-file limit

**Files:**
- Modify: `services/gateway/src/server.ts:645-656`

**Step 1: Update FST_FILES_LIMIT error message**

```typescript
      if (err && err.code === 'FST_FILES_LIMIT') {
        return reply.code(413).send({
          error: 'Too Many Files',
          message: `You can only upload a maximum of 30 files at once. Please reduce the number of files.`,
          details: {
            maxFiles: 30,
            limit: 'Files limit reached'
          },
          statusCode: 413,
          timestamp: new Date().toISOString()
        });
      }
```

Also update the multipart `files` limit from 100 to 30 in `setupMiddleware()`:

```typescript
    await this.server.register(multipart, {
      limits: {
        fileSize: 4294967296, // 4GB max file size
        files: 30, // Max 30 files per request
      },
    });
```

**Step 2: Commit**

```bash
git add services/gateway/src/server.ts
git commit -m "feat(gateway): enforce 30-file limit in multipart and error handler"
```

---

## Task 9: Integration testing

**Files:**
- No new files. Manual/integration verification.

**Step 1: Verify gateway starts correctly**

Run: `cd /Users/smpceo/Documents/v2_meeshy/services/gateway && npx tsc --noEmit`
Expected: No errors

**Step 2: Verify shared package builds**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/shared && npm run build`
Expected: Build succeeds

**Step 3: Verify web builds**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/web && npx tsc --noEmit`
Expected: No errors (or only pre-existing warnings)

**Step 4: Verify iOS builds**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build`
Expected: Build succeeds

**Step 5: Commit final integration verification**

If all builds pass, no additional commit needed. If fixes were required, commit them:

```bash
git commit -m "fix: resolve build issues from resumable upload integration"
```

---

## Summary of changes

| Layer | What changed | Key files |
|-------|-------------|-----------|
| **shared** | UPLOAD_LIMITS 2GB->4GB, new constants (MAX_FILES, TUS_CHUNK_SIZE) | `packages/shared/types/attachment.ts` |
| **gateway** | tus server at `/uploads/*`, cleanup cron, 4GB limits, 30-file limit | `routes/uploads/tus-handler.ts`, `services/TusCleanupService.ts`, `server.ts` |
| **web** | TusUploadService with queue + resume + progress, 30-file validation | `services/tusUploadService.ts`, `services/attachmentService.ts` |
| **iOS** | TusUploadManager with chunked upload, queue, Combine progress | `MeeshySDK/Networking/TusUploadManager.swift` |

## What is NOT in scope (future tasks)

- UI components for upload progress bars (web composer, iOS composer)
- Integration of TusUploadService into existing message send flows
- E2EE encryption of tus chunks (currently only REST upload supports E2EE)
- S3StorageAdapter implementation
- Traefik/Docker configuration changes (chunks are 10MB, well within current limits)
