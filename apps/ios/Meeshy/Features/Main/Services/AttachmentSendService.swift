import Foundation
import Combine
import MeeshySDK
import MeeshyUI
import UIKit

// MARK: - Attachment Send Result

struct AttachmentSendResult: Sendable {
    let uploadedIds: [String]
    let localAttachments: [MeeshyMessageAttachment]
    let sendSuccess: Bool
}

// MARK: - Pending File Info

struct PendingFileInfo: Sendable {
    let attachmentId: String
    let fileURL: URL
    let mimeType: String
    let thumbnailImage: UIImage?
}

// MARK: - Protocol

@MainActor
protocol AttachmentSendServiceProviding {
    func send(
        conversationId: String,
        content: String?,
        attachments: [MeeshyMessageAttachment],
        audioURL: URL?,
        mediaFiles: [String: URL],
        thumbnails: [String: UIImage],
        replyToId: String?,
        originalLanguage: String?,
        onProgress: @escaping (UploadQueueProgress) -> Void
    ) async throws -> AttachmentSendResult
}

// MARK: - AttachmentSendService

@MainActor
final class AttachmentSendService: AttachmentSendServiceProviding {
    static let shared = AttachmentSendService()

    private let messageService: MessageServiceProviding
    private let socketManager: MessageSocketProviding

    init(
        messageService: MessageServiceProviding = MessageService.shared,
        socketManager: MessageSocketProviding = MessageSocketManager.shared
    ) {
        self.messageService = messageService
        self.socketManager = socketManager
    }

    func send(
        conversationId: String,
        content: String?,
        attachments: [MeeshyMessageAttachment],
        audioURL: URL?,
        mediaFiles: [String: URL],
        thumbnails: [String: UIImage],
        replyToId: String?,
        originalLanguage: String?,
        onProgress: @escaping (UploadQueueProgress) -> Void
    ) async throws -> AttachmentSendResult {
        try await ensureSocketConnected()

        let serverOrigin = MeeshyConfig.shared.serverOrigin
        guard let baseURL = URL(string: serverOrigin),
              let token = APIClient.shared.authToken else {
            throw AttachmentSendError.missingConfiguration
        }

        let uploader = TusUploadManager(baseURL: baseURL)

        let progressCancellable = uploader.progressPublisher
            .receive(on: DispatchQueue.main)
            .sink { progress in
                onProgress(progress)
            }

        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        var uploadedIds: [String] = []
        var localAttachments: [MeeshyMessageAttachment] = []

        if let audioURL {
            let result = try await uploadAudio(
                audioURL: audioURL, uploader: uploader, token: token, userId: currentUserId
            )
            uploadedIds.append(result.uploadedId)
            localAttachments.append(result.localAttachment)
        }

        for attachment in attachments where attachment.type != .audio {
            guard let fileURL = mediaFiles[attachment.id] else { continue }
            let thumbnail = thumbnails[attachment.id]
            let result = try await uploadMedia(
                fileURL: fileURL,
                mimeType: attachment.mimeType,
                thumbnail: thumbnail,
                uploader: uploader,
                token: token,
                userId: currentUserId
            )
            uploadedIds.append(result.uploadedId)
            localAttachments.append(result.localAttachment)
        }

        progressCancellable.cancel()

        guard !uploadedIds.isEmpty || !(content ?? "").isEmpty else {
            return AttachmentSendResult(uploadedIds: [], localAttachments: [], sendSuccess: false)
        }

        let hasAudio = audioURL != nil
        let sendSuccess: Bool

        if hasAudio {
            socketManager.sendWithAttachments(
                conversationId: conversationId,
                content: content,
                attachmentIds: uploadedIds,
                replyToId: replyToId,
                storyReplyToId: nil,
                originalLanguage: originalLanguage,
                isEncrypted: false
            )
            sendSuccess = true
        } else {
            let request = SendMessageRequest(
                content: content,
                originalLanguage: originalLanguage,
                replyToId: replyToId,
                attachmentIds: uploadedIds.isEmpty ? nil : uploadedIds
            )
            let _ = try await messageService.send(conversationId: conversationId, request: request)
            sendSuccess = true
        }

        return AttachmentSendResult(
            uploadedIds: uploadedIds,
            localAttachments: localAttachments,
            sendSuccess: sendSuccess
        )
    }

    // MARK: - Private

    private func ensureSocketConnected() async throws {
        guard !socketManager.isConnected else { return }
        socketManager.connect()
        try await Task.sleep(nanoseconds: 1_000_000_000)
        guard socketManager.isConnected else {
            throw AttachmentSendError.socketConnectionFailed
        }
    }

    private func uploadAudio(
        audioURL: URL,
        uploader: TusUploadManager,
        token: String,
        userId: String
    ) async throws -> (uploadedId: String, localAttachment: MeeshyMessageAttachment) {
        let result = try await uploader.uploadFile(
            fileURL: audioURL, mimeType: "audio/mp4", token: token
        )

        // Seed the audio cache from the file bytes — read OFF the main actor so a
        // multi-hundred-KB read never stalls the UI on the send path. The file is
        // still on disk (removed below), and the read is skipped entirely when
        // the upload throws.
        if let audioData = await Self.readFileBytes(audioURL) {
            await CacheCoordinator.shared.audio.store(audioData, for: result.fileUrl)
        }

        try? FileManager.default.removeItem(at: audioURL)
        return (result.id, result.toMessageAttachment(uploadedBy: userId))
    }

    private func uploadMedia(
        fileURL: URL,
        mimeType: String,
        thumbnail: UIImage?,
        uploader: TusUploadManager,
        token: String,
        userId: String
    ) async throws -> (uploadedId: String, localAttachment: MeeshyMessageAttachment) {
        let thumbHash = thumbnail?.toThumbHash()
        let result = try await uploader.uploadFile(
            fileURL: fileURL, mimeType: mimeType, token: token, thumbHash: thumbHash
        )

        // Read the bytes off the main actor (see uploadAudio) — large media (MB)
        // would otherwise block the UI on send.
        if let fileData = await Self.readFileBytes(fileURL) {
            await CacheCoordinator.shared.images.store(fileData, for: result.fileUrl)
            if let thumbUrl = result.thumbnailUrl,
               let thumbnail,
               let thumbData = await ImageCompressor.jpegOffMain(thumbnail, quality: 0.8) {
                await CacheCoordinator.shared.thumbnails.store(thumbData, for: thumbUrl)
            }
        }

        try? FileManager.default.removeItem(at: fileURL)
        return (result.id, result.toMessageAttachment(uploadedBy: userId))
    }

    /// Read a local file's bytes off the main actor. `Data(contentsOf:)` is a
    /// synchronous read; on `@MainActor` it would stall the UI for the whole
    /// read duration on the send path, so hop to a background task.
    private nonisolated static func readFileBytes(_ url: URL) async -> Data? {
        await Task.detached(priority: .utility) { try? Data(contentsOf: url) }.value
    }
}

// MARK: - Errors

enum AttachmentSendError: LocalizedError {
    case missingConfiguration
    case socketConnectionFailed

    var errorDescription: String? {
        switch self {
        case .missingConfiguration:
            return "Missing server URL or auth token"
        case .socketConnectionFailed:
            return "Failed to connect to message socket"
        }
    }
}
