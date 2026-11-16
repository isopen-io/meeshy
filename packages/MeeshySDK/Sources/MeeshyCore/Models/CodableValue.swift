import Foundation

// MARK: - CodableValue (type-erased JSON value for extensible preferences)

public enum CodableValue: Codable, Equatable, Sendable {
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([CodableValue])
    case dict([String: CodableValue])
    case null

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let v = try? container.decode(Bool.self) {
            self = .bool(v)
        } else if let v = try? container.decode(Int.self) {
            self = .int(v)
        } else if let v = try? container.decode(Double.self) {
            self = .double(v)
        } else if let v = try? container.decode(String.self) {
            self = .string(v)
        } else if let v = try? container.decode([CodableValue].self) {
            self = .array(v)
        } else if let v = try? container.decode([String: CodableValue].self) {
            self = .dict(v)
        } else {
            self = .null
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .bool(let v): try container.encode(v)
        case .int(let v): try container.encode(v)
        case .double(let v): try container.encode(v)
        case .string(let v): try container.encode(v)
        case .array(let v): try container.encode(v)
        case .dict(let v): try container.encode(v)
        case .null: try container.encodeNil()
        }
    }

    public var boolValue: Bool? { if case .bool(let v) = self { return v }; return nil }
    public var intValue: Int? { if case .int(let v) = self { return v }; return nil }
    public var doubleValue: Double? { if case .double(let v) = self { return v }; return nil }
    public var stringValue: String? { if case .string(let v) = self { return v }; return nil }
}
