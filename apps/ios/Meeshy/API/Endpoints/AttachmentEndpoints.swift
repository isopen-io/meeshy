//
//  AttachmentEndpoints.swift
//  Meeshy
//
//  Attachment API endpoints
//  Aligned with webapp format (files field, metadata_0)
//  UPDATED: Uses offset/limit pagination pattern
//

import Foundation

// MARK: - Upload Metadata

/// Complete metadata sent with file uploads (matches webapp's metadata_0 format)
/// Supports all media types: audio, video, image, document, code
struct AttachmentUploadMetadata: Codable, Sendable {
    // MARK: - Required Fields
    let type: String
    let conversationId: String

    // MARK: - Image/Video Dimensions
    let width: Int?
    let height: Int?

    // MARK: - Audio/Video Duration & Quality
    let duration: Double?           // Duration in seconds
    let bitrate: Int?               // Bitrate in bps
    let sampleRate: Int?            // Sample rate in Hz (e.g., 44100, 48000)
    let codec: String?              // Audio codec (e.g., "aac", "opus")
    let channels: Int?              // Number of audio channels (1=mono, 2=stereo)

    // MARK: - Video Specific
    let fps: Double?                // Frames per second
    let videoCodec: String?         // Video codec (e.g., "h264", "hevc")

    // MARK: - Document Specific
    let pageCount: Int?             // Number of pages (PDF, etc.)

    // MARK: - Code/Text Specific
    let lineCount: Int?             // Number of lines

    // MARK: - Audio Effects Timeline (for voice recordings with effects)
    // Uses AudioEffectsRecordingTimeline (event-based format) to match webapp
    let audioEffectsTimeline: AudioEffectsRecordingTimeline?

    // MARK: - Initializers

    /// Full initializer with all metadata
    init(
        type: String,
        conversationId: String,
        width: Int? = nil,
        height: Int? = nil,
        duration: Double? = nil,
        bitrate: Int? = nil,
        sampleRate: Int? = nil,
        codec: String? = nil,
        channels: Int? = nil,
        fps: Double? = nil,
        videoCodec: String? = nil,
        pageCount: Int? = nil,
        lineCount: Int? = nil,
        audioEffectsTimeline: AudioEffectsRecordingTimeline? = nil
    ) {
        self.type = type
        self.conversationId = conversationId
        self.width = width
        self.height = height
        self.duration = duration
        self.bitrate = bitrate
        self.sampleRate = sampleRate
        self.codec = codec
        self.channels = channels
        self.fps = fps
        self.videoCodec = videoCodec
        self.pageCount = pageCount
        self.lineCount = lineCount
        self.audioEffectsTimeline = audioEffectsTimeline
    }

    /// Initialize with AttachmentMediaType (used by Attachment model)
    init(type: AttachmentMediaType, conversationId: String, duration: Double? = nil) {
        self.init(type: type.rawValue, conversationId: conversationId, duration: duration)
    }

    /// Initialize with AttachmentType (used by API models)
    init(type: AttachmentType, conversationId: String, duration: Double? = nil) {
        self.init(type: type.rawValue, conversationId: conversationId, duration: duration)
    }

    // MARK: - Convenience Initializers for Specific Media Types

    /// Audio recording metadata
    static func audio(
        conversationId: String,
        duration: Double,
        sampleRate: Int = 44100,
        channels: Int = 1,
        codec: String = "aac",
        bitrate: Int? = nil,
        audioEffectsTimeline: AudioEffectsRecordingTimeline? = nil
    ) -> AttachmentUploadMetadata {
        AttachmentUploadMetadata(
            type: "audio",
            conversationId: conversationId,
            duration: duration,
            bitrate: bitrate,
            sampleRate: sampleRate,
            codec: codec,
            channels: channels,
            audioEffectsTimeline: audioEffectsTimeline
        )
    }

    /// Video recording metadata
    static func video(
        conversationId: String,
        width: Int,
        height: Int,
        duration: Double,
        fps: Double = 30,
        videoCodec: String = "h264",
        audioCodec: String? = "aac",
        sampleRate: Int? = 44100,
        channels: Int? = 2
    ) -> AttachmentUploadMetadata {
        AttachmentUploadMetadata(
            type: "video",
            conversationId: conversationId,
            width: width,
            height: height,
            duration: duration,
            sampleRate: sampleRate,
            codec: audioCodec,
            channels: channels,
            fps: fps,
            videoCodec: videoCodec
        )
    }

    /// Image metadata
    static func image(
        conversationId: String,
        width: Int,
        height: Int
    ) -> AttachmentUploadMetadata {
        AttachmentUploadMetadata(
            type: "image",
            conversationId: conversationId,
            width: width,
            height: height
        )
    }

    /// Document metadata
    static func document(
        conversationId: String,
        pageCount: Int? = nil
    ) -> AttachmentUploadMetadata {
        AttachmentUploadMetadata(
            type: "document",
            conversationId: conversationId,
            pageCount: pageCount
        )
    }

    /// Code/text file metadata
    static func code(
        conversationId: String,
        lineCount: Int? = nil
    ) -> AttachmentUploadMetadata {
        AttachmentUploadMetadata(
            type: "code",
            conversationId: conversationId,
            lineCount: lineCount
        )
    }
}

// MARK: - Endpoints

enum AttachmentEndpoints: APIEndpoint, Sendable {

    /// Upload attachment(s) - matches webapp format
    /// POST /api/attachments/upload
    /// Body: multipart/form-data with "files" field and "metadata_0" JSON
    case upload(metadata: AttachmentUploadMetadata)

    /// Download attachment file
    /// GET /api/attachments/:attachmentId
    case download(attachmentId: String)

    /// Delete attachment
    /// DELETE /api/attachments/:attachmentId
    case delete(attachmentId: String)

    /// Get attachment thumbnail
    /// GET /api/attachments/:attachmentId/thumbnail
    case getThumbnail(attachmentId: String, size: ThumbnailSize)

    /// List attachments for a conversation
    /// GET /api/conversations/:conversationId/attachments
    case getAttachments(conversationId: String, type: AttachmentType?, offset: Int, limit: Int)

    /// Stream file by path (used for generated URLs)
    /// GET /api/attachments/file/*
    case streamFile(path: String)

    enum ThumbnailSize: String, Sendable {
        case small = "small"
        case medium = "medium"
        case large = "large"
    }

    // MARK: - APIEndpoint Protocol

    var path: String {
        switch self {
        case .upload:
            return "/api/attachments/upload"
        case .download(let attachmentId):
            return "/api/attachments/\(attachmentId)"
        case .delete(let attachmentId):
            return "/api/attachments/\(attachmentId)"
        case .getThumbnail(let attachmentId, _):
            return "/api/attachments/\(attachmentId)/thumbnail"
        case .getAttachments(let conversationId, _, _, _):
            return "/api/conversations/\(conversationId)/attachments"
        case .streamFile(let filePath):
            return "/api/attachments/file/\(filePath)"
        }
    }

    var method: HTTPMethod {
        switch self {
        case .download, .getThumbnail, .getAttachments, .streamFile:
            return .get
        case .upload:
            return .post
        case .delete:
            return .delete
        }
    }

    var queryParameters: [String: Any]? {
        switch self {
        case .getThumbnail(_, let size):
            return ["size": size.rawValue]
        case .getAttachments(_, let type, let offset, let limit):
            var params: [String: Any] = ["offset": offset, "limit": limit]
            if let type = type {
                params["type"] = type.rawValue
            }
            return params
        default:
            return nil
        }
    }

    var body: Encodable? {
        // Body is handled separately for multipart uploads
        return nil
    }

    /// Get metadata for upload endpoint
    var uploadMetadata: AttachmentUploadMetadata? {
        switch self {
        case .upload(let metadata):
            return metadata
        default:
            return nil
        }
    }
}
