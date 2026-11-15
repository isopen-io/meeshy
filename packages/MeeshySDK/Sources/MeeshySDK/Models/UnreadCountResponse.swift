import Foundation

public struct UnreadCountResponse: Decodable {
    public let success: Bool
    public let count: Int
}
