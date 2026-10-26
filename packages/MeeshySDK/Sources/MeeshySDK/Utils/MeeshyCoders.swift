import Foundation

public enum MeeshyCoders {

    public enum Preset: Sendable, CaseIterable {
        case api
        case socket
        case persistence
        case outbox
    }

    public static func decoder(_ preset: Preset) -> JSONDecoder {
        JSONDecoder()
    }

    public static func encoder(_ preset: Preset) -> JSONEncoder {
        JSONEncoder()
    }
}
