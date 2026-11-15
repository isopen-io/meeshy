import CoreGraphics
import Foundation

// MARK: - Story Background Audio Entry

public struct StoryBackgroundAudioEntry: Codable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let uploaderName: String?
    public let duration: Int
    public let fileUrl: String
    public let usageCount: Int
    public let isPublic: Bool

    public init(id: String, title: String, uploaderName: String? = nil,
                duration: Int, fileUrl: String, usageCount: Int = 0, isPublic: Bool = true) {
        self.id = id; self.title = title; self.uploaderName = uploaderName
        self.duration = duration; self.fileUrl = fileUrl
        self.usageCount = usageCount; self.isPublic = isPublic
    }
}
