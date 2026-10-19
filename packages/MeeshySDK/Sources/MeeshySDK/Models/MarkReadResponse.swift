import Foundation

public struct MarkReadResponse: Decodable {
    public let success: Bool
    public let count: Int?
}
