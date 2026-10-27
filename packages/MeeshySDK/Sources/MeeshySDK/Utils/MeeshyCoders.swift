import Foundation

/// The single factory of configured JSON coders (#13130). Every preset reads
/// dates through `WireDate` — with or without fractional seconds, `Z` or offset.
/// `.api` and `.socket` write what the gateway serialises (`toISOString`, to the
/// millisecond). `.persistence` and `.outbox` keep writing the second-precision
/// form of Foundation's `.iso8601`, so a file written by this build stays
/// readable by an earlier one after a downgrade; `.outbox` sorts keys so a
/// queued payload has deterministic bytes.
public enum MeeshyCoders {

    public enum Preset: Sendable, CaseIterable {
        case api
        case socket
        case persistence
        case outbox
    }

    public static func decoder(_ preset: Preset) -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom(decodeDate)
        return decoder
    }

    public static func encoder(_ preset: Preset) -> JSONEncoder {
        let encoder = JSONEncoder()
        switch preset {
        case .api, .socket:
            encoder.dateEncodingStrategy = .custom(encodeWireDate)
        case .persistence:
            encoder.dateEncodingStrategy = .iso8601
        case .outbox:
            encoder.outputFormatting = [.sortedKeys]
            encoder.dateEncodingStrategy = .iso8601
        }
        return encoder
    }

    @Sendable private static func decodeDate(_ decoder: Decoder) throws -> Date {
        let container = try decoder.singleValueContainer()
        let text = try container.decode(String.self)
        if let date = WireDate.date(from: text) { return date }
        throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(text)")
    }

    @Sendable private static func encodeWireDate(_ date: Date, _ encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(WireDate.string(from: date))
    }
}
