/**
 * Storage-backend-agnostic interface for media file operations.
 *
 * The Meeshy gateway currently writes media files to a local Docker volume
 * (`process.env.UPLOAD_PATH`) and serves them through a Fastify route. As
 * we scale beyond a single gateway instance (or want to leverage CDN edge
 * for cheaper egress), the natural progression is :
 *   1. Local filesystem (today) → `LocalFilesystemMediaStorage`
 *   2. MinIO Docker (S3-compatible, single-host) → `S3CompatibleMediaStorage`
 *   3. Cloudflare R2 / AWS S3 (production) → same `S3CompatibleMediaStorage`
 *      (R2 inherits S3 API)
 *
 * Wrapping all media operations behind this interface lets the rest of the
 * gateway (`PostService`, future workers, route handlers) stay agnostic of
 * the underlying backend, so the migration becomes a configuration switch
 * rather than a refactor.
 *
 * Reference: SOTA audit Pilier 7.
 */
export interface MediaStorage {
  /**
   * Duplicates a media file referenced by `originalUrl` to a new snapshot
   * path. Returns the metadata required to persist a fresh `PostMedia`
   * record (fileUrl, filePath, fileName, fileSize, mimeType).
   *
   * Implementations MUST be transactional from the caller's perspective :
   * either the returned snapshot is fully written to the storage backend,
   * or an error is thrown and no partial file is left behind. Callers
   * still own the cross-resource rollback (e.g. deleting media files when
   * the surrounding DB transaction fails) via {@link MediaStorage.delete}.
   *
   * For producers that need to register the destination URL in an outbox
   * BEFORE the storage write (so a process crash mid-write is recoverable
   * by a janitor sweep), use the two-phase {@link MediaStorage.planDuplicate}
   * API instead.
   */
  duplicate(originalUrl: string): Promise<MediaDuplicateResult>;

  /**
   * Two-phase variant of {@link MediaStorage.duplicate} for outbox-tracked
   * call sites. Phase 1 (this method) generates a destination plan without
   * touching the storage backend. Phase 2 (`plan.commit()`) actually writes
   * the file. Between the two, the producer can register the planned
   * fileUrl in an outbox so that a crash before commit() is recoverable.
   *
   * Pattern :
   *   const plan = storage.planDuplicate(originalUrl);
   *   const trackId = await orphanOutbox.track(plan.plannedFileUrl, ...);
   *   try {
   *     const result = await plan.commit();
   *     // ... use result, on commit success untrack the row.
   *   } catch (e) {
   *     // commit() failed — file did not write, but the outbox row stays
   *     // and the worker will reap (idempotent on a non-existent file).
   *   }
   *
   * Reference: SOTA audit Pilier 4 producer guarantee.
   */
  planDuplicate(originalUrl: string): MediaDuplicatePlan;

  /**
   * Deletes a media file referenced by `fileUrl`. Implementations MUST be
   * idempotent — deleting a file that does not exist (already-purged
   * snapshot, double-call from rollback, etc.) is a no-op rather than an
   * error. Callers rely on this to keep their cleanup paths simple.
   */
  delete(fileUrl: string): Promise<void>;

  /**
   * Decodes a public-facing `fileUrl` (e.g.
   * `/api/v1/attachments/file/<encoded>`) into a backend-relative path.
   * Returns null when the URL does not match the expected pattern (caller
   * passes external URL, malformed input, etc.). Used by the thin route
   * handlers and by other services that need to address files by their
   * canonical relative path.
   */
  relativePathFromUrl(fileUrl: string): string | null;
}

/**
 * Metadata returned by {@link MediaStorage.duplicate}. Mirrors the shape
 * historically produced by `MediaService.duplicateMedia` so existing call
 * sites in `PostService` work without changes when wired through the
 * interface.
 */
export type MediaDuplicateResult = {
  fileUrl: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

/**
 * Phase-1 result of {@link MediaStorage.planDuplicate}. Holds the eventual
 * destination URL/path (so the producer can register it in an outbox) plus
 * a `commit()` thunk that performs the actual storage write.
 *
 * `plannedFileUrl` MUST be deterministic relative to the plan instance —
 * calling `commit()` MUST write to that exact URL or throw. Implementations
 * that retry on collision (UUID re-roll) must do so internally and update
 * `plannedFileUrl` so the outbox row stays in sync.
 */
export interface MediaDuplicatePlan {
  /** The destination URL the file WILL be written to on `commit()`. */
  readonly plannedFileUrl: string;
  /** The storage-backend-relative path of `plannedFileUrl`. */
  readonly plannedFilePath: string;
  /** Performs the actual storage write at the planned URL. */
  commit(): Promise<MediaDuplicateResult>;
}
