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
    private var queue: [(URL, String, String, String?, CheckedContinuation<TusUploadResult, Error>)] = []
    private var progressMap: [String: FileUploadProgress] = [:]
    private let progressSubject = PassthroughSubject<UploadQueueProgress, Never>()

    public nonisolated var progressPublisher: AnyPublisher<UploadQueueProgress, Never> {
        progressSubject.eraseToAnyPublisher()
    }

    public init(baseURL: URL) {
        self.baseURL = baseURL
    }

    public func uploadFile(fileURL: URL, mimeType: String, token: String, uploadContext: String? = nil) async throws -> TusUploadResult {
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
            queue.append((fileURL, mimeType, token, uploadContext, continuation))
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
            let (fileURL, mimeType, token, uploadContext, continuation) = queue.removeFirst()
            activeCount += 1
            Task {
                do {
                    let result = try await performTusUpload(fileURL: fileURL, mimeType: mimeType, token: token, uploadContext: uploadContext)
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

    private func performTusUpload(fileURL: URL, mimeType: String, token: String, uploadContext: String? = nil) async throws -> TusUploadResult {
        let fileName = fileURL.lastPathComponent
        let attrs = try FileManager.default.attributesOfItem(atPath: fileURL.path)
        let fileSize = (attrs[.size] as? Int64) ?? 0
        let fileId = progressMap.first(where: { $0.value.fileName == fileName })?.key ?? UUID().uuidString

        // Step 1: Create upload (POST)
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
        createReq.setValue(metadataValue, forHTTPHeaderField: "Upload-Metadata")

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

            // If this is the last chunk, parse onUploadFinish response
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
