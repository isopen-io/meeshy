//
//  AttachmentUploadManager.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import Foundation
import UIKit
import AVFoundation

enum UploadStatus: Equatable {
    case pending
    case compressing
    case uploading(Double)
    case completed
    case failed(String)

    var isCompleted: Bool {
        if case .completed = self { return true }
        return false
    }

    var isFailed: Bool {
        if case .failed = self { return true }
        return false
    }
}

struct UploadTask {
    let id: String
    let attachment: Attachment
    let conversationId: String
    var data: Data?
    var thumbnailData: Data?
    var status: UploadStatus
    var progress: Double
    var uploadedURL: String?
    var videoMetadata: VideoMetadata?   // Extracted video metadata
    var imageMetadata: ImageMetadata?   // Extracted image metadata
    var audioEffectsTimeline: AudioEffectsRecordingTimeline?  // Event-based timeline for webapp compatibility
}

/// Image metadata extracted during processing
struct ImageMetadata {
    let width: Int
    let height: Int
    let hasAlpha: Bool
    let colorSpace: String
}

@MainActor
final class AttachmentUploadManager: ObservableObject {
    static let shared = AttachmentUploadManager()

    // MARK: - Published Properties

    @Published var uploadProgress: [String: Double] = [:]
    @Published var uploadStatus: [String: UploadStatus] = [:]
    @Published var activeTasks: [String: UploadTask] = [:]

    // MARK: - Private Properties

    private var uploadTasks: [String: URLSessionUploadTask] = [:]
    private let maxConcurrentUploads = 3
    private var pendingUploads: [UploadTask] = []
    private var activeUploadsCount = 0

    private init() {}

    // MARK: - Main Upload Method

    func uploadAttachment(
        _ attachment: Attachment,
        to conversationId: String
    ) async throws -> Attachment {
        try await uploadAttachment(attachment, to: conversationId, effectsTimeline: nil)
    }

    /// Upload an audio attachment with effects recording timeline
    /// The recording timeline (event-based) is sent to the server as-is to match webapp format
    /// - Parameters:
    ///   - attachment: The attachment to upload
    ///   - conversationId: The conversation ID
    ///   - effectsTimeline: Optional recording timeline from AudioEffectsTimelineTracker
    /// - Returns: The uploaded attachment with server-assigned ID and URLs
    func uploadAttachment(
        _ attachment: Attachment,
        to conversationId: String,
        effectsTimeline: AudioEffectsRecordingTimeline?
    ) async throws -> Attachment {
        let taskId = attachment.id

        // Create upload task
        var task = UploadTask(
            id: taskId,
            attachment: attachment,
            conversationId: conversationId,
            data: nil,
            thumbnailData: nil,
            status: .pending,
            progress: 0,
            audioEffectsTimeline: effectsTimeline
        )

        activeTasks[taskId] = task
        updateStatus(taskId, status: .pending)

        do {
            // Step 1: Process the media (compress, generate thumbnail)
            task = try await processMedia(task)

            // Step 2: Upload to server
            let uploadedAttachment = try await performUpload(task)

            // Step 3: Update status
            updateStatus(taskId, status: .completed)
            activeTasks.removeValue(forKey: taskId)

            return uploadedAttachment

        } catch {
            updateStatus(taskId, status: .failed(error.localizedDescription))
            throw error
        }
    }

    // MARK: - Media Processing

    private func processMedia(_ task: UploadTask) async throws -> UploadTask {
        var updatedTask = task
        updateStatus(task.id, status: .compressing)

        switch task.attachment.type {
        case .image:
            updatedTask = try await processImage(task)
        case .video:
            updatedTask = try await processVideo(task)
        case .audio:
            updatedTask = try await processAudio(task)
        case .file:
            updatedTask = try await processFile(task)
        default:
            break
        }

        return updatedTask
    }

    private func processImage(_ task: UploadTask) async throws -> UploadTask {
        guard let localURL = task.attachment.localURL,
              let imageData = try? Data(contentsOf: localURL),
              let image = UIImage(data: imageData) else {
            throw NSError(domain: "AttachmentUpload", code: -1, userInfo: [
                NSLocalizedDescriptionKey: "Failed to load image"
            ])
        }

        // Extract image metadata
        let hasAlpha = image.cgImage?.alphaInfo != .none && image.cgImage?.alphaInfo != .noneSkipLast && image.cgImage?.alphaInfo != .noneSkipFirst
        let colorSpace = image.cgImage?.colorSpace?.name as? String ?? "sRGB"
        let imageMeta = ImageMetadata(
            width: Int(image.size.width * image.scale),
            height: Int(image.size.height * image.scale),
            hasAlpha: hasAlpha,
            colorSpace: colorSpace
        )
        mediaLogger.info("[AttachmentUpload] Image metadata: \(imageMeta.width)x\(imageMeta.height), hasAlpha: \(imageMeta.hasAlpha)")

        // Compress image
        guard let compressedData = ImageCompressor.compress(
            image,
            maxSizeMB: 5.0,
            quality: .balanced
        )?.data else {
            throw NSError(domain: "AttachmentUpload", code: -2, userInfo: [
                NSLocalizedDescriptionKey: "Failed to compress image"
            ])
        }

        // Generate thumbnail
        let thumbnail = ImageCompressor.generateThumbnail(image)
        let thumbnailData = thumbnail?.jpegData(compressionQuality: 0.7)

        var updatedTask = task
        updatedTask.data = compressedData
        updatedTask.thumbnailData = thumbnailData
        updatedTask.imageMetadata = imageMeta

        return updatedTask
    }

    private func processVideo(_ task: UploadTask) async throws -> UploadTask {
        guard let localURL = task.attachment.localURL else {
            throw NSError(domain: "AttachmentUpload", code: -3, userInfo: [
                NSLocalizedDescriptionKey: "Failed to load video"
            ])
        }

        // Extract metadata BEFORE compression (for accurate source info)
        let metadata = try await VideoCompressor.extractMetadata(localURL)
        mediaLogger.info("[AttachmentUpload] Video metadata: \(Int(metadata.resolution.width))x\(Int(metadata.resolution.height)), \(metadata.durationFormatted), codec: \(metadata.codec)")

        // Compress video
        let taskId = task.id
        let compressedURL = try await VideoCompressor.compress(
            localURL,
            quality: .medium,
            progressHandler: { @Sendable progress in
                Task { @MainActor in
                    await AttachmentUploadManager.shared.updateProgress(taskId, progress: progress * 0.5) // First 50% is compression
                }
            }
        )

        // Generate thumbnail
        let thumbnail = try? await VideoCompressor.generateThumbnail(compressedURL, at: .zero)
        let thumbnailData = thumbnail?.jpegData(compressionQuality: 0.7)

        // Read compressed video data
        let videoData = try Data(contentsOf: compressedURL)

        // Store metadata in task for upload
        var updatedTask = task
        updatedTask.data = videoData
        updatedTask.thumbnailData = thumbnailData
        updatedTask.videoMetadata = metadata

        // Cleanup temp file
        try? FileManager.default.removeItem(at: compressedURL)

        return updatedTask
    }

    private func processAudio(_ task: UploadTask) async throws -> UploadTask {
        guard let localURL = task.attachment.localURL else {
            throw NSError(domain: "AttachmentUpload", code: -4, userInfo: [
                NSLocalizedDescriptionKey: "Failed to load audio"
            ])
        }

        let audioData = try Data(contentsOf: localURL)

        var updatedTask = task
        updatedTask.data = audioData

        return updatedTask
    }

    private func processFile(_ task: UploadTask) async throws -> UploadTask {
        guard let localURL = task.attachment.localURL else {
            throw NSError(domain: "AttachmentUpload", code: -5, userInfo: [
                NSLocalizedDescriptionKey: "Failed to load file"
            ])
        }

        let fileData = try Data(contentsOf: localURL)

        var updatedTask = task
        updatedTask.data = fileData

        return updatedTask
    }

    // MARK: - Network Upload

    /// Performs the upload following the same approach as the webapp:
    /// - Uses AttachmentEndpoints.upload for consistent endpoint definition
    /// - Field name: "files" (not "file")
    /// - Metadata: "metadata_0" for additional data
    /// - Response: { success: bool, attachments: [...] } with fileUrl field
    private func performUpload(_ task: UploadTask) async throws -> Attachment {
        guard let data = task.data else {
            throw NSError(domain: "AttachmentUpload", code: -6, userInfo: [
                NSLocalizedDescriptionKey: "No data to upload"
            ])
        }

        // Build rich metadata for upload (matching webapp format)
        let metadata = buildMetadata(for: task)

        // Use AttachmentEndpoints for consistent path definition
        let endpoint = AttachmentEndpoints.upload(metadata: metadata)
        let baseURL = APIConfiguration.shared.currentBaseURL

        guard let url = URL(string: baseURL + endpoint.path) else {
            throw NSError(domain: "AttachmentUpload", code: -6, userInfo: [
                NSLocalizedDescriptionKey: "Invalid upload URL"
            ])
        }

        print("[AttachmentUploadManager] Uploading to: \(url.absoluteString)")

        // Create multipart form data
        let boundary = UUID().uuidString

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 600  // 10 minutes timeout like webapp

        // Add authentication token if available
        if let token = await AuthenticationManager.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        // Build multipart body - match webapp format
        var body = Data()

        // Add file data with field name "files" (webapp uses plural)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"files\"; filename=\"\(task.attachment.fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(task.attachment.mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n".data(using: .utf8)!)

        // Add metadata_0 using the endpoint's metadata (webapp format)
        // Use camelCase encoding to match webapp exactly
        if let metadataJSON = try? JSONEncoder().encode(metadata),
           let metadataString = String(data: metadataJSON, encoding: .utf8) {
            print("[AttachmentUploadManager] Metadata JSON: \(metadataString)")
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"metadata_0\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(metadataString)\r\n".data(using: .utf8)!)
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        // Perform upload with progress tracking
        updateStatus(task.id, status: .uploading(0))

        let (responseData, response) = try await URLSession.shared.upload(
            for: request,
            from: body,
            delegate: URLSessionProgressDelegate(taskId: task.id, manager: self)
        )

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NSError(domain: "AttachmentUpload", code: -7, userInfo: [
                NSLocalizedDescriptionKey: "Invalid response"
            ])
        }

        // Log raw response for debugging
        if let responseString = String(data: responseData, encoding: .utf8) {
            print("[AttachmentUploadManager] Response (\(httpResponse.statusCode)): \(responseString)")
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let errorMessage = String(data: responseData, encoding: .utf8) ?? "Upload failed"
            throw NSError(domain: "AttachmentUpload", code: httpResponse.statusCode, userInfo: [
                NSLocalizedDescriptionKey: errorMessage
            ])
        }

        // Parse response - webapp format: { success: bool, attachments: [...] }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        do {
            let uploadResponse = try decoder.decode(UploadMultipleResponse.self, from: responseData)

            guard uploadResponse.success, let firstAttachment = uploadResponse.attachments.first else {
                let errorMsg = uploadResponse.errors?.first?.message ?? "Upload failed - no attachment returned"
                throw NSError(domain: "AttachmentUpload", code: -8, userInfo: [
                    NSLocalizedDescriptionKey: errorMsg
                ])
            }

            // Update attachment with server data
            var uploadedAttachment = task.attachment
            if let fileUrl = firstAttachment.fileUrl {
                uploadedAttachment.url = fileUrl
            }
            uploadedAttachment.thumbnailUrl = firstAttachment.thumbnailUrl

            // CRITICAL: Use server-assigned ID for message sending
            if let serverId = firstAttachment.id {
                print("[AttachmentUploadManager] Replacing local ID '\(uploadedAttachment.id)' with server ID: \(serverId)")
                uploadedAttachment.id = serverId
            }

            return uploadedAttachment
        } catch {
            print("[AttachmentUploadManager] JSON decode error: \(error)")

            // Fallback: try to extract from raw JSON
            if let json = try? JSONSerialization.jsonObject(with: responseData) as? [String: Any] {
                // Try webapp format: { success, attachments: [...] }
                if let attachments = json["attachments"] as? [[String: Any]],
                   let first = attachments.first,
                   let fileUrl = first["fileUrl"] as? String ?? first["file_url"] as? String {
                    var uploadedAttachment = task.attachment
                    uploadedAttachment.url = fileUrl
                    uploadedAttachment.thumbnailUrl = first["thumbnailUrl"] as? String ?? first["thumbnail_url"] as? String
                    // CRITICAL: Use server-assigned ID
                    if let serverId = first["id"] as? String {
                        print("[AttachmentUploadManager] Fallback: Replacing local ID with server ID: \(serverId)")
                        uploadedAttachment.id = serverId
                    }
                    return uploadedAttachment
                }

                // Try simple format: { url, ... }
                if let url = json["url"] as? String ?? json["file_url"] as? String ?? json["fileUrl"] as? String {
                    var uploadedAttachment = task.attachment
                    uploadedAttachment.url = url
                    uploadedAttachment.thumbnailUrl = json["thumbnail_url"] as? String ?? json["thumbnailUrl"] as? String
                    // CRITICAL: Use server-assigned ID
                    if let serverId = json["id"] as? String {
                        print("[AttachmentUploadManager] Fallback simple: Replacing local ID with server ID: \(serverId)")
                        uploadedAttachment.id = serverId
                    }
                    return uploadedAttachment
                }
            }
            throw error
        }
    }

    // MARK: - Progress & Status Updates

    fileprivate func updateProgress(_ taskId: String, progress: Double) {
        uploadProgress[taskId] = progress

        if var task = activeTasks[taskId] {
            task.progress = progress
            activeTasks[taskId] = task
        }
    }

    fileprivate func updateStatus(_ taskId: String, status: UploadStatus) {
        uploadStatus[taskId] = status

        if var task = activeTasks[taskId] {
            task.status = status
            activeTasks[taskId] = task
        }
    }

    // MARK: - Metadata Building

    /// Build rich metadata for upload based on attachment type
    /// Matches webapp's metadata_0 format with all media-specific fields
    private func buildMetadata(for task: UploadTask) -> AttachmentUploadMetadata {
        let attachment = task.attachment

        switch attachment.type {
        case .audio:
            // Audio: include sampleRate, channels, codec, duration (in ms), bitrate
            // Note: Duration is stored in seconds locally but sent in milliseconds to server
            let durationMs = (attachment.duration ?? 0) * 1000
            return AttachmentUploadMetadata.audio(
                conversationId: task.conversationId,
                duration: durationMs,       // Duration in milliseconds for server
                sampleRate: 44100,          // Default iOS recording sample rate
                channels: 2,                // Stereo recording by default
                codec: "aac",               // AAC codec for .m4a files
                bitrate: 128000,            // 128 kbps default bitrate
                audioEffectsTimeline: task.audioEffectsTimeline  // Effects timeline for playback
            )

        case .video:
            // Video: include dimensions, fps, codecs, duration (in ms)
            // Use extracted metadata if available
            if let meta = task.videoMetadata {
                let durationMs = meta.duration * 1000
                return AttachmentUploadMetadata.video(
                    conversationId: task.conversationId,
                    width: Int(meta.resolution.width),
                    height: Int(meta.resolution.height),
                    duration: durationMs,
                    fps: Double(meta.fps),
                    videoCodec: meta.codec.lowercased(),
                    audioCodec: meta.hasAudioTrack ? "aac" : nil,
                    sampleRate: meta.hasAudioTrack ? 44100 : nil,
                    channels: meta.hasAudioTrack ? 2 : nil
                )
            } else {
                // Fallback to attachment metadata
                let durationMs = (attachment.duration ?? 0) * 1000
                return AttachmentUploadMetadata.video(
                    conversationId: task.conversationId,
                    width: Int(attachment.width ?? 1920),
                    height: Int(attachment.height ?? 1080),
                    duration: durationMs,
                    fps: 30,
                    videoCodec: "h264",
                    audioCodec: "aac",
                    sampleRate: 44100,
                    channels: 2
                )
            }

        case .image:
            // Image: include dimensions from extracted metadata
            if let meta = task.imageMetadata {
                return AttachmentUploadMetadata.image(
                    conversationId: task.conversationId,
                    width: meta.width,
                    height: meta.height
                )
            } else {
                return AttachmentUploadMetadata.image(
                    conversationId: task.conversationId,
                    width: Int(attachment.width ?? 0),
                    height: Int(attachment.height ?? 0)
                )
            }

        case .document, .file:
            // Document/file: basic metadata only
            return AttachmentUploadMetadata(
                type: attachment.type.rawValue,
                conversationId: task.conversationId
            )

        case .code:
            // Code file: include line count if available
            return AttachmentUploadMetadata(
                type: "code",
                conversationId: task.conversationId
            )

        case .text:
            // Text file: basic metadata
            return AttachmentUploadMetadata(
                type: "text",
                conversationId: task.conversationId
            )

        case .location:
            // Location: basic metadata
            return AttachmentUploadMetadata(
                type: "location",
                conversationId: task.conversationId
            )
        }
    }

    // MARK: - Queue Management

    func cancelUpload(_ attachmentId: String) {
        uploadTasks[attachmentId]?.cancel()
        uploadTasks.removeValue(forKey: attachmentId)
        activeTasks.removeValue(forKey: attachmentId)
        uploadProgress.removeValue(forKey: attachmentId)
        uploadStatus[attachmentId] = .failed("Cancelled")
    }

    func retryUpload(_ attachmentId: String) async throws {
        guard let task = activeTasks[attachmentId] else { return }
        _ = try await uploadAttachment(task.attachment, to: task.conversationId)
    }

    func clearCompleted() {
        let completedIds = uploadStatus.filter { $0.value.isCompleted }.map { $0.key }
        for id in completedIds {
            uploadStatus.removeValue(forKey: id)
            uploadProgress.removeValue(forKey: id)
        }
    }
}

// MARK: - URLSession Delegate

private class URLSessionProgressDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    let taskId: String
    weak var manager: AttachmentUploadManager?

    init(taskId: String, manager: AttachmentUploadManager) {
        self.taskId = taskId
        self.manager = manager
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        let progress = Double(totalBytesSent) / Double(totalBytesExpectedToSend)
        Task { @MainActor in
            self.manager?.updateProgress(self.taskId, progress: 0.5 + (progress * 0.5)) // Last 50% is upload
            self.manager?.updateStatus(self.taskId, status: .uploading(progress))
        }
    }
}

// MARK: - Response Models (matching webapp types)

/// Response format from /attachments/upload endpoint
/// Matches webapp's UploadMultipleResponse interface
struct UploadMultipleResponse: Codable {
    let success: Bool
    let attachments: [UploadedAttachmentResponse]
    let errors: [UploadError]?
}

/// Individual uploaded attachment in response
/// Matches webapp's UploadedAttachmentResponse interface
struct UploadedAttachmentResponse: Codable {
    let id: String?
    let messageId: String?
    let fileName: String?
    let originalName: String?
    let mimeType: String?
    let fileSize: Int64?
    let fileUrl: String?              // Primary URL field used by webapp
    let thumbnailUrl: String?
    let width: Int?
    let height: Int?
    let duration: Double?
    let bitrate: Int?
    let sampleRate: Int?
    let codec: String?
    let channels: Int?
    let uploadedBy: String?
    let isAnonymous: Bool?
    let createdAt: String?
    let metadata: AttachmentMetadata?

    enum CodingKeys: String, CodingKey {
        case id
        case messageId = "message_id"
        case fileName = "file_name"
        case originalName = "original_name"
        case mimeType = "mime_type"
        case fileSize = "file_size"
        case fileUrl = "file_url"
        case thumbnailUrl = "thumbnail_url"
        case width, height, duration, bitrate
        case sampleRate = "sample_rate"
        case codec, channels
        case uploadedBy = "uploaded_by"
        case isAnonymous = "is_anonymous"
        case createdAt = "created_at"
        case metadata
    }
}

/// Metadata attached to uploaded file
struct AttachmentMetadata: Codable {
    let audioEffectsTimeline: AudioEffectsTimeline?
    // Can contain other dynamic fields

    enum CodingKeys: String, CodingKey {
        case audioEffectsTimeline = "audioEffectsTimeline"
    }
}

/// Upload error details
struct UploadError: Codable {
    let fileName: String?
    let message: String?
    let code: String?

    enum CodingKeys: String, CodingKey {
        case fileName = "file_name"
        case message
        case code
    }
}
