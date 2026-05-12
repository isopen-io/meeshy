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
    private var queue: [(URL, String, String, String?, String?, CheckedContinuation<TusUploadResult, Error>)] = []
    private var progressMap: [String: FileUploadProgress] = [:]
    nonisolated(unsafe) private let progressSubject = PassthroughSubject<UploadQueueProgress, Never>()

    public nonisolated var progressPublisher: AnyPublisher<UploadQueueProgress, Never> {
        progressSubject.eraseToAnyPublisher()
    }

    public init(baseURL: URL) {
        self.baseURL = baseURL
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

        if let cp = resumed,
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
