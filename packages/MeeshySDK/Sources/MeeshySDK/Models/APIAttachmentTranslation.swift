import Foundation

public struct APIAttachmentTranslation: Codable, Sendable {
    public let type: String?
    public let transcription: String?
    public let url: String?
    public let durationMs: Int?
    public let format: String?
    public let cloned: Bool?
    public let quality: Double?
    public let voiceModelId: String?
    public let ttsModel: String?
    public let segments: [TranscriptionSegment]?
}
