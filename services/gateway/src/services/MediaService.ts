import { promises as fs, constants as fsConstants } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { MediaStorage, MediaDuplicateResult } from './storage/MediaStorage';

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
   */
  async duplicateMedia(originalUrl: string): Promise<MediaDuplicateResult> {
    const relativePath = this.relativePathFromUrl(originalUrl);
    if (relativePath === null) {
      throw new Error(`MediaService.duplicateMedia: cannot parse URL "${originalUrl}"`);
    }

    const srcPath = path.join(this.uploadBasePath, relativePath);

    const ext = path.extname(relativePath);
    const newFileName = `snapshot_${uuidv4()}${ext}`;
    const newRelativePath = path.join('snapshots', newFileName);
    const destPath = path.join(this.uploadBasePath, newRelativePath);

    await fs.mkdir(path.dirname(destPath), { recursive: true });
    // COPYFILE_FICLONE = best-effort copy-on-write reflink (zero-copy on APFS,
    // btrfs, XFS, ext4 5.6+) ; falls back to full byte copy on filesystems
    // that do not support reflinks. COPYFILE_EXCL guards against overwriting
    // a destination that somehow already exists (defensive against UUID race).
    await fs.copyFile(srcPath, destPath, fsConstants.COPYFILE_FICLONE | fsConstants.COPYFILE_EXCL);

    const stat = await fs.stat(destPath);

    const newFileUrl = `${ATTACHMENTS_FILE_PREFIX}${encodeURIComponent(newRelativePath)}`;

    return {
      fileUrl: newFileUrl,
      filePath: newRelativePath,
      fileName: newFileName,
      fileSize: stat.size,
      mimeType: this.guessMimeType(ext),
    };
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
