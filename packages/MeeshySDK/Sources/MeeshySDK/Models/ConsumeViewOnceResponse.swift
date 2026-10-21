import Foundation

public struct ConsumeViewOnceResponse: Decodable, Sendable {
    public let messageId: String
    public let viewOnceCount: Int
    public let maxViewOnceCount: Int
    public let isFullyConsumed: Bool
}
