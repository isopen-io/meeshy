import Foundation

public struct APIHashtag: Codable, Sendable, Hashable, Identifiable {
    public var id: String { tag }
    public let tag: String
    public let usageCount: Int

    public init(tag: String, usageCount: Int) {
        self.tag = tag
        self.usageCount = usageCount
    }
}
