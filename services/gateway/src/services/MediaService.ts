import { promises as fs, constants as fsConstants } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { MediaStorage, MediaDuplicateResult, MediaDuplicatePlan } from './storage/MediaStorage';

// Re-export for backwards compatibility with call sites that imported the
// type from `MediaService` rather than from the new `storage/MediaStorage`
// module. New code should import from `storage/MediaStorage`.
export type { MediaDuplicateResult };

const ATTACHMENTS_FILE_PREFIX = '/api/v1/attachments/file/';

/**
 * Local-filesystem implementation of {@link MediaStorage}. Targets the
 * UPLOAD_PATH volume mounted by the Docker container — the layout matches
 * what `UploadProcessor` produces during user-uploaded media intake.
 *
 * The class also exposes `duplicateMedia` / `deleteMedia` aliases that
 * preserve the original method names so existing call sites in
 * `PostService` and elsewhere keep working unchanged. The new interface
 * methods (`duplicate`, `delete`) are the canonical entry points for new
 * code, especially when the call site is typed against `MediaStorage`.
 *
 * Reference: SOTA audit Pilier 7 — wrapping media operations behind a
 * storage-agnostic interface to enable a future migration to MinIO / R2
 * without touching PostService or the route handlers.
 */
export class MediaService implements MediaStorage {
  private readonly uploadBasePath: string;
  private readonly publicUrl: string;

  constructor(
    uploadBasePath: string = process.env['UPLOAD_PATH'] ?? '/app/uploads',
    publicUrl: string = process.env['PUBLIC_URL'] ?? '',
  ) {
    this.uploadBasePath = uploadBasePath;
    this.publicUrl = publicUrl;
  }

  /**
   * Derives the disk-relative path from a fileUrl produced by UploadProcessor.
   * Supports both relative paths (/api/v1/attachments/file/<encoded>)
   * and absolute URLs (https://host/api/v1/attachments/file/<encoded>).
   * Returns null if the URL does not match the expected pattern.
   */
  relativePathFromUrl(fileUrl: string): string | null {
    let pathname = fileUrl;
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      try {
        pathname = new URL(fileUrl).pathname;
      } catch {
        return null;
      }
    }

    const idx = pathname.indexOf(ATTACHMENTS_FILE_PREFIX);
    if (idx === -1) return null;

    const encoded = pathname.slice(idx + ATTACHMENTS_FILE_PREFIX.length);
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }

  /**
   * Duplicates a media file to a new snapshot path and returns the metadata
   * needed to create a PostMedia record.
   *
   * The new file lives under <uploadBasePath>/snapshots/<uuid><ext> so it is
   * clearly separated from user-uploaded originals.
   *
   * COPYFILE_EXCL guards against overwriting a destination that somehow
   * already exists. UUID v4 collisions are astronomically improbable
   * (122 random bits) but a transient FS bug or a cloned process could
   * still trip EEXIST. We retry with a fresh UUID up to 3 times before
   * surfacing the error.
   */
  async duplicateMedia(originalUrl: string): Promise<MediaDuplicateResult> {
    const relativePath = this.relativePathFromUrl(originalUrl);
    if (relativePath === null) {
      throw new Error(`MediaService.duplicateMedia: cannot parse URL "${originalUrl}"`);
    }

    const srcPath = path.join(this.uploadBasePath, relativePath);
    const ext = path.extname(relativePath);

    // Make the snapshot directory once outside the retry loop.
    const snapshotsDir = path.join(this.uploadBasePath, 'snapshots');
    await fs.mkdir(snapshotsDir, { recursive: true });

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const newFileName = `snapshot_${uuidv4()}${ext}`;
      const newRelativePath = path.join('snapshots', newFileName);
      const destPath = path.join(this.uploadBasePath, newRelativePath);

      try {
        // COPYFILE_FICLONE = best-effort copy-on-write reflink (zero-copy on
        // APFS, btrfs, XFS, ext4 5.6+) ; falls back to full byte copy on
        // filesystems that do not support reflinks. COPYFILE_EXCL guards
        // against overwriting an unexpected destination.
        // Note : `fsConstants.COPYFILE_FICLONE` is undefined on macOS in
        // Node — coalesce to 0 so we don't OR `undefined` with EXCL and
        // silently drop the EXCL guard.
        const ficlone = (fsConstants.COPYFILE_FICLONE as number | undefined) ?? 0;
        await fs.copyFile(srcPath, destPath, ficlone | fsConstants.COPYFILE_EXCL);

        const stat = await fs.stat(destPath);
        const newFileUrl = `${ATTACHMENTS_FILE_PREFIX}${encodeURIComponent(newRelativePath)}`;
        return {
          fileUrl: newFileUrl,
          filePath: newRelativePath,
          fileName: newFileName,
          fileSize: stat.size,
          mimeType: this.guessMimeType(ext),
        };
      } catch (err) {
        lastError = err;
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code !== 'EEXIST') {
          // Anything other than UUID collision propagates immediately.
          throw err;
        }
        // EEXIST → retry loop with a fresh UUID. Don't sleep — this is a
        // CPU-only retry and the call site is already inside an async
        // operation that can absorb the microsecond cost.
      }
    }
    throw new Error(
      `MediaService.duplicateMedia: failed to find a free snapshot path after 3 retries`,
      { cause: lastError as Error | undefined },
    );
  }

  /**
   * Deletes a media file identified by its fileUrl.
   * Silently succeeds if the file does not exist (idempotent rollback).
   */
  async deleteMedia(fileUrl: string): Promise<void> {
    const relativePath = this.relativePathFromUrl(fileUrl);
    if (relativePath === null) return;

    const fullPath = path.join(this.uploadBasePath, relativePath);
    await fs.unlink(fullPath).catch(() => {});
  }

  // MARK: - MediaStorage interface conformance
  //
  // The interface uses shorter method names (duplicate, delete). We keep
  // duplicateMedia / deleteMedia as the existing public API so call sites
  // don't need to change, and forward through these thin wrappers.

  /** {@inheritDoc MediaStorage.duplicate} */
  duplicate(originalUrl: string): Promise<MediaDuplicateResult> {
    return this.duplicateMedia(originalUrl);
  }

  /** {@inheritDoc MediaStorage.delete} */
  delete(fileUrl: string): Promise<void> {
    return this.deleteMedia(fileUrl);
  }

  /** {@inheritDoc MediaStorage.planDuplicate} */
  planDuplicate(originalUrl: string): MediaDuplicatePlan {
    const relativePath = this.relativePathFromUrl(originalUrl);
    if (relativePath === null) {
      throw new Error(`MediaService.planDuplicate: cannot parse URL "${originalUrl}"`);
    }

    const srcPath = path.join(this.uploadBasePath, relativePath);
    const ext = path.extname(relativePath);
    const newFileName = `snapshot_${uuidv4()}${ext}`;
    const newRelativePath = path.join('snapshots', newFileName);
    const destPath = path.join(this.uploadBasePath, newRelativePath);
    const newFileUrl = `${ATTACHMENTS_FILE_PREFIX}${encodeURIComponent(newRelativePath)}`;
    const guessedMimeType = this.guessMimeType(ext);

    const commit = async (): Promise<MediaDuplicateResult> => {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      // COPYFILE_FICLONE = best-effort copy-on-write reflink (zero-copy on
      // APFS, btrfs, XFS, ext4 5.6+) ; falls back to full byte copy on
      // filesystems that do not support reflinks. COPYFILE_EXCL guards
      // against overwriting the planned destination — since the UUID was
      // committed at planDuplicate time, EEXIST here means a genuine
      // collision (extremely improbable) and we surface it instead of
      // silently overwriting the outbox-tracked URL.
      // Note : `fsConstants.COPYFILE_FICLONE` is undefined on macOS in
      // Node — bitwise OR with undefined yields the EXCL flag alone, which
      // is acceptable (just no reflink optimization on dev).
      const ficlone = (fsConstants.COPYFILE_FICLONE as number | undefined) ?? 0;
      await fs.copyFile(srcPath, destPath, ficlone | fsConstants.COPYFILE_EXCL);
      const stat = await fs.stat(destPath);
      return {
        fileUrl: newFileUrl,
        filePath: newRelativePath,
        fileName: newFileName,
        fileSize: stat.size,
        mimeType: guessedMimeType,
      };
    };

    return {
      plannedFileUrl: newFileUrl,
      plannedFilePath: newRelativePath,
      commit,
    };
  }

  private guessMimeType(ext: string): string {
    const map: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
    };
    return map[ext.toLowerCase()] ?? 'application/octet-stream';
  }
}
