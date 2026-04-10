import Foundation

public struct ThreadData: Sendable {
    public let parent: APIMessage
    public let replies: [APIMessage]
    public let totalCount: Int
}

extension ThreadData: Decodable {
    enum CodingKeys: String, CodingKey {
        case parent, replies, totalCount
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        parent = try container.decode(APIMessage.self, forKey: .parent)
        replies = try container.decode([APIMessage].self, forKey: .replies)
        totalCount = try container.decode(Int.self, forKey: .totalCount)
    }
}
