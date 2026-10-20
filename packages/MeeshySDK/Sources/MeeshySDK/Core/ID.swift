import Foundation

public enum IDTag {
    public enum Conversation {}
    public enum User {}
    public enum Message {}
    public enum Post {}
    public enum Story {}
}

public struct ID<Tag>: Hashable, Sendable, Codable, CustomStringConvertible {
    public let rawValue: String

    public init(_ rawValue: String) {
        self.rawValue = rawValue
    }

    public init(from decoder: Decoder) throws {
        rawValue = try decoder.singleValueContainer().decode(String.self)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    public var description: String { rawValue }
}

public typealias ConversationID = ID<IDTag.Conversation>
public typealias UserID = ID<IDTag.User>
public typealias MessageID = ID<IDTag.Message>
public typealias PostID = ID<IDTag.Post>
public typealias StoryID = ID<IDTag.Story>
