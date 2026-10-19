import Foundation

/// **Baisser puis rendre le volume d'un lecteur Meeshy** pendant un
/// enregistrement (#11042).
public struct PlaybackDuckLedger: Sendable {

    public static let duckedFactor: Float = 1

    public init() {}

    public var isEmpty: Bool { true }

    public mutating func duck(_ key: ObjectIdentifier, currentVolume: Float) -> Float? {
        nil
    }

    public mutating func restore(_ key: ObjectIdentifier, currentVolume: Float) -> Float? {
        nil
    }

    public mutating func forget(_ key: ObjectIdentifier) {}
}
