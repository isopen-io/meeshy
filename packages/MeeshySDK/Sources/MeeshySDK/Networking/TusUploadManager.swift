import Foundation
import Combine
import CryptoKit
import UIKit
import os

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

/// Marker error thrown by `TusUploadManager` when an existing TUS session
/// has been GC'd by the server (404 / 410 on PATCH). The checkpoint store
/// already drops the stale checkpoint before this is thrown ; the caller's
/// retry path will see a fresh state and POST a new session.
public struct TusResumeRetriableError: Error {
    public init() {}
}

public struct TusUploadResult: Decodable, Sendable {
    public let id: String
    public let fileName: String
    public let originalName: String?
    public let mimeType: String
    public let fileSize: Int
    public let fileUrl: String
    public let thumbnailUrl: String?
    public let thumbHash: String?
    public let width: Int?
    public let height: Int?
    public let duration: Int?

    public func toMessageAttachment(uploadedBy: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: id,
            fileName: fileName,
            originalName: originalName ?? fileName,
            mimeType: mimeType,
            fileSize: fileSize,
            fileUrl: fileUrl,
            width: width,
            height: height,
            thumbnailUrl: thumbnailUrl,
            duration: duration,
            uploadedBy: uploadedBy,
            createdAt: Date()
        )
    }
}

public actor TusUploadManager {
    private let baseURL: URL
    private let chunkSize: Int = 10 * 1024 * 1024 // 10 MB
    private let maxConcurrent: Int = 3
    private var activeCount = 0
    nonisolated(unsafe) private var queue: [(URL, String, String, String?, String?, CheckedContinuation<TusUploadResult, Error>)] = []
    private var progressMap: [String: FileUploadProgress] = [:]
    nonisolated(unsafe) private let progressSubject = PassthroughSubject<UploadQueueProgress, Never>()

    public nonisolated var progressPublisher: AnyPublisher<UploadQueueProgress, Never> {
        progressSubject.eraseToAnyPublisher()
    }

    public init(baseURL: URL) {
        self.baseURL = baseURL
    }

    deinit {
        for (_, _, _, _, _, continuation) in queue {
            continuation.resume(throwing: CancellationError())
        }
    }

    public func uploadFile(fileURL: URL, mimeType: String, token: String, uploadContext: String? = nil, thumbHash: String? = nil) async throws -> TusUploadResult {
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
            queue.append((fileURL, mimeType, token, uploadContext, thumbHash, continuation))
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
            let (fileURL, mimeType, token, uploadContext, thumbHash, continuation) = queue.removeFirst()
            activeCount += 1
            Task {
                do {
                    let result = try await withBackgroundTask(named: "tus-upload-\(fileURL.lastPathComponent)") {
                        try await self.performTusUpload(fileURL: fileURL, mimeType: mimeType, token: token, uploadContext: uploadContext, thumbHash: thumbHash)
                    }
                    // Local-first : copie le fichier qu'on vient d'uploader dans le
                    // cache média typé, keyé par l'URL canonique serveur. L'auteur
                    // relit ses propres médias (story, pièce jointe) depuis le disque
                    // — offline, jamais re-téléchargés. Idempotent (no-op si déjà
                    // caché, ex. via MessagePersistenceActor.adoptSDKLevel).
                    await Self.seedMediaCache(localFile: fileURL, result: result)
                    activeCount -= 1
                    continuation.resume(returning: result)
                    processQueue()
                } catch {
                    activeCount -= 1
                    // Mark the failed file `.error` so it stops being surfaced as an
                    // in-flight `.uploading` file forever (stale "Envoi…" indicator)
                    // and is excluded from the batch aggregates by `emitProgress`.
                    markFileFailed(fileName: fileURL.lastPathComponent, error: error)
                    continuation.resume(throwing: error)
                    processQueue()
                }
            }
        }
    }

    /// Local-first cache seed : copie le fichier source qu'on vient d'uploader
    /// dans le `DiskCacheStore` typé (image/vidéo/audio) selon le MIME, keyé par
    /// l'URL canonique serveur (`result.fileUrl` — exactement la clé que le
    /// reader résout). Non-destructif (la source reste pour le caller, ex. un
    /// asset encore référencé par la preview live). Idempotent. Un MIME non-média
    /// (document…) est ignoré. C'est ce qui garantit que l'auteur joue ses
    /// propres stories / pièces jointes depuis le disque, offline, sans jamais
    /// re-télécharger un média qu'il possède déjà localement.
    private static func seedMediaCache(localFile: URL, result: TusUploadResult) async {
        let mime = result.mimeType
        let store: DiskCacheStore?
        if mime.hasPrefix("image/") {
            store = CacheCoordinator.shared.images
        } else if mime.hasPrefix("video/") {
            store = CacheCoordinator.shared.video
        } else if mime.hasPrefix("audio/") {
            store = CacheCoordinator.shared.audio
        } else {
            store = nil
        }
        guard let store else { return }
        await store.seed(copyingLocalFile: localFile, for: result.fileUrl)
    }

    private func withBackgroundTask<T: Sendable>(named name: String, operation: @Sendable () async throws -> T) async throws -> T {
        let taskId = await UIApplication.shared.beginBackgroundTask(withName: name)
        do {
            let result = try await operation()
            if taskId != .invalid {
                await UIApplication.shared.endBackgroundTask(taskId)
            }
            return result
        } catch {
            if taskId != .invalid {
                await UIApplication.shared.endBackgroundTask(taskId)
            }
            throw error
        }
    }

    private func performTusUpload(fileURL: URL, mimeType: String, token: String, uploadContext: String? = nil, thumbHash: String? = nil) async throws -> TusUploadResult {
        let fileName = fileURL.lastPathComponent
        let attrs = try FileManager.default.attributesOfItem(atPath: fileURL.path)
        let fileSize = (attrs[.size] as? Int64) ?? 0
        let fileId = progressMap.first(where: { $0.value.fileName == fileName })?.key ?? UUID().uuidString

        // Compute the bytewise checkpoint key once. Same source file +
        // same compression settings → same bytes → same key, so a queue
        // retry after kill matches the previous session's checkpoint.
        let checkpointKey = try Self.sha256Hex(of: fileURL)
        let store = TusUploadCheckpointStore.shared

        // Step 1: Resolve patchURL — either resume from a stored checkpoint
        // or POST a fresh upload session.
        let resumed = await store.find(checkpointKey: checkpointKey)
        let patchURL: URL
        var offset: Int64

        // E4 — TUS sessions expire server-side after ~24h (gateway GC). A
        // checkpoint older than that points at a URL that will 404/410 on
        // PATCH, which currently triggers the `TusResumeRetriableError`
        // catch path and a new POST — wasting the partial upload bytes.
        // Pre-emptively dropping the stale checkpoint keeps the
        // "fresh POST" path symmetric and avoids one round-trip of
        // observable failure noise.
        let checkpointMaxAge: TimeInterval = 22 * 60 * 60 // 22h — leave 2h slack vs gateway 24h GC
        let isCheckpointStale = (resumed?.updatedAt).map { Date().timeIntervalSince($0) > checkpointMaxAge } ?? false
        if isCheckpointStale {
            Self.logger.info("TUS checkpoint \(checkpointKey, privacy: .public) older than \(Int(checkpointMaxAge), privacy: .public)s — restarting upload")
            await store.delete(checkpointKey: checkpointKey)
        }

        if !isCheckpointStale,
           let cp = resumed,
           let url = URL(string: cp.uploadURL, relativeTo: baseURL),
           cp.fileSize == fileSize {
            Self.logger.info("Resuming TUS upload at offset \(cp.byteOffset, privacy: .public) of \(fileSize, privacy: .public) (\(fileName, privacy: .public))")
            patchURL = url
            offset = cp.byteOffset
        } else {
            let location = try await postCreateUpload(
                fileSize: fileSize,
                fileName: fileName,
                mimeType: mimeType,
                token: token,
                uploadContext: uploadContext,
                thumbHash: thumbHash
            )
            guard let url = URL(string: location, relativeTo: baseURL) else {
                throw URLError(.badURL)
            }
            patchURL = url
            offset = 0
            await store.save(TusUploadCheckpoint(
                checkpointKey: checkpointKey,
                uploadURL: location,
                byteOffset: 0,
                fileSize: fileSize,
                fileName: fileName,
                mimeType: mimeType,
                uploadContext: uploadContext,
                thumbHash: thumbHash
            ))
        }

        // Step 2: PATCH chunks from `offset`. Persist after each successful
        // chunk so an OS suspend / app kill in the middle still leaves the
        // checkpoint in a state the next attempt can reuse.
        let fileHandle = try FileHandle(forReadingFrom: fileURL)
        defer { try? fileHandle.close() }
        fileHandle.seek(toFileOffset: UInt64(offset))

        while offset < fileSize {
            let remaining = fileSize - offset
            let readSize = min(Int64(chunkSize), remaining)

            guard let chunk = try fileHandle.read(upToCount: Int(readSize)),
                  !chunk.isEmpty else { break }

            var patchReq = URLRequest(url: patchURL)
            patchReq.httpMethod = "PATCH"
            patchReq.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            patchReq.setValue("1.0.0", forHTTPHeaderField: "Tus-Resumable")
            patchReq.setValue("application/offset+octet-stream", forHTTPHeaderField: "Content-Type")
            patchReq.setValue("\(offset)", forHTTPHeaderField: "Upload-Offset")
            patchReq.httpBody = chunk

            let (responseData, patchResponse) = try await URLSession.shared.data(for: patchReq)
            guard let patchHttp = patchResponse as? HTTPURLResponse else {
                throw URLError(.badServerResponse)
            }

            switch patchHttp.statusCode {
            case 204, 200:
                offset += Int64(chunk.count)
                await store.updateOffset(checkpointKey: checkpointKey, offset: offset)

                progressMap[fileId] = FileUploadProgress(
                    fileId: fileId, fileName: fileName, fileSize: fileSize,
                    status: .uploading, percentage: Double(offset) / Double(fileSize) * 100,
                    bytesUploaded: offset, error: nil, attachmentId: nil
                )
                emitProgress()

                // Last chunk → server's onUploadFinish hook returned the
                // attachment metadata in the response body.
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
                        await store.delete(checkpointKey: checkpointKey)
                        progressMap[fileId] = FileUploadProgress(
                            fileId: fileId, fileName: fileName, fileSize: fileSize,
                            status: .complete, percentage: 100, bytesUploaded: fileSize,
                            error: nil, attachmentId: attachment.id
                        )
                        emitProgress()
                        return attachment
                    }
                }

            case 409:
                // Server's offset doesn't match. Discover via HEAD and
                // realign before retrying the same chunk on the next
                // iteration.
                Self.logger.warning("PATCH 409 at offset \(offset, privacy: .public); HEAD-recovering")
                let serverOffset = try await headOffset(patchURL: patchURL, token: token)
                fileHandle.seek(toFileOffset: UInt64(serverOffset))
                offset = serverOffset
                await store.updateOffset(checkpointKey: checkpointKey, offset: serverOffset)

            case 404, 410:
                // Server has GC'd this upload session. Drop the checkpoint
                // and surface a retryable error so the caller (queue) can
                // replay; the next call will see no checkpoint and POST
                // a fresh session.
                Self.logger.warning("PATCH \(patchHttp.statusCode, privacy: .public) — TUS session expired, restarting")
                await store.delete(checkpointKey: checkpointKey)
                throw TusResumeRetriableError()

            default:
                throw URLError(.badServerResponse)
            }
        }

        throw URLError(.cannotParseResponse)
    }

    // MARK: - TUS HTTP helpers

    private func postCreateUpload(
        fileSize: Int64,
        fileName: String,
        mimeType: String,
        token: String,
        uploadContext: String?,
        thumbHash: String?
    ) async throws -> String {
        let uploadURL = baseURL.appendingPathComponent("api/v1/uploads")
        var createReq = URLRequest(url: uploadURL)
        createReq.httpMethod = "POST"
        createReq.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        createReq.setValue("1.0.0", forHTTPHeaderField: "Tus-Resumable")
        createReq.setValue("\(fileSize)", forHTTPHeaderField: "Upload-Length")

        let encodedFilename = Data(fileName.utf8).base64EncodedString()
        let encodedFiletype = Data(mimeType.utf8).base64EncodedString()
        var metadataValue = "filename \(encodedFilename),filetype \(encodedFiletype)"
        if let context = uploadContext {
            let encodedContext = Data(context.utf8).base64EncodedString()
            metadataValue += ",uploadcontext \(encodedContext)"
        }
        if let hash = thumbHash {
            let encodedHash = Data(hash.utf8).base64EncodedString()
            metadataValue += ",thumbhash \(encodedHash)"
        }
        createReq.setValue(metadataValue, forHTTPHeaderField: "Upload-Metadata")

        let (_, createResponse) = try await URLSession.shared.data(for: createReq)
        guard let httpResponse = createResponse as? HTTPURLResponse,
              httpResponse.statusCode == 201,
              let location = httpResponse.value(forHTTPHeaderField: "Location") else {
            throw URLError(.badServerResponse)
        }
        return location
    }

    /// Issues a HEAD against the upload URL to discover the server-side
    /// offset, used to recover from a 409 Conflict (client + server out of
    /// sync). Returns 0 if the response is malformed or the server doesn't
    /// support HEAD.
    private func headOffset(patchURL: URL, token: String) async throws -> Int64 {
        var req = URLRequest(url: patchURL)
        req.httpMethod = "HEAD"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("1.0.0", forHTTPHeaderField: "Tus-Resumable")
        let (_, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        if let str = http.value(forHTTPHeaderField: "Upload-Offset"),
           let v = Int64(str) {
            return v
        }
        return 0
    }

    /// Streaming buffer size for the SHA-256 file digest. 64 KiB is the
    /// sweet spot between syscall overhead (too small → many reads) and
    /// memory pressure under iOS background-task constraints (too large →
    /// peaks that the OS may use as an OOM trigger on suspended apps).
    /// Each `read(upToCount:)` allocates a fresh `Data` that we drain into
    /// `SHA256` and release via the surrounding autoreleasepool.
    private static let hashBufferSize: Int = 64 * 1024

    /// Computes the SHA256 of the file contents and returns it as a
    /// lowercase hex string. Used as the bytewise-stable checkpoint key.
    ///
    /// Streams the file in 64 KiB chunks and folds each one into a running
    /// `SHA256` hasher, wrapping every read in an `autoreleasepool` so that
    /// the transient `Data` blocks are released immediately and not held
    /// for the entire run-loop tick. This keeps peak RSS bounded at ~64 KiB
    /// regardless of file size — required for 200-500 MB videos uploaded
    /// from `BGProcessingTask` / suspended-app contexts where iOS OOM-kills
    /// processes that touch the whole file with `Data(contentsOf:)` +
    /// `SHA256.hash(data:)`.
    ///
    /// `static` so the implementation is purely a pure I/O helper and can
    /// be exercised from tests without needing an actor hop.
    static func sha256Hex(of fileURL: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: fileURL)
        defer { try? handle.close() }

        var hasher = SHA256()
        while try autoreleasepool(invoking: { () throws -> Bool in
            guard let chunk = try handle.read(upToCount: hashBufferSize),
                  !chunk.isEmpty else {
                return false
            }
            hasher.update(data: chunk)
            return true
        }) {}

        let digest = hasher.finalize()
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private static let logger = Logger(subsystem: "com.meeshy.sdk", category: "tus-upload")

    /// Flip a queued/uploading file's progress row to `.error`, preserving its
    /// last bytes/percentage, and re-emit. Resolves the row by `fileName` (the
    /// same lookup `performTusUpload` uses) since the dispatch queue item only
    /// carries the URL. No-op if the row is already gone.
    private func markFileFailed(fileName: String, error: Error) {
        guard let fileId = progressMap.first(where: { $0.value.fileName == fileName })?.key,
              let prev = progressMap[fileId] else { return }
        progressMap[fileId] = FileUploadProgress(
            fileId: prev.fileId, fileName: prev.fileName, fileSize: prev.fileSize,
            status: .error, percentage: prev.percentage, bytesUploaded: prev.bytesUploaded,
            error: error.localizedDescription, attachmentId: prev.attachmentId
        )
        emitProgress()
    }

    /// Caller-declared size of the WHOLE send, set once via `setExpectedBatch`
    /// before a sequential multi-file upload loop. Used as a floor so the
    /// progress bar reflects the full batch up front instead of growing one file
    /// at a time. `0` (the default) means "infer from progressMap" — single-file
    /// and legacy callers are unaffected. The manager is created fresh per send,
    /// so these never need resetting across batches.
    private var expectedTotalFiles = 0
    private var expectedTotalBytes: Int64 = 0

    /// Declare the full planned batch BEFORE starting the per-file `uploadFile`
    /// loop. Without this, `progressMap` only gains an entry as each sequential
    /// upload begins, so `totalFiles`/`totalBytes` undercount and the bar
    /// oscillates to 100% each time a file completes before the next is
    /// registered. Idempotent; re-emits the corrected progress immediately.
    public func setExpectedBatch(totalFiles: Int, totalBytes: Int64) {
        expectedTotalFiles = totalFiles
        expectedTotalBytes = totalBytes
        emitProgress()
    }

    private func emitProgress() {
        progressSubject.send(Self.computeQueueProgress(
            from: Array(progressMap.values),
            expectedTotalFiles: expectedTotalFiles,
            expectedTotalBytes: expectedTotalBytes
        ))
    }

    /// Pure aggregation of per-file progress into the batch-level
    /// `UploadQueueProgress`. **Permanently-failed (`.error`) files are excluded
    /// from the aggregates** (totalFiles / completedFiles / totalBytes /
    /// uploadedBytes / globalPercentage) so a single failure doesn't freeze the
    /// progress bar's count and percentage below 100% forever. The failed file
    /// stays in `files` (status `.error`) so the UI can still surface it; the
    /// message-level failure UI owns showing the actual error.
    ///
    /// `expectedTotalFiles` / `expectedTotalBytes` act as FLOORS: a sequential
    /// multi-file send adds entries to `progressMap` one at a time, so without a
    /// caller-declared batch size the totals would grow file-by-file and the bar
    /// would oscillate to 100% as each file completes. With both at `0` (default)
    /// the result is identical to inferring everything from `files`.
    nonisolated static func computeQueueProgress(
        from files: [FileUploadProgress],
        expectedTotalFiles: Int = 0,
        expectedTotalBytes: Int64 = 0
    ) -> UploadQueueProgress {
        let active = files.filter { $0.status != .error }
        let knownBytes = active.reduce(Int64(0)) { $0 + $1.fileSize }
        let uploadedBytes = active.reduce(Int64(0)) { $0 + $1.bytesUploaded }
        let completedFiles = active.filter { $0.status == .complete }.count
        let totalFiles = max(active.count, expectedTotalFiles)
        let totalBytes = max(knownBytes, expectedTotalBytes)
        return UploadQueueProgress(
            files: files, totalFiles: totalFiles, completedFiles: completedFiles,
            totalBytes: totalBytes, uploadedBytes: uploadedBytes,
            globalPercentage: totalBytes > 0 ? Double(uploadedBytes) / Double(totalBytes) * 100 : 0
        )
    }
}
