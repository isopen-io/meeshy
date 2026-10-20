import Foundation

public struct LanguageCode: Hashable, Sendable, Codable, CustomStringConvertible {
    public let rawValue: String

    public static let fallback = LanguageCode("fr")

    public init(_ rawValue: String) {
        self.rawValue = rawValue
    }

    public init(normalizing raw: String?, fallback: LanguageCode = .fallback) {
        guard let normalized = MeeshyUser.normalizeLanguageCode(raw) else {
            self = fallback
            return
        }
        self.init(normalized)
    }

    public init(from decoder: Decoder) throws {
        rawValue = try decoder.singleValueContainer().decode(String.self)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    public var description: String { rawValue }

    public var dedupKey: String { MeeshyUser.normalizeLanguageForDedup(rawValue) }

    public func matches(_ other: LanguageCode) -> Bool {
        dedupKey == other.dedupKey
    }
}
