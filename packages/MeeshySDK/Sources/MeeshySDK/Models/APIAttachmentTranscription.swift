import Foundation

public struct APIAttachmentTranscription: Codable, Sendable {
    public let text: String?
    public let transcribedText: String?
    public let language: String?
    public let confidence: Double?
    public let durationMs: Int?
    public let segments: [TranscriptionSegment]?
    public let speakerCount: Int?

    public var resolvedText: String { text ?? transcribedText ?? "" }
}
