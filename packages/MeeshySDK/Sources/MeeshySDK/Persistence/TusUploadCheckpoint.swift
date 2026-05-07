import Foundation
import GRDB

/// Persistent checkpoint for an in-flight TUS upload. Survives app kills so
/// a retry can resume the PATCH stream at `byteOffset` instead of restarting
/// the upload session from byte 0.
///
/// The primary key is `checkpointKey` (a SHA256 hex of the file bytes
/// computed by `TusUploadManager` once per file). Two distinct files always
/// produce different keys; a re-encode of the same source UIImage with the
/// same `MediaCompressor` settings produces identical bytes → identical key,
/// which is what makes the retry path bandwidth-efficient.
public struct TusUploadCheckpoint: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "tus_upload_checkpoint"

    public let checkpointKey: String
    /// Server-assigned upload URL returned by the initial POST (TUS
    /// `Location` header). Reused across PATCH calls until the session is
    /// either complete or GC'd by the server (~24 h default).
    public var uploadURL: String
    public var byteOffset: Int64
    public let fileSize: Int64
    public let fileName: String
    public let mimeType: String
    public let uploadContext: String?
    public let thumbHash: String?
    public let createdAt: Date
    public var updatedAt: Date

    public init(
        checkpointKey: String,
        uploadURL: String,
        byteOffset: Int64,
        fileSize: Int64,
        fileName: String,
        mimeType: String,
        uploadContext: String? = nil,
        thumbHash: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.checkpointKey = checkpointKey
        self.uploadURL = uploadURL
        self.byteOffset = byteOffset
        self.fileSize = fileSize
        self.fileName = fileName
        self.mimeType = mimeType
        self.uploadContext = uploadContext
        self.thumbHash = thumbHash
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
