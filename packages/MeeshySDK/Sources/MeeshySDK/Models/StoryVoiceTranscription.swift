import CoreGraphics
import Foundation

// MARK: - Story Voice Transcription

public struct StoryVoiceTranscription: Codable, Sendable {
    public let language: String
    public let content: String

    public init(language: String, content: String) {
        self.language = language
        self.content = content
    }
}
