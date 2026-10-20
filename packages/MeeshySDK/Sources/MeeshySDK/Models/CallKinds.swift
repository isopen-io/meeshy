import Foundation

// MARK: - Call Direction

public enum CallDirection: String, Sendable, Hashable, Codable {
    case incoming
    case outgoing
    case missed
    case unknown

    public init(raw: String) {
        self = CallDirection(rawValue: raw) ?? .unknown
    }

    public init(from decoder: Decoder) throws {
        self.init(raw: try decoder.singleValueContainer().decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

// MARK: - Call Status

public enum CallStatus: String, Sendable, Hashable, Codable {
    case initiated
    case ringing
    case connecting
    case active
    case reconnecting
    case ended
    case missed
    case rejected
    case failed
    case unknown

    public init(raw: String) {
        self = CallStatus(rawValue: raw) ?? .unknown
    }

    public init(from decoder: Decoder) throws {
        self.init(raw: try decoder.singleValueContainer().decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

// MARK: - Call Mode

public enum CallMode: String, Sendable, Hashable, Codable {
    case p2p
    case sfu
    case unknown

    public init(raw: String) {
        self = CallMode(rawValue: raw) ?? .unknown
    }

    public init(from decoder: Decoder) throws {
        self.init(raw: try decoder.singleValueContainer().decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

// MARK: - Call Kind

public enum CallKind: String, Sendable, Hashable, Codable {
    case audio
    case video
    case unknown

    public init(raw: String) {
        self = CallKind(rawValue: raw) ?? .unknown
    }

    public init(isVideo: Bool) {
        self = isVideo ? .video : .audio
    }

    public var isVideo: Bool { self == .video }

    public init(from decoder: Decoder) throws {
        self.init(raw: try decoder.singleValueContainer().decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

// MARK: - Typed Projections

public extension APICallRecord {
    var statusKind: CallStatus { CallStatus(raw: status) }
    var modeKind: CallMode { CallMode(raw: mode) }
}

public extension ActiveCallSession {
    var statusKind: CallStatus { CallStatus(raw: status) }
    var modeKind: CallMode { CallMode(raw: mode) }
    var callKind: CallKind { CallKind(raw: metadata?.type ?? mode) }
}
